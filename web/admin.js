// TaskKamao admin panel. Access: Firestore doc admins/{uid} must exist (or custom claim admin=true).
import {
  configIsSet, loadFirebase, loadSettings, esc, safeUrl, rupees, fmtCoins, fmtDate, toMillis,
  badge, toast, errMsg, configBanner,
} from "./common.js";

const view = document.getElementById("view");
const tabsEl = document.getElementById("tabs");
const logoutBtn = document.getElementById("logoutBtn");
const S = { fb: null, user: null, settings: {}, tab: "subs", subFilter: "pending", wdFilter: "pending" };

async function boot() {
  if (!configIsSet()) { view.innerHTML = configBanner(); return; }
  try { S.fb = await loadFirebase(); }
  catch (e) { view.innerHTML = `<div class="banner bad">Firebase load nahi hua: ${esc(errMsg(e))}</div>`; return; }
  const { auth, A } = S.fb;
  logoutBtn.onclick = () => A.signOut(auth);
  tabsEl.querySelectorAll("button").forEach((b) => (b.onclick = () => { S.tab = b.dataset.t; drawTab(); }));
  A.getRedirectResult(auth).catch((e) => toast(errMsg(e), true));
  A.onAuthStateChanged(auth, async (u) => {
    S.user = u;
    logoutBtn.classList.toggle("hidden", !u);
    tabsEl.classList.add("hidden");
    if (!u) return renderLogin();
    view.innerHTML = `<div class="spin"></div>`;
    let ok = false;
    try {
      const tok = await u.getIdTokenResult();
      ok = tok.claims.admin === true;
      if (!ok) ok = (await S.fb.F.getDoc(S.fb.F.doc(S.fb.db, "admins", u.uid))).exists();
    } catch { ok = false; }
    if (!ok) {
      view.innerHTML = `<div class="card"><h2>⛔ Aap admin nahi hain</h2>
        <p>Admin banne ke liye Firebase Console &gt; Firestore mein collection <code>admins</code> banayein aur Document ID mein yeh UID daalein:</p>
        <p><code style="user-select:all">${esc(u.uid)}</code></p>
        <p class="muted">(Ek field bhi daal dein, jaise <code>role = "owner"</code>.) Phir yeh page refresh karein.</p></div>`;
      return;
    }
    S.settings = await loadSettings(S.fb.db, S.fb.F);
    tabsEl.classList.remove("hidden");
    drawTab();
  });
}

function renderLogin() {
  const { auth, A } = S.fb;
  view.innerHTML = `<div class="card" style="max-width:420px;margin:30px auto">
    <h2>Admin login</h2>
    <button class="gbtn" id="g" type="button">Google se login</button>
    <div class="or">— ya —</div>
    <form id="f"><label>Email</label><input name="e" type="email" required />
      <label>Password</label><input name="p" type="password" required />
      <button class="block" type="submit">Login</button></form></div>`;
  document.getElementById("g").onclick = async () => {
    const pr = new A.GoogleAuthProvider();
    try { await A.signInWithPopup(auth, pr); }
    catch (e) { if (e?.code === "auth/popup-blocked") await A.signInWithRedirect(auth, pr); else toast(errMsg(e), true); }
  };
  document.getElementById("f").onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try { await A.signInWithEmailAndPassword(auth, fd.get("e"), fd.get("p")); } catch (e) { toast(errMsg(e), true); }
  };
}

function drawTab() {
  tabsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === S.tab));
  view.innerHTML = `<div class="spin"></div>`;
  const fn = { subs: tabSubs, wds: tabWds, tasks: tabTasks, users: tabUsers, settings: tabSettings }[S.tab];
  fn().catch((e) => { view.innerHTML = `<div class="banner bad"><b>Load nahi hua</b><p>${esc(errMsg(e))}</p></div>`; });
}

const byNewest = (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt);
const byOldest = (a, b) => toMillis(a.createdAt) - toMillis(b.createdAt);

