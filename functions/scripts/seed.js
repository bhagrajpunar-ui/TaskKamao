/**
 * Seeds config, tasks and quiz questions.
 * Usage (from /functions):
 *   1) Firebase Console > Project settings > Service accounts > Generate new private key
 *      Save as functions/serviceAccount.json (NEVER commit / share it)
 *   2) set GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json   (Windows CMD)
 *      export GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json (Mac/Linux)
 *   3) npm run seed
 * Re-running is safe: documents are overwritten with the same ids.
 */
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const data = require("./seed-data.json");

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

(async () => {
  const batch = db.batch();
  batch.set(db.doc("config/app"), data.config, { merge: true });
  for (const [id, t] of Object.entries(data.tasks)) batch.set(db.doc(`tasks/${id}`), t, { merge: true });
  for (const q of data.quiz) {
    batch.set(db.doc(`quizQuestions/${q.id}`), {
      question: q.question, options: q.options, category: q.category, coins: q.coins ?? 2, active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`quizAnswers/${q.id}`), { correctIndex: q.correctIndex }); // admin-only collection
  }
  await batch.commit();
  console.log(`Seeded config, ${Object.keys(data.tasks).length} tasks, ${data.quiz.length} quiz questions.`);
})().catch((e) => { console.error(e); process.exit(1); });
