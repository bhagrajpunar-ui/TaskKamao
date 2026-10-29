import { HttpsError, onCall } from "firebase-functions/v2/https";
import { RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET } from "./config";
import { db, FieldValue } from "./firebase";
import { createRazorpayPayout, refundInTx } from "./payouts";
import { callOpts, requireAdmin, str } from "./util";

const adminOpts = { ...callOpts, secrets: [RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET] };

/** Admin approves a pending withdrawal -> RazorpayX UPI payout. Safe to retry (idempotency key = withdrawal id). */
export const adminApproveWithdrawal = onCall(adminOpts, async (req) => {
  const adminUid = requireAdmin(req);
  const id = str(req.data?.withdrawalId, "withdrawalId", 64);
  const wRef = db.doc(`withdrawals/${id}`);

  const w = await db.runTransaction(async (t) => {
    const snap = await t.get(wRef);
    const d = snap.data();
    if (!d) throw new HttpsError("not-found", "Withdrawal not found");
    const canSend = d.status === "pending" || (d.status === "processing" && !d.payoutId);
    if (!canSend) throw new HttpsError("failed-precondition", `Status is ${d.status}`);
    t.update(wRef, { status: "processing", approvedBy: adminUid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return d;
  });

  const result = await createRazorpayPayout({ id, uid: w.uid, name: w.name, phone: w.phone, upiId: w.upiId, amountRupees: w.amountRupees });
  if (result.ok) {
    await wRef.update({ payoutId: result.payoutId, payoutStatus: result.status ?? null, lastError: null, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, payoutId: result.payoutId, status: result.status };
  }
  if (result.retryable) {
    // Keep "processing" without payoutId so admin can press Approve again.
    await wRef.update({ lastError: result.error ?? "unknown", updatedAt: FieldValue.serverTimestamp() });
    throw new HttpsError("unavailable", `Payout not sent yet (retry): ${result.error}`);
  }
  await db.runTransaction(async (t) => {
    const snap = await t.get(wRef);
    const d = snap.data();
    if (d && d.status === "processing") refundInTx(t, d, wRef, "failed", result.error ?? "payout error");
  });
  throw new HttpsError("aborted", `Payout rejected by RazorpayX, coins refunded: ${result.error}`);
});

export const adminRejectWithdrawal = onCall(callOpts, async (req) => {
  requireAdmin(req);
  const id = str(req.data?.withdrawalId, "withdrawalId", 64);
  const reason = str(req.data?.reason ?? "Rejected by admin", "reason", 200);
  const wRef = db.doc(`withdrawals/${id}`);
  await db.runTransaction(async (t) => {
    const d = (await t.get(wRef)).data();
    if (!d) throw new HttpsError("not-found", "Withdrawal not found");
    if (!(d.status === "pending" || (d.status === "processing" && !d.payoutId))) throw new HttpsError("failed-precondition", `Status is ${d.status}`);
    refundInTx(t, d, wRef, "rejected", reason);
  });
  return { ok: true };
});

export const adminVerifyKyc = onCall(callOpts, async (req) => {
  requireAdmin(req);
  const uid = str(req.data?.uid, "uid", 128);
  const approve = req.data?.approve === true;
  const reason = typeof req.data?.reason === "string" ? req.data.reason.slice(0, 200) : null;
  await db.doc(`users/${uid}`).update(approve
    ? { kycStatus: "verified", kycVerifiedAt: FieldValue.serverTimestamp(), kycRejectReason: null }
    : { kycStatus: "rejected", kycRejectReason: reason ?? "Details match nahi hue" });
  return { ok: true };
});

export const adminSetUserStatus = onCall(callOpts, async (req) => {
  requireAdmin(req);
  const uid = str(req.data?.uid, "uid", 128);
  const status = req.data?.status;
  if (!["active", "blocked"].includes(status)) throw new HttpsError("invalid-argument", "status must be active|blocked");
  await db.doc(`users/${uid}`).update({ status, blockReason: status === "blocked" ? (req.data?.reason ?? "admin") : null });
  return { ok: true };
});
