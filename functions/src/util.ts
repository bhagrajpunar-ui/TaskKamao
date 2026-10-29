import { createHash, randomInt } from "crypto";
import { CallableRequest, HttpsError, CallableOptions } from "firebase-functions/v2/https";
import { ENFORCE_APP_CHECK, REGION } from "./config";

export const callOpts: CallableOptions = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  maxInstances: 20,
};

export interface UserDoc {
  uid: string;
  phone: string;
  name: string;
  balance: number;
  adPoints?: number;
  lockedCoins: number;
  totalEarned: number;
  taskEarned: number;
  referralCode: string;
  referredBy?: string | null;
  streak: number;
  lastCheckinDate?: string | null;
  kycStatus: "none" | "pending" | "verified" | "rejected";
  kycName?: string | null;
  panMasked?: string | null;
  deviceHash: string;
  deviceChanges?: number;
  status: "active" | "blocked" | "deletion_requested";
  hasPendingWithdrawal?: boolean;
  createdAt: FirebaseFirestore.Timestamp;
}

export function requireAuth(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError("unauthenticated", "Pehle login karein.");
  return req.auth.uid;
}

export function requireAdmin(req: CallableRequest): string {
  if (!req.auth || req.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Sirf admin ke liye.");
  }
  return req.auth.uid;
}

export function assertActive(user: UserDoc | undefined): UserDoc {
  if (!user) throw new HttpsError("failed-precondition", "Account setup pura nahi hua. App dobara kholein.");
  if (user.status !== "active") throw new HttpsError("permission-denied", "Aapka account abhi active nahi hai. Support se sampark karein.");
  if (!user.deviceHash) throw new HttpsError("failed-precondition", "Device registered nahi hai.");
  return user;
}

/** Calendar date in India (IST, UTC+5:30) as YYYY-MM-DD. All daily limits reset at IST midnight. */
export function istDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function weightedPick<T extends { weight: number }>(items: T[]): { item: T; index: number } {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let r = randomInt(0, total); // crypto-secure server RNG
  for (let i = 0; i < items.length; i++) {
    if (r < items[i].weight) return { item: items[i], index: i };
    r -= items[i].weight;
  }
  return { item: items[items.length - 1], index: items.length - 1 };
}

export function maskName(name: string): string {
  const n = (name || "User").trim();
  return n.length <= 2 ? n : n.slice(0, 2) + "*".repeat(Math.min(4, n.length - 2));
}

export function maskPan(pan: string): string {
  return pan.slice(0, 2) + "XXXXX" + pan.slice(7);
}

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const UPI_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,63}$/;
export const NAME_REGEX = /^[A-Za-z][A-Za-z .]{1,58}[A-Za-z.]$/;

export function str(v: unknown, field: string, max = 200): string {
  if (typeof v !== "string" || v.trim().length === 0 || v.length > max) {
    throw new HttpsError("invalid-argument", `Galat ${field}.`);
  }
  return v.trim();
}
