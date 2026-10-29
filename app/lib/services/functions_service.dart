import 'package:cloud_functions/cloud_functions.dart';

import '../core/app_config.dart';
import '../core/app_exception.dart';

/// Thin wrapper over Firebase callable functions. All coin changes happen on the server.
class FunctionsService {
  FunctionsService() : _f = FirebaseFunctions.instanceFor(region: AppConfig.functionsRegion);
  final FirebaseFunctions _f;

  Future<Map<String, dynamic>> call(String name, [Map<String, dynamic>? data]) async {
    try {
      final res = await _f
          .httpsCallable(name, options: HttpsCallableOptions(timeout: const Duration(seconds: 40)))
          .call<dynamic>(data ?? <String, dynamic>{});
      final d = res.data;
      if (d is Map) return d.map((k, v) => MapEntry(k.toString(), v));
      return <String, dynamic>{};
    } on FirebaseFunctionsException catch (e) {
      throw AppException(e.message ?? 'Kuch galat ho gaya. Dobara try karein.');
    } catch (_) {
      throw AppException('Internet check karein aur dobara try karein.');
    }
  }

  Future<Map<String, dynamic>> bootstrapUser({required String deviceId, String? referralCode}) =>
      call('bootstrapUser', {'deviceId': deviceId, if (referralCode != null && referralCode.isNotEmpty) 'referralCode': referralCode});
  Future<Map<String, dynamic>> applyReferral(String code) => call('applyReferral', {'code': code});
  Future<Map<String, dynamic>> claimCheckin() => call('claimCheckin');
  Future<Map<String, dynamic>> spinWheel() => call('spinWheel');
  Future<Map<String, dynamic>> scratchCard() => call('scratchCard');
  Future<Map<String, dynamic>> createAdSession() => call('createAdSession');
  Future<Map<String, dynamic>> startTask(String taskId) => call('startTask', {'taskId': taskId});
  Future<Map<String, dynamic>> completeVisitTask(String taskId, String sessionId) =>
      call('completeTask', {'taskId': taskId, 'sessionId': sessionId});
  Future<Map<String, dynamic>> answerQuiz(String questionId, int answerIndex) =>
      call('completeTask', {'taskId': 'quiz', 'questionId': questionId, 'answerIndex': answerIndex});
  Future<Map<String, dynamic>> requestWithdrawal({required int amountRupees, required String upiId}) =>
      call('requestWithdrawal', {'amountRupees': amountRupees, 'upiId': upiId});
  Future<Map<String, dynamic>> submitKyc({required String name, required String pan}) =>
      call('submitKyc', {'name': name, 'pan': pan});
  Future<Map<String, dynamic>> updateProfile(String name) => call('updateProfile', {'name': name});
  Future<Map<String, dynamic>> requestAccountDeletion() => call('requestAccountDeletion');
}
