import { setGlobalOptions } from "firebase-functions/v2";
import { REGION } from "./config";

setGlobalOptions({ region: REGION });

export { bootstrapUser, applyReferral, updateProfile, submitKyc, requestAccountDeletion } from "./user";
export { claimCheckin, spinWheel, scratchCard, startTask, completeTask } from "./rewards";
export { createAdSession, verifyRewardedAd } from "./ads";
export { offerwallPostback } from "./offerwall";
export { requestWithdrawal } from "./withdraw";
export { razorpayWebhook } from "./payouts";
export { adminApproveWithdrawal, adminRejectWithdrawal, adminVerifyKyc, adminSetUserStatus } from "./admin";
