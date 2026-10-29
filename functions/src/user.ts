import { randomInt } from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getConfig } from "./config";
import { db, FieldValue, Timestamp } from "./firebase";
import { assertActive, callOpts, maskName, maskPan, NAME_REGEX, PAN_REGEX, requireAuth, sha256, str, UserDoc } from "./util";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

function makeCode(): string {
  let c = "TK";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  return c;
}

/**
 * Called by the app right after OTP login.
 * Creates the user profile (first time), binds the device (one account per device) and applies an optional referral code.
 */
export const bootstrapUser = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const phone = (req.auth!.token.phone_number as string | undefined) ?? "";
  if (!phone) throw new HttpsError("failed-precondition", "Sirf phone OTP login allowed hai.");
  const deviceId = str(req.data?.deviceId, "device", 128);
  const deviceHash = sha256(deviceId);
  const rawCode = typeof req.data?.referralCode === "string" ? req.data.referralCode.trim().toUpperCase() : "";
  const name = typeof req.data?.name === "string" && NAME_REGEX.test(req.data.name.trim()) ? req.data.name.trim() : "TaskKamao User";

  const userRef = db.doc(`users/${uid}`);
  const deviceRef = db.doc(`devices/${deviceHash}`);

  return db.runTransaction(async (t) => {
    // ---------- reads ----------
    const [userSnap, deviceSnap] = await Promise.all([t.get(userRef), t.get(deviceRef)]);
    const deviceOwner = deviceSnap.exists ? (deviceSnap.data()!.uid as string) : null;

    if (userSnap.exists) {
      const u = userSnap.data() as UserDoc;
      if (u.deviceHash === deviceHash) return { created: false };
      if (deviceOwner && deviceOwner !== uid) {
        throw new HttpsError("already-exists", "Is phone par pehle se doosra TaskKamao account hai. Ek device par ek hi account allowed hai.");
      }
      const changes = (u.deviceChanges ?? 0) + 1;
      t.set(deviceRef, { uid, createdAt: FieldValue.serverTimestamp() });
      t.update(userRef, {
        deviceHash, deviceChanges: changes,
        // Too many device switches looks like account farming: hold for manual review.
        ...(changes > 3 ? { status: "blocked", blockReason: "too_many_devices" } : {}),
      });
      return { created: false };
    }

    if (deviceOwner && deviceOwner !== uid) {
      throw new HttpsError("already-exists", "Is phone par pehle se doosra TaskKamao account hai. Ek device par ek hi account allowed hai.");
    }

    let code = makeCode();
    let codeSnap = await t.get(db.doc(`referralCodes/${code}`));
    if (codeSnap.exists) { code = makeCode(); codeSnap = await t.get(db.doc(`referralCodes/${code}`)); }
    if (codeSnap.exists) throw new HttpsError("aborted", "Dobara try karein.");

    let referrerUid: string | null = null;
    if (rawCode) {
      const refSnap = await t.get(db.doc(`referralCodes/${rawCode}`));
      if (!refSnap.exists) throw new HttpsError("not-found", "Referral code galat hai. Khali chhod kar bhi aage badh sakte hain.");
      referrerUid = refSnap.data()!.uid as string;
      const referrer = (await t.get(db.doc(`users/${referrerUid}`))).data() as UserDoc | undefined;
      if (!referrer || referrer.status !== "active" || referrerUid === uid || referrer.deviceHash === deviceHash) {
        throw new HttpsError("failed-precondition", "Yeh referral code use nahi ho sakta.");
      }
    }

    // ---------- writes ----------
    const user: Omit<UserDoc, "createdAt"> & { createdAt: FirebaseFirestore.FieldValue } = {
      uid, phone, name, balance: 0, adPoints: 0, lockedCoins: 0, totalEarned: 0, taskEarned: 0,
      referralCode: code, referredBy: referrerUid, streak: 0, lastCheckinDate: null,
      kycStatus: "none", kycName: null, panMasked: null, deviceHash, deviceChanges: 0,
      status: "active", hasPendingWithdrawal: false, createdAt: FieldValue.serverTimestamp(),
    };
    t.set(userRef, user);
    t.set(deviceRef, { uid, createdAt: FieldValue.serverTimestamp() });
    t.set(db.doc(`referralCodes/${code}`), { uid });
    if (referrerUid) {
      t.set(db.doc(`referrals/${uid}`), {
        referrerUid, friendUid: uid, friendName: maskName(name), status: "pending",
        commissionEarned: 0, createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { created: true, referralApplied: !!referrerUid };
  });
});

/** Apply a referral code later (only within referralWindowHours of signup, once). */
export const applyReferral = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const code = str(req.data?.code, "code", 20).toUpperCase();
  const cfg = await getConfig();
  return db.runTransaction(async (t) => {
    const user = assertActive((await t.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined);
    if (user.referredBy) throw new HttpsError("already-exists", "Referral code pehle hi lag chuka hai.");
    const ageH = (Date.now() - user.createdAt.toMillis()) / 3.6e6;
    if (ageH > cfg.referralWindowHours) throw new HttpsError("deadline-exceeded", `Referral code signup ke ${cfg.referralWindowHours} ghante ke andar hi lag sakta hai.`);
    const codeSnap = await t.get(db.doc(`referralCodes/${code}`));
    if (!codeSnap.exists) throw new HttpsError("not-found", "Referral code galat hai.");
    const referrerUid = codeSnap.data()!.uid as string;
    const referrer = (await t.get(db.doc(`users/${referrerUid}`))).data() as UserDoc | undefined;
    if (!referrer || referrerUid === uid || referrer.status !== "active" || referrer.deviceHash === user.deviceHash
        || referrer.referredBy === uid) {
      throw new HttpsError("failed-precondition", "Yeh referral code use nahi ho sakta.");
    }
    t.update(db.doc(`users/${uid}`), { referredBy: referrerUid });
    t.set(db.doc(`referrals/${uid}`), {
      referrerUid, friendUid: uid, friendName: maskName(user.name), status: "pending",
      commissionEarned: 0, createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  });
});

export const updateProfile = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const name = str(req.data?.name, "naam", 60);
  if (!NAME_REGEX.test(name)) throw new HttpsError("invalid-argument", "Naam mein sirf letters aur space likhein.");
  const snap = await db.doc(`users/${uid}`).get();
  assertActive(snap.data() as UserDoc | undefined);
  const batch = db.batch();
  batch.update(snap.ref, { name });
  batch.set(db.doc(`leaderboard/${uid}`), { name: maskName(name) }, { merge: true });
  await batch.commit();
  return { ok: true };
});

