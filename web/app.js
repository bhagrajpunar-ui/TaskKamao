// TaskKamao user app — hash-routed single page app.
import {
  configIsSet, loadFirebase, loadSettings, esc, safeUrl, rupees, fmtCoins, fmtDate, sortByCreatedDesc,
  badge, toast, errMsg, configBanner, UPI_REGEX, PAN_REGEX, PHONE_REGEX,
} from "./common.js";
import { defaultSettings } from "./firebase-config.js";
import { termsHtml } from "./terms.js";

const view = document.getElementById("view");
const nav = document.getElementById("bottomNav");
const logoutBtn = document.getElementById("logoutBtn");

const S = {
  fb: null,          // { auth, db, A, F }
  user: null,        // Firebase auth user
  profile: null,     // users/{uid} doc data
  settings: { ...defaultSettings },
  unsubProfile: null,
  authReady: false,
  isAdmin: false,
};

const PUBLIC_ROUTES = new Set(["login", "terms"]);

function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [name, ...rest] = h.split("/");
  return { name: name || "", arg: decodeURIComponent(rest.join("/") || "") };
}

function go(path) {
  if (location.hash === "#/" + path) render();
  else location.hash = "#/" + path;
}

function setNav(name) {
  const show = !!S.user && !PUBLIC_ROUTES.has(name);
  nav.classList.toggle("hidden", !show);
  logoutBtn.classList.toggle("hidden", !S.user);
  nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.r === name || (name === "task" && a.dataset.r === "tasks")));
}

// ---------------------------------------------------------------- boot
async function boot() {
  window.addEventListener("hashchange", render);
  if (!configIsSet()) {
    S.authReady = true;
    render();
    return;
  }
  try {
    S.fb = await loadFirebase();
  } catch (e) {
    view.innerHTML = `<div class="banner bad"><b>Firebase load nahi ho paaya.</b><p>${esc(errMsg(e))}</p></div>`;
    return;
  }
  const { auth, A } = S.fb;
  logoutBtn.onclick = async () => { await A.signOut(auth); go("login"); };
  A.getRedirectResult(auth).catch((e) => toast(errMsg(e), true));
  A.onAuthStateChanged(auth, async (u) => {
    S.user = u;
    if (S.unsubProfile) { S.unsubProfile(); S.unsubProfile = null; }
    S.profile = null;
    S.isAdmin = false;
    if (u) {
      S.settings = await loadSettings(S.fb.db, S.fb.F);
      try {
        await ensureProfile(u);
      } catch (e) {
        toast("Profile nahi ban paaya: " + errMsg(e), true);
      }
      checkAdmin(u.uid);
      S.unsubProfile = S.fb.F.onSnapshot(S.fb.F.doc(S.fb.db, "users", u.uid), (snap) => {
        S.profile = snap.exists() ? snap.data() : null;
        const r = route().name;
        if (["dashboard", "wallet", "profile", ""].includes(r)) render();
      }, (e) => toast(errMsg(e), true));
    }
    S.authReady = true;
    const r = route().name;
    if (u && (r === "login" || r === "")) go("dashboard");
    else render();
  });
}

async function ensureProfile(u) {
  const { db, F } = S.fb;
  const ref = F.doc(db, "users", u.uid);
  const snap = await F.getDoc(ref);
  if (snap.exists()) return;
  await F.setDoc(ref, {
    uid: u.uid,
    name: (S.pendingName || u.displayName || (u.email || "").split("@")[0] || "TaskKamao User").slice(0, 60),
    email: u.email || "",
    phone: "",
    upiId: "",
    balance: 0,
    lockedCoins: 0,
    totalEarned: 0,
    taskEarned: 0,
    kycStatus: "none",
    status: "active",
    source: "web",
    createdAt: F.serverTimestamp(),
  });
}

async function checkAdmin(uid) {
  try {
    const snap = await S.fb.F.getDoc(S.fb.F.doc(S.fb.db, "admins", uid));
    S.isAdmin = snap.exists();
    if (S.isAdmin && route().name === "profile") render();
  } catch { S.isAdmin = false; }
}

