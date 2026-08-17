const CONFIGURED = !!(window.SUPABASE_URL && window.SUPABASE_URL.startsWith("http"));
const client = CONFIGURED ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null;

const $ = (sel) => document.querySelector(sel);

const ICONS = {
  folder: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  file: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
};

const state = {
  folders: [],
  files: [],
  folderId: null,
  folderQuery: "",
  fileQuery: "",
  fileSort: "newest"
};

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function safeUrl(u) {
  return /^https?:\/\//i.test(u || "") ? u : "";
}

function formatNum(n) {
  return Intl.NumberFormat().format(n);
}

function downloadUrl(f) {
  return "https://archive.org/download/" + encodeURIComponent(f.archive_id) + "/" + encodeURIComponent(f.filename);
}

const root = document.documentElement;
let theme = localStorage.getItem("ms-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

function applyTheme(t) {
  theme = t;
  root.setAttribute("data-theme", t);
  localStorage.setItem("ms-theme", t);
  $("#themeToggle").innerHTML = t === "dark" ? ICONS.moon : ICONS.sun;
}

applyTheme(theme);

function route() {
  const hash = location.hash || "#/";
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  if (hash.startsWith("#/folder/")) {
    const id = hash.slice(9);
    $("#view-folder").classList.remove("hidden");
    openFolder(id);
  } else if (hash.startsWith("#/storage")) {
    $("#view-storage").classList.remove("hidden");
    loadFolders();
  } else {
    $("#view-home").classList.remove("hidden");
    loadHomeStats();
  }
  window.scrollTo(0, 0);
}

function showConfigMsg(el) {
  document.querySelector(el).innerHTML = '<div class="empty">Storage is not configured yet. Open supabase-config.js and paste your Supabase URL and anon key.</div>';
}

function showError(el, msg) {
  document.querySelector(el).innerHTML = '<div class="empty">Error: ' + esc(msg) + "</div>";
}

async function loadFolders() {
  if (!client) { showConfigMsg("#folderGrid"); return; }
  const { data, error } = await client.from("folders").select("*").order("sort_order");
  if (error) { showError("#folderGrid", error.message); return; }
  state.folders = data || [];
  renderFolders();
}

function renderFolders() {
  const q = state.folderQuery.toLowerCase();
  const list = state.folders.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.description || "").toLowerCase().includes(q)
  );
  const grid = $("#folderGrid");
  if (!list.length) {
    grid.innerHTML = '<div class="empty">' + (q ? "No folders match your search." : "No folders yet.") + "</div>";
    return;
  }
  grid.innerHTML = list
    .map(
      (f) =>
        '<a class="folder-card" href="#/folder/' + f.id + '" style="--card-accent:' + (f.color || "#4f8cff") + '">' +
        '<div class="folder-icon">' + ICONS.folder + "</div>" +
        '<div class="folder-name">' + esc(f.name) + "</div>" +
        (f.description ? '<div class="folder-desc">' + esc(f.description) + "</div>" : "") +
        "</a>"
    )
    .join("");
}

async function openFolder(id) {
  if (!client) { showConfigMsg("#fileList"); return; }
  state.folderId = id;
  const folder = state.folders.find((f) => f.id === id);
  if (folder) {
    $("#folderTitle").textContent = folder.name;
    $("#folderDesc").textContent = folder.description || "";
  }
  const { data, error } = await client
    .from("files")
    .select("*")
    .eq("folder_id", id)
    .order("sort_order");
  if (error) { showError("#fileList", error.message); return; }
  state.files = data || [];
  renderFiles();
}

