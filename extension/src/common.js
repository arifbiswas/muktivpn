// Shared by background, popup and options.
// Free servers come from servers.json in the GitHub repo, so new servers reach every user
// without publishing a new extension version. A copy is bundled for first run / offline.
var api = globalThis.browser ?? globalThis.chrome;

var FREE_LIST_URL = "https://raw.githubusercontent.com/arifbiswas/muktivpn/main/servers.json";

function normalizeServer(s, free) {
  const host = String(s?.host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const port = Number(s?.port ?? 443);
  if (!host || !(port > 0 && port < 65536)) return null;
  return {
    id: free ? `free:${host}:${port}` : s.id,
    name: String(s.name || host).trim(),
    country: String(s.country ?? "").trim(),
    host,
    port,
    username: String(s.username ?? ""),
    password: String(s.password ?? ""),
    free: !!free,
  };
}

// All servers the user can pick: free list first, then their own.
async function getAllServers() {
  const { freeServers = [], servers = [] } = await api.storage.local.get(["freeServers", "servers"]);
  return [...freeServers, ...servers];
}

async function refreshFreeServers() {
  let list = null;
  try {
    const r = await fetch(`${FREE_LIST_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) list = (await r.json()).servers;
  } catch {}
  if (!Array.isArray(list)) {
    const { freeServers } = await api.storage.local.get("freeServers");
    if (freeServers) return freeServers; // keep the last good list
    try {
      list = (await (await fetch(api.runtime.getURL("servers.json"))).json()).servers;
    } catch {
      list = [];
    }
  }
  const freeServers = list.map((s) => normalizeServer(s, true)).filter(Boolean);
  await api.storage.local.set({ freeServers, freeServersUpdated: Date.now() });
  return freeServers;
}

function flag(country) {
  const cc = String(country || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🌐";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
