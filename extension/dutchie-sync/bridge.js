window.addEventListener("message", event => {
  if (event.source !== window || event.origin !== "https://canyon.backoffice.dutchie.com" || event.data?.type !== "court-image-snapshot-v1") return;
  chrome.runtime.sendMessage({ type: "capture", snapshot: event.data.snapshot }).catch(() => {});
});
