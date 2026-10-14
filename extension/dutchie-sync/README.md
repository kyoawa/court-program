# Dutchie Catalog Image Sync

Install the unpacked extension in Chrome (chrome://extensions → Developer mode → Load unpacked). Choose this folder. Sign in to Canyon Backoffice normally. Configure the private SYNC_IMPORT_TOKEN from the Railway app, then test product 1577752 before running the catalog.

The worker fetches product IDs from the authenticated /api/images/sync endpoint, opens one catalog page to capture the authenticated metadata request, then sends batches of five metadata requests through that page. Session fields and request headers remain in the page closure and are sent only to the original Dutchie endpoint. Document-start scripts observe only successful get-product-extra-info responses. They forward only product/image IDs, image URLs and capture time. Only image mappings leave the Dutchie tab. Session fields and headers are never sent to Railway; descriptions, inventory, prices and compliance fields are not imported. No script clicks Save or calls a Dutchie mutation API.

The sync is catalog-wide and does not need twelve store runs. Coverage is limited to products visible to the app's API account. The current app uses its default BILLINGS API credential for the product list. The user can also enter a specific product ID.

Each import atomically replaces one catalog snapshot; snapshots older than the stored capture are ignored. Empty successful responses clear mappings, not Dutchie images. API uploads made after the snapshot remain discoverable. The existing deletion routes read both sources. Deletion is a separate explicit UI operation.

The key permits reading the product ID list and writing image mappings. It does not authorize extension calls to deletion routes. The application has existing unauthenticated mutation routes; this feature does not retrofit app-wide authentication. Do not distribute the key or add it to source control. Rotate the Railway variable to revoke it.

Five metadata requests run concurrently; their five app imports settle before the next batch. HTTP 429 and server errors retry with bounded exponential delays. A successful 25-product pilot is available. The queue and progress persist in extension storage. A timeout, login expiry, import failure or unexpected response pauses instead of skipping a product. Resume reloads the unfinished product. Browser restart pauses the job. Do not navigate the dedicated tab while syncing. Keep Chrome running; alarms may be delayed by Chrome scheduling. New runs can reuse the extension's previous dedicated tab. Partial batches are retried idempotently after a pause; progress advances only after all five records are saved.

Internal Dutchie responses are not a supported public API contract and may change. This extension is intentionally restricted to Canyon Backoffice and the current Railway app domain. Change the manifest and worker together if moving domains.

Run tests from the repository root: `node --test tests/image-sync.cjs`. Chrome content script reference: https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts
