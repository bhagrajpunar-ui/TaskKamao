import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/validators.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

/// Basic KYC: name exactly as on PAN + PAN number. Server checks format and that the PAN is not used
/// on another account; admin (or a PAN-verification API you plug in later) marks it verified.
class KycScreen extends ConsumerStatefulWidget {
  const KycScreen({super.key});
  @override
  ConsumerState<KycScreen> createState() => _KycScreenState();
}

class _KycScreenState extends ConsumerState<KycScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _pan = TextEditingController();
  bool _busy = false;
  bool _consent = false;

  @override
  void dispose() {
    _name.dispose();
    _pan.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    if (!_consent) {
      showSnack(context, 'Consent tick karein', error: true);
      return;
    }
    setState(() => _busy = true);
    final res = await runWithFeedback(
      context,
      () => ref.read(functionsProvider).submitKyc(name: _name.text.trim(), pan: _pan.text.trim().toUpperCase()),
      success: 'KYC submit ho gayi. Review ke baad update milega.',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (res != null) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('KYC')),
      body: Form(
        key: _form,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          const Text('UPI withdrawal ke liye KYC zaroori hai. Isse fake accounts rokne aur payout partner ke niyam poore karne mein madad milti hai.'),
          const SizedBox(height: 16),
          TextFormField(
            controller: _name,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'Naam (bilkul PAN card jaisa)'),
            validator: Validators.name,
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _pan,
            maxLength: 10,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
              TextInputFormatter.withFunction((o, n) => n.copyWith(text: n.text.toUpperCase())),
            ],
            decoration: const InputDecoration(labelText: 'PAN number', hintText: 'ABCDE1234F'),
            validator: Validators.pan,
          ),
          CheckboxListTile(
            value: _consent,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            onChanged: (v) => setState(() => _consent = v ?? false),
            title: const Text('Main confirm karta/karti hoon ki yeh details meri hain aur TaskKamao inhe sirf KYC/payout ke liye use kare.'),
          ),
          const SizedBox(height: 12),
          FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Bhej rahe hain...' : 'Submit')),
        ]),
      ),
    );
  }
}
