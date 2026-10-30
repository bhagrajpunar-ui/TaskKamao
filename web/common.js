// Shared helpers: Firebase loading, config check, formatting, DOM utils.
import { firebaseConfig, defaultSettings } from "./firebase-config.js";

export const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

export function configIsSet(cfg = firebaseConfig) {
  const vals = [cfg.apiKey, cfg.projectId, cfg.appId, cfg.authDomain].map((v) => String(v || ""));
  return vals.every((v) => v && !v.includes("YOUR_"));
}

/** Loads Firebase SDK modules from the gstatic CDN and initializes the app. */
export async function loadFirebase() {
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  return { app, auth, db, A: authMod, F: fsMod };
}

export async function loadSettings(db, F) {
  try {
    const snap = await F.getDoc(F.doc(db, "config", "app"));
    return { ...defaultSettings, ...(snap.exists() ? snap.data() : {}) };
  } catch {
    return { ...defaultSettings };
  }
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Only allow http(s) links in href attributes. */
export function safeUrl(u) {
  try {
    const url = new URL(String(u || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function rupees(coins, s) {
  const r = (Number(coins) || 0) / (Number(s?.coinsPerRupee) || 100);
  return "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCoins(n) {
  return (Number(n) || 0).toLocaleString("en-IN");
}

export function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

export function fmtDate(ts) {
  const ms = toMillis(ts);
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function sortByCreatedDesc(arr) {
  return arr.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export const STATUS_LABEL = {
  pending: "Pending ⏳",
  approved: "Approved ✅",
  rejected: "Rejected ❌",
  paid: "Paid ✅",
  none: "Nahi kiya",
  verified: "Verified ✅",
};

export function badge(status) {
  return `<span class="badge b-${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>`;
}

export const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const PHONE_REGEX = /^[6-9][0-9]{9}$/;

let toastTimer;
export function toast(msg, isError = false) {
  const el = document.getElementById("toast");
  if (!el) return alert(msg);
  el.textContent = msg;
  el.className = "toast show" + (isError ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 3500);
}

export function errMsg(e) {
  const code = e?.code || "";
  const map = {
    "auth/invalid-credential": "Email ya password galat hai.",
    "auth/wrong-password": "Password galat hai.",
    "auth/user-not-found": "Is email se koi account nahi mila.",
    "auth/email-already-in-use": "Is email se account pehle se bana hua hai. Login karein.",
    "auth/weak-password": "Password kam se kam 6 characters ka rakhein.",
    "auth/invalid-email": "Email sahi nahi hai.",
    "auth/popup-closed-by-user": "Google login window band ho gayi.",
    "auth/unauthorized-domain": "Yeh domain Firebase Auth mein authorized nahi hai (README dekhein).",
    "auth/operation-not-allowed": "Yeh login method Firebase mein enable nahi hai.",
    "auth/network-request-failed": "Internet connection check karein.",
    "permission-denied": "Permission nahi hai (rules ne roka).",
    unavailable: "Server se connect nahi ho paaya, thodi der baad try karein.",
  };
  return map[code] || e?.message || "Kuch gadbad ho gayi.";
}

export function configBanner() {
  return `<div class="banner warn">
    <b>⚠️ Firebase config abhi set nahi hai</b>
    <p><code>web/firebase-config.js</code> mein apna Firebase web config paste karein. Steps <code>web/README.md</code> mein hain.</p>
  </div>`;
}