async function listWhereStatus(col, status) {
  const { db, F } = S.fb;
  const q = status === "all"
    ? F.query(F.collection(db, col), F.orderBy("createdAt", "desc"), F.limit(200))
    : F.query(F.collection(db, col), F.where("status", "==", status));
  const snap = await F.getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return rows.sort(status === "pending" ? byOldest : byNewest);
}

function filterBar(current, key) {
  const opts = key === "subFilter" ? ["pending", "approved", "rejected", "all"] : ["pending", "paid", "rejected", "all"];
  return `<div class="actions" style="margin-bottom:12px">${opts.map((o) =>
    `<button type="button" class="sm ${o === current ? "" : "ghost"}" data-f="${o}">${esc(o)}</button>`).join("")}</div>`;
}
function bindFilter(key) {
  view.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { S[key] = b.dataset.f; drawTab(); }));
}

// ---------------------------------------------------------------- submissions
async function tabSubs() {
  const rows = await listWhereStatus("submissions", S.subFilter);
  view.innerHTML = `<h2>Submissions (${rows.length})</h2>${filterBar(S.subFilter, "subFilter")}
    ${rows.length ? rows.map((s) => `<div class="card">
      <div class="row"><div><b>${esc(s.taskTitle)}</b> <span class="coin">+${fmtCoins(s.reward)}</span><br>
        <span class="muted">${esc(s.userName || "")} · uid ${esc(s.uid)} · ${fmtDate(s.createdAt)}</span></div>${badge(s.status)}</div>
      <p style="white-space:pre-wrap">${esc(s.proofText)}</p>
      ${safeUrl(s.proofLink) ? `<p><a href="${esc(safeUrl(s.proofLink))}" target="_blank" rel="noopener noreferrer">Proof link / screenshot ↗</a></p>` : (s.proofLink ? `<p class="muted">Link: ${esc(s.proofLink)}</p>` : "")}
      ${s.rejectReason ? `<p class="muted">Reject reason: ${esc(s.rejectReason)}</p>` : ""}
      ${s.status === "pending" ? `<div class="actions">
        <button class="okb sm" data-ap="${esc(s.id)}">Approve (+${fmtCoins(s.reward)})</button>
        <button class="danger sm" data-rj="${esc(s.id)}">Reject</button></div>` : ""}
    </div>`).join("") : `<div class="card muted center">Kuch nahi mila.</div>`}`;
  bindFilter("subFilter");
  view.querySelectorAll("[data-ap]").forEach((b) => (b.onclick = () => approveSub(b.dataset.ap, b)));
  view.querySelectorAll("[data-rj]").forEach((b) => (b.onclick = () => rejectSub(b.dataset.rj, b)));
}

async function approveSub(id, btn) {
  if (!confirm("Approve karein? Coins user ko turant mil jaayenge.")) return;
  btn.disabled = true;
  const { db, F } = S.fb;
  try {
    await F.runTransaction(db, async (t) => {
      const sRef = F.doc(db, "submissions", id);
      const sSnap = await t.get(sRef);
      if (!sSnap.exists()) throw new Error("Submission nahi mila.");
      const s = sSnap.data();
      if (s.status !== "pending") throw new Error("Yeh submission pehle hi " + s.status + " hai.");
      const uRef = F.doc(db, "users", s.uid);
      const uSnap = await t.get(uRef);
      if (!uSnap.exists()) throw new Error("User profile nahi mila.");
      const reward = Number(s.reward) || 0;
      t.update(sRef, { status: "approved", reviewedAt: F.serverTimestamp(), reviewedBy: S.user.uid });
      t.update(uRef, { balance: F.increment(reward), totalEarned: F.increment(reward), taskEarned: F.increment(reward) });
      t.set(F.doc(F.collection(db, "transactions")), {
        uid: s.uid, coins: reward, kind: "task", category: "earn", title: s.taskTitle || "Task",
        status: "success", meta: { submissionId: id, source: "web" }, createdAt: F.serverTimestamp(),
      });
    });
    toast("Approved ✅ coins credit ho gaye");
    drawTab();
  } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
}

