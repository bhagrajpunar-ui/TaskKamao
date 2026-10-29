import { createPublicKey, verify } from "crypto";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { getConfig, getTask, REGION } from "./config";
import { creditInTx } from "./credit";
import { db, FieldValue } from "./firebase";
import { assertActive, callOpts, istDate, requireAuth, UserDoc } from "./util";

/**
 * Step 1 (app): create a one-time ad session. The app passes sessionId as AdMob SSV "customData"
 * and the Firebase uid as SSV "userId". Coins are credited only when Google calls verifyRewardedAd.
 */
export const createAdSession = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const task = await getTask("video");
  if (!task || !task.active) throw new HttpsError("unavailable", "Video task abhi band hai.");
  assertActive((await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined);
  const daily = (await db.doc(`users/${uid}/daily/${istDate()}`).get()).data();
  if (((daily?.video as number) ?? 0) >= task.dailyLimit) throw new HttpsError("resource-exhausted", "Aaj ke videos poore. Kal phir aana!");
  const cfg = await getConfig();
  const ref = await db.collection("adSessions").add({ uid, status: "pending", createdAt: FieldValue.serverTimestamp() });
  return { sessionId: ref.id, coins: task.coins, asPoints: !cfg.videoRewardWithdrawable };
});

let keyCache: { at: number; keys: Map<string, string> } | null = null;
async function getAdMobKeys(): Promise<Map<string, string>> {
  if (keyCache && Date.now() - keyCache.at < 6 * 3600 * 1000) return keyCache.keys;
  const res = await fetch("https://www.gstatic.com/admob/reward/verifier-keys.json");
  if (!res.ok) throw new Error(`AdMob key fetch failed ${res.status}`);
  const json = (await res.json()) as { keys: { keyId: number | string; pem: string }[] };
  const keys = new Map(json.keys.map((k) => [String(k.keyId), k.pem]));
  keyCache = { at: Date.now(), keys };
  return keys;
}

/**
 * Step 2 (Google -> server): AdMob Server-Side Verification callback.
 * Set this function's URL as the SSV callback URL on the rewarded ad unit in AdMob.
 * https://developers.google.com/admob/android/ssv
 */
export const verifyRewardedAd = onRequest({ region: REGION, maxInstances: 20 }, async (req, res) => {
  try {
    const url = req.originalUrl || req.url;
    const q = url.indexOf("?");
    if (q < 0) { res.status(200).send("ok"); return; } // AdMob "verify URL" ping
    const query = url.substring(q + 1);
    const sigPos = query.indexOf("&signature=");
    if (sigPos < 0) { res.status(400).send("missing signature"); return; }
    const message = query.substring(0, sigPos);
    const params = new URLSearchParams(query);
    const signature = params.get("signature") ?? "";
    const keyId = params.get("key_id") ?? "";

    const pem = (await getAdMobKeys()).get(keyId);
    if (!pem) { keyCache = null; res.status(400).send("unknown key"); return; }
    const ok = verify("sha256", Buffer.from(message, "utf8"), createPublicKey(pem), Buffer.from(signature, "base64url"));
    if (!ok) { logger.warn("SSV bad signature"); res.status(403).send("bad signature"); return; }

    const uid = params.get("user_id") ?? "";
    const sessionId = params.get("custom_data") ?? "";
    const txnId = params.get("transaction_id") ?? "";
    if (!uid || !sessionId || !txnId) { res.status(200).send("ok (test or incomplete)"); return; }

    const cfg = await getConfig();
    const task = await getTask("video");
    const dRef = db.doc(`users/${uid}/daily/${istDate()}`);
    const sRef = db.doc(`adSessions/${sessionId}`);
    const txnRef = db.doc(`adTransactions/${txnId}`);

    await db.runTransaction(async (t) => {
      const [txnSnap, sSnap, uSnap, dSnap] = await Promise.all([t.get(txnRef), t.get(sRef), t.get(db.doc(`users/${uid}`)), t.get(dRef)]);
      if (txnSnap.exists) return; // Google retried; already handled
      const s = sSnap.data();
      const reject = (reason: string) => {
        t.set(txnRef, { uid, sessionId, result: "rejected", reason, at: FieldValue.serverTimestamp() });
        if (s) t.update(sRef, { status: "rejected", reason });
      };
      if (!s || s.uid !== uid || s.status !== "pending") return reject("bad_session");
      if (Date.now() - s.createdAt.toMillis() > 3600 * 1000) return reject("expired");
      const user = uSnap.data() as UserDoc | undefined;
      if (!user || user.status !== "active") return reject("user_inactive");
      const d = dSnap.data();
      if (!task || ((d?.video as number) ?? 0) >= task.dailyLimit) return reject("daily_limit");
      const asPoints = !cfg.videoRewardWithdrawable;
      if (!asPoints && ((d?.taskCoins as number) ?? 0) + task.coins > cfg.maxDailyTaskCoins) return reject("daily_cap");
      assertActive(user);
      await creditInTx(t, uid, user, cfg, {
        coins: task.coins, kind: "video", title: "Video dekha", countsAsTask: !asPoints, asPoints,
        meta: { adTxn: txnId }, daily: { ref: dRef, field: "video" },
      });
      t.set(txnRef, { uid, sessionId, result: "credited", coins: task.coins, at: FieldValue.serverTimestamp() });
      t.update(sRef, { status: "credited", coins: task.coins, asPoints, creditedAt: FieldValue.serverTimestamp() });
    });
    res.status(200).send("ok");
  } catch (e) {
    logger.error("SSV error", e);
    res.status(500).send("error"); // AdMob will retry
  }
});

