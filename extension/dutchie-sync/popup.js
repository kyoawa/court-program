const status = document.querySelector("#status");
async function render() {
  const { job, key } = await chrome.storage.local.get(["job", "key"]);
  document.querySelector("#key").placeholder = key ? "Key saved (paste to replace)" : "Paste your private sync key";
  status.textContent = job ? `${job.running ? "Running" : "Stopped"}: ${job.index} / ${job.ids.length} products\n${job.images} image mappings imported\n${job.message}` : "Ready. Test one product first.";
}
async function send(message) {
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (result?.error) throw new Error(result.error);
    if (message.type === "save") document.querySelector("#key").value = "";
    await render();
  } catch (error) { status.textContent = error.message; }
}
document.querySelector("#save").onclick = () => send({ type: "save", key: document.querySelector("#key").value });
document.querySelector("#one").onclick = () => send({ type: "start", productId: document.querySelector("#product").value });
document.querySelector("#all").onclick = () => { if (confirm("Read the entire catalog in a dedicated tab? This can take hours. You can pause and resume.")) send({ type: "start" }); };
document.querySelector("#pause").onclick = () => send({ type: "pause" });
document.querySelector("#resume").onclick = () => send({ type: "resume" });
chrome.storage.onChanged.addListener(render);
render();
