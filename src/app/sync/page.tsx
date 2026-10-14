export default function SyncPage() {
  return <div className="max-w-2xl space-y-6">
    <h1 className="text-2xl font-semibold">Sync existing Dutchie images</h1>
    <p>Import image IDs from your company-wide catalog so existing images can be removed through Catalog Manager. Syncing only reads Dutchie and saves image mappings here. Image deletion remains a separate action.</p>
    <ol className="list-decimal pl-6 space-y-4">
      <li><a className="underline" href="/dutchie-image-sync.zip">Download the Chrome extension</a> and unzip it.</li>
      <li>Open <code>chrome://extensions</code> in Chrome, enable Developer mode, choose <strong>Load unpacked</strong>, and select the unzipped folder containing <code>manifest.json</code>.</li>
      <li>Open the extension and paste your private sync key. This is the <code>SYNC_IMPORT_TOKEN</code> variable on the Railway app service. It is separate from your Dutchie API keys.</li>
      <li>Sign in to Canyon Dutchie Backoffice. In the extension, enter a product ID and choose <strong>Sync this product</strong>. Start with <strong>1577752</strong>.</li>
      <li>After success, refresh that product in Catalog Manager. Its images should no longer show the missing image ID message.</li>
      <li>Choose <strong>Sync entire catalog</strong> when ready. Keep Chrome and the dedicated sync tab open. Pause and Resume preserve progress. An expired login or unexpected response pauses the run.</li>
    </ol>
    <p>The extension sends only product IDs, image IDs, image URLs, and capture times to this app. Dutchie login cookies stay in Chrome. It reads five products’ image metadata concurrently. Use the 25-product test before a full crawl; completion time depends on Dutchie response times and throttling.</p>
    <p>Run sync again after images are changed directly in Backoffice. If Dutchie changes its internal page responses, the extension may need an update. Catalog coverage follows the products visible to the app’s configured API account.</p>
  </div>;
}