// ---------------------------------------------------------------- render
async function render() {
  const { name, arg } = route();
  setNav(name);
  window.scrollTo(0, 0);

  if (!configIsSet()) {
    if (name === "terms") { view.innerHTML = configBanner() + termsHtml(S.settings); return; }
    view.innerHTML = configBanner() + landingHtml() ;
    return;
  }
  if (!S.authReady) { view.innerHTML = `<div class="spin"></div>`; return; }
  if (name === "terms") { view.innerHTML = termsHtml(S.settings) + backLink(); return; }
  if (!S.user) { renderLogin(); return; }

  try {
    switch (name) {
      case "tasks": return await renderTasks();
      case "task": return await renderTask(arg);
      case "submissions": return await renderSubmissions();
      case "wallet": return await renderWallet();
      case "profile": return renderProfile();
      case "login": case "": case "dashboard": default: return await renderDashboard();
    }
  } catch (e) {
    view.innerHTML = `<div class="banner bad"><b>Load nahi ho paaya</b><p>${esc(errMsg(e))}</p></div>`;
  }
}

function backLink() {
  return `<p class="center"><a href="#/${S.user ? "dashboard" : "login"}">← Wapas</a></p>`;
}

function landingHtml() {
  return `<div class="card hero"><div class="big">Tasks karo, coins kamao 🪙</div>
    <p class="sub">Chhote tasks poore karo, proof bhejo. Admin verify karega aur coins aapke wallet mein. UPI par withdraw karo.</p></div>
    <div class="card"><p>✅ Koi deposit nahi &nbsp; ✅ Koi investment nahi &nbsp; ✅ Sirf mehnat ki kamai</p>
    <p><a href="#/terms">Terms padhein</a></p></div>`;
}

// ---------------------------------------------------------------- login
function renderLogin() {
  let mode = "login";
  const draw = () => {
    view.innerHTML = `
    <div class="card hero"><div class="big">Namaste 🙏</div>
      <p class="sub">Tasks poore karo, admin verify kare, coins kamao aur UPI par withdraw karo.</p></div>
    <div class="card">
      <button class="gbtn" id="gBtn" type="button">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Google se login karein
      </button>
      <div class="or">— ya email se —</div>
      <div class="tabs">
        <button type="button" data-m="login" class="${mode === "login" ? "on" : ""}">Login</button>
        <button type="button" data-m="signup" class="${mode === "signup" ? "on" : ""}">Naya account</button>
      </div>
      <form id="emailForm">
        ${mode === "signup" ? `<label>Aapka naam</label><input name="name" required maxlength="60" placeholder="Jaise: Rahul Sharma" />` : ""}
        <label>Email</label><input name="email" type="email" required autocomplete="email" placeholder="aap@gmail.com" />
        <label>Password</label><input name="password" type="password" required minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" placeholder="Kam se kam 6 characters" />
        ${mode === "signup" ? `<label class="chk"><input type="checkbox" name="agree" required /> Main <a href="#/terms">Terms</a> se sehmat hoon</label>` : ""}
        <button class="block" type="submit">${mode === "signup" ? "Account banayein" : "Login"}</button>
      </form>
      ${mode === "login" ? `<p class="center"><a href="javascript:void 0" id="forgot">Password bhool gaye?</a></p>` : ""}
    </div>
    <p class="center links"><a href="#/terms">Terms &amp; Conditions</a></p>`;

    const { auth, A } = S.fb;
    view.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { mode = b.dataset.m; draw(); }));
    view.querySelector("#gBtn").onclick = async () => {
      const provider = new A.GoogleAuthProvider();
      try {
        await A.signInWithPopup(auth, provider);
      } catch (e) {
        if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") {
          await A.signInWithRedirect(auth, provider);
        } else toast(errMsg(e), true);
      }
    };
    const forgot = view.querySelector("#forgot");
    if (forgot) forgot.onclick = async () => {
      const email = view.querySelector("input[name=email]").value.trim();
      if (!email) return toast("Pehle upar apna email likhein.", true);
      try { await A.sendPasswordResetEmail(auth, email); toast("Password reset link email par bhej diya."); }
      catch (e) { toast(errMsg(e), true); }
    };
    view.querySelector("#emailForm").onsubmit = async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const btn = ev.target.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        if (mode === "signup") {
          // ensureProfile() (run from onAuthStateChanged) picks this name up for the new users/{uid} doc.
          S.pendingName = String(fd.get("name") || "").trim().slice(0, 60);
          const cred = await A.createUserWithEmailAndPassword(auth, fd.get("email").trim(), fd.get("password"));
          if (S.pendingName) A.updateProfile(cred.user, { displayName: S.pendingName }).catch(() => {});
        } else {
          await A.signInWithEmailAndPassword(auth, fd.get("email").trim(), fd.get("password"));
        }
      } catch (e) {
        toast(errMsg(e), true);
        btn.disabled = false;
      }
    };
  };
  draw();
}