async function rejectSub(id, btn) {
  const reason = prompt("Reject reason (user ko dikhega):", "Proof sahi nahi hai");
  if (reason === null) return;
  btn.disabled = true;
  const { db, F } = S.fb;
  try {
    await F.runTransaction(db, async (t) => {
      const ref = F.doc(db, "submissions", id);
      const snap = await t.get(ref);
      if (!snap.exists() || snap.data().status !== "pending") throw new Error("Yeh submission ab pending nahi hai.");
      t.update(ref, { status: "rejected", rejectReason: reason.trim().slice(0, 300) || "Proof sahi nahi hai", reviewedAt: F.serverTimestamp(), reviewedBy: S.user.uid });
    });
    toast("Rejected");
    drawTab();
  } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
}

// ---------------------------------------------------------------- withdrawals
async function tabWds() {
  const rows = await listWhereStatus("withdrawals", S.wdFilter);
  const total = rows.filter((w) => w.status === "pending").reduce((a, w) => a + (Number(w.amountRupees) || 0), 0);
  view.innerHTML = `<h2>Withdrawals (${rows.length})</h2>${filterBar(S.wdFilter, "wdFilter")}
    ${S.wdFilter === "pending" && rows.length ? `<div class="banner info">Kul pending: ₹${esc(total)}. Pehle apne UPI app se payment bhejein, phir UTR daal kar "Paid" mark karein.</div>` : ""}
    ${rows.length ? rows.map((w) => `<div class="card">
      <div class="row"><div><b>₹${esc(w.amountRupees)}</b> → <code style="user-select:all">${esc(w.upiId)}</code><br>
        <span class="muted">${esc(w.name || "")} · uid ${esc(w.uid)} · ${fmtCoins(w.coins)} coins · ${fmtDate(w.createdAt)}${w.source ? " · " + esc(w.source) : ""}</span></div>${badge(w.status)}</div>
      ${w.utr ? `<p class="muted">UTR: ${esc(w.utr)} · ${fmtDate(w.paidAt)}</p>` : ""}
      ${w.rejectReason ? `<p class="muted">Reason: ${esc(w.rejectReason)}</p>` : ""}
      ${w.status === "pending" ? `<div class="actions">
        <button class="okb sm" data-pd="${esc(w.id)}">Paid mark karo (UTR)</button>
        <button class="danger sm" data-rw="${esc(w.id)}">Reject + refund</button></div>` : ""}
    </div>`).join("") : `<div class="card muted center">Kuch nahi mila.</div>`}`;
  bindFilter("wdFilter");
  view.querySelectorAll("[data-pd]").forEach((b) => (b.onclick = () => settleWd(b.dataset.pd, "paid", b)));
  view.querySelectorAll("[data-rw]").forEach((b) => (b.onclick = () => settleWd(b.dataset.rw, "rejected", b)));
}

