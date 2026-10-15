const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, Set, Map, Number, JSON });
  return exports;
}
const { replaceImage } = load('src/lib/replace-image.ts');
function fixture(overrides = {}) {
  let saved = { phase: 'planned' };
  const events = [];
  const deps = {
    save: async state => { saved = structuredClone(state); events.push(`save:${state.phase}`); },
    mappings: async () => [{ imageId: 1, imageUrl: 'old' }, { imageId: 2, imageUrl: 'old' }],
    upload: async () => { events.push('upload'); return { imageId: 3, imageUrl: 'new' }; },
    record: async () => { events.push('record'); },
    remove: async id => { events.push(`remove:${id}`); return { result: true }; },
    forget: async id => { events.push(`forget:${id}`); },
    ...overrides,
  };
  return { deps, events, get saved() { return structuredClone(saved); }, run: () => replaceImage(structuredClone(saved), ['old'], 'hash', deps) };
}
test('uploads and records before deleting every old ID, including duplicated URLs', async () => {
  const f = fixture(); assert.equal((await f.run()).imageId, 3);
  assert.equal(f.saved.phase, 'done');
  assert.ok(f.events.indexOf('record') < f.events.indexOf('remove:1'));
  assert.ok(f.events.includes('remove:2'));
  assert.equal(f.events.includes('remove:3'), false);
  await f.run(); assert.equal(f.events.filter(e => e === 'upload').length, 1);
});
test('missing mappings fail before any mutation', async () => {
  const f = fixture({ mappings: async () => [] });
  await assert.rejects(f.run(), /no recorded ID/); assert.equal(f.events.length, 0);
});
test('upload failure keeps old images and blocks blindly repeating uncertain upload', async () => {
  let uploads = 0;
  const f = fixture({ upload: async () => { uploads++; throw new Error('timeout'); } });
  await assert.rejects(f.run(), /timeout/);
  await assert.rejects(f.run(), /uncertain/);
  assert.equal(uploads, 1); assert.equal(f.events.some(e => e.startsWith('remove:')), false);
});
test('invalid upload result never removes existing images', async () => {
  const f = fixture({ upload: async () => ({ imageId: 0, imageUrl: null }) });
  await assert.rejects(f.run(), /did not confirm/);
  assert.equal(f.events.some(e => e.startsWith('remove:')), false);
});
test('partial deletion retries only remaining images without another upload', async () => {
  const attempts = [];
  let fail = true;
  const f = fixture({ remove: async id => { attempts.push(id); return { result: id !== 2 || !fail, message: 'no' }; } });
  await assert.rejects(f.run(), /Retry to continue/); fail = false; await f.run();
  assert.deepEqual(attempts, [1, 2, 2]);
  assert.equal(f.events.filter(e => e === 'upload').length, 1);
});
test('unknown deletion outcome cannot be mistaken for success or retried blindly', async () => {
  let deletes = 0;
  const f = fixture({ remove: async () => { deletes++; throw new Error('connection lost'); } });
  await assert.rejects(f.run(), /connection lost/); await assert.rejects(f.run(), /uncertain/);
  assert.equal(deletes, 1); assert.equal(f.saved.phase, 'uploaded');
});
test('tracking failure is retried before deleting; new image not uploaded twice', async () => {
  let fail = true;
  const f = fixture({ record: async () => { if (fail) throw new Error('db down'); } });
  await assert.rejects(f.run(), /db down/); fail = false; await f.run();
  assert.equal(f.events.filter(e => e === 'upload').length, 1);
});
test('DB cleanup failure retries cleanup without repeating successful deletion', async () => {
  let fail = true;
  const f = fixture({ forget: async () => { if (fail) throw new Error('db down'); } });
  await assert.rejects(f.run(), /db down/); fail = false; await f.run();
  assert.equal(f.events.filter(e => e === 'remove:1').length, 1);
});
test('checkpoint failure before upload causes no mutation', async () => {
  const f = fixture({ save: async () => { throw new Error('db down'); } });
  await assert.rejects(f.run(), /db down/); assert.equal(f.events.length, 0);
});
test('different image cannot reuse a completed operation', async () => {
  const f = fixture(); await f.run();
  await assert.rejects(replaceImage(f.saved, ['old'], 'different', f.deps), /different image/);
});
test('empty image list simply uploads the replacement', async () => {
  const f = fixture(); await replaceImage({ phase: 'planned' }, [], 'hash', f.deps);
  assert.equal(f.events.some(e => e.startsWith('remove:')), false);
});
test('a batch of 5000 products needs one catalog read and one bulk insert', async () => {
  let reads = 0, writes = 0;
  const items = Array.from({ length: 5000 }, (_, i) => ({ operationId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, productId: i + 1 }));
  const { POST } = load('src/app/api/images/replace/plan/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/db': { ensureSchema: async () => {}, sql: () => async (_, data) => { writes++; assert.equal(JSON.parse(data).length, 5000); } },
    '@/lib/dutchie-client': { getProducts: async () => { reads++; return items.map(item => ({ productId: item.productId, imageUrls: ['old'] })); } },
  });
  const result = await POST({ json: async () => ({ items }) });
  assert.equal(result.status, 200); assert.equal(result.body.planned, 5000); assert.equal(reads, 1); assert.equal(writes, 1);
  const invalid = await POST({ json: async () => ({ items: [items[0], items[0]] }) });
  assert.equal(invalid.status, 400); assert.equal(writes, 1);
});
