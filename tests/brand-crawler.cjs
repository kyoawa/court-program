const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { exports, require: name => { if (!(name in imports)) throw new Error(name); return imports[name]; }, Set, Map, Array, Object, String, URL, JSON, Promise, RegExp, Date, setTimeout });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const searchQuery = load('src/lib/search-query.ts');
const finder = load('src/lib/brand-image-finder.ts', { './search-query': searchQuery });
const crawler = load('src/lib/brand-crawler.ts', { './brand-image-finder': finder, './search-query': searchQuery });
const { crawlBrandSource, canonicalImageUrl, largestFromSrcset, extractGalleryImages, isProductLink, isPaginationLink, keywordsFromTitle, normalizePageUrl } = crawler;

const site = 'https://stokes.example';
const listing = (page) => `
<html><head><title>Shop</title>${page === 1 ? '<link rel="next" href="/collections/all?page=2">' : ''}</head><body>
<img src="/cdn/logo.png" alt="Stokes logo">
<a href="/products/og-kush-1g?variant=1" title="OG Kush 1g Pre-Roll"><img srcset="/cdn/og_300x.jpg 300w, /cdn/og_600x.jpg 600w" alt="OG Kush 1g"></a>
<a href="/products/blue-dream-3-5g"><img data-src="/cdn/blue_400x400.jpg" alt=""><span>Blue Dream 3.5g</span></a>
<a href="/pages/about">About us</a>
<a href="/cart"><img src="/cdn/cart-icon.png" alt="cart"></a>
<a href="https://instagram.com/stokes"><img src="/cdn/insta.png"></a>
${page === 2 ? '<a href="/products/gelato-5pk"><img src="/cdn/gelato.jpg" alt="Gelato 5pk"></a>' : '<a href="/collections/all?page=2">Next</a>'}
<img src="/cdn/banner_1200x.webp" alt="Spring sale banner">
</body></html>`;
const product = (title, image) => `<html><head><title>${title} – Stokes</title><meta property="og:image" content="${image}"><meta property="og:title" content="${title}"></head><body><img src="/cdn/thumb.jpg"></body></html>`;
const pages = {
  [`${site}/collections/all`]: listing(1),
  [`${site}/collections/all?page=2`]: listing(2),
  [`${site}/products/og-kush-1g?variant=1`]: product('OG Kush 1g Pre-Roll', 'https://stokes.example/cdn/og.jpg?v=9'),
  [`${site}/products/blue-dream-3-5g`]: product('Blue Dream 3.5g', 'https://stokes.example/cdn/blue.jpg'),
  [`${site}/products/gelato-5pk`]: product('Gelato 5pk', 'https://stokes.example/cdn/gelato.jpg'),
};
const deps = (log = []) => ({ fetchPage: async url => { log.push(url); return pages[url] ?? null; }, sleep: async () => {} });

test('url helpers: canonical images, srcset, product and pagination detection', () => {
  assert.equal(canonicalImageUrl('https://x.com/cdn/og_600x600.jpg?v=9&width=600'), 'https://x.com/cdn/og.jpg');
  assert.equal(canonicalImageUrl('https://x.com/cdn/og_x800.jpg'), 'https://x.com/cdn/og.jpg');
  assert.equal(canonicalImageUrl('https://img.imgix.net/a.png?w=400&fit=crop&auto=format'), 'https://img.imgix.net/a.png');
  assert.equal(largestFromSrcset('/a_300.jpg 300w, /a_900.jpg 900w, /a_600.jpg 600w'), '/a_900.jpg');
  assert.equal(largestFromSrcset('/a.jpg 1x, /a@2x.jpg 2x'), '/a@2x.jpg');
  assert.equal(isProductLink('https://x.com/products/og-kush'), true);
  assert.equal(isProductLink('https://x.com/shop/og-kush'), true);
  assert.equal(isProductLink('https://x.com/pages/about'), false);
  assert.equal(isProductLink('https://x.com/pages/og-kush', '<img src="a.jpg">'), true);
  assert.equal(isProductLink('https://x.com/pages/about', '<img src="a.jpg">'), false);
  assert.equal(isProductLink('https://x.com/cart', '<img src="a.jpg">'), false);
  assert.equal(isProductLink('https://x.com/products/sheet.pdf'), false);
  assert.equal(isPaginationLink('https://x.com/collections/all?page=2', 'https://x.com/collections/all'), true);
  assert.equal(isPaginationLink('https://x.com/collections/all/page/3', 'https://x.com/collections/all'), true);
  assert.equal(isPaginationLink('https://x.com/other?page=2', 'https://x.com/collections/all'), false);
  assert.equal(isPaginationLink('https://x.com/anything', 'https://x.com/collections/all', 'next'), true);
  assert.equal(normalizePageUrl('https://x.com/a/?utm_source=ig#top'), 'https://x.com/a');
});

