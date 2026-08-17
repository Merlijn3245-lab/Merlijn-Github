const $ = (sel) => document.querySelector(sel);

let client = null;
let session = null;
let folders = [];
let files = [];
let folderFileCounts = {};
let currentFolder = null;
let formMode = "add";
let editingFolder = null;
let editingFile = null;

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}

function downloadUrl(f) {
  return "https://archive.org/download/" + encodeURIComponent(f.archive_id) + "/" + encodeURIComponent(f.filename);
}

function showLogin() {
  $("#loginView").classList.remove("hidden");
  $("#adminView").classList.add("hidden");
  $("#logoutBtn").classList.add("hidden");
}

function showAdmin() {
  $("#loginView").classList.add("hidden");
  $("#adminView").classList.remove("hidden");
  $("#logoutBtn").classList.remove("hidden");
  loadFolders();
}

function boot() {
  if (!window.SUPABASE_URL || !window.SUPABASE_URL.startsWith("http")) {
    $("#loginMsg").textContent = "supabase-config.js is not configured yet. Paste your Supabase URL and anon key there.";
    return;
  }
  client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  client.auth.getSession().then(({ data }) => {
    session = data.session;
    if (session) showAdmin();
    else showLogin();
  });
}

$("#brandBtn").addEventListener("click", () => { location.href = "index.html"; });

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    $("#loginMsg").textContent = "Login failed: " + error.message;
    return;
  }
  session = data.session;
  showAdmin();
});

$("#logoutBtn").addEventListener("click", async () => {
  await client.auth.signOut();
  session = null;
  showLogin();
});

async function loadFolders() {
  const { data, error } = await client.from("folders").select("*").order("sort_order");
  if (error) { alert("Failed to load folders: " + error.message); return; }
  folders = data || [];
  const { data: allFiles } = await client.from("files").select("folder_id");
  folderFileCounts = {};
  (allFiles || []).forEach((f) => {
    folderFileCounts[f.folder_id] = (folderFileCounts[f.folder_id] || 0) + 1;
  });
  renderFolderList();
}

function renderFolderList() {
  const ul = $("#folderList");
  ul.innerHTML = folders
    .map(
      (f) =>
        '<li class="' + (currentFolder && currentFolder.id === f.id ? "active" : "") + '">' +
        '<button data-folder="' + f.id + '">' +
        "<span>" + esc(f.name) + "</span>" +
        '<span class="muted small">' + (folderFileCounts[f.id] || 0) + "</span>" +
        "</button></li>"
    )
    .join("");
}

$("#folderList").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-folder]");
  if (!btn) return;
  currentFolder = folders.find((f) => f.id === btn.dataset.folder);
  hideForm();
  renderFolderList();
  await loadFiles();
});

async function loadFiles() {
  if (!currentFolder) return;
  $("#folderEmpty").classList.add("hidden");
  $("#folderManage").classList.remove("hidden");
  $("#manageTitle").textContent = currentFolder.name;
  const { data, error } = await client
    .from("files")
    .select("*")
    .eq("folder_id", currentFolder.id)
    .order("sort_order");
  if (error) { alert("Failed to load files: " + error.message); return; }
  files = data || [];
  renderFiles();
}

function renderFiles() {
  const rows = $("#fileRows");
  rows.innerHTML = files
    .map(
      (f) =>
        '<div class="file-row">' +
        "<div>" +
        '<div class="fname">' + esc(f.name) + "</div>" +
        '<div class="fsub">' + esc(f.archive_id) + " / " + esc(f.filename) +
        (f.size_gb ? " · " + f.size_gb + " GB" : "") + "</div>" +
        "</div>" +
        '<div class="row-actions">' +
        '<button class="btn btn-ghost btn-sm" data-copy="' + f.id + '">Copy URL</button>' +
        '<button class="btn btn-ghost btn-sm" data-edit="' + f.id + '">Edit</button>' +
        '<button class="btn btn-danger btn-sm" data-del="' + f.id + '">Delete</button>' +
        "</div></div>"
    )
    .join("");
}

$("#fileRows").addEventListener("click", async (e) => {
  const copyBtn = e.target.closest("button[data-copy]");
  if (copyBtn) {
    const f = files.find((x) => x.id === copyBtn.dataset.copy);
    if (!f) return;
    try {
      await navigator.clipboard.writeText(downloadUrl(f));
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy URL"; }, 1500);
    } catch (_) {
      alert(downloadUrl(f));
    }
    return;
  }
  const editBtn = e.target.closest("button[data-edit]");
  if (editBtn) {
    const f = files.find((x) => x.id === editBtn.dataset.edit);
    if (!f) return;
    showFileForm("edit", f);
    return;
  }
  const delBtn = e.target.closest("button[data-del]");
  if (delBtn) {
    const f = files.find((x) => x.id === delBtn.dataset.del);
    if (!f) return;
    if (!confirm('Delete "' + f.name + '"?')) return;
    const { error } = await client.from("files").delete().eq("id", f.id);
    if (error) { alert("Delete failed: " + error.message); return; }
    hideForm();
    await loadFiles();
  }
});

$("#addFolderBtn").addEventListener("click", () => showFolderForm("add", null));
$("#editFolderBtn").addEventListener("click", () => showFolderForm("edit", currentFolder));

$("#deleteFolderBtn").addEventListener("click", async () => {
  if (!currentFolder) return;
  if (!confirm('Delete folder "' + currentFolder.name + '" and ALL files inside it?')) return;
  const { error } = await client.from("folders").delete().eq("id", currentFolder.id);
  if (error) { alert("Delete failed: " + error.message); return; }
  currentFolder = null;
  files = [];
  hideForm();
  $("#folderEmpty").classList.remove("hidden");
  $("#folderManage").classList.add("hidden");
  await loadFolders();
});

