import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_config.dart';
import '../../core/format.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import '../shell/main_shell.dart';
import '../tasks/tasks_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(userDocProvider).valueOrNull;
    if (user == null) return const Center(child: CircularProgressIndicator());
    final tasks = ref.watch(tasksProvider).valueOrNull ?? const <TaskItem>[];

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppConfig.appName),
        actions: [Padding(padding: const EdgeInsets.only(right: 16), child: CoinBadge(user.balance))],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(tasksProvider);
          ref.invalidate(leaderboardProvider);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Namaste, ${user.name.split(' ').first}!', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            BalanceCard(balance: user.balance, locked: user.lockedCoins),
            const SizedBox(height: 12),
            _CheckinCard(user: user),
            SectionTitle('Aaj ke tasks',
                action: TextButton(
                  onPressed: () => ref.read(shellTabProvider.notifier).state = 1,
                  child: const Text('Sab dekho'),
                )),
            ...tasks.take(3).map((t) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: TaskTile(task: t),
                )),
            const SectionTitle('Leaderboard (Top 10)'),
            const _Leaderboard(),
            const SizedBox(height: 16),
            Text(
              'Note: Coins tasks aur ads se milte hain. Kamai ki koi guarantee nahi hai.',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckinCard extends ConsumerStatefulWidget {
  const _CheckinCard({required this.user});
  final AppUser user;
  @override
  ConsumerState<_CheckinCard> createState() => _CheckinCardState();
}

class _CheckinCardState extends ConsumerState<_CheckinCard> {
  bool _busy = false;

  Future<void> _claim() async {
    setState(() => _busy = true);
    final res = await runWithFeedback(context, () => ref.read(functionsProvider).claimCheckin());
    if (mounted) setState(() => _busy = false);
    if (res != null && mounted) {
      showSnack(context, '+${res['coins']} coins! Streak: ${res['streak']} din');
    }
  }

  @override
  Widget build(BuildContext context) {
    final done = widget.user.lastCheckinDate == istToday();
    final streak = widget.user.streak;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.local_fire_department, color: Colors.deepOrange),
            const SizedBox(width: 8),
            Expanded(child: Text('Daily check-in  (+50 coins)', style: Theme.of(context).textTheme.titleMedium)),
            Text('Streak: $streak'),
          ]),
          const SizedBox(height: 12),
          Row(
            children: List.generate(7, (i) {
              final filled = done ? i < ((streak - 1) % 7) + 1 : i < streak % 7;
              return Expanded(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  height: 8,
                  decoration: BoxDecoration(
                    color: filled ? Colors.deepOrange : Theme.of(context).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 4),
          Text('7 din lagatar check-in par bonus coins', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: done || _busy ? null : _claim,
              child: Text(done ? 'Aaj ho gaya - kal phir aana' : 'Check-in karo'),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Leaderboard extends ConsumerWidget {
  const _Leaderboard();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = ref.watch(currentUidProvider);
    return ref.watch(leaderboardProvider).when(
          loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
          error: (e, _) => const Text('Leaderboard load nahi hua'),
          data: (list) => list.isEmpty
              ? const Text('Abhi koi entry nahi. Pehle task karke top par aao!')
              : Card(
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++)
                        ListTile(
                          dense: true,
                          leading: CircleAvatar(radius: 14, child: Text('${i + 1}')),
                          title: Text(list[i].uid == me ? '${list[i].name} (Aap)' : list[i].name),
                          trailing: CoinBadge(list[i].coins),
                        ),
                    ],
                  ),
                ),
        );
  }
}
