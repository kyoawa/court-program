const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('src/hooks/use-upload-queue.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function harness(fetch) {
  const slots = []; let cursor = 0;
  const react = {
    useState: value => { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: value => { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback: value => value,
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => name === 'react' ? react : { UPLOAD_CONCURRENCY: 3 }, fetch, crypto: require('node:crypto').webcrypto, TextDecoder, Blob });
  return () => { cursor = 0; return exports.useUploadQueue(); };
}
const item = productId => ({ productId, productName: `Product ${productId}`, source: { type: 'url', url: 'https://example.com/image.jpg' } });
const ok = body => ({ ok: true, json: async () => body });
test('5000 replacement products use one plan, at most three workers, accurate counts', async () => {
  let active = 0, peak = 0, plans = 0, replacements = 0;
  const render = harness(async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith('/plan')) { plans++; assert.equal(body.items.length, 5000); return ok({ planned: 5000 }); }
    assert.equal(url, '/api/images/replace'); assert.ok(body.operationId); assert.ok(body.imageUrl);
    active++; peak = Math.max(peak, active); replacements++;
    await new Promise(resolve => setImmediate(resolve)); active--;
    return ok({ imageId: body.productId, imageUrl: 'new' });
  });
  render().addItems(Array.from({ length: 5000 }, (_, i) => item(i + 1)));
  const result = await render().startUpload(true);
  assert.equal(result.succeeded, 5000); assert.equal(result.failed, 0);
  assert.equal(render().stats.success, 5000); assert.equal(peak, 3); assert.equal(plans, 1); assert.equal(replacements, 5000);
});
test('double-start is ignored; pause stops scheduling and resume finishes remainder', async () => {
  const waits = [];
  const render = harness(async url => {
    if (url.endsWith('/plan')) return ok({ planned: 5 });
    await new Promise(resolve => waits.push(resolve)); return ok({ imageId: 10, imageUrl: 'new' });
  });
  render().addItems([1, 2, 3, 4, 5].map(item));
  const run = render().startUpload(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(waits.length, 3); assert.equal(await render().startUpload(true), undefined);
  render().stopUpload(); waits.splice(0).forEach(resolve => resolve());
  const result = await run; assert.equal(result.paused, true); assert.equal(render().stats.queued, 2);
  const resumed = render().startUpload(true); await new Promise(resolve => setImmediate(resolve));
  assert.equal(waits.length, 2); waits.forEach(resolve => resolve()); await resumed;
  assert.equal(render().stats.success, 5);
});
test('failed replacement retries with the same operation ID and mode', async () => {
  const ids = []; let fail = true;
  const render = harness(async (url, options) => {
    if (url.endsWith('/plan')) return ok({ planned: 1 });
    assert.equal(url, '/api/images/replace'); ids.push(JSON.parse(options.body).operationId);
    return fail ? { ok: false, json: async () => ({ error: 'partial failure' }) } : ok({ imageId: 10, imageUrl: 'new' });
  });
  render().addItems([item(1)]); await render().startUpload(true);
  assert.equal(render().stats.failed, 1); render().retryFailed(); fail = false;
  await render().startUpload(false); assert.equal(ids[0], ids[1]); assert.equal(render().stats.success, 1);
});
test('multiple replacement images for one product are rejected before requests', async () => {
  const render = harness(async () => { throw new Error('must not fetch'); });
  render().addItems([item(1), item(1)]); await assert.rejects(render().startUpload(true), /exactly one/);
  assert.equal(render().isRunning, false);
});
test('add-mode URL stream handles split network chunks', async () => {
  const message = 'data: {"type":"success","result":{"imageId":1,"imageUrl":"new"}}\n\n';
  const chunks = [message.slice(0, 18), message.slice(18, 50), message.slice(50)].map(text => new TextEncoder().encode(text));
  const render = harness(async () => ({ ok: true, body: { getReader: () => ({ read: async () => chunks.length ? { done: false, value: chunks.shift() } : { done: true } }) } }));
  render().addItems([item(1)]); await render().startUpload(); assert.equal(render().stats.success, 1);
});
test('empty stream and HTTP errors are failures, never false success', async () => {
  for (const response of [{ ok: false, status: 500, json: async () => ({ error: 'server failure' }) }, { ok: true, body: { getReader: () => ({ read: async () => ({ done: true }) }) } }]) {
    const render = harness(async () => response); render().addItems([item(1)]); await render().startUpload();
    assert.equal(render().stats.failed, 1); assert.equal(render().stats.success, 0);
  }
});
