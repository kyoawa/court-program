const APP = "https://court-program-production.up.railway.app";
const DUTCHIE = "https://canyon.backoffice.dutchie.com";
// The sync key is available only to extension pages and this worker, not content scripts.
chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
let chain = Promise.resolve();
const serialize = task => { const result = chain.then(task); chain = result.catch(() => {}); return result; };
async function request(path, body) {
  const { key } = await chrome.storage.local.get("key");
  if (!key) throw new Error("Enter your sync key first.");
  const response = await fetch(APP + path, {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Sync failed (${response.status}).`);
  return data;
}
async function pause(message) {
  const { job } = await chrome.storage.local.get("job");
  if (job) await chrome.storage.local.set({ job: { ...job, running: false, message } });
  await chrome.alarms.clear("sync-timeout");
  await chrome.alarms.clear("sync-next");
}
async function visit() {
  const { job } = await chrome.storage.local.get("job");
  if (!job?.running) return;
  if (job.index >= job.ids.length) { await pause("Sync complete. Refresh the product page in Catalog Manager."); return; }
  const url = `${DUTCHIE}/products/catalog/${job.ids[job.index]}`;
  await chrome.alarms.create("sync-timeout", { when: Date.now() + 60000 });
  if (job.tabId) {
    try { await chrome.tabs.update(job.tabId, { url }); return; } catch { /* Closed tab: create a new dedicated tab. */ }
  }
  const tab = await chrome.tabs.create({ url, active: false });
  await chrome.storage.local.set({ job: { ...job, tabId: tab.id } });
}
async function nextBatch() {
  const { job } = await chrome.storage.local.get("job");
  if (!job?.running) return;
  if (job.index >= job.ids.length) { await pause("Sync complete. Refresh the product page in Catalog Manager."); return; }
  const batchId = crypto.randomUUID();
  const ids = job.ids.slice(job.index, job.index + 5);
  await chrome.storage.local.set({ job: { ...job, batchId, message: "Reading five image-metadata requests at a time…" } });
  await chrome.alarms.create("sync-timeout", { when: Date.now() + 180000 });
  await chrome.tabs.sendMessage(job.tabId, { type: "fetch-images", batchId, ids });
}
async function handle(message, sender) {
  if (message.type === "batch") {
    const { job } = await chrome.storage.local.get("job");
    if (!job?.running || sender.tab?.id !== job.tabId || sender.frameId !== 0 ||
        !sender.url?.startsWith(DUTCHIE + "/products/catalog/") || message.batchId !== job.batchId) return;
    const ids = job.ids.slice(job.index, job.index + 5);
    if (!Array.isArray(message.results) || message.results.length !== ids.length) throw new Error("Incomplete metadata batch. Resume to retry.");
    const snapshots = message.results.map((result, index) => {
      if (result.error) throw new Error(result.error);
      if (result.snapshot?.productId !== ids[index]) throw new Error("Unexpected product in metadata batch.");
      return result.snapshot;
    });
    // All app writes settle before advancing; partial failures are safe to retry.
    const results = await Promise.all(snapshots.map(async snapshot => {
      try { return await request("/api/images/sync", snapshot); }
      catch (error) { return { error: error.message }; }
    }));
    const failed = results.find(result => result.error || !result.synced);
    if (failed) throw new Error(failed.error || "A newer snapshot exists. Resume to retry.");
    await chrome.alarms.clear("sync-timeout");
    await chrome.storage.local.set({ job: { ...job, index: job.index + ids.length,
      images: job.images + results.reduce((total, result) => total + result.imageCount, 0), batchId: null } });
    return nextBatch();
  }
  if (message.type === "capture") {
    const { job } = await chrome.storage.local.get("job");
    const s = message.snapshot;
    if (!job?.running || job.batchId || sender.tab?.id !== job.tabId || sender.frameId !== 0 ||
        sender.url !== `${DUTCHIE}/products/catalog/${job.ids[job.index]}` || s?.productId !== job.ids[job.index]) return;
    // Only this read-only endpoint ever receives data from Dutchie. No cookies or headers are copied.
    const result = await request("/api/images/sync", s);
    if (!result.synced) throw new Error("A newer snapshot already exists. Resume to read this product again.");
    await chrome.alarms.clear("sync-timeout");
    await chrome.storage.local.set({ job: { ...job, index: job.index + 1, images: job.images + result.imageCount, message: `Synced product ${s.productId}.` } });
    await nextBatch();
    return;
  }
  // Only the extension popup may control a job or update the key.
  if (sender.url !== chrome.runtime.getURL("popup.html")) throw new Error("Unsupported sender.");
  if (message.type === "save") {
    if (typeof message.key !== "string" || message.key.length < 32) throw new Error("Paste the full sync key.");
    await chrome.storage.local.set({ key: message.key.trim() }); return;
  }
  if (message.type === "pause") return pause("Paused. Resume continues with the next unfinished product.");
  if (message.type === "resume") {
    const { job } = await chrome.storage.local.get("job");
    if (!job || job.index >= job.ids.length) throw new Error("No unfinished sync to resume.");
    await chrome.storage.local.set({ job: { ...job, running: true, batchId: null, message: "Resuming…" } });
    return visit();
  }
  if (message.type === "start") {
    const { job: previous } = await chrome.storage.local.get("job");
    if (previous?.running) throw new Error("Pause the current sync before starting another.");
    let ids;
    if (message.productId !== undefined) {
      const id = Number(message.productId);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Enter a valid product ID.");
      ids = [id];
    } else {
      ids = (await request("/api/images/sync")).productIds;
    }
    if (message.pilot === true) ids = ids.slice(0, 25);
    if (!Array.isArray(ids) || !ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error("No valid catalog products returned.");
    await chrome.storage.local.set({ job: { ids: [...new Set(ids)], index: 0, images: 0, running: true, message: "Starting five-request metadata sync…", startedAt: Date.now(), tabId: previous?.tabId } });
    return visit();
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  serialize(() => handle(message, sender)).then(() => reply({ ok: true })).catch(async error => {
    if (message.type === "capture" || message.type === "batch") await pause(error.message);
    reply({ error: error.message });
  });
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => {
  serialize(async () => {
    if (alarm.name === "sync-timeout") await pause("No image response received. Check the sync tab for an expired login or page error, then Resume.");
    if (alarm.name === "sync-next") await visit();
  }).catch(error => pause(error.message));
});
chrome.runtime.onStartup.addListener(() => serialize(() => pause("Chrome restarted. Sign in to Dutchie, then Resume.")));
