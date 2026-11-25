const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);

async function render() {
  const { servers = [], activeId, connected = false, lastError = "" } = await api.storage.local.get([
    "servers", "activeId", "connected", "lastError",
  ]);

  $("noServers").hidden = servers.length > 0;
  $("main").hidden = servers.length === 0;
  if (!servers.length) return;

  const sel = $("server");
  sel.replaceChildren(
    ...servers.map((s) => {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name || s.host;
      return o;
    })
  );
  sel.value = activeId && servers.some((s) => s.id === activeId) ? activeId : servers[0].id;

  document.body.classList.toggle("on", connected);
  $("power").setAttribute("aria-label", connected ? "Disconnect" : "Connect");
  $("status").textContent = connected ? "Connected" : "Disconnected";

  $("error").hidden = !lastError;
  $("error").textContent = lastError;

  // Firefox MV3 treats <all_urls> as optional; make sure it is granted.
  const granted = await api.permissions.contains({ origins: ["<all_urls>"] });
  $("grant").hidden = granted;
}

async function checkIp() {
  $("ip").textContent = "…";
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch("https://api.ipify.org?format=json", { cache: "no-store", signal: ctrl.signal });
    $("ip").textContent = (await r.json()).ip;
  } catch {
    $("ip").textContent = "unknown";
  }
}

$("power").addEventListener("click", async () => {
  const { connected = false } = await api.storage.local.get("connected");
  await api.storage.local.set({ connected: !connected, activeId: $("server").value });
  await render();
  setTimeout(checkIp, 1200);
});

$("server").addEventListener("change", async (e) => {
  await api.storage.local.set({ activeId: e.target.value });
  setTimeout(checkIp, 1200);
});

$("grant").addEventListener("click", async () => {
  await api.permissions.request({ origins: ["<all_urls>"] });
  render();
});

const openOptions = (e) => {
  e.preventDefault();
  api.runtime.openOptionsPage();
};
$("openOptions").addEventListener("click", openOptions);
$("addFirst").addEventListener("click", openOptions);

api.storage.onChanged.addListener(render);
render();
checkIp();
