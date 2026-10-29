import 'package:android_id/android_id.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

/// Returns a stable device identifier used for "one account per device".
/// ANDROID_ID survives app reinstall (per signing key + device + user). The server only stores its SHA-256 hash.
class DeviceService {
  static const _key = 'tk_install_id';

  static Future<String> deviceId() async {
    try {
      final id = await const AndroidId().getId();
      if (id != null && id.isNotEmpty) return 'aid:$id';
    } catch (_) {
      // fall through to install id
    }
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_key);
    if (id == null) {
      id = const Uuid().v4();
      await prefs.setString(_key, id);
    }
    return 'iid:$id';
  }
}
