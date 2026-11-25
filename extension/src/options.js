const $ = (id) => document.getElementById(id);
const FIELDS = ["name", "host", "port", "username", "password"];

const getServers = async () => (await api.storage.local.get("servers")).servers ?? [];
const setServers = (servers) => api.storage.local.set({ servers });
const newId = () => crypto.randomUUID();

function clean(s) {
  const host = String(s.host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const port = Number(s.port ?? 443);
  if (!host) throw new Error("host is required");
  if (!(port > 0 && port < 65536)) throw new Error("invalid port");
  return {
    id: s.id || newId(),
    name: String(s.name || host).trim(),
    host,
    port,
    username: String(s.username ?? ""),
    password: String(s.password ?? ""),
  };
}

async function renderFree() {
  const { freeServers = [] } = await api.storage.local.get("freeServers");
  $("freeEmpty").hidden = freeServers.length > 0;
  $("freeList").replaceChildren(
    ...freeServers.map((s) => {
      const li = document.createElement("li");
      const info = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = `${flag(s.country)}  ${s.name}`;
      const small = document.createElement("small");
      small.textContent = `${s.host}:${s.port}`;
      info.append(b, small);
      li.append(info);
      return li;
    })
  );
}
$("refreshFree").addEventListener("click", async () => {
  $("refreshFree").disabled = true;
  await refreshFreeServers();
  await renderFree();
  $("refreshFree").disabled = false;
});
renderFree();

async function render() {
  const servers = await getServers();
  $("empty").hidden = servers.length > 0;
  $("list").replaceChildren(
    ...servers.map((s) => {
      const li = document.createElement("li");
      const info = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = s.name;
      const small = document.createElement("small");
      small.textContent = `${s.host}:${s.port}`;
      info.append(b, small);

      const edit = document.createElement("button");
      edit.className = "secondary";
      edit.textContent = "Edit";
      edit.onclick = () => fillForm(s);

      const del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Delete";
      del.onclick = async () => {
        if (!confirm(`Delete ${s.name}?`)) return;
        await setServers((await getServers()).filter((x) => x.id !== s.id));
        const { activeId } = await api.storage.local.get("activeId");
        if (activeId === s.id) await api.storage.local.set({ activeId: null, connected: false });
        render();
      };
      li.append(info, edit, del);
      return li;
    })
  );
}

function fillForm(s) {
  $("id").value = s?.id ?? "";
  for (const f of FIELDS) $(f).value = s?.[f] ?? (f === "port" ? 443 : "");
  $("formTitle").textContent = s ? "Edit server" : "Add server";
  $("cancel").hidden = !s;
  $("name").focus();
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const s = clean(Object.fromEntries([["id", $("id").value], ...FIELDS.map((f) => [f, $(f).value])]));
  const servers = await getServers();
  const i = servers.findIndex((x) => x.id === s.id);
  if (i >= 0) servers[i] = s;
  else servers.push(s);
  await setServers(servers);
  fillForm(null);
  render();
});
$("cancel").addEventListener("click", () => fillForm(null));

$("import").addEventListener("click", async () => {
  try {
    const data = JSON.parse($("json").value);
    const incoming = (Array.isArray(data) ? data : [data]).map(clean);
    const servers = await getServers();
    for (const s of incoming) {
      const dup = servers.findIndex((x) => x.host === s.host && x.port === s.port && x.username === s.username);
      if (dup >= 0) servers[dup] = { ...s, id: servers[dup].id };
      else servers.push(s);
    }
    await setServers(servers);
    $("msg").textContent = `Imported ${incoming.length} server(s).`;
    $("json").value = "";
    render();
  } catch (err) {
    $("msg").textContent = `Import failed: ${err.message}`;
  }
});

$("export").addEventListener("click", async () => {
  const servers = (await getServers()).map(({ id, ...rest }) => rest);
  $("json").value = JSON.stringify(servers, null, 2);
  $("msg").textContent = "Contains passwords — share carefully.";
});

render();
