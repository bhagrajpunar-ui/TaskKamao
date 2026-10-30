# TaskKamao — "Task karo, coins kamao"

Android rewards app (Flutter) + Firebase backend + web admin panel.

Users earn **coins** by doing tasks (daily check-in, quiz, daily spin, scratch card, partner offers, timed custom
tasks) and referrals, then **withdraw earned rewards to UPI**. 100 coins = ₹1, minimum withdrawal ₹50.

**What it deliberately does NOT have**
* No "Add Money" / deposit / wallet top-up of any kind (holding user money needs an RBI PPI licence).
* No passive income / "earn while sleeping" / guaranteed-earning claims anywhere.
* No client-side coin logic: the app can never write balances. Every credit happens in Cloud Functions.

> Hindi/Hinglish step-by-step setup guide for non-developers: `TaskKamao_Setup_Guide_Hindi.pdf` (next to the zip).

---

## Repository layout

```
app/                 Flutter app (Android)
  lib/
    main.dart, app.dart          bootstrap, theme, AuthGate (login -> setup -> main shell)
    core/                        config (TODO placeholders), theme, formatters, validators
    models/                      Firestore models
    services/                    callable-functions wrapper, AdMob rewarded flow, device id
    providers/                   Riverpod providers (auth, user doc, tasks, wallet, referrals...)
    features/auth|home|tasks|refer|wallet|profile|shell
  android/                       Gradle + AndroidManifest (AdMob TEST app id, permissions)
functions/           Cloud Functions (Node.js 20, TypeScript, firebase-functions v2)
  src/credit.ts      the ONLY place balances are credited (referral commission + bonus logic inside)
  src/rewards.ts     claimCheckin, spinWheel, scratchCard, startTask, completeTask (quiz / visit)
  src/ads.ts         createAdSession + verifyRewardedAd (AdMob SSV callback, ECDSA-verified)
  src/offerwall.ts   offerwallPostback (HMAC-verified placeholder integration point)
  src/withdraw.ts    requestWithdrawal (balance lock, KYC gate, limits)
  src/admin.ts       adminApproveWithdrawal (RazorpayX payout), reject, KYC verify, block user
  src/payouts.ts     RazorpayX Payouts API + razorpayWebhook (HMAC-verified)
  src/user.ts        bootstrapUser (device bind + referral), applyReferral, submitKyc, updateProfile, deletion
  scripts/           seed.js (config, tasks, quiz), setAdmin.js (admin custom claim), seed-data.json
admin/index.html     single-page admin panel (Firebase JS SDK) — deploy with Firebase Hosting
firestore.rules      clients can read their own data only; no client writes to money data
firestore.indexes.json
firebase.json, .firebaserc
docs/PRIVACY_POLICY.md, docs/TERMS.md   Play-Store-ready templates with [PLACEHOLDERS]
```

## Architecture

```
 Flutter app ──(Firebase Auth phone OTP)──► Firebase Auth
     │  reads own docs (rules-restricted)            ▲
     ├──────────────────────────────► Firestore ◄────┤ Admin SDK writes (balances, txs, withdrawals)
     │  callable functions (App Check ready)         │
     └──────────────────────────────► Cloud Functions (asia-south1)
                                          ▲      │
          Google AdMob SSV callback ──────┘      ├──► RazorpayX Payouts API (UPI)
          Offerwall postback ─────────────┘      ◄─── RazorpayX webhook (payout status)
 Admin panel (Hosting) ── email/password + admin claim ──► callables + Firestore (admin rules)
```

### Money/coin rules (server-enforced)
| Item | Default (edit in `config/app`) |
|---|---|
| Coins per ₹ | 100 |
| Min / max withdrawal | ₹50 / ₹500 per request, 1 per day, 1 pending at a time |
| Withdrawal gates | KYC verified (name + PAN, admin-reviewed), account ≥ 24 h old, status active |
| Daily check-in | 50 coins, +50 bonus on every 7th consecutive day (IST days) |
| Quiz | coins per correct answer (per question), 15 attempts/day, each question once |
| Spin / scratch | server RNG (`crypto.randomInt`), weighted, 1 spin + 3 scratch per day; odds in `config.ts` |
| Referral | friend applies code at signup (≤48 h). When friend earns 2,000 **task** coins → referrer 1,000, friend 500. Referrer also gets 10% of friend's task coins (paid by the platform, not deducted from friend) |
| Daily cap | 3,000 task coins per user per IST day |
| Fraud | one account per device (ANDROID_ID hash) and per phone; PAN can't be reused; >3 device changes → auto-block; risk flags shown to admin; App Check ready |

### Important policy note — rewarded video ads
Google AdMob's *Policies for ad units that offer rewards* do **not** allow rewarded-ad rewards that can be converted
into cash. Therefore, by default (`videoRewardWithdrawable: false`) rewarded videos credit **non-withdrawable
"video points"** (leaderboard only), kept separate from withdrawable coins. Withdrawable coins come from quiz, check-in,
spin/scratch, custom tasks, offerwall postbacks and referrals. Only flip the flag if your ad network explicitly allows it.
Ad revenue still funds the platform; it just isn't paid out *per ad view*.

