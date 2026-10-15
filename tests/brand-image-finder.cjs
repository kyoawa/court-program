const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, Set, Map, Array, Object, String, URL, JSON, Promise, RegExp });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const finder = load('src/lib/brand-image-finder.ts', { './search-query': load('src/lib/search-query.ts') });
const { leaflyBrandSlug, leaflyBrandPages, extractLeaflyProductLinks, rankProductMatches, extractProductImages, buildBrandQueries, isAllowedProductPage, looksLikeProductPage, findBrandImages, DUTCHIE_NEEDS_SEARCH_NOTE } = finder;

const brandPage = `
<html><body>
<a href="/brands/kiva-confections/products/camino-midnight-blueberry-gummies"><div><span>Camino Midnight Blueberry Gummies</span></div></a>
<a href="https://www.leafly.com/brands/kiva-confections/products/petra-tart-cherry-mints?utm=x" title="Petra Tart Cherry Mints">img</a>
<a href="/brands/other-brand/products/camino-sours">Camino Sours</a>
<a href="/brands/kiva-confections/products/camino-midnight-blueberry-gummies">Camino</a>
</body></html>`;
const productPage = (image, title = 'Camino Midnight Blueberry Gummies | Kiva') => `
<html><head><title>${title}</title>
<meta property="og:image" content="${image}">
<meta property="og:title" content="${title}">
<link rel="icon" href="https://images.leafly.com/favicon.png">
</head><body><img src="https://images.leafly.com/logo.png"><img src="https://images.leafly.com/products/other.jpg"></body></html>`;

test('leafly brand slugs and pages', () => {
  assert.equal(leaflyBrandSlug("Kiva Confections"), 'kiva-confections');
  assert.equal(leaflyBrandSlug("Lowell Herb Co."), 'lowell-herb-co');
  assert.equal(leaflyBrandSlug("Wyld & Co's"), 'wyld-and-cos');
  assert.deepEqual(plain(leaflyBrandPages('Kiva')), ['https://www.leafly.com/brands/kiva', 'https://www.leafly.com/brands/kiva/products']);
  assert.deepEqual(plain(leaflyBrandPages('   ')), []);
});

test('brand page links are collected for the brand only, deduped, with the best title', () => {
  const links = plain(extractLeaflyProductLinks(brandPage, 'Kiva Confections'));
  assert.deepEqual(links, [
    { url: 'https://www.leafly.com/brands/kiva-confections/products/camino-midnight-blueberry-gummies', title: 'Camino Midnight Blueberry Gummies' },
    { url: 'https://www.leafly.com/brands/kiva-confections/products/petra-tart-cherry-mints', title: 'Petra Tart Cherry Mints' },
  ]);
});

test('candidates are ranked by shared product-name words and non-matches dropped', () => {
  const hits = extractLeaflyProductLinks(brandPage, 'Kiva Confections');
  assert.deepEqual(plain(rankProductMatches('Midnight Blueberry Gummies 100mg', hits)).map(h => h.title), ['Camino Midnight Blueberry Gummies']);
  assert.deepEqual(plain(rankProductMatches('Tart Cherry', hits)).map(h => h.title), ['Petra Tart Cherry Mints']);
  assert.deepEqual(plain(rankProductMatches('Lost Farm Chews', hits)), []);
  assert.equal(plain(rankProductMatches('', hits)).length, 2);
});

test('product images: og:image first, then JSON-LD and CDN images; chrome skipped; relative resolved', () => {
  assert.deepEqual(plain(extractProductImages(productPage('https://images.leafly.com/products/camino.jpg?w=600'), 'https://www.leafly.com/x')),
    ['https://images.leafly.com/products/camino.jpg?w=600', 'https://images.leafly.com/products/other.jpg']);
  const ld = `<html><head><script type="application/ld+json">{"@type":"Product","image":["https://images.dutchie.com/a.png",{"url":"https://images.dutchie.com/b.png"}]}</script></head><body></body></html>`;
  assert.deepEqual(plain(extractProductImages(ld, 'https://dutchie.com/p')), ['https://images.dutchie.com/a.png', 'https://images.dutchie.com/b.png']);
  assert.deepEqual(plain(extractProductImages('<meta content="/img/c.webp" property="og:image">', 'https://dutchie.com/dispensary/x/product/y')), ['https://dutchie.com/img/c.webp']);
  assert.deepEqual(plain(extractProductImages('<meta property="og:image" content="https://cdn/opengraph-default.png">', 'https://dutchie.com/')), []);
});

test('queries, host allow-list and product-page detection', () => {
  assert.deepEqual(plain(buildBrandQueries({ productName: 'Camino Gummies 100mg', brandName: 'Kiva' })),
    { Leafly: 'site:leafly.com/brands "Kiva" Camino Gummies', Dutchie: 'site:dutchie.com "Kiva" Camino Gummies' });
  assert.equal(isAllowedProductPage('https://www.leafly.com/brands/kiva'), true);
  assert.equal(isAllowedProductPage('https://dutchie.com/dispensary/x/product/y'), true);
  assert.equal(isAllowedProductPage('https://evil.com/dutchie.com'), false);
  assert.equal(isAllowedProductPage('http://dutchie.com/'), false);
  assert.equal(isAllowedProductPage('https://notdutchie.com/'), false);
  assert.equal(looksLikeProductPage('https://dutchie.com/dispensary/x/product/y'), true);
  assert.equal(looksLikeProductPage('https://www.leafly.com/brands/kiva/products/camino'), true);
  assert.equal(looksLikeProductPage('https://www.leafly.com/brands/kiva'), false);
});