async function settleWd(id, outcome, btn) {
  let utr = "", reason = "";
  if (outcome === "paid") {
    utr = (prompt("UPI payment ka UTR / reference number:") || "").trim();
    if (!utr) return;
  } else {
    const r = prompt("Reject reason (coins user ko wapas milenge):", "UPI ID galat hai / KYC match nahi hua");
    if (r === null) return;
    reason = r.trim().slice(0, 300) || "Rejected";
  }
  btn.disabled = true;
  const { db, F } = S.fb;
  try {
    await F.runTransaction(db, async (t) => {
      const wRef = F.doc(db, "withdrawals", id);
      const wSnap = await t.get(wRef);
      if (!wSnap.exists()) throw new Error("Withdrawal nahi mila.");
      const w = wSnap.data();
      if (w.status !== "pending") throw new Error("Yeh request pehle hi " + w.status + " hai.");
      const uRef = F.doc(db, "users", w.uid);
      const uSnap = await t.get(uRef);
      if (!uSnap.exists()) throw new Error("User nahi mila.");
      const coins = Number(w.coins) || 0;
      const locked = Number(uSnap.data().lockedCoins) || 0;
      const unlock = Math.min(coins, locked);
      if (outcome === "paid") {
        t.update(wRef, { status: "paid", utr: utr.slice(0, 64), paidAt: F.serverTimestamp(), updatedAt: F.serverTimestamp(), reviewedBy: S.user.uid });
        t.update(uRef, { lockedCoins: F.increment(-unlock), hasPendingWithdrawal: false });
        t.set(F.doc(F.collection(db, "transactions")), {
          uid: w.uid, coins: -coins, kind: "withdrawal", category: "withdraw", title: `UPI withdrawal Rs ${w.amountRupees}`,
          status: "success", meta: { withdrawalId: id, utr, source: "web" }, createdAt: F.serverTimestamp(),
        });
      } else {
        t.update(wRef, { status: "rejected", rejectReason: reason, updatedAt: F.serverTimestamp(), reviewedBy: S.user.uid });
        t.update(uRef, { balance: F.increment(coins), lockedCoins: F.increment(-unlock), hasPendingWithdrawal: false });
      }
    });
    toast(outcome === "paid" ? "Paid mark ho gaya ✅" : "Rejected, coins refund ho gaye");
    drawTab();
  } catch (e) { toast(errMsg(e), true); btn.disabled = false; }
}

// ---------------------------------------------------------------- tasks
async function tabTasks() {
  const { db, F } = S.fb;
  const snap = await F.getDocs(F.query(F.collection(db, "tasks"), F.where("type", "==", "proof")));
  const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest);
  view.innerHTML = `<h2>Tasks</h2>
    <form class="card" id="tForm">
      <h3 id="tFormTitle">Naya task</h3>
      <input type="hidden" name="id" />
      <div class="formgrid">
        <div class="full"><label>Title</label><input name="title" required maxlength="100" placeholder="Jaise: YouTube channel subscribe karo" /></div>
        <div class="full"><label>Description / steps (user ko kya proof bhejna hai)</label><textarea name="description" required maxlength="2000"></textarea></div>
        <div><label>Reward (coins) — ${esc(S.settings.coinsPerRupee)} coins = ₹1</label><input name="reward" type="number" min="1" max="100000" step="1" required /></div>
        <div><label>Link (optional)</label><input name="link" type="url" maxlength="500" placeholder="https://..." /></div>
      </div>
      <label class="chk"><input type="checkbox" name="active" checked /> Active (users ko dikhega)</label>
      <div class="actions" style="margin-top:12px"><button type="submit">Save task</button><button type="button" class="ghost" id="tReset">Clear</button></div>
    </form>
    <div class="card tablewrap"><table>
      <tr><th>Task</th><th>Reward</th><th>Status</th><th></th></tr>
      ${tasks.map((t) => `<tr>
        <td><b>${esc(t.title)}</b><br><span class="muted">${esc(String(t.description || "").slice(0, 120))}</span></td>
        <td class="coin">${fmtCoins(t.reward)}<br><span class="muted">${rupees(t.reward, S.settings)}</span></td>
        <td>${t.active ? `<span class="badge b-approved">Active</span>` : `<span class="badge b-none">Disabled</span>`}</td>
        <td><div class="actions"><button class="sm ghost" data-ed="${esc(t.id)}">Edit</button>
          <button class="sm ${t.active ? "dark" : "okb"}" data-tg="${esc(t.id)}">${t.active ? "Disable" : "Enable"}</button></div></td>
      </tr>`).join("") || `<tr><td colspan="4" class="muted">Abhi koi task nahi.</td></tr>`}
    </table></div>`;
  const form = document.getElementById("tForm");
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  document.getElementById("tReset").onclick = () => { form.reset(); form.id.value = ""; document.getElementById("tFormTitle").textContent = "Naya task"; };
  view.querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => {
    const t = byId[b.dataset.ed];
    form.id.value = t.id; form.title.value = t.title || ""; form.description.value = t.description || "";
    form.reward.value = t.reward || ""; form.link.value = t.link || ""; form.active.checked = !!t.active;
    document.getElementById("tFormTitle").textContent = "Task edit: " + t.title;
    form.scrollIntoView({ behavior: "smooth" });
  }));
  view.querySelectorAll("[data-tg]").forEach((b) => (b.onclick = async () => {
    const t = byId[b.dataset.tg];
    try { await F.updateDoc(F.doc(db, "tasks", t.id), { active: !t.active, updatedAt: F.serverTimestamp() }); drawTab(); }
    catch (e) { toast(errMsg(e), true); }
  }));
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const reward = Number(form.reward.value);
    const link = form.link.value.trim();
    if (!Number.isInteger(reward) || reward < 1) return toast("Reward poora number ho.", true);
    if (link && !safeUrl(link)) return toast("Link https:// se shuru ho.", true);
    const data = {
      title: form.title.value.trim(), description: form.description.value.trim(), reward, link,
      active: form.active.checked, type: "proof", updatedAt: F.serverTimestamp(),
    };
    try {
      if (form.id.value) await F.updateDoc(F.doc(db, "tasks", form.id.value), data);
      else await F.addDoc(F.collection(db, "tasks"), { ...data, createdAt: F.serverTimestamp(), createdBy: S.user.uid });
      toast("Task save ho gaya ✅");
      drawTab();
    } catch (e) { toast(errMsg(e), true); }
  };
}

