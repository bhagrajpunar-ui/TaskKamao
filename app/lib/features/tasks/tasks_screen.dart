import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/format.dart';
import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';
import 'offerwall_screen.dart';
import 'quiz_screen.dart';
import 'scratch_card_screen.dart';
import 'spin_wheel_screen.dart';

class TasksScreen extends ConsumerWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(tasksProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Tasks')),
      body: tasks.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: 'Tasks load nahi hue', onRetry: () => ref.invalidate(tasksProvider)),
        data: (list) => list.isEmpty
            ? const Center(child: Text('Abhi koi task available nahi hai'))
            : ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => TaskTile(task: list[i]),
              ),
      ),
    );
  }
}

IconData _iconFor(String type) => switch (type) {
      'video' => Icons.play_circle_fill,
      'quiz' => Icons.quiz,
      'spin' => Icons.casino,
      'scratch' => Icons.style,
      'offerwall' => Icons.local_offer,
      _ => Icons.open_in_new,
    };

/// Daily counter key on the server for each task type.
String _dailyKey(TaskItem t) => switch (t.type) {
      'video' || 'quiz' || 'spin' || 'scratch' || 'offerwall' => t.type,
      _ => 'task_${t.id}',
    };

class TaskTile extends ConsumerStatefulWidget {
  const TaskTile({super.key, required this.task});
  final TaskItem task;
  @override
  ConsumerState<TaskTile> createState() => _TaskTileState();
}

class _TaskTileState extends ConsumerState<TaskTile> {
  bool _busy = false;

  Future<void> _open() async {
    final t = widget.task;
    switch (t.type) {
      case 'video':
        await _watchVideo();
      case 'quiz':
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const QuizScreen()));
      case 'spin':
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SpinWheelScreen()));
      case 'scratch':
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const ScratchCardScreen()));
      case 'offerwall':
        await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OfferwallScreen()));
      case 'visit':
        await _visitTask();
    }
  }

  Future<void> _watchVideo() async {
    final uid = ref.read(currentUidProvider);
    if (uid == null) return;
    setState(() => _busy = true);
    final coins = await runWithFeedback(context, () => ref.read(adServiceProvider).watchRewardedVideo(uid));
    if (mounted) setState(() => _busy = false);
    if (!mounted || coins == null) return;
    showSnack(context, coins > 0 ? '+$coins video points mil gaye!' : 'Poora video dekhne par hi points milte hain');
  }

  Future<void> _visitTask() async {
    final t = widget.task;
    setState(() => _busy = true);
    final start = await runWithFeedback(context, () => ref.read(functionsProvider).startTask(t.id));
    if (start == null) {
      if (mounted) setState(() => _busy = false);
      return;
    }
    final url = start['url'] as String?;
    final seconds = (start['minSeconds'] as num?)?.toInt() ?? t.minSeconds;
    if (url != null) await launchUrl(Uri.parse(url), mode: LaunchMode.inAppBrowserView);
    if (!mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _CountdownDialog(seconds: seconds),
    );
    if (ok == true && mounted) {
      final res = await runWithFeedback(
          context, () => ref.read(functionsProvider).completeVisitTask(t.id, start['sessionId'] as String));
      if (res != null && mounted) showSnack(context, '+${res['coins']} coins!');
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.task;
    final daily = ref.watch(dailyStatsProvider(istToday())).valueOrNull ?? const {};
    final used = (daily[_dailyKey(t)] as num?)?.toInt() ?? 0;
    final left = (t.dailyLimit - used).clamp(0, t.dailyLimit);
    final cs = Theme.of(context).colorScheme;
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        leading: CircleAvatar(backgroundColor: cs.secondaryContainer, child: Icon(_iconFor(t.type), color: cs.onSecondaryContainer)),
        title: Text(t.title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text([
          if (t.subtitle.isNotEmpty) t.subtitle,
          if (t.dailyLimit > 0) 'Aaj baaki: $left/${t.dailyLimit}',
        ].join('\n')),
        isThreeLine: t.subtitle.isNotEmpty && t.dailyLimit > 0,
        trailing: _busy
            ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
            : (t.coins > 0 ? Text(t.type == 'video' ? '+${t.coins} pts' : '+${t.coins}', style: TextStyle(fontWeight: FontWeight.bold, color: cs.primary)) : const Icon(Icons.chevron_right)),
        onTap: _busy || (t.dailyLimit > 0 && left == 0) ? null : _open,
      ),
    );
  }
}

class _CountdownDialog extends StatefulWidget {
  const _CountdownDialog({required this.seconds});
  final int seconds;
  @override
  State<_CountdownDialog> createState() => _CountdownDialogState();
}

class _CountdownDialogState extends State<_CountdownDialog> {
  late int _left = widget.seconds;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_left <= 0) {
        t.cancel();
      } else {
        setState(() => _left--);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Task chal raha hai'),
        content: Text(_left > 0 ? 'Content padhte rahiye... $_left second baaki' : 'Ho gaya! Ab coins claim karein.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: _left > 0 ? null : () => Navigator.pop(context, true), child: const Text('Claim')),
        ],
      );
}
