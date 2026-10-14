window.addEventListener("message", event => {
  if (event.source !== window || event.origin !== "https://canyon.backoffice.dutchie.com") return;
  if (event.data?.type === "court-image-snapshot-v1") {
    chrome.runtime.sendMessage({ type: "capture", snapshot: event.data.snapshot }).catch(() => {});
  }
  if (event.data?.type === "court-image-batch-v2") {
    chrome.runtime.sendMessage({ type: "batch", batchId: event.data.batchId, results: event.data.results }).catch(() => {});
  }
});
chrome.runtime.onMessage.addListener(message => {
  if (message.type === "fetch-images") {
    window.postMessage({ type: "court-fetch-images-v2", ids: message.ids, batchId: message.batchId }, location.origin);
  }
});
