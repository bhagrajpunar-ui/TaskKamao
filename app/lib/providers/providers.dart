import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';
import '../services/ad_service.dart';
import '../services/functions_service.dart';

final _db = FirebaseFirestore.instance;

// ---------- services ----------
final functionsProvider = Provider<FunctionsService>((ref) => FunctionsService());
final adServiceProvider = Provider<AdService>((ref) => AdService(ref.watch(functionsProvider)));

/// Overridden in main() with the real instance.
final sharedPrefsProvider = Provider<SharedPreferences>((ref) => throw UnimplementedError());

// ---------- theme ----------
class ThemeModeNotifier extends Notifier<ThemeMode> {
  static const _key = 'tk_dark_mode';
  @override
  ThemeMode build() {
    final dark = ref.watch(sharedPrefsProvider).getBool(_key);
    if (dark == null) return ThemeMode.system;
    return dark ? ThemeMode.dark : ThemeMode.light;
  }

  void setDark(bool dark) {
    ref.read(sharedPrefsProvider).setBool(_key, dark);
    state = dark ? ThemeMode.dark : ThemeMode.light;
  }
}

final themeModeProvider = NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

// ---------- auth & user ----------
final authStateProvider = StreamProvider<User?>((ref) => FirebaseAuth.instance.authStateChanges());

/// Referral code typed on the login screen; used once by bootstrapUser.
final pendingReferralCodeProvider = StateProvider<String?>((ref) => null);

final currentUidProvider = Provider<String?>((ref) => ref.watch(authStateProvider).valueOrNull?.uid);

final userDocProvider = StreamProvider<AppUser?>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value(null);
  return _db.collection('users').doc(uid).snapshots().map((s) => s.exists ? AppUser.fromDoc(s) : null);
});

// ---------- tasks / quiz ----------
final tasksProvider = StreamProvider<List<TaskItem>>((ref) {
  if (ref.watch(currentUidProvider) == null) return Stream.value(const []);
  return _db
      .collection('tasks')
      .where('active', isEqualTo: true)
      .orderBy('order')
      .snapshots()
      .map((q) => q.docs.map(TaskItem.fromDoc).toList());
});

/// Today's usage counters (users/{uid}/daily/{yyyy-MM-dd}), used to show "3/20 done".
final dailyStatsProvider = StreamProvider.family<Map<String, dynamic>, String>((ref, date) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value(const {});
  return _db.collection('users').doc(uid).collection('daily').doc(date).snapshots().map((s) => s.data() ?? const {});
});

// ---------- leaderboard ----------
final leaderboardProvider = StreamProvider<List<LeaderEntry>>((ref) {
  if (ref.watch(currentUidProvider) == null) return Stream.value(const []);
  return _db
      .collection('leaderboard')
      .orderBy('coins', descending: true)
      .limit(10)
      .snapshots()
      .map((q) => q.docs.map(LeaderEntry.fromDoc).toList());
});

// ---------- wallet ----------
/// null = all, otherwise earn | referral | withdraw | refund | points
final txFilterProvider = StateProvider<String?>((ref) => null);

final transactionsProvider = StreamProvider<List<CoinTx>>((ref) {
  final uid = ref.watch(currentUidProvider);
  final filter = ref.watch(txFilterProvider);
  if (uid == null) return Stream.value(const []);
  Query<Map<String, dynamic>> q = _db.collection('transactions').where('uid', isEqualTo: uid);
  if (filter != null) q = q.where('category', isEqualTo: filter);
  return q.orderBy('createdAt', descending: true).limit(50).snapshots().map((s) => s.docs.map(CoinTx.fromDoc).toList());
});

// ---------- referrals ----------
final referralsProvider = StreamProvider<List<Referral>>((ref) {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return Stream.value(const []);
  return _db
      .collection('referrals')
      .where('referrerUid', isEqualTo: uid)
      .orderBy('createdAt', descending: true)
      .limit(100)
      .snapshots()
      .map((s) => s.docs.map(Referral.fromDoc).toList());
});
