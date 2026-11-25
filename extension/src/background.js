// MuktiVPN background — works in Chrome / Edge / Brave / Opera / Vivaldi (MV3 service worker)
// and Firefox (MV3 event page). The same file is used for both builds.
const api = globalThis.browser ?? globalThis.chrome;
const IS_FIREFOX = typeof globalThis.browser !== "undefined" && !!api.runtime.getBrowserInfo;

const BYPASS = ["localhost", "127.0.0.1", "::1", "<local>", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

let state = { connected: false, server: null };

async function loadState() {
  const { connected = false, servers = [], activeId = null, lastError: saved = "" } = await api.storage.local.get([
    "connected", "servers", "activeId", "lastError",
  ]);
  lastError = saved;
  const server = servers.find((s) => s.id === activeId) ?? servers[0] ?? null;
  state = { connected: connected && !!server, server };
  return state;
}
let ready = loadState();

function basicAuth(user, pass) {
  // btoa only handles Latin-1; encode UTF-8 safely
  return "Basic " + btoa(String.fromCharCode(...new TextEncoder().encode(`${user}:${pass}`)));
}

function isLocalHost(host) {
  return host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "[::1]";
}

// ---------- Firefox: per-request proxy ----------
if (IS_FIREFOX) {
  api.proxy.onRequest.addListener(
    async (req) => {
      await ready;
      const s = state.server;
      if (!state.connected || !s) return { type: "direct" };
      try {
        if (isLocalHost(new URL(req.url).hostname)) return { type: "direct" };
      } catch {}
      return {
        type: "https",
        host: s.host,
        port: Number(s.port),
        proxyAuthorizationHeader: basicAuth(s.username, s.password),
        failoverTimeout: 5,
      };
    },
    { urls: ["<all_urls>"] }
  );
  api.proxy.onError.addListener((e) => setError(e.message));
}

// ---------- Chromium: global proxy setting ----------
async function applyChromeProxy() {
  if (IS_FIREFOX) return;
  if (state.connected && state.server) {
    await api.proxy.settings.set({
      value: {
        mode: "fixed_servers",
        rules: {
          singleProxy: { scheme: "https", host: state.server.host, port: Number(state.server.port) },
          bypassList: BYPASS,
        },
      },
      scope: "regular",
    });
    const cur = await api.proxy.settings.get({});
    if (cur.levelOfControl !== "controlled_by_this_extension") {
      setError("Another extension is controlling the proxy. Disable other VPN/proxy extensions.");
    }
  } else {
    await api.proxy.settings.clear({ scope: "regular" });
  }
}
if (!IS_FIREFOX) {
  api.proxy.onProxyError.addListener((e) => setError(friendlyProxyError(e.error)));
}

function friendlyProxyError(code = "") {
  if (/TUNNEL_CONNECTION_FAILED|PROXY_AUTH/.test(code))
    return "Server refused the connection. Check username/password in Options.";
  if (/PROXY_CONNECTION_FAILED|CONNECTION_REFUSED|TIMED_OUT|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE/.test(code))
    return "Cannot reach the VPN server. Check host/port, or that the server is running.";
  if (/CERT|SSL/.test(code)) return "Server TLS certificate problem. Re-run install.sh on the server.";
  return `Proxy error: ${code}`;
}

// ---------- Proxy authentication (both browsers) ----------
const triedRequests = new Set();
function credentialsFor(details) {
  if (!details.isProxy || !state.connected || !state.server) return null;
  if (triedRequests.has(details.requestId)) {
    setError("Wrong proxy username/password. Check the server in Options.");
    return { cancel: true };
  }
  triedRequests.add(details.requestId);
  setTimeout(() => triedRequests.delete(details.requestId), 60_000);
  return { authCredentials: { username: state.server.username, password: state.server.password } };
}

if (IS_FIREFOX) {
  api.webRequest.onAuthRequired.addListener(
    async (details) => {
      await ready;
      return credentialsFor(details) ?? {};
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
  );
} else {
  api.webRequest.onAuthRequired.addListener(
    (details, callback) => {
      ready.then(() => callback(credentialsFor(details) ?? {}));
    },
    { urls: ["<all_urls>"] },
    ["asyncBlocking"]
  );
}

// ---------- WebRTC leak protection ----------
async function applyWebRTC() {
  try {
    const setting = api.privacy?.network?.webRTCIPHandlingPolicy;
    if (!setting) return;
    if (state.connected) await setting.set({ value: "disable_non_proxied_udp" });
    else await setting.clear({});
  } catch (e) {
    console.warn("WebRTC policy:", e);
  }
}

// ---------- Badge / errors ----------
async function updateBadge() {
  await api.action.setBadgeText({ text: state.connected ? "ON" : "" });
  await api.action.setBadgeBackgroundColor({ color: "#16a34a" });
  await api.action.setTitle({ title: state.connected ? `MuktiVPN: connected to ${state.server?.name}` : "MuktiVPN: off" });
}

var lastError = "";
function setError(msg) {
  if (msg === lastError) return;
  // a specific "wrong password" message is more useful than the generic tunnel error that follows it
  if (/password/i.test(lastError) && /^(Server refused|Proxy error)/.test(msg)) return;
  lastError = msg;
  api.storage.local.set({ lastError: msg });
}
function clearError() {
  if (!lastError) return;
  lastError = "";
  api.storage.local.set({ lastError: "" });
}

// Once traffic flows through the proxy again, drop any stale error.
api.webRequest.onCompleted.addListener(
  (d) => {
    if (lastError && state.connected && d.statusCode < 400 && d.tabId >= 0) clearError();
  },
  { urls: ["<all_urls>"] }
);

async function applyAll() {
  await loadState();
  ready = Promise.resolve(state);
  triedRequests.clear();
  try {
    await applyChromeProxy();
  } catch (e) {
    setError(String(e?.message ?? e));
  }
  await applyWebRTC();
  await updateBadge();
}

api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.connected || changes.activeId || changes.servers) {
    if (changes.connected || changes.activeId || changes.servers) clearError();
    applyAll();
  }
});
api.runtime.onStartup.addListener(applyAll);
api.runtime.onInstalled.addListener(applyAll);
applyAll();