// ---------------------------------------------------------------- users
async function tabUsers() {
  const { db, F } = S.fb;
  const snap = await F.getDocs(F.query(F.collection(db, "users"), F.orderBy("balance", "desc"), F.limit(300)));
  const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const kycPending = users.filter((u) => u.kycStatus === "pending");
  view.innerHTML = `<h2>Users (${users.length})</h2>
    ${kycPending.length ? `<div class="banner warn">${kycPending.length} KYC pending hain.</div>` : ""}
    <input id="uSearch" placeholder="Naam / email / phone / UPI se dhoondo" style="margin-bottom:12px" />
    <div class="card tablewrap"><table id="uTable">
      <tr><th>User</th><th>Balance</th><th>Earned</th><th>KYC</th><th>Status</th><th></th></tr>
      ${users.map((u) => `<tr data-s="${esc([u.name, u.email, u.phone, u.upiId, u.id].join(" ").toLowerCase())}">
        <td><b>${esc(u.name || "—")}</b><br><span class="muted">${esc(u.email || u.phone || "")}${u.upiId ? " · " + esc(u.upiId) : ""}<br>${esc(u.id)}</span></td>
        <td class="coin">${fmtCoins(u.balance)}<br><span class="muted">${rupees(u.balance, S.settings)}${u.lockedCoins ? " · 🔒" + fmtCoins(u.lockedCoins) : ""}</span></td>
        <td>${fmtCoins(u.totalEarned)}</td>
        <td>${badge(u.kycStatus || "none")}${u.kycName ? `<br><span class="muted">${esc(u.kycName)} ${esc(u.panMasked || "")}</span>` : ""}</td>
        <td>${u.status === "active" || !u.status ? `<span class="badge b-approved">active</span>` : `<span class="badge b-rejected">${esc(u.status)}</span>`}</td>
        <td><div class="actions">
          ${u.kycStatus === "pending" ? `<button class="sm ghost" data-pan="${esc(u.id)}">PAN dekho</button>
            <button class="sm okb" data-kv="${esc(u.id)}">KYC verify</button><button class="sm danger" data-kr="${esc(u.id)}">KYC reject</button>` : ""}
          <button class="sm dark" data-bl="${esc(u.id)}" data-cur="${esc(u.status || "active")}">${u.status === "blocked" ? "Unblock" : "Block"}</button>
        </div></td></tr>`).join("")}
    </table></div>`;
  document.getElementById("uSearch").oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    view.querySelectorAll("#uTable tr[data-s]").forEach((tr) => tr.classList.toggle("hidden", !!q && !tr.dataset.s.includes(q)));
  };
  const act = (sel, fn) => view.querySelectorAll(sel).forEach((b) => (b.onclick = () => fn(b).catch((e) => toast(errMsg(e), true))));
  act("[data-pan]", async (b) => {
    const s = await F.getDoc(F.doc(db, "users", b.dataset.pan, "private", "kyc"));
    alert(s.exists() ? `Naam: ${s.data().name}\nPAN: ${s.data().pan}` : "KYC details nahi mile.");
  });
  act("[data-kv]", async (b) => {
    if (!confirm("KYC verify karein? (Naam UPI account se match karein)")) return;
    await F.updateDoc(F.doc(db, "users", b.dataset.kv), { kycStatus: "verified", kycRejectReason: null, kycReviewedAt: F.serverTimestamp() });
    toast("KYC verified ✅"); drawTab();
  });
  act("[data-kr]", async (b) => {
    const r = prompt("KYC reject reason:", "PAN aur naam match nahi hua");
    if (r === null) return;
    await F.updateDoc(F.doc(db, "users", b.dataset.kr), { kycStatus: "rejected", kycRejectReason: r.trim().slice(0, 200), kycReviewedAt: F.serverTimestamp() });
    toast("KYC rejected"); drawTab();
  });
  act("[data-bl]", async (b) => {
    const next = b.dataset.cur === "blocked" ? "active" : "blocked";
    if (!confirm(next === "blocked" ? "User block karein? Woh tasks/withdraw nahi kar payega." : "User unblock karein?")) return;
    await F.updateDoc(F.doc(db, "users", b.dataset.bl), { status: next });
    toast("Updated"); drawTab();
  });
}

