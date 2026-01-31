/*
  Year 8 Homework: Scratch Breakout (Arkanoid-style)

  Student workflow:
  - Build game in Scratch
  - Click Share
  - Submit the Scratch project link + Scratch username

  Storage:
  - Always saves a local copy in this browser (localStorage)
  - If Firebase Firestore is initialised on the page (window.db), it will also write to collection: submissions
*/

const CLASSES = ["8A1","8A2","8A3","8A4","8B1","8B2","8B3","8B4"];

// Firebase (optional)
// Resolve Firestore wrapper at call time (avoids load-order race conditions)
function getDb(){
  return (window.db && typeof window.db.collection === "function") ? window.db : null;
}


function $(id){ return document.getElementById(id); }

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function setStatus(msg){
  const el = $("status");
  if (el) el.textContent = msg || "";
}

function normaliseScratchLink(raw){
  const s = String(raw || "").trim();
  if (!s) return { ok:false, reason:"Paste your Scratch project link." };

  if (/^\d{4,}$/.test(s)){
    const id = s;
    return { ok:true, id,
      url:`https://scratch.mit.edu/projects/${id}/`,
      embed:`https://scratch.mit.edu/projects/${id}/embed`
    };
  }

  const m = s.match(/scratch\.mit\.edu\/projects\/(\d{4,})/i);
  if (!m) return { ok:false, reason:"That doesn’t look like a Scratch project link. It should include: scratch.mit.edu/projects/..." };

  const id = m[1];
  return { ok:true, id,
    url:`https://scratch.mit.edu/projects/${id}/`,
    embed:`https://scratch.mit.edu/projects/${id}/embed`
  };
}

function getCheckedFeatures(){
  const nodes = document.querySelectorAll('input[type="checkbox"][name="feat"]:checked');
  return Array.from(nodes).map(n => String(n.value || "").trim()).filter(Boolean);
}

function validateMeta(){
  const cls = $("studentClass")?.value?.trim() || "";
  const name = $("studentName")?.value?.trim() || "";
  const scratchUser = $("scratchUser")?.value?.trim() || "";
  const link = normaliseScratchLink($("projectLink")?.value);

  if (!CLASSES.includes(cls)) return "Please select your class.";
  if (name.length < 3) return "Please enter your full name.";
  if (scratchUser.length < 3) return "Please enter your Scratch username.";
  if (!link.ok) return link.reason;

  return null;
}

function buildPayload(){
  const cls = $("studentClass")?.value?.trim() || "";
  const name = $("studentName")?.value?.trim() || "";
  const scratchUser = $("scratchUser")?.value?.trim() || "";
  const rawLink = $("projectLink")?.value?.trim() || "";
  const link = normaliseScratchLink(rawLink);
  const now = new Date();

  return {
    class: cls,
    student_name: name,
    scratch_username: scratchUser,
    project_id: link.ok ? link.id : "",
    project_url: link.ok ? link.url : rawLink,
    project_embed: link.ok ? link.embed : "",
    features: getCheckedFeatures(),
    created_at: now.toISOString(),
    user_agent: navigator.userAgent || ""
  };
}

async function saveSubmission(payload){
  // Local first (always)
  try {
    const key = "y8_scratch_submissions_local";
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.push(payload);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (_) {}

  // Firestore optional
  const db = getDb();
  if (!db) return { ok:false, mode:"localStorage", error:"Firebase not initialised on this page (window.db missing)." };

  try {
    await db.collection("submissions").add(payload);
    return { ok:true, mode:"Firestore" };
  } catch (e) {
    console.warn("Firestore write failed:", e);
    const msg = (e && (e.message || e.code)) ? `${e.code ? e.code + ": " : ""}${e.message || ""}` : "Unknown Firestore error";
    return { ok:false, mode:"localStorage", error: msg };
  }
}

function showPreview(embedUrl){
  const wrap = $("previewWrap");
  const frame = $("previewFrame");
  if (!wrap || !frame) return;

  if (embedUrl){
    frame.src = embedUrl;
    wrap.style.display = "block";
    wrap.hidden = false;
  } else {
    frame.src = "";
    wrap.style.display = "none";
    wrap.hidden = true;
  }
}

function renderConfirmation(payload, mode, errorMsg){
  const out = $("results");
  if (!out) return;

  const extra = (mode === "localStorage" && errorMsg)
    ? `<p class="muted" style="margin-top:8px;"><strong>Why not Firestore?</strong> ${escapeHtml(errorMsg)}</p>`
    : "";

  out.hidden = false;
  out.innerHTML = `
    <h3>Submission received ✅</h3>
    <p class="muted">Saved via <strong>${escapeHtml(mode)}</strong>. You can re-submit later if you improve your game.</p>
    ${extra}
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(payload.student_name)} (${escapeHtml(payload.class)})</li>
      <li><strong>Scratch:</strong> ${escapeHtml(payload.scratch_username)}</li>
      <li><strong>Project link:</strong> <a href="${escapeHtml(payload.project_url)}" target="_blank" rel="noopener">Open on Scratch</a></li>
    </ul>
    <p class="fineprint">If your teacher can’t view it, it usually means you forgot to click <strong>Share</strong> or the link is wrong.</p>
  `;
}

function wireMenu(){
  const ham = $("hamburger");
  const nav = $("topnav");
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

function wirePreviewButton(){
  const btn = $("previewBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const link = normaliseScratchLink($("projectLink")?.value);
    if (!link.ok){
      setStatus(link.reason);
      return;
    }
    showPreview(link.embed);
  });
}

function wireSubmit(){
  const form = $("submitForm");
  const btn = $("submitBtn");
  if (!form || !btn) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("");

    const err = validateMeta();
    if (err){
      setStatus(err);
      return;
    }

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "Submitting…";

    try{
      const payload = buildPayload();
      const res = await saveSubmission(payload);
      renderConfirmation(payload, res.mode, res.error);
      showPreview(payload.project_embed);
      setStatus("");
    }finally{
      btn.disabled = false;
      btn.textContent = oldText || "Submit link";
    }
  });
}

function main(){
  wireMenu();
  wirePreviewButton();
  wireSubmit();
}

// Ensure DOM exists before wiring (module scripts can execute before elements are available)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
