import 'package:flutter/material.dart';

/// OFFERWALL INTEGRATION POINT.
/// 1. Sign up with an offerwall provider that supports India and Flutter/Android (check their SDK docs).
/// 2. Add their SDK to pubspec.yaml and open their offerwall here, passing the Firebase uid as the user id.
/// 3. Set their server "postback URL" to the offerwallPostback Cloud Function and adapt
///    functions/src/offerwall.ts to their parameter names + signature.
/// 4. Set tasks/offerwall.active = true from the admin panel.
/// Coins are credited ONLY by the server postback, never by this screen.
/// Play Store policy: do not offer rewards for installing/rating apps unless the provider is policy compliant.
class OfferwallScreen extends StatelessWidget {
  const OfferwallScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Offers')),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.local_offer, size: 64),
            SizedBox(height: 12),
            Text('Partner offers jald aa rahe hain!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            SizedBox(height: 8),
            Text('Offer poora hone ke baad partner ki confirmation milte hi coins wallet mein aayenge.', textAlign: TextAlign.center),
          ]),
        ),
      ),
    );
  }
}
