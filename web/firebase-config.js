// =====================================================================
//  TaskKamao Web — Firebase config
// ---------------------------------------------------------------------
//  YAHAN APNA FIREBASE WEB CONFIG PASTE KAREIN.
//  Firebase Console > Project settings (⚙️) > General > "Your apps" >
//  Web app (</>) > SDK setup and configuration > "Config" wala object.
//
//  Jab tak neeche "YOUR_..." placeholder hain, site ek banner dikhayegi
//  "Firebase config abhi set nahi hai" — crash nahi hogi.
//  (Yeh keys public hoti hain; security Firestore rules se aati hai.)
// =====================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyBWnqIghcSt0a2fOXshoKWQ2-kCifcuH70",
  authDomain: "taskkamao-bcb15.firebaseapp.com",
  projectId: "taskkamao-bcb15",
  storageBucket: "taskkamao-bcb15.firebasestorage.app",
  messagingSenderId: "613203070527",
  appId: "1:613203070527:web:8ec7ef508f090f0d1ab28a",
  measurementId: "G-FNE24BR026",
};

// Default app settings. Admin Firestore doc `config/app` mein same naam ki
// field daal kar inhe badal sakta hai (wahi value jeetegi).
export const defaultSettings = {
  coinsPerRupee: 100,          // 100 coins = ₹1
  minWithdrawRupees: 50,       // minimum withdrawal ₹50
  maxWithdrawRupeesPerRequest: 500,
  requireKycForWithdraw: true, // withdrawal se pehle KYC verified hona zaroori
  referralBonusCoins: 500,     // dost ka pehla task approve hone par referrer ko (0 = band)
};
