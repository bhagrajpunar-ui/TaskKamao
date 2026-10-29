import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../core/app_config.dart';
import '../core/app_exception.dart';
import 'functions_service.dart';

/// Rewarded video flow (coins are credited ONLY by the server via AdMob SSV):
/// 1. createAdSession (server checks daily limit) -> sessionId
/// 2. load rewarded ad with SSV options userId=uid, customData=sessionId
/// 3. user watches ad -> Google calls our verifyRewardedAd function -> coins credited
/// 4. app waits for adSessions/{sessionId}.status == 'credited'
/// NOTE: by default the server credits non-withdrawable "video points", because AdMob policy does not allow
/// rewarded-ad rewards that can be converted to cash (config/app.videoRewardWithdrawable).
class AdService {
  AdService(this._functions);
  final FunctionsService _functions;

  Future<RewardedAd> _load() {
    final c = Completer<RewardedAd>();
    RewardedAd.load(
      adUnitId: AppConfig.rewardedAdUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) => c.complete(ad),
        onAdFailedToLoad: (err) => c.completeError(AppException('Abhi video available nahi hai. Thodi der baad try karein.')),
      ),
    );
    return c.future.timeout(const Duration(seconds: 30),
        onTimeout: () => throw AppException('Video load nahi hua. Internet check karein.'));
  }

  /// Returns coins credited (0 if user closed the ad early).
  Future<int> watchRewardedVideo(String uid) async {
    final session = await _functions.createAdSession();
    final sessionId = session['sessionId'] as String;

    final ad = await _load();
    await ad.setServerSideOptions(ServerSideVerificationOptions(userId: uid, customData: sessionId));

    final earned = Completer<bool>();
    ad.fullScreenContentCallback = FullScreenContentCallback(
      onAdDismissedFullScreenContent: (a) {
        a.dispose();
        if (!earned.isCompleted) earned.complete(false);
      },
      onAdFailedToShowFullScreenContent: (a, err) {
        a.dispose();
        if (!earned.isCompleted) earned.completeError(AppException('Video chal nahi paya.'));
      },
    );
    await ad.show(onUserEarnedReward: (_, __) {
      if (!earned.isCompleted) earned.complete(true);
    });
    final ok = await earned.future;
    if (!ok) return 0;
    return _waitForCredit(sessionId);
  }

  Future<int> _waitForCredit(String sessionId) async {
    final doc = FirebaseFirestore.instance.collection('adSessions').doc(sessionId);
    try {
      final snap = await doc
          .snapshots()
          .firstWhere((s) => (s.data()?['status'] as String? ?? 'pending') != 'pending')
          .timeout(const Duration(seconds: 45));
      final d = snap.data()!;
      if (d['status'] == 'credited') return (d['coins'] as num?)?.toInt() ?? 0; // coins or points (see asPoints)
      throw AppException('Is video ke coins nahi mile (${d['reason'] ?? 'limit'}).');
    } on TimeoutException {
      throw AppException('Verification mein der ho rahi hai. Coins kuch minute mein wallet mein aa jayenge.');
    }
  }
}
