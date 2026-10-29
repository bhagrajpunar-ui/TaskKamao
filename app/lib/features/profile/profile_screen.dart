import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_config.dart';
import '../../core/validators.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import 'faq_screen.dart';
import 'kyc_screen.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  Future<void> _editName(BuildContext context, WidgetRef ref, AppUser user) async {
    final ctrl = TextEditingController(text: user.name);
    final formKey = GlobalKey<FormState>();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Naam badlein'),
        content: Form(
          key: formKey,
          child: TextFormField(controller: ctrl, autofocus: true, validator: Validators.name),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () {
              if (formKey.currentState!.validate()) Navigator.pop(ctx, ctrl.text.trim());
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (name != null && context.mounted) {
      await runWithFeedback(context, () => ref.read(functionsProvider).updateProfile(name), success: 'Naam update ho gaya');
    }
  }

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Account delete karein?'),
        content: const Text('Aapka account aur bacha hua coin balance 30 din mein permanently delete ho jayega. '
            'Pending withdrawal ho to pehle uske poora hone ka intezaar karein.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Nahi')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Haan, delete request')),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      await runWithFeedback(context, () => ref.read(functionsProvider).requestAccountDeletion(), success: 'Request mil gayi');
    }
  }

  void _open(String url) => launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userDocProvider).valueOrNull;
    if (user == null) return const Center(child: CircularProgressIndicator());
    final themeMode = ref.watch(themeModeProvider);
    final isDark = themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system && MediaQuery.platformBrightnessOf(context) == Brightness.dark);
    final kycLabel = switch (user.kycStatus) {
      'verified' => 'Verified (${user.panMasked ?? ''})',
      'pending' => 'Review mein',
      'rejected' => 'Reject - dobara bhejein',
      _ => 'Pending - withdrawal ke liye zaroori',
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(children: [
        ListTile(
          leading: const CircleAvatar(child: Icon(Icons.person)),
          title: Text(user.name),
          subtitle: Text(user.phone),
          trailing: IconButton(icon: const Icon(Icons.edit), onPressed: () => _editName(context, ref, user)),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.verified_user_outlined),
          title: const Text('KYC'),
          subtitle: Text(kycLabel),
          onTap: user.kycStatus == 'verified' || user.kycStatus == 'pending'
              ? null
              : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const KycScreen())),
        ),
        SwitchListTile(
          secondary: const Icon(Icons.dark_mode_outlined),
          title: const Text('Dark mode'),
          value: isDark,
          onChanged: (v) => ref.read(themeModeProvider.notifier).setDark(v),
        ),
        ListTile(
          leading: const Icon(Icons.help_outline),
          title: const Text('FAQ / Madad'),
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const FaqScreen())),
        ),
        ListTile(
          leading: const Icon(Icons.privacy_tip_outlined),
          title: const Text('Privacy Policy'),
          onTap: () => _open(AppConfig.privacyPolicyUrl),
        ),
        ListTile(
          leading: const Icon(Icons.description_outlined),
          title: const Text('Terms & Conditions'),
          onTap: () => _open(AppConfig.termsUrl),
        ),
        const Divider(),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Logout'),
          onTap: () => FirebaseAuth.instance.signOut(),
        ),
        ListTile(
          leading: Icon(Icons.delete_forever_outlined, color: Theme.of(context).colorScheme.error),
          title: const Text('Account delete karein'),
          onTap: () => _deleteAccount(context, ref),
        ),
        const SizedBox(height: 16),
        const Center(child: Text('${AppConfig.appName} v1.0.0 - ${AppConfig.tagline}', style: TextStyle(fontSize: 12))),
        const SizedBox(height: 24),
      ]),
    );
  }
}