test('gallery extraction keeps product images with titles and links, drops chrome', () => {
  const images = plain(extractGalleryImages(listing(1), `${site}/collections/all`));
  assert.deepEqual(images.map(i => [i.imageUrl, i.title, i.linkUrl]), [
    ['https://stokes.example/cdn/og_600x.jpg', 'OG Kush 1g', 'https://stokes.example/products/og-kush-1g?variant=1'],
    ['https://stokes.example/cdn/blue_400x400.jpg', 'Blue Dream 3.5g', 'https://stokes.example/products/blue-dream-3-5g'],
    ['https://stokes.example/cdn/banner_1200x.webp', 'Spring sale banner', null],
  ]);
});

test('crawl follows pagination and product links on the same site, preferring product-page images', async () => {
  const log = [];
  const progress = [];
  const result = plain(await crawlBrandSource({ url: `${site}/collections/all` }, deps(log), { concurrency: 2 }, p => progress.push(p)));
  assert.equal(result.truncated, false);
  assert.equal(result.pagesVisited, 5);
  assert.deepEqual(result.errors, []);
  assert.ok(progress.length >= 2 && progress.at(-1).pagesVisited === 5);
  const byTitle = Object.fromEntries(result.candidates.map(c => [c.title, c]));
  assert.deepEqual(byTitle['OG Kush 1g Pre-Roll'], { imageUrl: 'https://stokes.example/cdn/og.jpg?v=9', title: 'OG Kush 1g Pre-Roll', pageUrl: `${site}/products/og-kush-1g?variant=1`, fromProductPage: true });
  assert.equal(byTitle['Blue Dream 3.5g'].fromProductPage, true);
  assert.equal(byTitle['Gelato 5pk'].fromProductPage, true);
  assert.equal(byTitle['Spring sale banner'].fromProductPage, false);
  // The 600x listing thumbnail and the og.jpg original are the same picture; only one survives.
  assert.equal(result.candidates.filter(c => c.imageUrl.includes('/og')).length, 1);
  assert.equal(log.some(url => url.includes('instagram')), false);
  assert.equal(log.some(url => url.includes('/pages/about')), false);
});

test('path prefix limits product links, and the page cap truncates', async () => {
  const limited = plain(await crawlBrandSource({ url: `${site}/collections/all`, pathPrefix: '/products/og-kush-1g' }, deps()));
  assert.deepEqual(limited.candidates.filter(c => c.fromProductPage).map(c => c.title), ['OG Kush 1g Pre-Roll']);
  const capped = plain(await crawlBrandSource({ url: `${site}/collections/all` }, deps(), { maxPages: 2 }));
  assert.equal(capped.truncated, true); assert.equal(capped.truncatedReason, 'pages'); assert.equal(capped.pagesVisited, 2);
});

test('time budget stops the crawl and failed pages are reported', async () => {
  let clock = 0;
  const slow = { fetchPage: async url => { clock += 70_000; if (url.endsWith('gelato-5pk')) throw new Error('boom'); return pages[url] ?? null; }, now: () => clock, sleep: async () => {} };
  const result = plain(await crawlBrandSource({ url: `${site}/collections/all` }, slow, { concurrency: 1, timeBudgetMs: 100_000 }));
  assert.equal(result.truncated, true); assert.equal(result.truncatedReason, 'time');
  const failing = { fetchPage: async url => { if (url.endsWith('gelato-5pk')) throw new Error('boom'); return pages[url] ?? null; }, sleep: async () => {} };
  const errors = plain(await crawlBrandSource({ url: `${site}/collections/all` }, failing)).errors;
  assert.deepEqual(errors, [{ url: `${site}/products/gelato-5pk`, error: 'boom' }]);
});

test('rule keywords drop brand, dosage and filler words', () => {
  assert.deepEqual(plain(keywordsFromTitle('Stokes OG Kush 1g Pre-Roll (5pk)', 'Stokes')), ['og', 'kush', 'pre', 'roll']);
  assert.deepEqual(plain(keywordsFromTitle('The Blue Dream Cannabis Product', 'Lowell Herb Co')), ['blue', 'dream']);
  assert.deepEqual(plain(keywordsFromTitle('', 'X')), []);
});