function renderFiles() {
  const q = state.fileQuery.toLowerCase();
  let list = state.files.filter(
    (f) => f.name.toLowerCase().includes(q) || (f.changelog || "").toLowerCase().includes(q)
  );
  const s = state.fileSort;
  list.sort((a, b) => {
    if (s === "oldest") return (a.release_date || "").localeCompare(b.release_date || "");
    if (s === "largest") return (b.size_gb || 0) - (a.size_gb || 0);
    if (s === "smallest") return (a.size_gb || 0) - (b.size_gb || 0);
    if (s === "az") return a.name.localeCompare(b.name);
    return (b.release_date || "").localeCompare(a.release_date || "");
  });
  const listEl = $("#fileList");
  if (!list.length) {
    listEl.innerHTML = '<div class="empty">' + (q ? "No files match your search." : "This folder is empty.") + "</div>";
    return;
  }
  listEl.innerHTML = list.map(fileCard).join("");
  list.forEach((f) => loadCount(f, listEl));
}

function fileCard(f) {
  const cover = safeUrl(f.cover_url);
  const size = f.size_gb ? f.size_gb + " GB" : "";
  const date = f.release_date
    ? new Date(f.release_date + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "";
  return (
    '<article class="file-card' + (cover ? " has-cover" : "") + '">' +
    '<div class="file-main">' +
    '<div class="file-icon">' + ICONS.file + "</div>" +
    '<div class="file-info">' +
    (cover ? '<img class="file-cover" src="' + esc(cover) + '" alt="" loading="lazy">' : "") +
    '<div class="file-name-row"><h3 class="file-name">' + esc(f.name) + "</h3>" +
    '<span class="downloads" id="count-' + f.id + '"></span></div>' +
    '<div class="file-meta">' +
    (size ? '<span class="chip">' + size + "</span>" : "") +
    (date ? '<span class="chip">' + date + "</span>" : "") +
    '<span class="chip chip-file">' + esc(f.filename) + "</span>" +
    "</div>" +
    (f.changelog
      ? '<details class="changelog"><summary>Changelog</summary><div class="changelog-body">' + esc(f.changelog) + "</div></details>"
      : "") +
    "</div>" +
    "</div>" +
    '<a class="btn btn-primary" href="' + downloadUrl(f) + '" target="_blank" rel="noopener">Download</a>' +
    "</article>"
  );
}

async function loadCount(f, container) {
  const el = container.querySelector("#count-" + f.id);
  if (!el) return;
  try {
    const res = await fetch("https://be-api.us.archive.org/views/v1/short/" + encodeURIComponent(f.archive_id));
    if (!res.ok) return;
    const json = await res.json();
    const data = json[f.archive_id];
    if (data && data.all_time > 0) el.textContent = formatNum(data.all_time) + " downloads";
  } catch (_) {}
}

async function loadHomeStats() {
  if (!client) return;
  const [foldersRes, filesRes] = await Promise.all([
    client.from("folders").select("id", { count: "exact", head: true }),
    client.from("files").select("id", { count: "exact", head: true })
  ]);
  const folderCount = foldersRes.count ?? 0;
  const fileCount = filesRes.count ?? 0;
  if (folderCount === 0 && fileCount === 0) return;
  $("#heroStats").innerHTML =
    '<div class="stat"><div class="stat-num">' + folderCount + '</div><div class="stat-label">Folders</div></div>' +
    '<div class="stat"><div class="stat-num">' + fileCount + '</div><div class="stat-label">Files</div></div>';
}

$("#brandBtn").addEventListener("click", () => { location.hash = "#/"; });
$("#openStorageBtn").addEventListener("click", () => { location.hash = "#/storage"; });
$("#storageBackBtn").addEventListener("click", () => { location.hash = "#/"; });
$("#folderBackBtn").addEventListener("click", () => { location.hash = "#/storage"; });
$("#themeToggle").addEventListener("click", () => applyTheme(theme === "dark" ? "light" : "dark"));
$("#folderSearch").addEventListener("input", (e) => { state.folderQuery = e.target.value; renderFolders(); });
$("#fileSearch").addEventListener("input", (e) => { state.fileQuery = e.target.value; renderFiles(); });
$("#fileSort").addEventListener("change", (e) => { state.fileSort = e.target.value; renderFiles(); });

window.addEventListener("hashchange", route);
route();