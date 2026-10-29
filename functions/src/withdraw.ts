import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getConfig } from "./config";
import { newTx } from "./credit";
import { db, FieldValue } from "./firebase";
import { assertActive, callOpts, istDate, requireAuth, str, UPI_REGEX, UserDoc } from "./util";

/**
 * User asks to withdraw earned rewards to a UPI ID.
 * Coins are moved from balance -> lockedCoins immediately (balance lock), so they cannot be spent twice.
 * Admin approves -> RazorpayX payout. Rejected/failed payouts are refunded.
 */
export const requestWithdrawal = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const cfg = await getConfig();
  if (!cfg.payoutsEnabled) throw new HttpsError("unavailable", "Withdrawal abhi kuch samay ke liye band hai.");
  const upiId = str(req.data?.upiId, "UPI ID", 120).toLowerCase();
  const rupees = Number(req.data?.amountRupees);
  if (!UPI_REGEX.test(upiId)) throw new HttpsError("invalid-argument", "UPI ID sahi nahi hai (jaise naam@okaxis).");
  if (!Number.isInteger(rupees) || rupees < cfg.minWithdrawRupees || rupees > cfg.maxWithdrawRupeesPerRequest) {
    throw new HttpsError("invalid-argument", `Amount Rs ${cfg.minWithdrawRupees} se Rs ${cfg.maxWithdrawRupeesPerRequest} ke beech poore rupaye mein ho.`);
  }
  const coins = rupees * cfg.coinsPerRupee;
  const dRef = db.doc(`users/${uid}/daily/${istDate()}`);

  return db.runTransaction(async (t) => {
    const user = assertActive((await t.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined);
    const daily = (await t.get(dRef)).data();
    if (user.kycStatus !== "verified") throw new HttpsError("failed-precondition", "Withdrawal se pehle KYC verified hona zaroori hai.");
    if (user.hasPendingWithdrawal) throw new HttpsError("already-exists", "Ek withdrawal pehle se process ho raha hai.");
    if (((daily?.withdraw as number) ?? 0) >= cfg.withdrawalsPerDay) throw new HttpsError("resource-exhausted", "Aaj ki withdrawal limit poori.");
    const ageH = (Date.now() - user.createdAt.toMillis()) / 3.6e6;
    if (ageH < cfg.minAccountAgeHours) throw new HttpsError("failed-precondition", `Naye account se ${cfg.minAccountAgeHours} ghante baad withdrawal hoga.`);
    if (user.balance < coins) throw new HttpsError("failed-precondition", "Balance kam hai.");

    const wRef = db.collection("withdrawals").doc();
    const txRef = newTx(t, { uid, coins: -coins, kind: "withdrawal", category: "withdraw",
      title: `UPI withdrawal Rs ${rupees}`, status: "pending", meta: { withdrawalId: wRef.id } });
    t.set(wRef, {
      uid, phone: user.phone, name: user.kycName ?? user.name, upiId, amountRupees: rupees, coins,
      status: "pending", txId: txRef.id, payoutId: null, failureReason: null,
      riskFlags: (user.deviceChanges ?? 0) > 1 ? ["device_changed"] : [],
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    t.update(db.doc(`users/${uid}`), {
      balance: FieldValue.increment(-coins), lockedCoins: FieldValue.increment(coins), hasPendingWithdrawal: true,
    });
    t.set(dRef, { withdraw: FieldValue.increment(1) }, { merge: true });
    return { withdrawalId: wRef.id, status: "pending" };
  });
});