// ---------------------------------------------------------------- settings
async function tabSettings() {
  const s = S.settings;
  view.innerHTML = `<h2>Settings</h2>
    <form class="card" id="sForm">
      <p class="muted">Yeh values Firestore doc <code>config/app</code> mein save hoti hain (Android app bhi isi doc ko padhta hai).</p>
      <div class="formgrid">
        <div><label>Coins per ₹1</label><input name="coinsPerRupee" type="number" min="1" step="1" required value="${esc(s.coinsPerRupee)}" /></div>
        <div><label>Minimum withdrawal (₹)</label><input name="minWithdrawRupees" type="number" min="1" step="1" required value="${esc(s.minWithdrawRupees)}" /></div>
        <div><label>Maximum per request (₹)</label><input name="maxWithdrawRupeesPerRequest" type="number" min="1" step="1" required value="${esc(s.maxWithdrawRupeesPerRequest)}" /></div>
      </div>
      <label class="chk"><input type="checkbox" name="requireKycForWithdraw" ${s.requireKycForWithdraw !== false ? "checked" : ""} /> Withdrawal ke liye KYC verified zaroori</label>
      <button class="block" type="submit">Save settings</button>
    </form>`;
  const form = document.getElementById("sForm");
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const data = {
      coinsPerRupee: Number(form.coinsPerRupee.value),
      minWithdrawRupees: Number(form.minWithdrawRupees.value),
      maxWithdrawRupeesPerRequest: Number(form.maxWithdrawRupeesPerRequest.value),
      requireKycForWithdraw: form.requireKycForWithdraw.checked,
    };
    if (Object.values(data).some((v) => typeof v === "number" && (!Number.isInteger(v) || v < 1))) return toast("Sab numbers poore aur 1+ hon.", true);
    if (data.minWithdrawRupees > data.maxWithdrawRupeesPerRequest) return toast("Minimum, maximum se zyada nahi ho sakta.", true);
    try {
      await S.fb.F.setDoc(S.fb.F.doc(S.fb.db, "config", "app"), data, { merge: true });
      S.settings = { ...S.settings, ...data };
      toast("Settings save ✅");
    } catch (e) { toast(errMsg(e), true); }
  };
}

boot();
