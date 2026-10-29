/// App-wide constants. Replace every TODO before publishing.
class AppConfig {
  AppConfig._();

  static const appName = 'TaskKamao';
  static const tagline = 'Task karo, coins kamao';

  /// Cloud Functions region (must match functions/src/config.ts REGION).
  static const functionsRegion = 'asia-south1';

  static const coinsPerRupee = 100; // 100 coins = Rs 1 (server is the source of truth)
  static const minWithdrawRupees = 50;

  /// TODO: Replace with your own AdMob rewarded ad unit id before release.
  /// This is Google's official TEST rewarded unit id (safe for development).
  static const rewardedAdUnitId = 'ca-app-pub-3940256099942544/5224354917';

  // TODO: host these pages (e.g. Firebase Hosting / Google Sites) and paste the links.
  static const privacyPolicyUrl = 'https://YOUR-DOMAIN.com/privacy';
  static const termsUrl = 'https://YOUR-DOMAIN.com/terms';
  static const accountDeletionUrl = 'https://YOUR-DOMAIN.com/delete-account';
  static const supportEmail = 'support@YOUR-DOMAIN.com';
  static const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.taskkamao.app';
}
