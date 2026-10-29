import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/app_config.dart';
import '../../core/format.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

class ReferScreen extends ConsumerWidget {
  const ReferScreen({super.key});

  String _message(String code) =>
      '${AppConfig.appName} - ${AppConfig.tagline}!\n'
      'Quiz, video aur daily tasks se coins kamao aur UPI par withdraw karo.\n'
      'Mera referral code: $code (signup par daalo, eligible activity ke baad 500 bonus coins).\n'
      '${AppConfig.playStoreUrl}';

  Future<void> _whatsApp(BuildContext context, String code) async {
    final text = _message(code);
    final uri = Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) await Share.share(text);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userDocProvider).valueOrNull;
    if (user == null) return const Center(child: CircularProgressIndicator());
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Refer & Earn')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: cs.secondaryContainer,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(children: [
                const Text('Aapka referral code'),
                const SizedBox(height: 8),
                SelectableText(user.referralCode,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, letterSpacing: 3)),
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.copy),
                      label: const Text('Copy'),
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: user.referralCode));
                        if (context.mounted) showSnack(context, 'Code copy ho gaya');
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton.icon(
                      icon: const Icon(Icons.chat),
                      label: const Text('WhatsApp'),
                      onPressed: () => _whatsApp(context, user.referralCode),
                    ),
                  ),
                ]),
                TextButton.icon(
                  icon: const Icon(Icons.share),
                  label: const Text('Aur apps mein share karo'),
                  onPressed: () => Share.share(_message(user.referralCode)),
                ),
              ]),
            ),
          ),
          const SectionTitle('Niyam (Rules)'),
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('1. Dost signup par aapka code daale (signup ke 48 ghante ke andar).'),
                SizedBox(height: 6),
                Text('2. Jab dost tasks se 2,000 coins kama le (withdrawal-eligible activity), tab aapko 1,000 coins aur dost ko 500 coins milenge.'),
                SizedBox(height: 6),
                Text('3. Uske baad dost ke task coins (video, quiz, offers) ka 10% aapko bonus milta rahega. Dost ke coins kam nahi hote.'),
                SizedBox(height: 6),
                Text('4. Ek device / ek number = ek account. Fake ya duplicate account milne par bonus cancel ho sakta hai.'),
              ]),
            ),
          ),
          const SectionTitle('Aapke dost'),
          ref.watch(referralsProvider).when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => const Text('List load nahi hui'),
                data: (list) => list.isEmpty
                    ? const Padding(padding: EdgeInsets.all(8), child: Text('Abhi tak koi dost nahi juda.'))
                    : Card(
                        child: Column(children: [
                          for (final r in list)
                            ListTile(
                              leading: const CircleAvatar(child: Icon(Icons.person)),
                              title: Text(r.friendName),
                              subtitle: Text('${r.status == 'qualified' ? 'Bonus mil gaya' : 'Pending'} - ${dateText(r.createdAt)}'),
                              trailing: Text('+${coinsText(r.commissionEarned)}'),
                            ),
                        ]),
                      ),
              ),
        ],
      ),
    );
  }
}
