/**
 * Gives a Firebase Auth user the "admin" custom claim (needed for the /admin panel).
 * Usage (from /functions, with GOOGLE_APPLICATION_CREDENTIALS set as in seed.js):
 *   node scripts/setAdmin.js admin@yourdomain.com        (email/password admin user)
 *   node scripts/setAdmin.js +919876543210               (or a phone user)
 *   node scripts/setAdmin.js admin@yourdomain.com remove (remove admin)
 * The admin must log out and log in again after this.
 */
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp({ credential: applicationDefault() });
const who = process.argv[2];
const remove = process.argv[3] === "remove";
if (!who) { console.log("Usage: node scripts/setAdmin.js <email|+91phone> [remove]"); process.exit(1); }

(async () => {
  const auth = getAuth();
  const user = who.startsWith("+") ? await auth.getUserByPhoneNumber(who) : await auth.getUserByEmail(who);
  await auth.setCustomUserClaims(user.uid, remove ? {} : { admin: true });
  console.log(`${remove ? "Removed" : "Granted"} admin for ${who} (uid ${user.uid}).`);
})().catch((e) => { console.error(e.message); process.exit(1); });