test('without a web search the brand lookup uses Leafly brand pages and explains the Dutchie gap', async () => {
  const fetched = [];
  const pages = {
    'https://www.leafly.com/brands/kiva-confections': brandPage,
    'https://www.leafly.com/brands/kiva-confections/products/camino-midnight-blueberry-gummies': productPage('https://images.leafly.com/products/camino.jpg'),
    'https://www.leafly.com/brands/kiva-confections/products/petra-tart-cherry-mints': productPage('https://images.leafly.com/products/petra.jpg', 'Petra'),
  };
  const deps = { fetchPage: async url => { fetched.push(url); return pages[url] ?? null; } };
  const outcome = plain(await findBrandImages({ productId: 1, productName: 'Midnight Blueberry Gummies', brandName: 'Kiva Confections', category: 'Edibles', strain: null }, deps));
  assert.deepEqual(outcome, {
    images: [{ originalUrl: 'https://images.leafly.com/products/camino.jpg', thumbnailUrl: 'https://images.leafly.com/products/camino.jpg', title: 'Camino Midnight Blueberry Gummies | Kiva', source: 'Leafly', pageUrl: 'https://www.leafly.com/brands/kiva-confections/products/camino-midnight-blueberry-gummies' }],
    note: DUTCHIE_NEEDS_SEARCH_NOTE,
  });
  assert.equal(fetched.includes('https://www.leafly.com/brands/kiva-confections/products/petra-tart-cherry-mints'), false);
  const none = plain(await findBrandImages({ productId: 2, productName: 'Anything', brandName: null, category: null, strain: null }, deps));
  assert.deepEqual(none.images, []);
});

test('with a web search, Dutchie menus are included, foreign hosts ignored, results interleaved', async () => {
  const queries = [];
  const pages = {
    'https://www.leafly.com/brands/lowell': '<a href="/brands/lowell/products/the-social-pack">The Social Pack</a>',
    'https://www.leafly.com/brands/lowell/products/the-social-pack': productPage('https://images.leafly.com/social.jpg', 'Social Pack'),
    'https://dutchie.com/dispensary/green/product/lowell-social-pack': productPage('https://images.dutchie.com/social-1.png', 'Lowell Social Pack'),
    'https://dutchie.com/dispensary/blue/product/lowell-social-pack-2': productPage('https://images.dutchie.com/social-2.png', 'Lowell Social Pack 2'),
  };
  const deps = {
    fetchPage: async url => pages[url] ?? null,
    webSearch: async query => {
      queries.push(query);
      return query.startsWith('site:dutchie.com') ? [
        { url: 'https://evil.com/dutchie.com/product/x', title: 'nope' },
        { url: 'https://dutchie.com/dispensary/green', title: 'menu' },
        { url: 'https://dutchie.com/dispensary/green/product/lowell-social-pack', title: 'hit' },
        { url: 'https://dutchie.com/dispensary/blue/product/lowell-social-pack-2', title: 'hit 2' },
      ] : [];
    },
  };
  const outcome = plain(await findBrandImages({ productId: 3, productName: 'Social Pack 3.5g', brandName: 'Lowell', category: 'Pre-Rolls', strain: null }, deps, { maxResults: 3 }));
  assert.equal(outcome.note, undefined);
  assert.deepEqual(queries, ['site:dutchie.com "Lowell" Social Pack']);
  assert.deepEqual(outcome.images.map(i => [i.source, i.originalUrl]), [
    ['Dutchie', 'https://images.dutchie.com/social-1.png'],
    ['Leafly', 'https://images.leafly.com/social.jpg'],
    ['Dutchie', 'https://images.dutchie.com/social-2.png'],
  ]);
});

test('web search for Leafly is a fallback when the brand page yields nothing', async () => {
  const queries = [];
  const deps = {
    fetchPage: async url => url === 'https://www.leafly.com/brands/acme/products/widget' ? productPage('https://images.leafly.com/w.jpg', 'Widget') : null,
    webSearch: async query => { queries.push(query); return query.startsWith('site:leafly.com') ? [{ url: 'https://www.leafly.com/brands/acme/products/widget' }] : []; },
  };
  const outcome = plain(await findBrandImages({ productId: 4, productName: 'Widget', brandName: 'Acme', category: null, strain: null }, deps));
  assert.deepEqual(queries, ['site:leafly.com/brands "Acme" Widget', 'site:dutchie.com "Acme" Widget']);
  assert.deepEqual(outcome.images.map(i => i.originalUrl), ['https://images.leafly.com/w.jpg']);
});