$("#addFileBtn").addEventListener("click", () => showFileForm("add", null));

function hideForm() {
  $("#formArea").innerHTML = "";
  editingFolder = null;
  editingFile = null;
}

function showFolderForm(mode, folder) {
  formMode = mode;
  editingFolder = folder;
  const f = folder || {};
  $("#formArea").innerHTML =
    '<div class="inline-form">' +
    "<h4>" + (mode === "edit" ? "Edit folder" : "New folder") + "</h4>" +
    '<div class="form-row">' +
    '<label>Name<input id="ff-name" value="' + esc(f.name || "") + '" required></label>' +
    '<label>Color<input id="ff-color" type="color" value="' + esc(f.color || "#4f8cff") + '"></label>' +
    "</div>" +
    '<label class="full">Description<input id="ff-desc" value="' + esc(f.description || "") + '"></label>' +
    '<div class="form-actions">' +
    '<button class="btn btn-primary btn-sm" id="ff-save">Save</button>' +
    '<button class="btn btn-ghost btn-sm" id="ff-cancel">Cancel</button>' +
    "</div></div>";
  $("#ff-save").addEventListener("click", saveFolder);
  $("#ff-cancel").addEventListener("click", hideForm);
}

async function saveFolder() {
  const payload = {
    name: $("#ff-name").value.trim(),
    description: $("#ff-desc").value.trim(),
    color: $("#ff-color").value
  };
  if (!payload.name) { alert("Name is required."); return; }
  let res;
  if (formMode === "edit") {
    res = await client.from("folders").update(payload).eq("id", editingFolder.id);
  } else {
    res = await client.from("folders").insert([payload]);
  }
  if (res.error) { alert("Save failed: " + res.error.message); return; }
  hideForm();
  if (formMode === "add") {
    currentFolder = res.data[0];
    renderFolderList();
    await loadFiles();
  } else {
    await loadFolders();
    const fresh = folders.find((x) => x.id === currentFolder.id);
    if (fresh) { currentFolder = fresh; $("#manageTitle").textContent = fresh.name; }
  }
}

function showFileForm(mode, file) {
  formMode = mode;
  editingFile = file;
  const f = file || {};
  $("#formArea").innerHTML =
    '<div class="inline-form">' +
    "<h4>" + (mode === "edit" ? "Edit file" : "Add file") + "</h4>" +
    '<div class="form-row">' +
    '<label>Name<input id="ff-name" value="' + esc(f.name || "") + '" placeholder="Orion Drift v1.2.3" required></label>' +
    '<label>Size (GB)<input id="ff-size" type="number" step="0.1" min="0" value="' + esc(f.size_gb != null ? f.size_gb : "") + '" placeholder="5.2"></label>' +
    "</div>" +
    '<div class="form-row">' +
    '<label>Archive item ID<input id="ff-archive" value="' + esc(f.archive_id || "") + '" placeholder="orion-drift-v1-2-3" required></label>' +
    '<label>File name<input id="ff-file" value="' + esc(f.filename || "") + '" placeholder="orion-drift-v1.2.3.zip" required></label>' +
    "</div>" +
    '<div class="form-row">' +
    '<label>Release date<input id="ff-date" type="date" value="' + esc(f.release_date || "") + '"></label>' +
    '<label>Cover image URL<input id="ff-cover" value="' + esc(f.cover_url || "") + '" placeholder="https://... (optional)"></label>' +
    "</div>" +
    '<label class="full">Changelog<textarea id="ff-changelog" rows="4" placeholder="One change per line (optional)">' + esc(f.changelog || "") + "</textarea></label>" +
    '<div class="url-preview" id="ff-preview"></div>' +
    '<div class="form-actions">' +
    '<button class="btn btn-primary btn-sm" id="ff-save">Save</button>' +
    '<button class="btn btn-ghost btn-sm" id="ff-cancel">Cancel</button>' +
    "</div></div>";
  const updatePreview = () => {
    const a = $("#ff-archive").value.trim();
    const fn = $("#ff-file").value.trim();
    $("#ff-preview").textContent = a && fn ? "Download URL: https://archive.org/download/" + a + "/" + fn : "";
  };
  $("#ff-archive").addEventListener("input", updatePreview);
  $("#ff-file").addEventListener("input", updatePreview);
  updatePreview();
  $("#ff-save").addEventListener("click", saveFile);
  $("#ff-cancel").addEventListener("click", hideForm);
}

async function saveFile() {
  const payload = {
    name: $("#ff-name").value.trim(),
    archive_id: $("#ff-archive").value.trim(),
    filename: $("#ff-file").value.trim(),
    size_gb: $("#ff-size").value !== "" ? parseFloat($("#ff-size").value) : null,
    release_date: $("#ff-date").value || null,
    changelog: $("#ff-changelog").value,
    cover_url: $("#ff-cover").value.trim(),
    folder_id: currentFolder.id
  };
  if (!payload.name || !payload.archive_id || !payload.filename) {
    alert("Name, archive item ID and file name are required.");
    return;
  }
  let res;
  if (formMode === "edit") {
    res = await client.from("files").update(payload).eq("id", editingFile.id);
  } else {
    res = await client.from("files").insert([payload]);
  }
  if (res.error) { alert("Save failed: " + res.error.message); return; }
  hideForm();
  await loadFiles();
}

boot();