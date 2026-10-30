# TaskKamao Website (web/)

Yeh TaskKamao ki **website** hai — mobile browser mein chalti hai, koi app install nahi.
Plain HTML/CSS/JS + Firebase (Auth + Firestore). Koi Cloud Functions / Blaze plan zaroori nahi.

**Live URL (Pages on hone ke baad):** https://bhagrajpunar-ui.github.io/TaskKamao/
**Admin panel:** https://bhagrajpunar-ui.github.io/TaskKamao/admin.html

## Kya hai, kya nahi
- ✅ User: Login/Signup (Google + Email), Dashboard, Tasks, Proof bhejna, History, Wallet (withdraw request), Profile + KYC, Terms
- ✅ Admin: Tasks banana/edit/band karna, proof approve (coins credit) / reject, withdrawal "Paid" (UTR ke saath) / reject (coins refund), users list, KYC verify, settings
- ❌ Koi "Add Money"/deposit/recharge nahi, ❌ koi investment/daily return nahi, ❌ deposit par referral nahi, ❌ video ads nahi
- Kamai sirf admin-approved tasks se. Payout aap khud UPI app se manually bhejte ho.

## Setup (sab kuch phone ke browser se ho jaata hai)

### 1. Firebase web app banao (wahi project jo Android app ke liye hai)
1. https://console.firebase.google.com kholo → apna TaskKamao project chuno.
2. ⚙️ **Project settings** → **General** → neeche "Your apps" → **Add app** → **Web (</>)** icon.
3. Nickname: `TaskKamao Web` → **Register app** (Hosting wala box tick mat karo).
4. Jo `firebaseConfig = { ... }` dikhe, use copy karo.

### 2. Config paste karo
1. GitHub par repo kholo → `web/firebase-config.js` → ✏️ (Edit).
2. `YOUR_API_KEY`, `YOUR_PROJECT_ID` waghera ki jagah apni values paste karo.
3. **Commit changes** dabao. 1–2 minute mein website apne aap update ho jaayegi.
   (Jab tak placeholder rahenge, site par "Firebase config abhi set nahi hai" banner dikhega.)

### 3. Login methods on karo
Firebase Console → **Authentication** → **Sign-in method**:
- **Google** → Enable → support email chuno → Save
- **Email/Password** → Enable → Save

### 4. Authorized domain add karo
Authentication → **Settings** → **Authorized domains** → **Add domain** → `bhagrajpunar-ui.github.io` → Add.

### 5. Firestore rules publish karo
1. Firestore Database (agar nahi bana to **Create database** → location `asia-south1 (Mumbai)` → production mode).
2. **Rules** tab → sab kuch hata ke repo ki `firestore.rules` file (repo ke root mein) ka poora content paste karo → **Publish**.
   Yeh rules Android app ke saath bhi kaam karte hain.

### 6. Khud ko admin banao
1. Website par apne account se ek baar login karo.
2. `admin.html` kholo — wahan aapka **UID** dikhega (copy karo).
   (Ya Firebase Console → Authentication → Users → User UID column.)
3. Firestore → **Start collection** → Collection ID: `admins` → Document ID: *apna UID* → ek field `role` = `owner` → Save.
4. `admin.html` refresh karo — ab admin panel khul jaayega.

### 7. GitHub Pages on karo (ek baar)
Repo → **Settings** → **Pages** → **Build and deployment → Source: GitHub Actions**.
Phir **Actions** tab → "Deploy website (GitHub Pages)" → **Run workflow**.
⚠️ Free GitHub account par **private repo** ke liye Pages nahi milta. Ya to repo ko **Public** karo
(Settings → General → Danger Zone → Change visibility; repo mein koi password/secret nahi hai),
ya GitHub Pro lo.

## Settings badalna
Admin panel → **Settings**: coins per ₹1 (default 100), minimum withdrawal (default ₹50), max per request (₹500),
KYC zaroori (default ON). Yeh Firestore doc `config/app` mein save hota hai. Default values `web/firebase-config.js` mein bhi hain.

## Roz ka kaam (admin)
1. **Submissions**: proof dekho → Approve (coins turant user ke balance mein) ya Reject (reason likho).
2. **Users**: KYC pending → "PAN dekho" → naam match ho to Verify.
3. **Withdrawals**: apne UPI app se user ke UPI ID par paisa bhejo → UTR copy karo → "Paid mark karo" mein daalo.
   Galat request ho to Reject — coins apne aap wapas.

## Data (Firestore collections)
| Collection | Kya hai |
|---|---|
| `users/{uid}` | profile, `balance`, `lockedCoins`, `kycStatus` (user balance nahi badal sakta) |
| `users/{uid}/private/kyc` | full PAN (sirf admin padh sakta hai) |
| `tasks/{id}` | `title, description, reward, link, active, type:"proof"` |
| `submissions/{taskId}_{uid}` | proof, `status: pending/approved/rejected` |
| `withdrawals/{id}` | `upiId, amountRupees, coins, status: pending/paid/rejected, utr` |
| `transactions/{id}` | ledger (admin approve/paid par banta hai) |
| `admins/{uid}` | admin list (sirf console se) |
| `config/app` | settings |

Web tasks mein `order` field nahi hoti, isliye Android app ki Tasks screen unhe nahi dikhati (dono alag rehte hain).

## Local test
```
cd web && python3 -m http.server 8000   # phir http://localhost:8000
```
Rules test: `tests/firestore-rules.test.mjs` (Firebase emulator, Java chahiye).
