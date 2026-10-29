import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getConfig, getTask, SCRATCH_PRIZES, SPIN_SEGMENTS } from "./config";
import { checkDailyCap, creditInTx } from "./credit";
import { db, FieldValue } from "./firebase";
import { assertActive, callOpts, istDate, requireAuth, str, UserDoc, weightedPick } from "./util";

function dailyRef(uid: string, date = istDate()) {
  return db.doc(`users/${uid}/daily/${date}`);
}

export const claimCheckin = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const cfg = await getConfig();
  const today = istDate();
  const yesterday = istDate(new Date(Date.now() - 24 * 3600 * 1000));
  return db.runTransaction(async (t) => {
    const user = assertActive((await t.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined);
    if (user.lastCheckinDate === today) throw new HttpsError("already-exists", "Aaj ka check-in ho chuka hai. Kal aana!");
    const streak = user.lastCheckinDate === yesterday ? (user.streak ?? 0) + 1 : 1;
    const bonus = cfg.streakBonusEvery > 0 && streak % cfg.streakBonusEvery === 0 ? cfg.streakBonusCoins : 0;
    const coins = cfg.checkinCoins + bonus;
    await creditInTx(t, uid, user, cfg, {
      coins, kind: "checkin", title: bonus ? `Daily check-in (Day ${streak} bonus)` : `Daily check-in (Day ${streak})`,
      countsAsTask: false, extraUserUpdates: { lastCheckinDate: today, streak },
      daily: { ref: dailyRef(uid, today), field: "checkin" },
    });
    return { coins, streak };
  });
});

async function dailyGame(uid: string, taskId: "spin" | "scratch") {
  const cfg = await getConfig();
  const task = await getTask(taskId);
  if (!task || !task.active) throw new HttpsError("unavailable", "Yeh task abhi band hai.");
  const dRef = dailyRef(uid);
  return db.runTransaction(async (t) => {
    const user = assertActive((await t.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined);
    const daily = (await t.get(dRef)).data();
    if (((daily?.[taskId] as number) ?? 0) >= task.dailyLimit) {
      throw new HttpsError("resource-exhausted", "Aaj ki limit poori. Kal phir try karein!");
    }
    const { item, index } = weightedPick(taskId === "spin" ? SPIN_SEGMENTS : SCRATCH_PRIZES);
    await creditInTx(t, uid, user, cfg, {
      coins: item.coins, kind: taskId, title: taskId === "spin" ? "Daily spin" : "Scratch card",
      countsAsTask: false, daily: { ref: dRef, field: taskId },
    });
    return { coins: item.coins, segmentIndex: index, remaining: task.dailyLimit - (((daily?.[taskId] as number) ?? 0) + 1) };
  });
}

export const spinWheel = onCall(callOpts, async (req) => dailyGame(requireAuth(req), "spin"));
export const scratchCard = onCall(callOpts, async (req) => dailyGame(requireAuth(req), "scratch"));

/** Starts a timed "visit" task (e.g. read an article in-app). Returns a session that completeTask checks. */
export const startTask = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const taskId = str(req.data?.taskId, "task", 64);
  const task = await getTask(taskId);
  if (!task || !task.active || task.type !== "visit") throw new HttpsError("not-found", "Task nahi mila.");
  const user = assertActive((await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined);
  const daily = (await dailyRef(uid).get()).data();
  if (((daily?.[`task_${taskId}`] as number) ?? 0) >= task.dailyLimit) {
    throw new HttpsError("resource-exhausted", "Is task ki aaj ki limit poori.");
  }
  const ref = await db.collection("taskSessions").add({
    uid: user.uid, taskId, status: "started", startedAt: FieldValue.serverTimestamp(),
  });
  return { sessionId: ref.id, url: task.url ?? null, minSeconds: task.minSeconds ?? 30 };
});

/**
 * Completes a task. Supported:
 *  - taskId "quiz": { questionId, answerIndex } -> checks answer against admin-only quizAnswers
 *  - any task with type "visit": { sessionId } -> checks the minimum time passed
 * Video ads are credited ONLY by the AdMob SSV callback (verifyRewardedAd), never from the app.
 */
