import { DocumentReference, Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { AppConfig } from "./config";
import { db, FieldValue } from "./firebase";
import { maskName, UserDoc } from "./util";

export type TxKind =
  | "checkin" | "spin" | "scratch" | "video" | "quiz" | "task" | "offerwall"
  | "referral_bonus" | "referral_commission" | "withdrawal" | "refund" | "admin_adjust";
export type TxCategory = "earn" | "referral" | "withdraw" | "refund" | "points";

export function newTx(
  t: Transaction,
  data: { uid: string; coins: number; kind: TxKind; category: TxCategory; title: string; status?: string; meta?: Record<string, unknown> },
): DocumentReference {
  const ref = db.collection("transactions").doc();
  t.set(ref, { status: "success", meta: {}, ...data, createdAt: FieldValue.serverTimestamp() });
  return ref;
}

export interface CreditOptions {
  coins: number;
  kind: TxKind;
  title: string;
  countsAsTask: boolean;             // task coins feed referral commission, leaderboard and the daily cap
  meta?: Record<string, unknown>;
  daily?: { ref: DocumentReference; field: string; data?: FirebaseFirestore.DocumentData };
  extraUserUpdates?: Record<string, unknown>;
  /** Credit non-withdrawable "points" (adPoints) instead of withdrawable coins. Used for AdMob rewarded videos. */
  asPoints?: boolean;
}

/** Throws if crediting `coins` task coins would cross the per-day cap. */
export function checkDailyCap(daily: FirebaseFirestore.DocumentData | undefined, coins: number, cfg: AppConfig): void {
  const today = (daily?.taskCoins as number) ?? 0;
  if (today + coins > cfg.maxDailyTaskCoins) {
    throw new HttpsError("resource-exhausted", "Aaj ki earning limit poori ho gayi. Kal phir try karein.");
  }
}

/**
 * The ONLY place coins are added to a user's balance.
 * Must be called inside a Firestore transaction, AFTER the caller's reads and BEFORE the caller's writes
 * (Firestore requires all reads before writes; this function does its own reads first).
 */
export async function creditInTx(t: Transaction, uid: string, user: UserDoc, cfg: AppConfig, o: CreditOptions): Promise<void> {
  if (!Number.isInteger(o.coins) || o.coins < 0) throw new Error("coins must be a non-negative integer");

  if (o.asPoints) {
    // Points never touch balance, referral commission or withdrawals.
    t.update(db.doc(`users/${uid}`), { ...(o.extraUserUpdates ?? {}), adPoints: FieldValue.increment(o.coins) });
    if (o.coins > 0) {
      newTx(t, { uid, coins: o.coins, kind: o.kind, category: "points", title: `${o.title} (points)`, meta: o.meta });
      t.set(db.doc(`leaderboard/${uid}`), { name: maskName(user.name), coins: FieldValue.increment(o.coins),
        updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    if (o.daily) t.set(o.daily.ref, { ...(o.daily.data ?? {}), [o.daily.field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }

  // ---------- reads ----------
  let referral: FirebaseFirestore.DocumentSnapshot | null = null;
  let referrer: UserDoc | undefined;
  if (o.countsAsTask && o.coins > 0 && user.referredBy) {
    referral = await t.get(db.doc(`referrals/${uid}`));
    if (referral.exists) {
      const rs = await t.get(db.doc(`users/${user.referredBy}`));
      referrer = rs.data() as UserDoc | undefined;
    }
  }

  // ---------- writes ----------
  let friendExtra = 0;
  if (referral?.exists && referrer && referrer.status === "active") {
    const r = referral.data()!;
    let referrerCoins = 0;
    const referralUpdate: Record<string, unknown> = {};

    const commission = Math.floor((o.coins * cfg.referralCommissionPercent) / 100);
    if (commission > 0) {
      referrerCoins += commission;
      referralUpdate.commissionEarned = FieldValue.increment(commission);
      newTx(t, { uid: user.referredBy!, coins: commission, kind: "referral_commission", category: "referral",
        title: `${maskName(user.name)} ke task se ${cfg.referralCommissionPercent}% commission`, meta: { friendUid: uid } });
    }

    const newTaskTotal = (user.taskEarned ?? 0) + o.coins;
    if (r.status === "pending" && newTaskTotal >= cfg.referralQualifyTaskCoins) {
      referrerCoins += cfg.referrerBonusCoins;
      friendExtra = cfg.friendBonusCoins;
      referralUpdate.status = "qualified";
      referralUpdate.qualifiedAt = FieldValue.serverTimestamp();
      newTx(t, { uid: user.referredBy!, coins: cfg.referrerBonusCoins, kind: "referral_bonus", category: "referral",
        title: `Referral bonus: ${maskName(user.name)}`, meta: { friendUid: uid } });
      newTx(t, { uid, coins: friendExtra, kind: "referral_bonus", category: "referral",
        title: "Welcome referral bonus", meta: { referrerUid: user.referredBy } });
    }

    if (referrerCoins > 0) {
      t.update(db.doc(`users/${user.referredBy}`), {
        balance: FieldValue.increment(referrerCoins),
        totalEarned: FieldValue.increment(referrerCoins),
      });
    }
    if (Object.keys(referralUpdate).length) t.update(referral.ref, referralUpdate);
  }

  const total = o.coins + friendExtra;
  const userUpdate: Record<string, unknown> = { ...(o.extraUserUpdates ?? {}) };
  if (total > 0) {
    userUpdate.balance = FieldValue.increment(total);
    userUpdate.totalEarned = FieldValue.increment(total);
  }
  if (o.countsAsTask && o.coins > 0) userUpdate.taskEarned = FieldValue.increment(o.coins);
  if (Object.keys(userUpdate).length) t.update(db.doc(`users/${uid}`), userUpdate);

  if (o.coins > 0) {
    newTx(t, { uid, coins: o.coins, kind: o.kind, category: "earn", title: o.title, meta: o.meta });
  }

  if (o.countsAsTask && o.coins > 0) {
    t.set(db.doc(`leaderboard/${uid}`), { name: maskName(user.name), coins: FieldValue.increment(o.coins),
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  if (o.daily) {
    const d: Record<string, unknown> = { ...(o.daily.data ?? {}), [o.daily.field]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp() };
    if (o.countsAsTask && o.coins > 0) d.taskCoins = FieldValue.increment(o.coins);
    t.set(o.daily.ref, d, { merge: true });
  }
}
