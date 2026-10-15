const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, Set, Map, Number, String, Boolean, Object, Array, URLSearchParams });
  return exports;
}
const constants = load('src/lib/constants.ts');
const imageUtils = load('src/lib/image-utils.ts', { './constants': constants });
const { parseQuery, filterProducts, filtersToParams, filtersFromParams, buildFacets, countActiveFilters, EMPTY_FILTERS } =
  load('src/lib/product-filters.ts', { './image-utils': imageUtils, './constants': constants });

const product = (overrides = {}) => ({
  productId: 1, globalProductId: null, sku: 'SKU-1', internalName: null, productName: 'Blue Dream 3.5g', description: null,
  onlineDescription: 'A classic sativa.', masterCategory: 'Flower', categoryId: 1, category: 'Flower', imageUrl: 'a.jpg', imageUrls: ['a.jpg', 'b.jpg'],
  strainId: 1, strain: 'Blue Dream', strainType: 'Sativa', size: '3.5g', netWeight: 3.5, netWeightUnitId: 1, netWeightUnit: 'g',
  brandId: 1, brandName: 'Kiva', vendorId: 1, vendorName: 'Lost Farm Distribution', isCannabis: true, isActive: true,
  thcContent: null, thcContentUnit: null, cbdContent: null, cbdContentUnit: null, price: null, medPrice: null, recPrice: null, unitCost: null,
  createdDate: null, lastModifiedDateUTC: null, ...overrides,
});
const catalog = [
  product(),
  product({ productId: 2, productName: 'Gelato Pre-Roll', category: 'Pre-Rolls', strain: 'Gelato', strainType: 'Hybrid', size: '1g', brandName: 'Lowell', vendorName: 'Lowell Farms', imageUrls: null, imageUrl: null, onlineDescription: null, sku: 'PR-2' }),
  product({ productId: 3, productName: 'Blueberry Gummies', category: 'Edibles', strain: null, strainType: null, size: '100mg', brandName: 'Kiva', vendorName: 'Kiva', imageUrls: null, imageUrl: 'c.jpg', description: 'Sample pack', sku: 'ED-3' }),
];
const inventory = { 1: ['BILLINGS', 'HELENA'], 2: [] };
const ids = (list) => list.map(p => p.productId);
// Values built inside the vm realm have foreign prototypes; compare them as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
const withQuery = (query, extra = {}) => ({ ...EMPTY_FILTERS, query, ...extra });

test('parses words, quoted phrases, exclusions and field prefixes', () => {
  assert.deepEqual(plain(parseQuery('blue  Dream')), [{ text: 'blue', negate: false }, { text: 'dream', negate: false }]);
  assert.deepEqual(plain(parseQuery('"blue dream" -sample vendor:"lost farm" BRAND:kiva')), [
    { text: 'blue dream', negate: false },
    { text: 'sample', negate: true },
    { text: 'lost farm', field: 'vendor', negate: false },
    { text: 'kiva', field: 'brand', negate: false },
  ]);
  assert.deepEqual(plain(parseQuery('re:order')), [{ text: 're:order', negate: false }]);
  assert.deepEqual(plain(parseQuery('   ""  ')), []);
});

test('free-text terms search name, sku, brand, vendor, strain, category and size', () => {
  assert.deepEqual(ids(filterProducts(catalog, withQuery('blue'))), [1, 3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('blue dream'))), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('"dream 3.5"'))), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('"blue 3.5"'))), []);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('lowell'))), [2]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('ED-3'))), [3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('pre-rolls'))), [2]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('3.5g'))), [1]);
  // Descriptions are only searched with the desc: prefix.
  assert.deepEqual(ids(filterProducts(catalog, withQuery('sativa'))), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('classic'))), []);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('desc:classic'))), [1, 3]);
});

test('field prefixes, exclusions and exact id lookups', () => {
  assert.deepEqual(ids(filterProducts(catalog, withQuery('brand:kiva'))), [1, 3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('brand:kiva -gummies'))), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('vendor:"lost farm"'))), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('strain:gelato'))), [2]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('type:hybrid'))), [2]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('id:2'))), [2]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('id:20'))), []);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('-brand:kiva'))), [2]);
});

test('structured filters: category, brand, vendor, strain type, images, description', () => {
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { category: 'Edibles' }))), [3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { brand: 'Kiva' }))), [1, 3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { vendor: 'Kiva' }))), [3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { strainType: 'Sativa' }))), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { images: 'none' }))), [2]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { images: 'any' }))), [1, 3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { images: 'multi' }))), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { description: 'missing' }))), [2]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { description: 'has' }))), [1, 3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('kiva', { images: 'none' }))), []);
});

test('stock filters use the inventory map: anywhere, nowhere, or one store', () => {
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { stock: 'any' }), inventory)), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { stock: 'none' }), inventory)), [2, 3]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { stock: 'HELENA' }), inventory)), [1]);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { stock: 'BUTTE' }), inventory)), []);
  assert.deepEqual(ids(filterProducts(catalog, withQuery('', { stock: 'any' }))), []);
});

test('filters round-trip through URL params and reject unknown values', () => {
  const filters = { query: 'brand:kiva -sample', category: 'Flower', brand: 'Kiva', vendor: 'Lost Farm Distribution', strainType: 'Sativa', stock: 'HELENA', images: 'multi', description: 'has' };
  const params = filtersToParams(filters);
  assert.equal(params.get('q'), 'brand:kiva -sample');
  assert.deepEqual(plain(filtersFromParams(params)), filters);
  assert.deepEqual(plain(filtersFromParams(new URLSearchParams('stock=NOWHERE&images=bogus&description=x'))), plain(EMPTY_FILTERS));
  assert.equal(filtersToParams(EMPTY_FILTERS).toString(), '');
  assert.equal(countActiveFilters(EMPTY_FILTERS), 0);
  assert.equal(countActiveFilters({ ...EMPTY_FILTERS, query: '   ' }), 0);
  assert.equal(countActiveFilters(filters), 8);
});

test('facets are distinct, sorted and skip blanks', () => {
  assert.deepEqual(plain(buildFacets([...catalog, product({ brandName: '  ', vendorName: null })])), {
    categories: ['Edibles', 'Flower', 'Pre-Rolls'],
    brands: ['Kiva', 'Lowell'],
    vendors: ['Kiva', 'Lost Farm Distribution', 'Lowell Farms'],
    strainTypes: ['Hybrid', 'Sativa'],
  });
});
