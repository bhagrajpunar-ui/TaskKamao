import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { RAZORPAYX_ACCOUNT_NUMBER, RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET, RAZORPAYX_WEBHOOK_SECRET, REGION } from "./config";
import { newTx } from "./credit";
import { db, FieldValue } from "./firebase";

export interface PayoutResult { ok: boolean; payoutId?: string; status?: string; error?: string; retryable?: boolean }

/** Creates a UPI payout with RazorpayX Payouts "composite" API (contact + fund account inline). */
export async function createRazorpayPayout(w: { id: string; uid: string; name: string; phone: string; upiId: string; amountRupees: number }): Promise<PayoutResult> {
  const authHeader = "Basic " + Buffer.from(`${RAZORPAYX_KEY_ID.value()}:${RAZORPAYX_KEY_SECRET.value()}`).toString("base64");
  const body = {
    account_number: RAZORPAYX_ACCOUNT_NUMBER.value(),
    amount: w.amountRupees * 100, // paise
    currency: "INR",
    mode: "UPI",
    purpose: "cashback",
    queue_if_low_balance: true,
    reference_id: w.id,
    narration: "TaskKamao Reward",
    fund_account: {
      account_type: "vpa",
      vpa: { address: w.upiId },
      contact: { name: w.name.slice(0, 50), type: "customer", reference_id: w.uid, contact: w.phone.replace("+91", "") },
    },
    notes: { withdrawalId: w.id, uid: w.uid },
  };
  try {
    const res = await fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, "X-Payout-Idempotency": w.id },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { description?: string } };
    if (res.ok && json.id) return { ok: true, payoutId: json.id, status: json.status };
    return { ok: false, error: json.error?.description ?? `HTTP ${res.status}`, retryable: res.status >= 500 || res.status === 429 };
  } catch (e) {
    return { ok: false, error: String(e), retryable: true };
  }
}

/** Refund locked coins to the user. Call inside a transaction AFTER reads. */
export function refundInTx(t: FirebaseFirestore.Transaction, w: FirebaseFirestore.DocumentData, wRef: FirebaseFirestore.DocumentReference, status: "rejected" | "failed", reason: string) {
  t.update(db.doc(`users/${w.uid}`), {
    balance: FieldValue.increment(w.coins), lockedCoins: FieldValue.increment(-w.coins), hasPendingWithdrawal: false,
  });
  t.update(wRef, { status, failureReason: reason, updatedAt: FieldValue.serverTimestamp() });
  if (w.txId) t.update(db.doc(`transactions/${w.txId}`), { status });
  newTx(t, { uid: w.uid, coins: w.coins, kind: "refund", category: "refund", title: `Withdrawal refund (${reason})`.slice(0, 80),
    meta: { withdrawalId: wRef.id } });
}

export function markPaidInTx(t: FirebaseFirestore.Transaction, w: FirebaseFirestore.DocumentData, wRef: FirebaseFirestore.DocumentReference, utr: string | null) {
  t.update(db.doc(`users/${w.uid}`), { lockedCoins: FieldValue.increment(-w.coins), hasPendingWithdrawal: false });
  t.update(wRef, { status: "paid", utr, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  if (w.txId) t.update(db.doc(`transactions/${w.txId}`), { status: "success" });
}

/**
 * RazorpayX webhook. In RazorpayX Dashboard > Settings > Webhooks add this function URL,
 * select events payout.processed, payout.failed, payout.reversed, payout.rejected, payout.updated,
 * and use the same secret you stored as RAZORPAYX_WEBHOOK_SECRET.
 */
export const razorpayWebhook = onRequest({ region: REGION, secrets: [RAZORPAYX_WEBHOOK_SECRET] }, async (req, res) => {
  try {
    const sig = String(req.header("X-Razorpay-Signature") ?? "");
    const expected = createHmac("sha256", RAZORPAYX_WEBHOOK_SECRET.value()).update(req.rawBody).digest("hex");
    const a = Buffer.from(expected); const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) { res.status(403).send("bad signature"); return; }

    const event = String(req.body?.event ?? "");
    const payout = req.body?.payload?.payout?.entity as { id: string; status: string; reference_id?: string; utr?: string; status_details?: { description?: string } } | undefined;
    if (!payout?.reference_id) { res.status(200).send("ignored"); return; }

    const wRef = db.doc(`withdrawals/${payout.reference_id}`);
    await db.runTransaction(async (t) => {
      const snap = await t.get(wRef);
      const w = snap.data();
      if (!w || ["paid", "failed", "rejected"].includes(w.status)) return; // unknown or already final
      if (payout.status === "processed") {
        markPaidInTx(t, w, wRef, payout.utr ?? null);
      } else if (["failed", "reversed", "rejected", "cancelled"].includes(payout.status)) {
        refundInTx(t, w, wRef, "failed", payout.status_details?.description ?? payout.status);
      } else {
        t.update(wRef, { payoutStatus: payout.status, payoutId: payout.id, updatedAt: FieldValue.serverTimestamp() });
      }
    });
    logger.info("razorpay webhook", { event, id: payout.id, status: payout.status });
    res.status(200).send("ok");
  } catch (e) {
    logger.error("webhook error", e);
    res.status(500).send("error");
  }
});
