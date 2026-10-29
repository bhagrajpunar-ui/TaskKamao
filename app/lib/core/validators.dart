class Validators {
  Validators._();

  static final _phone = RegExp(r'^[6-9]\d{9}$');
  static final _upi = RegExp(r'^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,63}$');
  static final _pan = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
  static final _name = RegExp(r'^[A-Za-z][A-Za-z .]{1,58}[A-Za-z.]$');
  static final _code = RegExp(r'^[A-Z0-9]{6,12}$');

  static String? phone(String? v) =>
      _phone.hasMatch((v ?? '').trim()) ? null : '10 digit ka sahi mobile number likhein';

  static String? upi(String? v) =>
      _upi.hasMatch((v ?? '').trim()) ? null : 'Sahi UPI ID likhein (jaise naam@okaxis)';

  static String? pan(String? v) =>
      _pan.hasMatch((v ?? '').trim().toUpperCase()) ? null : 'PAN format: ABCDE1234F';

  static String? name(String? v) =>
      _name.hasMatch((v ?? '').trim()) ? null : 'Naam mein sirf English letters aur space';

  static String? referralCode(String? v) {
    final s = (v ?? '').trim().toUpperCase();
    if (s.isEmpty) return null; // optional
    return _code.hasMatch(s) ? null : 'Referral code galat lag raha hai';
  }
}
