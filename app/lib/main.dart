import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'providers/providers.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Reads android/app/google-services.json (see GOOGLE_SERVICES_README.txt).
  await Firebase.initializeApp();

  // App Check: proves requests come from your genuine app (Play Integrity).
  // Enable "Play Integrity" for the app in Firebase Console > App Check, then set
  // ENFORCE_APP_CHECK = true in functions/src/config.ts.
  await FirebaseAppCheck.instance.activate(
    androidProvider: kReleaseMode ? AndroidProvider.playIntegrity : AndroidProvider.debug,
  );

  await MobileAds.instance.initialize();
  final prefs = await SharedPreferences.getInstance();

  runApp(ProviderScope(
    overrides: [sharedPrefsProvider.overrideWithValue(prefs)],
    child: const TaskKamaoApp(),
  ));
}
