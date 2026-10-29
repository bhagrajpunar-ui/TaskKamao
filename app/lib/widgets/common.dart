import 'package:flutter/material.dart';

import '../core/app_exception.dart';
import '../core/format.dart';

void showSnack(BuildContext context, String msg, {bool error = false}) {
  final cs = Theme.of(context).colorScheme;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? cs.error : null,
      behavior: SnackBarBehavior.floating,
    ));
}

String errorText(Object e) => e is AppException ? e.message : 'Kuch galat ho gaya. Dobara try karein.';

/// Runs [action], shows success/error snackbar. Returns the result or null on error.
Future<T?> runWithFeedback<T>(BuildContext context, Future<T> Function() action, {String? success}) async {
  try {
    final r = await action();
    if (success != null && context.mounted) showSnack(context, success);
    return r;
  } catch (e) {
    if (context.mounted) showSnack(context, errorText(e), error: true);
    return null;
  }
}

class CoinBadge extends StatelessWidget {
  const CoinBadge(this.coins, {super.key, this.big = false});
  final int coins;
  final bool big;

  @override
  Widget build(BuildContext context) {
    final style = big ? Theme.of(context).textTheme.headlineMedium : Theme.of(context).textTheme.titleSmall;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.monetization_on, color: Colors.amber.shade700, size: big ? 30 : 18),
      const SizedBox(width: 4),
      Text(coinsText(coins), style: style?.copyWith(fontWeight: FontWeight.bold)),
    ]);
  }
}

class BalanceCard extends StatelessWidget {
  const BalanceCard({super.key, required this.balance, this.locked = 0, this.trailing});
  final int balance;
  final int locked;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      color: cs.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Aapka balance', style: TextStyle(color: cs.onPrimaryContainer)),
              const SizedBox(height: 6),
              CoinBadge(balance, big: true),
              const SizedBox(height: 4),
              Text('= ${rupeesFromCoins(balance)}  (100 coins = \u20B91)',
                  style: TextStyle(color: cs.onPrimaryContainer)),
              if (locked > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('Withdrawal mein: ${coinsText(locked)} coins',
                      style: TextStyle(color: cs.onPrimaryContainer, fontSize: 12)),
                ),
            ]),
          ),
          if (trailing != null) trailing!,
        ]),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.action});
  final String text;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(0, 20, 0, 8),
        child: Row(children: [
          Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
          if (action != null) action!,
        ]),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.error_outline, size: 48),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              FilledButton(onPressed: onRetry, child: const Text('Dobara try karein')),
            ],
          ]),
        ),
      );
}
