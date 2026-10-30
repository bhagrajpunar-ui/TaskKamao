// Firestore rules tests (run with the emulator, needs Java 11+):
//   cd tests && npm i firebase@10 @firebase/rules-unit-testing@3 firebase-tools@13 --legacy-peer-deps
//   npx firebase emulators:exec --only firestore --project demo-taskkamao "node firestore-rules.test.mjs"
// Uses tests/firebase.json (emulator port 8085).
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, writeBatch, runTransaction,
  serverTimestamp, increment, addDoc } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-taskkamao",
  firestore: { rules: readFileSync("../firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 },
});
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log("PASS", name); } catch (e) { fail++; console.log("FAIL", name, e?.message?.slice(0, 300)); } }

await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "admins/admin1"), { role: "owner" }); });
const alice = env.authenticatedContext("alice").firestore();
const bob = env.authenticatedContext("bob").firestore();
const admin = env.authenticatedContext("admin1").firestore();
const anon = env.unauthenticatedContext().firestore();

const newUser = (uid, extra = {}) => ({ uid, name: "Alice", email: "a@x.com", phone: "", upiId: "", balance: 0, lockedCoins: 0,
  totalEarned: 0, taskEarned: 0, kycStatus: "none", status: "active", source: "web", createdAt: serverTimestamp(), ...extra });

await t("user create own profile", assertSucceeds(setDoc(doc(alice, "users/alice"), newUser("alice"))));
await t("bob cannot create with balance", assertFails(setDoc(doc(bob, "users/bob"), newUser("bob", { balance: 100 }))));
await t("bob cannot create alice's doc", assertFails(setDoc(doc(bob, "users/alice2"), newUser("alice2"))));
await t("bob create ok", assertSucceeds(setDoc(doc(bob, "users/bob"), newUser("bob"))));
await t("profile edit ok", assertSucceeds(updateDoc(doc(alice, "users/alice"), { name: "Alice K", phone: "9876543210", upiId: "alice@okaxis", updatedAt: serverTimestamp() })));
await t("cannot set balance", assertFails(updateDoc(doc(alice, "users/alice"), { balance: 99999 })));
await t("cannot set balance via profile edit", assertFails(updateDoc(doc(alice, "users/alice"), { name: "x y", balance: 5 })));
await t("cannot self verify kyc", assertFails(updateDoc(doc(alice, "users/alice"), { kycStatus: "verified" })));
await t("bob cannot read alice", assertFails(getDoc(doc(bob, "users/alice"))));
await t("anon cannot read tasks", assertFails(getDocs(collection(anon, "tasks"))));
await t("admin read alice", assertSucceeds(getDoc(doc(admin, "users/alice"))));

await t("user cannot create task", assertFails(setDoc(doc(alice, "tasks/t1"), { title: "x", type: "proof", reward: 100, active: true })));
await t("admin create task", assertSucceeds(setDoc(doc(admin, "tasks/t1"), { title: "Subscribe", description: "d", type: "proof", reward: 3000, link: "", active: true })));
await t("admin create task2 inactive", assertSucceeds(setDoc(doc(admin, "tasks/t2"), { title: "Old", description: "d", type: "proof", reward: 10, link: "", active: false })));
await t("user reads active tasks", assertSucceeds(getDocs(query(collection(alice, "tasks"), where("active", "==", true)))));