export const completeTask = onCall(callOpts, async (req) => {
  const uid = requireAuth(req);
  const taskId = str(req.data?.taskId, "task", 64);
  const cfg = await getConfig();
  const task = await getTask(taskId);
  if (!task || !task.active) throw new HttpsError("not-found", "Task nahi mila ya band hai.");
  const dRef = dailyRef(uid);

  if (task.type === "quiz") {
    const qid = str(req.data?.questionId, "question", 64);
    const answerIndex = Number(req.data?.answerIndex);
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 5) throw new HttpsError("invalid-argument", "Galat jawab index.");
    return db.runTransaction(async (t) => {
      const user = assertActive((await t.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined);
      const [daily, qSnap, aSnap, doneSnap] = await Promise.all([
        t.get(dRef), t.get(db.doc(`quizQuestions/${qid}`)), t.get(db.doc(`quizAnswers/${qid}`)),
        t.get(db.doc(`users/${uid}/quizAnswered/${qid}`)),
      ]);
      if (!qSnap.exists || !aSnap.exists || qSnap.data()!.active === false) throw new HttpsError("not-found", "Sawal nahi mila.");
      if (doneSnap.exists) throw new HttpsError("already-exists", "Yeh sawal aap pehle de chuke hain.");
      const d = daily.data();
      if (((d?.quiz as number) ?? 0) >= task.dailyLimit) throw new HttpsError("resource-exhausted", "Aaj ke quiz poore. Kal naye sawal!");
      const correctIndex = aSnap.data()!.correctIndex as number;
      const correct = answerIndex === correctIndex;
      const coins = correct ? ((qSnap.data()!.coins as number) ?? task.coins) : 0;
      if (coins > 0) checkDailyCap(d, coins, cfg);
      await creditInTx(t, uid, user, cfg, {
        coins, kind: "quiz", title: "Quiz sahi jawab", countsAsTask: true, meta: { questionId: qid },
        daily: { ref: dRef, field: "quiz" },
      });
      t.set(db.doc(`users/${uid}/quizAnswered/${qid}`), { correct, at: FieldValue.serverTimestamp() });
      return { correct, correctIndex, coins };
    });
  }

  if (task.type === "visit") {
    const sessionId = str(req.data?.sessionId, "session", 64);
    const sRef = db.doc(`taskSessions/${sessionId}`);
    return db.runTransaction(async (t) => {
      const user = assertActive((await t.get(db.doc(`users/${uid}`))).data() as UserDoc | undefined);
      const [sSnap, daily] = await Promise.all([t.get(sRef), t.get(dRef)]);
      const s = sSnap.data();
      if (!s || s.uid !== uid || s.taskId !== taskId || s.status !== "started") throw new HttpsError("not-found", "Session galat hai.");
      const elapsed = (Date.now() - s.startedAt.toMillis()) / 1000;
      if (elapsed < (task.minSeconds ?? 30)) throw new HttpsError("failed-precondition", "Task poora karne ke liye thoda aur samay dein.");
      if (elapsed > 3600) throw new HttpsError("deadline-exceeded", "Session expire ho gaya. Dobara shuru karein.");
      const d = daily.data();
      if (((d?.[`task_${taskId}`] as number) ?? 0) >= task.dailyLimit) throw new HttpsError("resource-exhausted", "Aaj ki limit poori.");
      checkDailyCap(d, task.coins, cfg);
      await creditInTx(t, uid, user, cfg, {
        coins: task.coins, kind: "task", title: task.title, countsAsTask: true, meta: { taskId },
        daily: { ref: dRef, field: `task_${taskId}` },
      });
      t.update(sRef, { status: "completed", completedAt: FieldValue.serverTimestamp() });
      return { coins: task.coins };
    });
  }

  throw new HttpsError("invalid-argument", "Is task ko app se complete nahi kiya ja sakta.");
});
