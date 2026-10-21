const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, Set, Map, Array, Object, String, Number, Boolean, Date, URLSearchParams, RegExp, JSON });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const constants = load('src/lib/constants.ts');
const imageUtils = load('src/lib/image-utils.ts', { './constants': constants });
const filters = load('src/lib/product-filters.ts', { './image-utils': imageUtils, './constants': constants });
const { filterRepositoryImages, EMPTY_REPOSITORY_FILTERS, UNGROUPED, countActiveRepositoryFilters } = load('src/lib/repository-search.ts', { './product-filters': filters });

const image = (overrides) => ({ id: 1, name: 'OG Kush Pre-Roll', fileName: 'og.jpg', mimeType: 'image/jpeg', groupName: 'Stokes', createdAt: '2026-01-01', updatedAt: null, sourceUrl: null, appliedCount: 0, excludedProductIds: [], rules: [], ...overrides });
const images = [
  image(),
  image({ id: 2, name: 'Gelato 5pk', groupName: 'Stokes', sourceUrl: 'https://stokes.example/p', appliedCount: 3, rules: [{ id: 1, imageId: 2, brandName: 'Stokes', category: null, strain: null, strainType: null, productNameKeywords: ['gelato', '-1g'], priority: 2, createdAt: '' }] }),
  image({ id: 3, name: 'Kiva Bar', groupName: null, rules: [{ id: 2, imageId: 3, brandName: 'Kiva', category: 'Edibles', strain: null, strainType: null, productNameKeywords: null, priority: 2, createdAt: '' }] }),
];
const ids = (list) => plain(list.map(i => i.id));
const f = (overrides) => ({ ...EMPTY_REPOSITORY_FILTERS, ...overrides });

test('query searches name, group and rule text with the shared grammar', () => {
  assert.deepEqual(ids(filterRepositoryImages(images, f({ query: 'kush' }))), [1]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ query: 'stokes' }))), [1, 2]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ query: 'edibles' }))), [3]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ query: 'rule:stokes' }))), [2]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ query: 'group:stokes -gelato' }))), [1]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ query: '/^og/' }))), [1]);
});

test('structured filters: group, rules, applied, origin', () => {
  assert.deepEqual(ids(filterRepositoryImages(images, f({ group: UNGROUPED }))), [3]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ group: 'Stokes', rules: 'none' }))), [1]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ rules: 'has' }))), [2, 3]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ applied: 'applied' }))), [2]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ applied: 'never', origin: 'uploaded' }))), [1, 3]);
  assert.deepEqual(ids(filterRepositoryImages(images, f({ origin: 'imported' }))), [2]);
  assert.equal(countActiveRepositoryFilters(f({ query: ' ', group: 'Stokes' })), 1);
});
