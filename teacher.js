/* Teacher dashboard: Firebase Auth + Firestore reader (Option C) */

const db = (window.db && typeof window.db.collection === "function") ? window.db : null;
const auth = (window.auth && typeof window.auth.onAuthStateChanged === "function") ? window.auth : null;

// Restrict teacher access here (recommended). Leave empty to allow any signed-in user.
const ALLOWED_STAFF_EMAILS = [
  // "j.connolly@school.org",
];

const teacherEmail = document.getElementById("teacherEmail");
const teacherPassword = document.getElementById("teacherPassword");
const loginBtn = document.getElementById("btnTeacherLogin");
const logoutBtn = document.getElementById("btnTeacherLogout");
const authMsg = document.getElementById("teacherAuthMsg");
const dashboard = document.getElementById("teacher-dashboard");

const refreshBtn = document.getElementById("refreshBtn");
const exportBtn = document.getElementById("exportBtn");
const dataStatus = document.getElementById("dataStatus");

const filterClass = document.getElementById("filterClass");
const filterName = document.getElementById("filterName");
const tbody = document.querySelector("#attemptsTable tbody");

const previewDialog = document.getElementById("previewDialog");
const previewFrame = document.getElementById("previewFrame");
const previewTitle = document.getElementById("previewTitle");
const previewHint = document.getElementById("previewHint");
const previewClose = document.getElementById("previewClose");

let currentRows = [];
let allRowsCache = [];

function setAuthMsg(msg){ if (authMsg) authMsg.textContent = msg || ""; }
function setDataStatus(msg){ if (dataStatus) dataStatus.textContent = msg || ""; }
function show(el, yes){ if (el) el.style.display = yes ? "" : "none"; }

function isAllowedEmail(email){
  const list = (ALLOWED_STAFF_EMAILS || []).map(x => String(x).toLowerCase().trim()).filter(Boolean);
  if (list.length === 0) return true;
  const e = String(email || "").toLowerCase().trim();
  return list.includes(e);
}

function fmtDate(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("en-GB", { dateStyle:"short", timeStyle:"short" });
  }catch(_){ return iso || ""; }
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function clearTable(){ if (tbody) tbody.innerHTML = ""; }

function featuresText(r){
  const arr = Array.isArray(r.features) ? r.features : [];
  return arr.length ? arr.join(" • ") : "-";
}

function renderTable(rows){
  clearTable();
  if (!tbody) return;

  rows.forEach(r => {
    const tr = document.createElement("tr");
    const link = r.project_url || "";
    tr.innerHTML = `
      <td>${fmtDate(r.created_at)}</td>
      <td>${escapeHtml(r.class)}</td>
      <td>${escapeHtml(r.student_name)}</td>
      <td>${escapeHtml(r.scratch_username || "-")}</td>
      <td><a href="${escapeHtml(link)}" target="_blank" rel="noopener">Open</a></td>
      <td>-</td>
      <td style="max-width:520px; white-space:normal;">${escapeHtml(featuresText(r))}</td>
      <td style="text-align:right; white-space:nowrap;">
        <button type="button" class="btn btn--sm" data-action="preview" data-id="${r.id}">Preview</button>
        <button type="button" class="btn btn--sm btn--ghost" data-action="delete" data-id="${r.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function applyFiltersAndRender(){
  const cls = (filterClass?.value || "").trim();
  const nameNeedle = (filterName?.value || "").trim().toLowerCase();

  let rows = [...allRowsCache];
  if (cls) rows = rows.filter(r => String(r.class || "").trim() === cls);
  if (nameNeedle) rows = rows.filter(r => String(r.student_name || "").toLowerCase().includes(nameNeedle));
  rows.sort((a,b) => String(b.created_at||"").localeCompare(String(a.created_at||"")));

  currentRows = rows;
  renderTable(rows);
  setDataStatus(`Showing ${rows.length} submission(s).`);
  if (exportBtn) exportBtn.disabled = rows.length === 0;
}

function readLocal(){
  try{
    const key = "y8_scratch_submissions_local";
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    return existing.map((r, idx) => ({
      id: (r.created_at ? `local_${r.created_at}` : (r.id ? String(r.id) : `local_${idx}`)),
      _source: "local",
      _local_created_at: r.created_at || null,
      ...r
    }));
  }catch(_){ return []; }
}

async function loadSubmissions(){
  setDataStatus("Loading…");
  if (refreshBtn) refreshBtn.disabled = true;
  if (exportBtn) exportBtn.disabled = true;

  try{
    if (!db){
      allRowsCache = readLocal();
      applyFiltersAndRender();
      setDataStatus(`Local mode: showing ${allRowsCache.length} submission(s) from this browser only.`);
      return;
    }

    const snap = await db.collection("submissions")
      .orderBy("created_at", "desc")
      .limit(500)
      .get();

    allRowsCache = snap.docs.map(d => ({ id: d.id, _source: "firestore", ...d.data() }));
    applyFiltersAndRender();
  }catch(e){
    console.error(e);
    setDataStatus("Failed to load submissions. Check Firestore rules + Firebase initialisation.");
  }finally{
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function downloadCsv(filename, csvText){
  const blob = new Blob([csvText], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCsv(){
  if (!currentRows.length) return;

  const headers = ["created_at","class","student_name","scratch_username","project_url","project_id","features","ua"];
  const lines = [headers.join(",")];

  currentRows.forEach(r => {
    const row = [
      r.created_at || "",
      r.class || "",
      r.student_name || "",
      r.scratch_username || "",
      r.project_url || "",
      r.project_id || "",
      (Array.isArray(r.features) ? r.features.join(";") : ""),
      r.user_agent || ""
    ].map(v => `"${String(v).replace(/"/g,'""')}"`);
    lines.push(row.join(","));
  });

  downloadCsv("y8_scratch_submissions.csv", lines.join("\n"));
}