/** KYC: name as on PAN + PAN number. Admin (or a PAN-verification API you add later) marks it verified. */
export const submitKyc = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const name = str(req.data?.name, "naam", 60).replace(/\s+/g, " ").toUpperCase();
  const pan = str(req.data?.pan, "PAN", 10).toUpperCase();
  if (!NAME_REGEX.test(name)) throw new HttpsError("invalid-argument", "PAN card wala naam sahi likhein.");
  if (!PAN_REGEX.test(pan)) throw new HttpsError("invalid-argument", "PAN format galat hai (jaise ABCDE1234F).");
  const panRef = db.doc(`kycIndex/${sha256(pan)}`);
  return db.runTransaction(async (t) => {
    const user = assertActive((await t.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined);
    const panSnap = await t.get(panRef);
    if (user.kycStatus === "verified") throw new HttpsError("already-exists", "KYC pehle se verified hai.");
    if (panSnap.exists && panSnap.data()!.uid !== uid) {
      throw new HttpsError("already-exists", "Yeh PAN kisi doosre account se juda hai.");
    }
    t.set(panRef, { uid, at: FieldValue.serverTimestamp() });
    t.set(db.doc(`users/${uid}/private/kyc`), { name, pan, submittedAt: FieldValue.serverTimestamp() });
    t.update(db.doc(`users/${uid}`), { kycStatus: "pending", kycName: name, panMasked: maskPan(pan), kycRejectReason: null });
    return { status: "pending" };
  });
});

/** Google Play requires an in-app way to request account deletion. Admin completes it within 30 days. */
export const requestAccountDeletion = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  await db.doc(`users/${uid}`).update({ status: "deletion_requested", deletionRequestedAt: Timestamp.now() });
  return { ok: true };
});
