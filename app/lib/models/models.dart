import 'package:cloud_firestore/cloud_firestore.dart';

typedef Json = Map<String, dynamic>;

DateTime? _ts(dynamic v) => v is Timestamp ? v.toDate() : null;
int _int(dynamic v) => v is num ? v.toInt() : 0;

class AppUser {
  AppUser({
    required this.uid,
    required this.phone,
    required this.name,
    required this.balance,
    required this.adPoints,
    required this.lockedCoins,
    required this.totalEarned,
    required this.referralCode,
    required this.referredBy,
    required this.streak,
    required this.lastCheckinDate,
    required this.kycStatus,
    required this.kycName,
    required this.panMasked,
    required this.kycRejectReason,
    required this.status,
    required this.hasPendingWithdrawal,
    required this.createdAt,
  });

  final String uid;
  final String phone;
  final String name;
  final int balance;
  final int adPoints; // non-withdrawable video points (AdMob policy)
  final int lockedCoins;
  final int totalEarned;
  final String referralCode;
  final String? referredBy;
  final int streak;
  final String? lastCheckinDate;
  final String kycStatus; // none | pending | verified | rejected
  final String? kycName;
  final String? panMasked;
  final String? kycRejectReason;
  final String status; // active | blocked | deletion_requested
  final bool hasPendingWithdrawal;
  final DateTime? createdAt;

  bool get isKycVerified => kycStatus == 'verified';

  factory AppUser.fromDoc(DocumentSnapshot<Json> doc) {
    final d = doc.data() ?? <String, dynamic>{};
    return AppUser(
      uid: doc.id,
      phone: d['phone'] as String? ?? '',
      name: d['name'] as String? ?? 'User',
      balance: _int(d['balance']),
      adPoints: _int(d['adPoints']),
      lockedCoins: _int(d['lockedCoins']),
      totalEarned: _int(d['totalEarned']),
      referralCode: d['referralCode'] as String? ?? '',
      referredBy: d['referredBy'] as String?,
      streak: _int(d['streak']),
      lastCheckinDate: d['lastCheckinDate'] as String?,
      kycStatus: d['kycStatus'] as String? ?? 'none',
      kycName: d['kycName'] as String?,
      panMasked: d['panMasked'] as String?,
      kycRejectReason: d['kycRejectReason'] as String?,
      status: d['status'] as String? ?? 'active',
      hasPendingWithdrawal: d['hasPendingWithdrawal'] == true,
      createdAt: _ts(d['createdAt']),
    );
  }
}

class TaskItem {
  TaskItem({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.type,
    required this.coins,
    required this.dailyLimit,
    required this.url,
    required this.minSeconds,
  });

  final String id;
  final String title;
  final String subtitle;
  final String type; // video | quiz | spin | scratch | offerwall | visit
  final int coins;
  final int dailyLimit;
  final String? url;
  final int minSeconds;

  factory TaskItem.fromDoc(DocumentSnapshot<Json> doc) {
    final d = doc.data() ?? <String, dynamic>{};
    return TaskItem(
      id: doc.id,
      title: d['title'] as String? ?? doc.id,
      subtitle: d['subtitle'] as String? ?? '',
      type: d['type'] as String? ?? 'visit',
      coins: _int(d['coins']),
      dailyLimit: _int(d['dailyLimit']),
      url: d['url'] as String?,
      minSeconds: d['minSeconds'] is num ? (d['minSeconds'] as num).toInt() : 30,
    );
  }
}

class QuizQuestion {
  QuizQuestion({required this.id, required this.question, required this.options, required this.coins});
  final String id;
  final String question;
  final List<String> options;
  final int coins;

  factory QuizQuestion.fromDoc(DocumentSnapshot<Json> doc) {
    final d = doc.data() ?? <String, dynamic>{};
    return QuizQuestion(
      id: doc.id,
      question: d['question'] as String? ?? '',
      options: (d['options'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      coins: _int(d['coins']),
    );
  }
}

class CoinTx {
  CoinTx({
    required this.id,
    required this.coins,
    required this.kind,
    required this.category,
    required this.title,
    required this.status,
    required this.createdAt,
  });
  final String id;
  final int coins;
  final String kind;
  final String category; // earn | referral | withdraw | refund
  final String title;
  final String status;
  final DateTime? createdAt;

  factory CoinTx.fromDoc(DocumentSnapshot<Json> doc) {
    final d = doc.data() ?? <String, dynamic>{};
    return CoinTx(
      id: doc.id,
      coins: _int(d['coins']),
      kind: d['kind'] as String? ?? '',
      category: d['category'] as String? ?? 'earn',
      title: d['title'] as String? ?? '',
      status: d['status'] as String? ?? 'success',
      createdAt: _ts(d['createdAt']),
    );
  }
}

class Referral {
  Referral({required this.friendName, required this.status, required this.commissionEarned, required this.createdAt});
  final String friendName;
  final String status; // pending | qualified
  final int commissionEarned;
  final DateTime? createdAt;

  factory Referral.fromDoc(DocumentSnapshot<Json> doc) {
    final d = doc.data() ?? <String, dynamic>{};
    return Referral(
      friendName: d['friendName'] as String? ?? 'Friend',
      status: d['status'] as String? ?? 'pending',
      commissionEarned: _int(d['commissionEarned']),
      createdAt: _ts(d['createdAt']),
    );
  }
}

class LeaderEntry {
  LeaderEntry({required this.uid, required this.name, required this.coins});
  final String uid;
  final String name;
  final int coins;

  factory LeaderEntry.fromDoc(DocumentSnapshot<Json> doc) {
    final d = doc.data() ?? <String, dynamic>{};
    return LeaderEntry(uid: doc.id, name: d['name'] as String? ?? 'User', coins: _int(d['coins']));
  }
}
