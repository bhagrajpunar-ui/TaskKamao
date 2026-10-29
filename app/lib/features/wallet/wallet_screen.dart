import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_config.dart';
import '../../core/format.dart';
import '../../core/validators.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../profile/kyc_screen.dart';

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userDocProvider).valueOrNull;
    if (user == null) return const Center(child: CircularProgressIndicator());
    final filter = ref.watch(txFilterProvider);
    final minCoins = AppConfig.minWithdrawRupees * AppConfig.coinsPerRupee;

    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          BalanceCard(balance: user.balance, locked: user.lockedCoins),
          if (user.adPoints > 0)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text('Video points: ${coinsText(user.adPoints)} (leaderboard ke liye, withdraw nahi hote)',
                  style: Theme.of(context).textTheme.bodySmall),
            ),
          const SizedBox(height: 12),
          if (!user.isKycVerified) _KycBanner(user: user),
          if (user.hasPendingWithdrawal)
            const Card(
              child: ListTile(
                leading: Icon(Icons.hourglass_top),
                title: Text('Ek withdrawal process ho raha hai'),
                subtitle: Text('Approve hone ke baad UPI mein paise aate hain. Usually 1-3 working days.'),
              ),
            ),
          const SizedBox(height: 8),
          FilledButton.icon(
            icon: const Icon(Icons.account_balance),
            label: Text('UPI par withdraw karo (min ${rupees(AppConfig.minWithdrawRupees)})'),
            onPressed: !user.isKycVerified || user.hasPendingWithdrawal
                ? null
                : () {
                    if (user.balance < minCoins) {
                      showSnack(context, 'Kam se kam ${coinsText(minCoins)} coins chahiye', error: true);
                      return;
                    }
                    showModalBottomSheet<void>(
                      context: context,
                      isScrollControlled: true,
                      builder: (_) => _WithdrawSheet(balance: user.balance),
                    );
                  },
          ),
          const SectionTitle('History'),
          Wrap(spacing: 8, children: [
            for (final f in const [(null, 'Sab'), ('earn', 'Kamai'), ('referral', 'Referral'), ('withdraw', 'Withdrawal'), ('refund', 'Refund'), ('points', 'Points')])
              ChoiceChip(
                label: Text(f.$2),
                selected: filter == f.$1,
                onSelected: (_) => ref.read(txFilterProvider.notifier).state = f.$1,
              ),
          ]),
          const SizedBox(height: 8),
          ref.watch(transactionsProvider).when(
                loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
                error: (e, _) => Text('History load nahi hui: $e'),
                data: (list) => list.isEmpty
                    ? const Padding(padding: EdgeInsets.all(16), child: Text('Abhi koi transaction nahi'))
                    : Card(child: Column(children: [for (final t in list) _TxTile(t)])),
              ),
        ],
      ),
    );
  }
}

class _KycBanner extends StatelessWidget {
  const _KycBanner({required this.user});
  final AppUser user;
  @override
  Widget build(BuildContext context) {
    final (title, sub) = switch (user.kycStatus) {
      'pending' => ('KYC review mein hai', 'Verify hote hi withdrawal khul jayega.'),
      'rejected' => ('KYC reject hui', user.kycRejectReason ?? 'Details dobara check karke bhejein.'),
      _ => ('Withdrawal ke liye KYC zaroori hai', 'Sirf naam aur PAN number - 1 minute ka kaam.'),
    };
    return Card(
      color: Theme.of(context).colorScheme.tertiaryContainer,
      child: ListTile(
        leading: const Icon(Icons.verified_user_outlined),
        title: Text(title),
        subtitle: Text(sub),
        trailing: user.kycStatus == 'pending' ? null : const Icon(Icons.chevron_right),
        onTap: user.kycStatus == 'pending'
            ? null
            : () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const KycScreen())),
      ),
    );
  }
}

class _TxTile extends StatelessWidget {
  const _TxTile(this.t);
  final CoinTx t;
  @override
  Widget build(BuildContext context) {
    final positive = t.coins >= 0;
    final statusText = t.status == 'success' ? '' : '  [${t.status}]';
    return ListTile(
      dense: true,
      leading: Icon(positive ? Icons.arrow_downward : Icons.arrow_upward, color: positive ? Colors.green : Colors.red),
      title: Text(t.title),
      subtitle: Text('${dateText(t.createdAt)}$statusText'),
      trailing: Text('${positive ? '+' : ''}${coinsText(t.coins)}',
          style: TextStyle(fontWeight: FontWeight.bold, color: positive ? Colors.green : Colors.red)),
    );
  }
}

class _WithdrawSheet extends ConsumerStatefulWidget {
  const _WithdrawSheet({required this.balance});
  final int balance;
  @override
  ConsumerState<_WithdrawSheet> createState() => _WithdrawSheetState();
}

class _WithdrawSheetState extends ConsumerState<_WithdrawSheet> {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController(text: '${AppConfig.minWithdrawRupees}');
  final _upi = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _amount.dispose();
    _upi.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    final res = await runWithFeedback(
      context,
      () => ref.read(functionsProvider).requestWithdrawal(
            amountRupees: int.parse(_amount.text.trim()),
            upiId: _upi.text.trim(),
          ),
      success: 'Withdrawal request bhej di gayi',
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (res != null) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final maxRupees = widget.balance ~/ AppConfig.coinsPerRupee;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).viewInsets.bottom + 16),
      child: Form(
        key: _form,
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('UPI Withdrawal', style: Theme.of(context).textTheme.titleLarge),
          Text('Available: ${rupees(maxRupees)}'),
          const SizedBox(height: 12),
          TextFormField(
            controller: _amount,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'Amount (\u20B9)', prefixText: '\u20B9 '),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              if (n == null) return 'Amount likhein';
              if (n < AppConfig.minWithdrawRupees) return 'Minimum ${rupees(AppConfig.minWithdrawRupees)}';
              if (n > maxRupees) return 'Balance se zyada nahi';
              return null;
            },
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _upi,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: const InputDecoration(labelText: 'UPI ID', hintText: 'naam@okaxis'),
            validator: Validators.upi,
          ),
          const SizedBox(height: 8),
          const Text('UPI ID dhyan se check karein. Galat UPI par bheja gaya payment wapas nahi aata. '
              'Withdrawal admin approval ke baad hota hai.', style: TextStyle(fontSize: 12)),
          const SizedBox(height: 12),
          FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Bhej rahe hain...' : 'Withdraw request bhejo')),
        ]),
      ),
    );
  }
}
