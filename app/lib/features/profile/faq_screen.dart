import 'package:flutter/material.dart';

import '../../core/app_config.dart';

class FaqScreen extends StatelessWidget {
  const FaqScreen({super.key});

  static const _faqs = <(String, String)>[
    ('Coins kaise milte hain?', 'Daily check-in, video dekhne, quiz ke sahi jawab, spin, scratch card aur partner offers se. Har task ki daily limit hoti hai.'),
    ('100 coins kitne rupaye?', '100 coins = \u20B91. Minimum withdrawal \u20B950 (5,000 coins) hai.'),
    ('Video points kya hain?', 'Video (rewarded ad) dekhne par points milte hain jo leaderboard mein judte hain. Ad network ke niyam ke kaaran yeh points withdraw nahi hote.'),
    ('Spin aur scratch mein kya mil sakta hai?', 'Spin: 0, 2, 5, 10, 20, 30, 50 ya 100 coins. Scratch: 2, 5, 10, 20 ya 50 coins. Har inaam ke chance Terms mein likhe hain. Inke liye koi paisa nahi lagta.'),
    ('Kya isse fixed kamai hoti hai?', 'Nahi. Coins sirf tasks poore karne par milte hain aur tasks ad availability par nirbhar hain. Yeh income ka zariya nahi, ek rewards app hai.'),
    ('Kya main app mein paise daal sakta hoon?', 'Nahi. TaskKamao mein koi deposit / add money feature nahi hai. Aap sirf kamaye hue rewards withdraw kar sakte hain.'),
    ('Withdrawal kitne din mein aata hai?', 'KYC verified hone ke baad request admin approve karta hai, phir UPI par bheja jata hai. Usually 1-3 working days.'),
    ('Withdrawal fail ho gaya?', 'Agar payout fail ho, coins apne aap wallet mein wapas aa jaate hain. UPI ID check karke dobara request karein.'),
    ('Ek se zyada account bana sakte hain?', 'Nahi. Ek mobile number aur ek device par ek hi account allowed hai. Fake accounts block ho sakte hain.'),
    ('Account delete kaise karein?', 'Profile > Account delete karein. Ya website par request bhejein.'),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('FAQ / Madad')),
        body: ListView(children: [
          for (final f in _faqs) ExpansionTile(title: Text(f.$1), children: [Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: Text(f.$2))]),
          const ListTile(leading: Icon(Icons.email_outlined), title: Text('Support'), subtitle: Text(AppConfig.supportEmail)),
        ]),
      );
}
