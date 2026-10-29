import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_config.dart';
import '../../core/validators.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phone = TextEditingController();
  final _referral = TextEditingController();
  final _otp = TextEditingController();
  String? _verificationId;
  int? _resendToken;
  bool _loading = false;
  bool _agreed = false;

  @override
  void dispose() {
    _phone.dispose();
    _referral.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    if (!_formKey.currentState!.validate()) return;
    if (!_agreed) {
      showSnack(context, 'Aage badhne ke liye Terms aur Privacy Policy accept karein', error: true);
      return;
    }
    final code = _referral.text.trim().toUpperCase();
    ref.read(pendingReferralCodeProvider.notifier).state = code.isEmpty ? null : code;
    setState(() => _loading = true);
    await FirebaseAuth.instance.verifyPhoneNumber(
      phoneNumber: '+91${_phone.text.trim()}',
      forceResendingToken: _resendToken,
      timeout: const Duration(seconds: 60),
      verificationCompleted: (cred) async {
        // Android can auto-read the SMS and sign in directly.
        await FirebaseAuth.instance.signInWithCredential(cred);
      },
      verificationFailed: (e) {
        if (!mounted) return;
        setState(() => _loading = false);
        final msg = e.code == 'too-many-requests'
            ? 'Bahut zyada try ho gaye. Thodi der baad karein.'
            : 'OTP nahi bheja ja saka: ${e.message ?? e.code}';
        showSnack(context, msg, error: true);
      },
      codeSent: (id, token) {
        if (!mounted) return;
        setState(() {
          _verificationId = id;
          _resendToken = token;
          _loading = false;
        });
        showSnack(context, 'OTP bhej diya gaya hai');
      },
      codeAutoRetrievalTimeout: (id) => _verificationId = id,
    );
  }

  Future<void> _verifyOtp() async {
    final code = _otp.text.trim();
    if (code.length != 6 || _verificationId == null) {
      showSnack(context, '6 digit OTP likhein', error: true);
      return;
    }
    setState(() => _loading = true);
    try {
      final cred = PhoneAuthProvider.credential(verificationId: _verificationId!, smsCode: code);
      await FirebaseAuth.instance.signInWithCredential(cred);
      // AuthGate takes over from here.
    } on FirebaseAuthException catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      showSnack(context, e.code == 'invalid-verification-code' ? 'OTP galat hai' : (e.message ?? 'Login fail'), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final otpStep = _verificationId != null;
    final t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Icon(Icons.monetization_on, size: 72, color: Colors.amber.shade700),
                const SizedBox(height: 8),
                Text(AppConfig.appName, textAlign: TextAlign.center, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
                Text(AppConfig.tagline, textAlign: TextAlign.center, style: t.titleMedium),
                const SizedBox(height: 32),
                if (!otpStep) ...[
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    maxLength: 10,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 '),
                    validator: Validators.phone,
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _referral,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'Referral code (optional)'),
                    validator: Validators.referralCode,
                  ),
                  CheckboxListTile(
                    value: _agreed,
                    onChanged: (v) => setState(() => _agreed = v ?? false),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Wrap(children: [
                      const Text('Main 18+ hoon aur '),
                      InkWell(
                        onTap: () => launchUrl(Uri.parse(AppConfig.termsUrl), mode: LaunchMode.externalApplication),
                        child: Text('Terms', style: TextStyle(color: Theme.of(context).colorScheme.primary)),
                      ),
                      const Text(' / '),
                      InkWell(
                        onTap: () => launchUrl(Uri.parse(AppConfig.privacyPolicyUrl), mode: LaunchMode.externalApplication),
                        child: Text('Privacy Policy', style: TextStyle(color: Theme.of(context).colorScheme.primary)),
                      ),
                      const Text(' maanta hoon'),
                    ]),
                  ),
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: _loading ? null : _sendOtp,
                    child: _loading ? const _Spinner() : const Text('OTP bhejo'),
                  ),
                ] else ...[
                  Text('+91 ${_phone.text} par aaya 6 digit OTP likhein', textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _otp,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    textAlign: TextAlign.center,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(labelText: 'OTP'),
                  ),
                  FilledButton(
                    onPressed: _loading ? null : _verifyOtp,
                    child: _loading ? const _Spinner() : const Text('Verify & Login'),
                  ),
                  TextButton(
                    onPressed: _loading ? null : _sendOtp,
                    child: const Text('OTP dobara bhejo'),
                  ),
                  TextButton(
                    onPressed: _loading ? null : () => setState(() => _verificationId = null),
                    child: const Text('Number badlein'),
                  ),
                ],
                const SizedBox(height: 16),
                Text(
                  'Coins sirf tasks poore karne par milte hain. Kamai tasks aur ad availability par nirbhar hai - koi fixed income nahi.',
                  textAlign: TextAlign.center,
                  style: t.bodySmall,
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner();
  @override
  Widget build(BuildContext context) =>
      const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2));
}
