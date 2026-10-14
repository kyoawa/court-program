(() => {
  const endpoint = "/api/v2/inventory/get-product-extra-info";
  const matches = url => {
    try { const u = new URL(url, location.href); return u.origin === location.origin && u.pathname === endpoint; }
    catch { return false; }
  };
  function publish(body) {
    const productId = Number(location.pathname.match(/^\/products\/catalog\/(\d+)\/?$/)?.[1]);
    if (!productId || body?.Result !== true || !Array.isArray(body.Data?.images)) return;
    const rows = body.Data.images;
    if (rows.length > 100 || rows.some(r => r.WhseProducts_Id !== productId || !Number.isSafeInteger(r.Id) || r.Id <= 0 || typeof r.ProductImageFileName !== "string")) return;
    window.postMessage({ type: "court-image-snapshot-v1", snapshot: {
      productId, capturedAt: new Date().toISOString(),
      images: rows.map(r => ({ imageId: r.Id, imageUrl: r.ProductImageFileName }))
    } }, location.origin);
  }
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const selected = new WeakSet();
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    selected.delete(this);
    if (matches(url)) selected.add(this);
    return originalOpen.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    if (selected.has(this)) this.addEventListener("load", () => {
      if (this.status !== 200) return;
      try { publish(this.responseType === "json" ? this.response : JSON.parse(this.responseText)); } catch { /* Leave the original request unaffected. */ }
    }, { once: true });
    return originalSend.apply(this, args);
  };
  const originalFetch = window.fetch;
  window.fetch = async function(input, ...args) {
    const response = await originalFetch.call(this, input, ...args);
    if (response.ok && matches(typeof input === "string" ? input : input?.url ?? input)) {
      response.clone().json().then(publish).catch(() => {});
    }
    return response;
  };
})();