// ---------------------------------------------------------------- data helpers
async function mySubmissions() {
  const { db, F } = S.fb;
  const q = F.query(F.collection(db, "submissions"), F.where("uid", "==", S.user.uid));
  const snap = await F.getDocs(q);
  return sortByCreatedDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

async function myWithdrawals() {
  const { db, F } = S.fb;
  const q = F.query(F.collection(db, "withdrawals"), F.where("uid", "==", S.user.uid));
  const snap = await F.getDocs(q);
  return sortByCreatedDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

async function activeTasks() {
  const { db, F } = S.fb;
  const q = F.query(F.collection(db, "tasks"), F.where("active", "==", true));
  const snap = await F.getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => t.type === "proof")
    .sort((a, b) => (b.reward || 0) - (a.reward || 0));
}

function blockedBanner() {
  if (S.profile?.status && S.profile.status !== "active") {
    return `<div class="banner bad"><b>Aapka account abhi hold par hai.</b><p>Naye tasks aur withdrawal band hain. Admin se sampark karein.</p></div>`;
  }
  return "";
}

// ---------------------------------------------------------------- dashboard
async function renderDashboard() {
  const p = S.profile || {};
  view.innerHTML = `${blockedBanner()}
    <div class="card hero">
      <div class="sub">Namaste, ${esc(p.name || "dost")} 👋</div>
      <div class="big">${fmtCoins(p.balance)} coins</div>
      <div class="sub">≈ ${rupees(p.balance, S.settings)} &nbsp;·&nbsp; ${esc(S.settings.coinsPerRupee)} coins = ₹1</div>
      ${p.lockedCoins ? `<div class="sub">🔒 ${fmtCoins(p.lockedCoins)} coins withdrawal mein reserved</div>` : ""}
    </div>
    <div class="grid2">
      <div class="card stat"><div class="n" id="stPending">…</div><div class="l">Pending tasks</div></div>
      <div class="card stat"><div class="n" id="stApproved">…</div><div class="l">Approved tasks</div></div>
    </div>
    <div class="card">
      <div class="row"><h3>Kul kamai</h3><span class="coin">${fmtCoins(p.totalEarned)} coins</span></div>
      <p class="muted">Har task ka proof admin manually check karta hai. Approve hote hi coins balance mein jud jaate hain.</p>
      <a class="btn block" href="#/tasks">Tasks dekho →</a>
      <a class="btn ghost block" href="#/wallet">Withdraw karo</a>
    </div>
    <p class="center links"><a href="#/terms">Terms</a>${S.isAdmin ? `<a href="admin.html">Admin panel</a>` : ""}</p>`;
  try {
    const subs = await mySubmissions();
    const el1 = document.getElementById("stPending"), el2 = document.getElementById("stApproved");
    if (el1) el1.textContent = subs.filter((s) => s.status === "pending").length;
    if (el2) el2.textContent = subs.filter((s) => s.status === "approved").length;
  } catch (e) {
    ["stPending", "stApproved"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = "–"; });
  }
}