function projectEmbedUrl(projectId){
  if (!projectId) return null;
  return `https://scratch.mit.edu/projects/${encodeURIComponent(projectId)}/embed`;
}

function openPreview(row){
  const embed = projectEmbedUrl(row.project_id);
  if (!embed){ alert("No project ID found for this submission (bad link)."); return; }

  if (previewTitle) previewTitle.textContent = `Preview: ${row.student_name || ""}`;
  if (previewHint) previewHint.textContent = row.project_url || "";
  if (previewFrame) previewFrame.src = embed;

  if (previewDialog && typeof previewDialog.showModal === "function") previewDialog.showModal();
  else window.open(row.project_url || embed, "_blank");
}

function closePreview(){
  try{ if (previewDialog) previewDialog.close(); }catch(_){}
  if (previewFrame) previewFrame.src = "";
}


async function deleteSubmission(row){
  const when = row && row.created_at ? `\n\nDate: ${row.created_at}` : "";
  const who = row && row.student_name ? `\nName: ${row.student_name}` : "";
  const cls = row && row.class ? `\nClass: ${row.class}` : "";
  if (!confirm(`Delete this submission? This cannot be undone.${who}${cls}${when}`)) return;

  try{
    if (row._source === "firestore"){
      if (!db) throw new Error("Firestore not initialised on this page.");
      await db.collection("submissions").doc(row.id).delete();
    } else {
      // Local mode: remove by created_at where possible, otherwise by index match on stored JSON
      const key = "y8_scratch_submissions_local";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const filtered = existing.filter(r => {
        if (row._local_created_at) return String(r.created_at || "") !== String(row._local_created_at);
        // fallback: keep anything that doesn't match the visible row's key fields
        return !(
          String(r.student_name||"") === String(row.student_name||"") &&
          String(r.class||"") === String(row.class||"") &&
          String(r.project_url||"") === String(row.project_url||"") &&
          String(r.created_at||"") === String(row.created_at||"")
        );
      });
      localStorage.setItem(key, JSON.stringify(filtered));
    }

    // Refresh table to reflect deletion
    await loadSubmissions();
    setDataStatus("Deleted.");
  }catch(e){
    console.error(e);
    alert(e?.message || "Delete failed.");
  }
}

function wireMenu(){
  const ham = document.getElementById("hamburger");
  const nav = document.getElementById("topnav");
  if (!ham || !nav) return;

  ham.addEventListener("click", () => {
    const open = nav.classList.toggle("show");
    ham.setAttribute("aria-expanded", open ? "true" : "false");
  });

  nav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => {
      nav.classList.remove("show");
      ham.setAttribute("aria-expanded", "false");
    });
  });
}

// Auth
function setSignedOut(){
  show(loginBtn, !!auth);
  show(logoutBtn, false);
  show(dashboard, false);
  if (refreshBtn) refreshBtn.disabled = true;
  if (exportBtn) exportBtn.disabled = true;
  setAuthMsg(auth ? "Please sign in to view submissions." : "Firebase not enabled — local mode.");
  setDataStatus("");
  allRowsCache = [];
  currentRows = [];
  clearTable();
}

function setSignedIn(user){
  show(loginBtn, false);
  show(logoutBtn, true);
  show(dashboard, true);
  if (refreshBtn) refreshBtn.disabled = false;
  setAuthMsg(`Signed in as ${user.email}`);
  loadSubmissions();
}

async function signInEmailPassword(){
  const email = (teacherEmail?.value || "").trim();
  const password = teacherPassword?.value || "";
  if (!email || !password){ setAuthMsg("Enter your email and password."); return; }
  setAuthMsg("Signing in…");
  try{ await auth.signInWithEmailAndPassword(email, password); }
  catch(e){ console.error(e); setAuthMsg(e?.message || "Sign-in failed."); }
}

async function signOut(){
  try{ await auth.signOut(); }catch(e){ console.error(e); }
}

function wireAuth(){
  auth.onAuthStateChanged((user) => {
    if (!user){ setSignedOut(); return; }
    const email = user.email || "";
    if (!isAllowedEmail(email)){
      setAuthMsg(`Signed in as ${email} (not authorised).`);
      auth.signOut();
      return;
    }
    setSignedIn(user);
  });

  loginBtn?.addEventListener("click", signInEmailPassword);
  logoutBtn?.addEventListener("click", signOut);
  teacherPassword?.addEventListener("keydown", (e) => { if (e.key === "Enter") signInEmailPassword(); });
}

function wireUi(){
  refreshBtn?.addEventListener("click", loadSubmissions);
  filterClass?.addEventListener("change", applyFiltersAndRender);
  filterName?.addEventListener("input", () => {
    clearTimeout(window.__nameTimer);
    window.__nameTimer = setTimeout(applyFiltersAndRender, 150);
  });
  exportBtn?.addEventListener("click", exportCsv);

  tbody?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    const row = allRowsCache.find(r => r.id === id);
    if (action === "preview" && row) openPreview(row);
    if (action === "delete" && row) deleteSubmission(row);
  });

  previewClose?.addEventListener("click", closePreview);
  previewDialog?.addEventListener("close", closePreview);
}

(function main(){
  wireMenu();
  wireUi();

  if (!db || !auth){
    show(loginBtn, false);
    show(logoutBtn, false);
    show(dashboard, true);
    setAuthMsg("Firebase not enabled — local mode only (shows submissions made on this browser). To track whole classes, configure Firebase + rules.");
    loadSubmissions();
    return;
  }

  wireAuth();
  setSignedOut();
})();
