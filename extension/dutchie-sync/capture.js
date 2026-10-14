(() => {
  let requestTemplate;
  let busy = false;
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
  const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const requestHeaders = new WeakMap();
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (selected.has(this)) requestHeaders.get(this)[name] = value;
    return originalSetHeader.call(this, name, value);
  };
  const selected = new WeakSet();
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    selected.delete(this);
    if (matches(url)) { selected.add(this); requestHeaders.set(this, {}); }
    return originalOpen.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    if (selected.has(this)) {
      try {
        const body = JSON.parse(args[0]);
        if (body.SessionId && Number.isSafeInteger(body.ProductId)) {
          requestTemplate = { body, headers: { ...requestHeaders.get(this) } };
        }
      } catch { /* Not a usable authenticated request. */ }
    }
    if (selected.has(this)) this.addEventListener("load", () => {
      if (this.status !== 200) return;
      try { publish(this.responseType === "json" ? this.response : JSON.parse(this.responseText)); } catch { /* Leave the original request unaffected. */ }
    }, { once: true });
    return originalSend.apply(this, args);
  };
  const originalFetch = window.fetch;
  window.fetch = async function(input, ...args) {
    if (matches(typeof input === "string" ? input : input?.url ?? input)) {
      try {
        const body = JSON.parse(args[0]?.body);
        if (body.SessionId && Number.isSafeInteger(body.ProductId)) {
          requestTemplate = { body, headers: Object.fromEntries(new Headers(args[0]?.headers)) };
        }
      } catch { /* XHR normally supplies the template. */ }
    }
    const response = await originalFetch.call(this, input, ...args);
    if (response.ok && matches(typeof input === "string" ? input : input?.url ?? input)) {
      response.clone().json().then(publish).catch(() => {});
    }
    return response;
  };

  // Session data stays in this page closure and is used only on the same Dutchie endpoint.
  window.addEventListener("message", async event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.type !== "court-fetch-images-v2") return;
    const { ids, batchId } = event.data;
    if (busy || typeof batchId !== "string" || !Array.isArray(ids) || !ids.length || ids.length > 5 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return;
    busy = true;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function read(productId) {
      if (!requestTemplate) throw new Error("No authenticated request captured. Resume to reload the Dutchie page.");
      for (let attempt = 0; attempt < 4; attempt++) {
        const response = await originalFetch.call(window, endpoint, {
          method: "POST", credentials: "include", headers: requestTemplate.headers,
          body: JSON.stringify({ ...requestTemplate.body, ProductId: productId }),
          signal: AbortSignal.timeout(20000)
        });
        if ((response.status === 429 || response.status >= 500) && attempt < 3) {
          const retry = Number(response.headers.get("Retry-After"));
          await sleep(Math.min(20000, Math.max(1000 * 2 ** attempt, Number.isFinite(retry) ? retry * 1000 : 0)));
          continue;
        }
        if (!response.ok) throw new Error(`Dutchie returned ${response.status}. Sign in again if needed, then Resume.`);
        const data = await response.json();
        if (data?.Result !== true || !Array.isArray(data.Data?.images)) throw new Error("Dutchie did not return image data. Check the session and Resume.");
        const images = data.Data.images;
        if (images.length > 100 || images.some(r => r.WhseProducts_Id !== productId || !Number.isSafeInteger(r.Id) || r.Id <= 0 || typeof r.ProductImageFileName !== "string")) throw new Error("Image response did not match the requested product.");
        return { productId, capturedAt: new Date().toISOString(), images: images.map(r => ({ imageId: r.Id, imageUrl: r.ProductImageFileName })) };
      }
    }
    // Await every request, including failures, before allowing another five-request batch.
    const results = await Promise.all(ids.map(async id => {
      try { return { snapshot: await read(id) }; }
      catch (error) { return { error: error.message, productId: id }; }
    }));
    busy = false;
    window.postMessage({ type: "court-image-batch-v2", batchId, results }, location.origin);
  });
})();
