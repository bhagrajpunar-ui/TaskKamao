import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { getConfig, getTask, OFFERWALL_SECRET, REGION } from "./config";
import { creditInTx } from "./credit";
import { db, FieldValue } from "./firebase";
import { istDate, UserDoc } from "./util";

/**
 * OFFERWALL INTEGRATION POINT (placeholder).
 * Every offerwall provider (e.g. AdGem, Tapjoy, ayeT-Studios, Pubscale, etc.) sends a "postback"
 * when a user completes an offer. Their parameter names and signature formula differ, so adapt
 * the 3 marked lines below to your provider's docs. Default format expected here:
 *   GET .../offerwallPostback?user_id=<uid>&txn_id=<unique>&coins=<int>&sig=<hex>
 *   sig = HMAC_SHA256(OFFERWALL_SECRET, `${user_id}:${txn_id}:${coins}`)
 * Also whitelist the provider's server IPs if they publish them.
 */
const MAX_COINS_PER_OFFER = 5000;

export const offerwallPostback = onRequest({ region: REGION, secrets: [OFFERWALL_SECRET] }, async (req, res) => {
  try {
    const p = { ...(req.query as Record<string, string>), ...((req.body as Record<string, string>) ?? {}) };
    const uid = String(p.user_id ?? "");        // <-- adapt
    const txnId = String(p.txn_id ?? "");       // <-- adapt
    const coins = parseInt(String(p.coins ?? ""), 10); // <-- adapt
    const sig = String(p.sig ?? "");
    if (!uid || !txnId || !Number.isInteger(coins) || coins <= 0 || coins > MAX_COINS_PER_OFFER) {
      res.status(400).send("bad params"); return;
    }
    const expected = createHmac("sha256", OFFERWALL_SECRET.value()).update(`${uid}:${txnId}:${coins}`).digest("hex");
    const a = Buffer.from(expected); const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(403).send("bad sig"); return; }

    const task = await getTask("offerwall");
    if (!task || !task.active) { res.status(503).send("disabled"); return; }
    const cfg = await getConfig();
    const tRef = db.doc(`offerwallTransactions/${txnId}`);
    const dRef = db.doc(`users/${uid}/daily/${istDate()}`);
    await db.runTransaction(async (t) => {
      const [tSnap, uSnap, dSnap] = await Promise.all([t.get(tRef), t.get(db.doc(`users/${uid}`)), t.get(dRef)]);
      if (tSnap.exists) return;
      const user = uSnap.data() as UserDoc | undefined;
      const d = dSnap.data();
      if (!user || user.status !== "active" || ((d?.offerwall as number) ?? 0) >= task.dailyLimit) {
        t.set(tRef, { uid, coins, result: "rejected", at: FieldValue.serverTimestamp() });
        return;
      }
      await creditInTx(t, uid, user, cfg, {
        coins, kind: "offerwall", title: "Offer complete", countsAsTask: true, meta: { txnId },
        daily: { ref: dRef, field: "offerwall" },
      });
      t.set(tRef, { uid, coins, result: "credited", at: FieldValue.serverTimestamp() });
    });
    res.status(200).send("1"); // many providers expect "1" or "OK"
  } catch (e) {
    logger.error("offerwall postback error", e);
    res.status(500).send("error");
  }
});