## Prerequisites
* Flutter 3.24+ (Dart 3.5+), Android Studio (JDK 17), Android SDK 35
* Node.js 20, Firebase CLI (`npm i -g firebase-tools`)
* Firebase project on the **Blaze** plan (Cloud Functions + Secret Manager + outbound HTTP need it)

## Setup & run

```bash
# 0) Firebase project
firebase login
firebase use --add            # pick your project; or edit .firebaserc

# 1) Backend
cd functions
npm ci                        # or npm install
firebase functions:secrets:set RAZORPAYX_KEY_ID
firebase functions:secrets:set RAZORPAYX_KEY_SECRET
firebase functions:secrets:set RAZORPAYX_WEBHOOK_SECRET
firebase functions:secrets:set OFFERWALL_SECRET          # any long random string until you pick a provider
cd ..
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions                           # asks for RAZORPAYX_ACCOUNT_NUMBER on first deploy

# 2) Seed content + make an admin
#    Console > Project settings > Service accounts > Generate new private key -> functions/serviceAccount.json
cd functions
export GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json   # Windows: set GOOGLE_APPLICATION_CREDENTIALS=serviceAccount.json
npm run seed
#    Console > Authentication > Sign-in method: enable Email/Password, add an admin user, then:
node scripts/setAdmin.js admin@yourdomain.com
cd ..

# 3) Admin panel: paste web config into admin/index.html (firebaseConfig), then
firebase deploy --only hosting      # https://<project>.web.app

# 4) App
cd app
#   (Gradle wrapper, launcher icons and Android files are included; Flutter writes android/local.properties itself.
#    If something Android-side is missing, run `flutter create --platforms android .` and DELETE any newly
#    generated *.gradle.kts files, because this project uses the Groovy *.gradle files.)
#   copy google-services.json into app/android/app/   (see GOOGLE_SERVICES_README.txt)
flutter pub get
flutter run                          # debug on a phone
```

Local emulators: `cd functions && npm run serve` (Auth, Firestore, Functions, Hosting). Point the app at emulators
only for development (`FirebaseFunctions.instanceFor(...).useFunctionsEmulator(...)` etc.).

### Wiring external services
| Service | Where |
|---|---|
| AdMob app id | `app/android/app/src/main/AndroidManifest.xml` (currently Google's TEST id) |
| Rewarded ad unit id | `app/lib/core/app_config.dart` (currently TEST id) |
| AdMob SSV | AdMob > Apps > ad unit > Server-side verification > callback URL = `verifyRewardedAd` function URL |
| RazorpayX | Secrets above + account number param; Webhook URL = `razorpayWebhook` function URL, events `payout.*` |
| Offerwall | Provider postback URL = `offerwallPostback`; adapt param names/signature in `functions/src/offerwall.ts`; set `tasks/offerwall.active=true` |
| App Check | Console > App Check > register Android app with Play Integrity; then `ENFORCE_APP_CHECK = true` in `functions/src/config.ts` |
| Policy URLs | `app/lib/core/app_config.dart` (privacy, terms, deletion, support email) |

## Release build
```bash
cd app
keytool -genkey -v -keystore android/app/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cp android/key.properties.example android/key.properties   # fill passwords; storeFile=upload-keystore.jks
flutter build appbundle --release      # -> build/app/outputs/bundle/release/app-release.aab
flutter build apk --release            # optional, for side testing
```
Add the release + Play "App signing key" SHA-1/SHA-256 to Firebase (needed for phone OTP and Play Integrity).

## Security checklist
* Never commit `google-services.json`, `serviceAccount.json`, `key.properties`, `*.jks` (see `.gitignore`).
* Keep RazorpayX in **test mode** until everything works; payouts are real money.
* Start with `payoutsEnabled` and manual approval; review risk flags before approving.
* Turn on App Check enforcement before public launch.
* Firebase Console > Authentication > Settings > SMS region policy: allow only India.

## Known limitations / TODO before production
* KYC is manual review (no automatic PAN verification API wired). Plug one in inside `submitKyc` if needed.
* Offerwall is an integration point only — no provider SDK is bundled.
* Leaderboard is all-time (no weekly reset job).
* Account deletion is a request flag; complete deletion (Auth user + docs) manually or add a scheduled function.
* No push notifications.
* Not compiled in this environment (no Flutter SDK); Functions TypeScript compiles cleanly with `tsc`.
* Legal: get advice from a CA/lawyer on TDS/GST on rewards, the chance-based spin/scratch features, and
  India's online gaming rules before launch. You can switch off spin/scratch from the admin panel (tasks > active=false).

---

## 🌐 Website version (`web/`)

TaskKamao ab browser mein bhi chalta hai — koi app install nahi, koi Cloud Functions nahi.
Earnings sirf admin-approved tasks se; withdrawal requests admin manually UPI se pay karta hai.
Koi Add Money / deposit / investment nahi.

- Code: [`web/`](web/) · Setup (Hindi): [`web/README.md`](web/README.md)
- URL: https://bhagrajpunar-ui.github.io/TaskKamao/ (admin: `/admin.html`)
- Deploy: `.github/workflows/deploy-web.yml` (GitHub Pages, `web/**` push par)
- Rules: root `firestore.rules` (Android app + website dono ke liye) · tests: `tests/firestore-rules.test.mjs`
