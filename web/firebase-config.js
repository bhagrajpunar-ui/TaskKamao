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
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Default app settings. Admin Firestore doc `config/app` mein same naam ki
// field daal kar inhe badal sakta hai (wahi value jeetegi).
export const defaultSettings = {
  coinsPerRupee: 100,          // 100 coins = ₹1
  minWithdrawRupees: 50,       // minimum withdrawal ₹50
  maxWithdrawRupeesPerRequest: 500,
  requireKycForWithdraw: true, // withdrawal se pehle KYC verified hona zaroori
};
