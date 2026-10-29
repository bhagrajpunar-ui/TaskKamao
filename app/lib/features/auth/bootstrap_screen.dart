import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/providers.dart';
import '../../services/device_service.dart';
import '../../widgets/common.dart';

/// Shown once after first login: creates the profile on the server (device bind + referral).
class BootstrapScreen extends ConsumerStatefulWidget {
  const BootstrapScreen({super.key});
  @override
  ConsumerState<BootstrapScreen> createState() => _BootstrapScreenState();
}

class _BootstrapScreenState extends ConsumerState<BootstrapScreen> {
  String? _error;
  bool _referralFailed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  Future<void> _run({bool skipReferral = false}) async {
    setState(() => _error = null);
    try {
      final deviceId = await DeviceService.deviceId();
      final code = skipReferral ? null : ref.read(pendingReferralCodeProvider);
      await ref.read(functionsProvider).bootstrapUser(deviceId: deviceId, referralCode: code);
      ref.read(pendingReferralCodeProvider.notifier).state = null;
      // userDocProvider stream will emit the new profile and AuthGate moves on.
    } catch (e) {
      if (!mounted) return;
      final msg = errorText(e);
      setState(() {
        _error = msg;
        _referralFailed = msg.toLowerCase().contains('referral');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: _error == null
              ? const Column(mainAxisSize: MainAxisSize.min, children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Aapka account set ho raha hai...'),
                ])
              : Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, size: 48),
                  const SizedBox(height: 12),
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  if (_referralFailed)
                    FilledButton(
                      onPressed: () => _run(skipReferral: true),
                      child: const Text('Bina referral code ke aage badho'),
                    )
                  else
                    FilledButton(onPressed: _run, child: const Text('Dobara try karein')),
                  TextButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Logout')),
                ]),
        ),
      ),
    );
  }
}