const sub = (extra = {}) => ({ uid: "alice", userName: "Alice", taskId: "t1", taskTitle: "Subscribe", reward: 3000, proofText: "done @alice", proofLink: "", status: "pending", createdAt: serverTimestamp(), ...extra });
await t("submission wrong reward", assertFails(setDoc(doc(alice, "submissions/t1_alice"), sub({ reward: 999999 }))));
await t("submission status approved", assertFails(setDoc(doc(alice, "submissions/t1_alice"), sub({ status: "approved" }))));
await t("submission wrong id", assertFails(setDoc(doc(alice, "submissions/random"), sub())));
await t("submission for bob by alice", assertFails(setDoc(doc(alice, "submissions/t1_bob"), sub({ uid: "bob" }))));
await t("submission inactive task", assertFails(setDoc(doc(alice, "submissions/t2_alice"), sub({ taskId: "t2", reward: 10 }))));
await t("submission ok", assertSucceeds(setDoc(doc(alice, "submissions/t1_alice"), sub())));
await t("submission duplicate (set over) fails", assertFails(setDoc(doc(alice, "submissions/t1_alice"), sub({ proofText: "again" }))));
await t("user self-approve fails", assertFails(updateDoc(doc(alice, "submissions/t1_alice"), { status: "approved" })));
await t("user list own subs", assertSucceeds(getDocs(query(collection(alice, "submissions"), where("uid", "==", "alice")))));
await t("user list own subs by task", assertSucceeds(getDocs(query(collection(alice, "submissions"), where("uid", "==", "alice"), where("taskId", "==", "t1")))));
await t("bob cannot list alice subs", assertFails(getDocs(query(collection(bob, "submissions"), where("uid", "==", "alice")))));
await t("bob cannot list all subs", assertFails(getDocs(collection(bob, "submissions"))));
await t("admin list pending", assertSucceeds(getDocs(query(collection(admin, "submissions"), where("status", "==", "pending")))));

// admin approves (transaction)
await t("admin approve tx", assertSucceeds(runTransaction(admin, async (tx) => {
  const sRef = doc(admin, "submissions/t1_alice"); const s = (await tx.get(sRef)).data();
  const uRef = doc(admin, "users/alice"); await tx.get(uRef);
  tx.update(sRef, { status: "approved", reviewedAt: serverTimestamp(), reviewedBy: "admin1" });
  tx.update(uRef, { balance: increment(s.reward), totalEarned: increment(s.reward), taskEarned: increment(s.reward) });
  tx.set(doc(collection(admin, "transactions")), { uid: "alice", coins: s.reward, kind: "task", category: "earn", title: "x", status: "success", createdAt: serverTimestamp() });
})));
await t("admin approve 2nd task via bob reject+resubmit flow setup", assertSucceeds(setDoc(doc(bob, "submissions/t1_bob"), sub({ uid: "bob", userName: "Bob" }))));
await t("admin reject bob", assertSucceeds(updateDoc(doc(admin, "submissions/t1_bob"), { status: "rejected", rejectReason: "fake" })));
await t("bob resubmit ok", assertSucceeds(updateDoc(doc(bob, "submissions/t1_bob"), { proofText: "real proof", proofLink: "https://x.y", status: "pending", rejectReason: null, createdAt: serverTimestamp() })));
await t("bob cannot change reward on resubmit", assertFails(updateDoc(doc(bob, "submissions/t1_bob"), { reward: 1 })));

