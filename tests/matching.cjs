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
const { keywordsMatch, ruleMatches, matchProducts, sortRules } = load('src/lib/matching.ts', { './product-filters': filters });

const product = (overrides) => ({ productId: 1, productName: 'Stokes OG Kush 1g Pre-Roll', brandName: 'Stokes', category: 'Pre-Rolls', strain: 'OG Kush', strainType: 'Hybrid', ...overrides });
const rule = (overrides) => ({ id: 1, imageId: 10, imageName: 'img', brandName: null, category: null, strain: null, strainType: null, productNameKeywords: null, priority: 1, createdAt: '2026-01-01', ...overrides });

test('keywords: words, saved phrases, exclusions, regex, case-insensitive, name only', () => {
  assert.equal(keywordsMatch('Stokes OG Kush 1g Pre-Roll', ['og', 'kush']), true);
  assert.equal(keywordsMatch('Stokes OG Kush 1g Pre-Roll', ['og kush']), true);
  assert.equal(keywordsMatch('Stokes Kush OG 1g', ['og kush']), false);
  assert.equal(keywordsMatch('Stokes OG Kush 1g 5pk', ['1g', '-5pk']), false);
  assert.equal(keywordsMatch('Stokes OG Kush 1g', ['1g', '-5pk']), true);
  assert.equal(keywordsMatch('Stokes OG Kush 1g 5pk', ['-"1g 5pk"']), false);
  assert.equal(keywordsMatch('Stokes OG Kush 1g', ['/\\b1g\\b/']), true);
  assert.equal(keywordsMatch('Stokes OG Kush 1gx', ['/\\b1g\\b/']), false);
  assert.equal(keywordsMatch('Stokes OG Kush', ['KUSH']), true);
  assert.equal(keywordsMatch(null, ['kush']), false);
  assert.equal(keywordsMatch(null, []), true);
  assert.equal(keywordsMatch('anything', null), true);
});

test('rule fields compare case-insensitively and null means any', () => {
  assert.equal(ruleMatches(product(), rule({ brandName: 'stokes', category: 'PRE-ROLLS' })), true);
  assert.equal(ruleMatches(product(), rule({ brandName: 'Kiva' })), false);
  assert.equal(ruleMatches(product({ strain: null }), rule({ strain: 'OG Kush' })), false);
  assert.equal(ruleMatches(product(), rule({ strainType: 'Hybrid', productNameKeywords: ['-5pk'] })), true);
});

test('best match by priority then age, exclusions skip an image, alternatives listed', () => {
  const rules = [
    rule({ id: 1, imageId: 10, imageName: 'generic', brandName: 'Stokes', priority: 1, createdAt: '2026-01-01' }),
    rule({ id: 2, imageId: 20, imageName: 'specific', brandName: 'Stokes', productNameKeywords: ['og kush'], priority: 2, createdAt: '2026-02-01' }),
    rule({ id: 3, imageId: 30, imageName: 'older-generic', brandName: 'Stokes', priority: 1, createdAt: '2025-01-01' }),
  ];
  assert.deepEqual(plain(sortRules(rules).map(r => r.id)), [2, 3, 1]);
  const [outcome] = plain(matchProducts([product()], rules));
  assert.equal(outcome.matchedImageId, 20);
  assert.deepEqual(outcome.alternativeImageIds, [30, 10]);
  const [excluded] = plain(matchProducts([product()], rules, new Map([[20, new Set([1])]])));
  assert.equal(excluded.matchedImageId, 30);
  const [none] = plain(matchProducts([product({ brandName: 'Kiva' })], rules));
  assert.equal(none.matchedImageId, null); assert.deepEqual(none.alternativeImageIds, []);
});