// ---------------------------------------------------------------- tasks
async function renderTasks() {
  view.innerHTML = `<h2>✅ Tasks</h2><div class="spin"></div>`;
  const [tasks, subs] = await Promise.all([activeTasks(), mySubmissions()]);
  const byTask = Object.fromEntries(subs.map((s) => [s.taskId, s]));
  if (route().name !== "tasks") return;
  view.innerHTML = `${blockedBanner()}<h2>✅ Tasks</h2>
    <p class="muted">Task poora karo → proof bhejo → admin approve kare → coins milenge.</p>
    ${tasks.length ? "" : `<div class="card center muted">Abhi koi task nahi hai. Thodi der baad dekhein 🙂</div>`}
    ${tasks.map((t) => {
      const s = byTask[t.id];
      return `<a class="card task" href="#/task/${encodeURIComponent(t.id)}">
        <div class="ic">📝</div>
        <div class="body"><h3>${esc(t.title)}</h3><div class="d">${esc(t.description)}</div>
          ${s ? `<div style="margin-top:4px">${badge(s.status)}</div>` : ""}</div>
        <div class="coin">+${fmtCoins(t.reward)}</div>
      </a>`;
    }).join("")}`;
}

async function renderTask(id) {
  const { db, F } = S.fb;
  view.innerHTML = `<div class="spin"></div>`;
  const tSnap = await F.getDoc(F.doc(db, "tasks", id));
  const t = tSnap.exists() ? { id, ...tSnap.data() } : null;
  if (!t || t.type !== "proof") { view.innerHTML = `<div class="card center">Task nahi mila. <a href="#/tasks">Wapas</a></div>`; return; }
  const q = F.query(F.collection(db, "submissions"), F.where("uid", "==", S.user.uid), F.where("taskId", "==", id));
  const existing = (await F.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }))[0] || null;
  if (route().name !== "task") return;
  const link = safeUrl(t.link);
  const canSubmit = t.active && (!existing || existing.status === "rejected") && (S.profile?.status || "active") === "active";

  view.innerHTML = `${blockedBanner()}<p><a href="#/tasks">← Saare tasks</a></p>
    <div class="card">
      <div class="row"><h2>${esc(t.title)}</h2><span class="coin">+${fmtCoins(t.reward)} coins</span></div>
      <p class="muted">≈ ${rupees(t.reward, S.settings)}</p>
      <p style="white-space:pre-wrap">${esc(t.description)}</p>
      ${link ? `<a class="btn ghost block" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Task kholo ↗</a>` : ""}
      ${t.active ? "" : `<div class="banner warn" style="margin-top:12px">Yeh task abhi band hai.</div>`}
    </div>
    ${existing ? `<div class="card"><div class="row"><h3>Aapka proof</h3>${badge(existing.status)}</div>
        <p style="white-space:pre-wrap">${esc(existing.proofText)}</p>
        ${safeUrl(existing.proofLink) ? `<p><a href="${esc(safeUrl(existing.proofLink))}" target="_blank" rel="noopener noreferrer">Screenshot / link ↗</a></p>` : ""}
        ${existing.status === "rejected" && existing.rejectReason ? `<div class="banner bad">Reject reason: ${esc(existing.rejectReason)}</div>` : ""}
        <p class="muted">Bheja: ${fmtDate(existing.createdAt)}</p></div>` : ""}
    ${canSubmit ? `<form class="card" id="proofForm">
        <h3>${existing ? "Naya proof dobara bhejo" : "Proof bhejo"}</h3>
        <label>Kya kiya? (username, order ID, comment, jo task mein maanga ho)</label>
        <textarea name="proofText" required minlength="3" maxlength="2000" placeholder="Jaise: Maine channel subscribe kiya, mera username @rahul123 hai"></textarea>
        <label>Screenshot ka link (optional) — Google Drive / Photos / imgur share link</label>
        <input name="proofLink" type="url" maxlength="500" placeholder="https://..." />
        <p class="muted">Fake ya copy kiya hua proof reject hoga aur account block ho sakta hai.</p>
        <button class="block" type="submit">Proof submit karo</button>
      </form>` : ""}`;

  const form = document.getElementById("proofForm");
  if (!form) return;
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const proofText = String(fd.get("proofText") || "").trim();
    const proofLinkRaw = String(fd.get("proofLink") || "").trim();
    if (proofText.length < 3) return toast("Proof thoda detail mein likhein.", true);
    if (proofLinkRaw && !safeUrl(proofLinkRaw)) return toast("Link https:// se shuru hona chahiye.", true);
    const btn = form.querySelector("button");
    btn.disabled = true;
    const ref = F.doc(db, "submissions", `${id}_${S.user.uid}`);
    try {
      if (existing) {
        await F.updateDoc(ref, { proofText, proofLink: proofLinkRaw, status: "pending", rejectReason: null, createdAt: F.serverTimestamp() });
      } else {
        await F.setDoc(ref, {
          uid: S.user.uid, userName: S.profile?.name || "", taskId: id, taskTitle: t.title, reward: t.reward,
          proofText, proofLink: proofLinkRaw, status: "pending", createdAt: F.serverTimestamp(),
        });
      }
      toast("Proof bhej diya! Admin check karke approve karega ✅");
      go("submissions");
    } catch (e) {
      toast(errMsg(e), true);
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------- submissions
async function renderSubmissions() {
  view.innerHTML = `<h2>📋 Mere submissions</h2><div class="spin"></div>`;
  const subs = await mySubmissions();
  if (route().name !== "submissions") return;
  view.innerHTML = `<h2>📋 Mere submissions</h2>
    ${subs.length ? `<div class="card list">${subs.map((s) => `
      <div class="item">
        <div class="row"><b>${esc(s.taskTitle)}</b>${badge(s.status)}</div>
        <div class="row muted"><span>${fmtDate(s.createdAt)}</span><span class="coin">+${fmtCoins(s.reward)}</span></div>
        ${s.status === "rejected" && s.rejectReason ? `<p class="muted">Reason: ${esc(s.rejectReason)} · <a href="#/task/${encodeURIComponent(s.taskId)}">Dobara bhejo</a></p>` : ""}
      </div>`).join("")}</div>` : `<div class="card center muted">Abhi tak koi proof nahi bheja. <a href="#/tasks">Tasks dekho</a></div>`}`;
}

// ---------------------------------------------------------------- wallet
async function renderWallet() {
  const p = S.profile || {};
  const s = S.settings;
  const per = Number(s.coinsPerRupee) || 100;
  const min = Number(s.minWithdrawRupees) || 50;
  const max = Number(s.maxWithdrawRupeesPerRequest) || 500;
  const balRupees = Math.floor((p.balance || 0) / per);
  const needKyc = s.requireKycForWithdraw !== false && p.kycStatus !== "verified";
  const blocked = (p.status || "active") !== "active";

  let formHtml;
  if (blocked) formHtml = blockedBanner();
  else if (p.hasPendingWithdrawal) formHtml = `<div class="banner info">Aapki ek withdrawal request pehle se pending hai. Uske process hone ke baad nayi request bhej sakte hain.</div>`;
  else if (needKyc) formHtml = `<div class="banner warn"><b>Pehle KYC karein.</b><p>Withdrawal ke liye KYC verified hona zaroori hai (abhi: ${badge(p.kycStatus || "none")}). <a href="#/profile">Profile mein KYC bhejo →</a></p></div>`;
  else if (balRupees < min) formHtml = `<div class="banner info">Minimum withdrawal ₹${esc(min)} hai. Aapke paas ≈ ${rupees(p.balance, s)} hai — aur tasks karke ${fmtCoins(min * per - (p.balance || 0))} coins aur kamao.</div>`;
  else formHtml = `<form id="wForm">
      <label>UPI ID</label><input name="upiId" required maxlength="120" value="${esc(p.upiId || "")}" placeholder="naam@okaxis" autocapitalize="none" />
      <label>Amount (₹${esc(min)} – ₹${esc(Math.min(max, balRupees))}, poore rupaye)</label>
      <input name="amount" type="number" inputmode="numeric" required min="${esc(min)}" max="${esc(Math.min(max, balRupees))}" step="1" value="${esc(Math.min(max, balRupees))}" />
      <p class="muted">Request bhejte hi coins reserve ho jaayenge. Admin manually check karke UPI par payment bhejega.</p>
      <button class="block" type="submit">Withdrawal request bhejo</button>
    </form>`;

  view.innerHTML = `<h2>👛 Wallet</h2>
    <div class="card hero"><div class="sub">Available balance</div>
      <div class="big">${fmtCoins(p.balance)} coins</div>
      <div class="sub">≈ ${rupees(p.balance, s)}${p.lockedCoins ? ` · 🔒 ${fmtCoins(p.lockedCoins)} reserved` : ""}</div></div>
    <div class="card"><h3>Withdraw (UPI)</h3>${formHtml}</div>
    <div class="card"><h3>Withdrawal history</h3><div id="wHist"><div class="spin"></div></div></div>
    <p class="center muted">Koi "Add Money" ya deposit nahi hota. <a href="#/terms">Terms</a></p>`;

  const form = document.getElementById("wForm");
  if (form) form.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const upiId = String(fd.get("upiId") || "").trim().toLowerCase();
    const amt = Number(fd.get("amount"));
    if (!UPI_REGEX.test(upiId)) return toast("UPI ID sahi nahi hai (jaise naam@okaxis).", true);
    if (!Number.isInteger(amt) || amt < min || amt > max) return toast(`Amount ₹${min} se ₹${max} ke beech poore rupaye mein ho.`, true);
    const coins = amt * per;
    if (coins > (S.profile?.balance || 0)) return toast("Balance kam hai.", true);
    if (!confirm(`₹${amt} (${fmtCoins(coins)} coins) ${upiId} par withdraw karne ki request bhejein?`)) return;
    const btn = form.querySelector("button");
    btn.disabled = true;
    const { db, F } = S.fb;
    try {
      const wRef = F.doc(F.collection(db, "withdrawals"));
      const uRef = F.doc(db, "users", S.user.uid);
      const batch = F.writeBatch(db);
      batch.set(wRef, {
        uid: S.user.uid, name: S.profile?.kycName || S.profile?.name || "", upiId, amountRupees: amt, coins,
        status: "pending", source: "web", createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(),
      });
      batch.update(uRef, {
        balance: F.increment(-coins), lockedCoins: F.increment(coins), hasPendingWithdrawal: true, lastWithdrawalId: wRef.id,
      });
      await batch.commit();
      toast("Request bhej di! Admin approve karke UPI par payment karega.");
      renderWallet();
    } catch (e) {
      toast(errMsg(e), true);
      btn.disabled = false;
    }
  };

  try {
    const ws = await myWithdrawals();
    const el = document.getElementById("wHist");
    if (!el) return;
    el.innerHTML = ws.length ? `<div class="list">${ws.map((w) => `
      <div class="item">
        <div class="row"><b>₹${esc(w.amountRupees)} → ${esc(w.upiId)}</b>${badge(w.status)}</div>
        <div class="muted">${fmtDate(w.createdAt)}${w.utr ? ` · UTR: ${esc(w.utr)}` : ""}</div>
        ${w.status === "rejected" && (w.rejectReason || w.failureReason) ? `<div class="muted">Reason: ${esc(w.rejectReason || w.failureReason)} (coins wapas mil gaye)</div>` : ""}
      </div>`).join("")}</div>` : `<p class="muted">Abhi tak koi withdrawal nahi.</p>`;
  } catch (e) {
    const el = document.getElementById("wHist");
    if (el) el.innerHTML = `<p class="muted">${esc(errMsg(e))}</p>`;
  }
}

