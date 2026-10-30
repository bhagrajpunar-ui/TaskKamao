import { esc } from "./common.js";

export function termsHtml(s) {
  const per = Number(s.coinsPerRupee) || 100;
  const min = Number(s.minWithdrawRupees) || 50;
  return `<div class="card terms">
  <h2>📜 Terms &amp; Conditions</h2>
  <p class="muted">TaskKamao istemal karke aap in sharton se sehmat hain.</p>

  <h3>1. Kamai sirf tasks se</h3>
  <ul>
    <li>Coins <b>sirf tab milte hain jab aap koi task poora karke proof bhejte hain</b> aur admin use manually check karke <b>approve</b> karta hai.</li>
    <li>Galat, copy kiya hua ya fake proof <b>reject</b> hoga. Baar-baar fraud karne par account block ho sakta hai aur coins zabt ho sakte hain.</li>
    <li>Koi guaranteed ya fixed kamai nahi hai. Kitna kamaoge, yeh aapke approved tasks par depend karta hai.</li>
  </ul>

  <h3>2. Yahan kya NAHI hai</h3>
  <ul>
    <li><b>Koi "Add Money", deposit ya recharge nahi.</b> TaskKamao kabhi aapse paise jama karne ko nahi kahega.</li>
    <li><b>Koi investment plan, daily return ya "baithe-baithe kamai" (passive income) nahi.</b></li>
    <li>Paise jama karne par milne wala koi referral/commission nahi. Agar koi TaskKamao ke naam par aapse paise maange, woh fraud hai.</li>
    <li>Video ads se koi withdraw hone wala cash nahi milta.</li>
  </ul>

  <h3>3. Coins aur rupaye</h3>
  <ul>
    <li>${esc(per)} coins = ₹1. Yeh rate admin badal sakta hai; badlaav pehle se jama approved coins ke liye app mein dikhaya jayega.</li>
    <li>Coins koi currency, wallet balance ya deposit nahi hain; yeh tasks ka reward hain.</li>
  </ul>

  <h3>4. Withdrawal</h3>
  <ul>
    <li><b>Minimum withdrawal ₹${esc(min)}</b> hai.</li>
    <li>${s.requireKycForWithdraw === false ? "KYC (naam + PAN) verify karwana zaroori ho sakta hai." : "<b>Withdrawal se pehle KYC (legal naam + PAN) verify hona zaroori hai.</b>"} Naam aapke UPI/bank account ke naam se match hona chahiye.</li>
    <li>Withdrawal ek <b>request</b> hai. Admin har request manually check karta hai, phir aapke UPI ID par payment bhejta hai (UTR number history mein dikhega). Isme kuch working din lag sakte hain.</li>
    <li>Request bhejte hi utne coins "reserved" ho jaate hain. Request reject hui to coins wapas aapke balance mein aa jaate hain.</li>
    <li>Galat UPI ID dene par hua nuksaan hamari zimmedari nahi hai.</li>
  </ul>

  <h3>5. Account</h3>
  <ul>
    <li>Ek vyakti, ek account. Multiple/fake accounts block honge.</li>
    <li>Aapki jaankari (naam, email, phone, UPI, PAN) sirf verification aur payout ke liye use hoti hai.</li>
    <li>Hum service, rewards ya in terms ko kabhi bhi badal ya band kar sakte hain.</li>
  </ul>
  <p class="muted">Sawal ya shikayat ke liye admin se sampark karein.</p>
</div>`;
}
