import { defineSecret, defineString } from "firebase-functions/params";
import { db } from "./firebase";

export const REGION = "asia-south1"; // Mumbai

// ---- Secrets (set with: firebase functions:secrets:set NAME) ----
// Never put real keys in source code.
export const RAZORPAYX_KEY_ID = defineSecret("RAZORPAYX_KEY_ID");
export const RAZORPAYX_KEY_SECRET = defineSecret("RAZORPAYX_KEY_SECRET");
export const RAZORPAYX_WEBHOOK_SECRET = defineSecret("RAZORPAYX_WEBHOOK_SECRET");
export const OFFERWALL_SECRET = defineSecret("OFFERWALL_SECRET");

// ---- Plain params (asked during `firebase deploy`, stored in functions/.env.<project>) ----
export const RAZORPAYX_ACCOUNT_NUMBER = defineString("RAZORPAYX_ACCOUNT_NUMBER", {
  description: "Your RazorpayX current/virtual account number (Dashboard > My Account & Settings > Banking).",
});

// Turn on after enabling Firebase App Check (Play Integrity) in the console AND in the app.
export const ENFORCE_APP_CHECK = false;

export interface AppConfig {
  coinsPerRupee: number;
  minWithdrawRupees: number;
  maxWithdrawRupeesPerRequest: number;
  withdrawalsPerDay: number;
  minAccountAgeHours: number;
  checkinCoins: number;
  streakBonusEvery: number;
  streakBonusCoins: number;
  referrerBonusCoins: number;
  friendBonusCoins: number;
  referralCommissionPercent: number;
  referralQualifyTaskCoins: number;
  referralWindowHours: number;
  maxDailyTaskCoins: number;
  payoutsEnabled: boolean;
  videoRewardWithdrawable: boolean;
}

// Defaults. Override any of them in Firestore doc config/app (admin only).
export const DEFAULT_CONFIG: AppConfig = {
  coinsPerRupee: 100,              // 100 coins = Rs 1
  minWithdrawRupees: 50,
  maxWithdrawRupeesPerRequest: 500,
  withdrawalsPerDay: 1,
  minAccountAgeHours: 24,
  checkinCoins: 50,
  streakBonusEvery: 7,             // every 7th consecutive day...
  streakBonusCoins: 50,            // ...gets this many extra coins
  referrerBonusCoins: 1000,
  friendBonusCoins: 500,
  referralCommissionPercent: 10,   // % of friend's TASK coins (not bonuses)
  referralQualifyTaskCoins: 2000,  // friend must earn this many task coins before the referral bonus unlocks
  referralWindowHours: 48,         // referral code can be applied only within 48h of signup
  maxDailyTaskCoins: 3000,         // hard cap of task coins per user per IST day
  payoutsEnabled: true,
  // AdMob policy ("Policies for ad units that offer rewards") does NOT allow rewarded-ad rewards that can be
  // converted into cash. So by default rewarded videos give non-withdrawable "video points" (leaderboard only).
  // Only set true if you use an ad network whose policy explicitly allows cash-convertible rewards.
  videoRewardWithdrawable: false,
};

let cache: { at: number; cfg: AppConfig } | null = null;

export async function getConfig(): Promise<AppConfig> {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return cache.cfg;
  const snap = await db.doc("config/app").get();
  const cfg = { ...DEFAULT_CONFIG, ...((snap.data() as Partial<AppConfig>) ?? {}) };
  cache = { at: Date.now(), cfg };
  return cfg;
}

export interface TaskDef {
  title: string;
  type: "video" | "quiz" | "spin" | "scratch" | "offerwall" | "visit";
  coins: number;
  dailyLimit: number;
  active: boolean;
  url?: string;
  minSeconds?: number;
}

// Fallbacks used if the tasks/{id} document is missing.
export const DEFAULT_TASKS: Record<string, TaskDef> = {
  video: { title: "Video dekho", type: "video", coins: 5, dailyLimit: 20, active: true },
  quiz: { title: "Quiz khelo", type: "quiz", coins: 2, dailyLimit: 15, active: true },
  spin: { title: "Daily Spin", type: "spin", coins: 0, dailyLimit: 1, active: true },
  scratch: { title: "Scratch Card", type: "scratch", coins: 0, dailyLimit: 3, active: true },
  offerwall: { title: "Offers", type: "offerwall", coins: 0, dailyLimit: 50, active: false },
};

export async function getTask(taskId: string): Promise<TaskDef | null> {
  const snap = await db.doc(`tasks/${taskId}`).get();
  if (snap.exists) return { ...(DEFAULT_TASKS[taskId] ?? {}), ...(snap.data() as TaskDef) };
  return DEFAULT_TASKS[taskId] ?? null;
}

// Spin wheel segments. MUST match app/lib/features/tasks/spin_wheel_screen.dart (kSpinSegments).
export const SPIN_SEGMENTS: { coins: number; weight: number }[] = [
  { coins: 5, weight: 30 },
  { coins: 10, weight: 25 },
  { coins: 2, weight: 20 },
  { coins: 20, weight: 12 },
  { coins: 0, weight: 5 },
  { coins: 30, weight: 5 },
  { coins: 50, weight: 2 },
  { coins: 100, weight: 1 },
];

export const SCRATCH_PRIZES: { coins: number; weight: number }[] = [
  { coins: 2, weight: 35 },
  { coins: 5, weight: 35 },
  { coins: 10, weight: 20 },
  { coins: 20, weight: 8 },
  { coins: 50, weight: 2 },
];