// ---------------------------------------------------------------- profile
function renderProfile() {
  const p = S.profile || {};
  const kyc = p.kycStatus || "none";
  const canKyc = kyc === "none" || kyc === "rejected";
  view.innerHTML = `<h2>👤 Profile</h2>
    <form class="card" id="pForm">
      <label>Naam</label><input name="name" required maxlength="60" value="${esc(p.name || "")}" />
      <label>Email</label><input value="${esc(S.user.email || p.email || "")}" disabled />
      <label>Mobile number (10 digit)</label><input name="phone" inputmode="numeric" maxlength="10" value="${esc(p.phone || "")}" placeholder="9876543210" />
      <label>UPI ID (payment ke liye)</label><input name="upiId" maxlength="120" value="${esc(p.upiId || "")}" placeholder="naam@okaxis" autocapitalize="none" />
      <button class="block" type="submit">Save karo</button>
    </form>
    <div class="card">
      <div class="row"><h3>KYC</h3>${badge(kyc)}</div>
      ${kyc === "verified" ? `<p class="muted">KYC verified: ${esc(p.kycName || "")} ${p.panMasked ? "· PAN " + esc(p.panMasked) : ""}</p>` : ""}
      ${kyc === "pending" ? `<p class="muted">Aapka KYC admin check kar raha hai.</p>` : ""}
      ${kyc === "rejected" && p.kycRejectReason ? `<div class="banner bad">Reason: ${esc(p.kycRejectReason)}</div>` : ""}
      ${canKyc ? `<form id="kForm">
        <p class="muted">Withdrawal ke liye zaroori. Naam wahi likhein jo PAN card aur UPI/bank account par hai.</p>
        <label>Legal naam (PAN ke hisaab se)</label><input name="kycName" required maxlength="80" />
        <label>PAN number</label><input name="pan" required maxlength="10" placeholder="ABCDE1234F" style="text-transform:uppercase" />
        <button class="block" type="submit">KYC bhejo</button>
      </form>` : ""}
    </div>
    <div class="card links"><a href="#/terms">Terms &amp; Conditions</a>${S.isAdmin ? `<a href="admin.html">Admin panel</a>` : ""}</div>`;

  const { db, F } = S.fb;
  const uRef = F.doc(db, "users", S.user.uid);
  document.getElementById("pForm").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const name = String(fd.get("name") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    const upiId = String(fd.get("upiId") || "").trim().toLowerCase();
    if (name.length < 2) return toast("Naam sahi likhein.", true);
    if (phone && !PHONE_REGEX.test(phone)) return toast("Mobile number 10 digit ka hona chahiye.", true);
    if (upiId && !UPI_REGEX.test(upiId)) return toast("UPI ID sahi nahi hai (jaise naam@okaxis).", true);
    try { await F.updateDoc(uRef, { name, phone, upiId, updatedAt: F.serverTimestamp() }); toast("Profile save ho gaya ✅"); }
    catch (e) { toast(errMsg(e), true); }
  };
  const kf = document.getElementById("kForm");
  if (kf) kf.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(kf);
    const kycName = String(fd.get("kycName") || "").trim();
    const pan = String(fd.get("pan") || "").trim().toUpperCase();
    if (kycName.length < 3) return toast("Legal naam poora likhein.", true);
    if (!PAN_REGEX.test(pan)) return toast("PAN sahi format mein likhein (ABCDE1234F).", true);
    try {
      const batch = F.writeBatch(db);
      batch.set(F.doc(db, "users", S.user.uid, "private", "kyc"), { name: kycName, pan, submittedAt: F.serverTimestamp() });
      batch.update(uRef, { kycStatus: "pending", kycName, panMasked: pan.slice(0, 2) + "XXXXX" + pan.slice(7), updatedAt: F.serverTimestamp() });
      await batch.commit();
      toast("KYC bhej diya. Admin verify karega.");
    } catch (e) { toast(errMsg(e), true); }
  };
}

boot();