// withdrawals
const wd = async (db, uid, amt, coins, { skipUser = false, upi = "alice@okaxis", userCoins } = {}) => {
  const wRef = doc(collection(db, "withdrawals"));
  const b = writeBatch(db);
  b.set(wRef, { uid, name: "Alice", upiId: upi, amountRupees: amt, coins, status: "pending", source: "web", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const uc = userCoins ?? coins;
  if (!skipUser) b.update(doc(db, "users", uid), { balance: increment(-uc), lockedCoins: increment(uc), hasPendingWithdrawal: true, lastWithdrawalId: wRef.id });
  await b.commit();
  return wRef.id;
};
await t("withdraw blocked without KYC", assertFails(wd(alice, "alice", 30, 3000)));
// KYC submit
await t("kyc submit batch", assertSucceeds((async () => { const b = writeBatch(alice);
  b.set(doc(alice, "users/alice/private/kyc"), { name: "Alice Kumar", pan: "ABCDE1234F", submittedAt: serverTimestamp() });
  b.update(doc(alice, "users/alice"), { kycStatus: "pending", kycName: "Alice Kumar", panMasked: "ABXXXXX34F", updatedAt: serverTimestamp() });
  await b.commit(); })()));
await t("owner cannot read private kyc", assertFails(getDoc(doc(alice, "users/alice/private/kyc"))));
await t("admin reads private kyc", assertSucceeds(getDoc(doc(admin, "users/alice/private/kyc"))));
await t("admin verify kyc", assertSucceeds(updateDoc(doc(admin, "users/alice"), { kycStatus: "verified" })));
await t("withdraw below min (₹30 < ₹50 default)", assertFails(wd(alice, "alice", 30, 3000)));
// alice has 3000 coins = ₹30 -> give admin bonus 3000 via approve? Admin sets balance directly for test.
await t("admin credit", assertSucceeds(updateDoc(doc(admin, "users/alice"), { balance: increment(4000) })));
await t("withdraw coin mismatch", assertFails(wd(alice, "alice", 50, 100)));
await t("withdraw without reserving coins", assertFails(wd(alice, "alice", 50, 5000, { skipUser: true })));
await t("withdraw reserving fewer coins", assertFails(wd(alice, "alice", 50, 5000, { userCoins: 1 })));
await t("withdraw bad upi", assertFails(wd(alice, "alice", 50, 5000, { upi: "not-a-upi" })));
await t("withdraw more than balance (₹80 > ₹70)", assertFails(wd(alice, "alice", 80, 8000)));
await t("bob withdraw for alice", assertFails(wd(bob, "alice", 50, 5000)));
await t("user decrement balance alone", assertFails(updateDoc(doc(alice, "users/alice"), { balance: increment(-10), lockedCoins: increment(10) })));
let wid;
await t("withdraw ₹50 ok", assertSucceeds((async () => { wid = await wd(alice, "alice", 50, 5000); })()));
const after = (await getDoc(doc(admin, "users/alice"))).data();
console.log("alice after reserve:", after.balance, after.lockedCoins, after.hasPendingWithdrawal);
await t("second withdraw blocked while pending", assertFails(wd(alice, "alice", 50, 2000 * 0 + 5000)));
await t("user cannot mark own withdrawal paid", assertFails(updateDoc(doc(alice, "withdrawals", wid), { status: "paid" })));
await t("user reads own withdrawals", assertSucceeds(getDocs(query(collection(alice, "withdrawals"), where("uid", "==", "alice")))));
await t("bob cannot read alice withdrawals", assertFails(getDocs(query(collection(bob, "withdrawals"), where("uid", "==", "alice")))));
await t("admin reject+refund tx", assertSucceeds(runTransaction(admin, async (tx) => {
  const wRef = doc(admin, "withdrawals", wid); const w = (await tx.get(wRef)).data();
  const uRef = doc(admin, "users/alice"); await tx.get(uRef);
  tx.update(wRef, { status: "rejected", rejectReason: "test", updatedAt: serverTimestamp() });
  tx.update(uRef, { balance: increment(w.coins), lockedCoins: increment(-w.coins), hasPendingWithdrawal: false });
})));
await t("config: min ₹10 + 10 coins/₹ honoured", assertSucceeds((async () => {
  await setDoc(doc(admin, "config/app"), { coinsPerRupee: 10, minWithdrawRupees: 10, maxWithdrawRupeesPerRequest: 500, requireKycForWithdraw: true }, { merge: true });
  await wd(alice, "alice", 10, 100);
})()));
await t("user cannot write config", assertFails(setDoc(doc(alice, "config/app"), { coinsPerRupee: 1 })));
await t("user cannot create transaction", assertFails(addDoc(collection(alice, "transactions"), { uid: "alice", coins: 1000 })));
await t("user cannot make self admin", assertFails(setDoc(doc(alice, "admins/alice"), { role: "x" })));
await t("user reads own admins doc (absent)", assertSucceeds(getDoc(doc(alice, "admins/alice"))));
await t("blocked user cannot submit", assertSucceeds(updateDoc(doc(admin, "users/bob"), { status: "blocked" })));
await t("blocked bob submit t3", assertFails((async () => {
  await setDoc(doc(admin, "tasks/t3"), { title: "T3", description: "d", type: "proof", reward: 5, link: "", active: true });
  await setDoc(doc(bob, "submissions/t3_bob"), sub({ uid: "bob", taskId: "t3", reward: 5 }));
})()));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
