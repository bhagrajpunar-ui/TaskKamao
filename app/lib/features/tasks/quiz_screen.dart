import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/models.dart';
import '../../providers/providers.dart';
import '../../widgets/common.dart';

/// Loads active questions the user has not answered yet. Answers are checked on the server
/// (correct answers live in admin-only `quizAnswers`, never sent to the app beforehand).
final _unansweredQuizProvider = FutureProvider.autoDispose<List<QuizQuestion>>((ref) async {
  final uid = ref.watch(currentUidProvider);
  if (uid == null) return const [];
  final db = FirebaseFirestore.instance;
  final results = await Future.wait([
    db.collection('quizQuestions').where('active', isEqualTo: true).limit(100).get(),
    db.collection('users').doc(uid).collection('quizAnswered').get(),
  ]);
  final answered = results[1].docs.map((d) => d.id).toSet();
  final list = results[0].docs.where((d) => !answered.contains(d.id)).map(QuizQuestion.fromDoc).toList()..shuffle();
  return list.take(15).toList();
});

class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key});
  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  int _index = 0;
  int? _selected;
  int? _correctIndex;
  bool _busy = false;
  int _earned = 0;

  Future<void> _answer(QuizQuestion q, int i) async {
    if (_busy || _correctIndex != null) return;
    setState(() {
      _busy = true;
      _selected = i;
    });
    final res = await runWithFeedback(context, () => ref.read(functionsProvider).answerQuiz(q.id, i));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (res == null) {
        _selected = null;
      } else {
        _correctIndex = (res['correctIndex'] as num?)?.toInt();
        _earned += (res['coins'] as num?)?.toInt() ?? 0;
      }
    });
  }

  void _next() => setState(() {
        _index++;
        _selected = null;
        _correctIndex = null;
      });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text('Quiz  (+$_earned coins)')),
      body: ref.watch(_unansweredQuizProvider).when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ErrorView(message: 'Sawal load nahi hue', onRetry: () => ref.invalidate(_unansweredQuizProvider)),
            data: (qs) {
              if (_index >= qs.length) {
                return Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.emoji_events, size: 64, color: Colors.amber),
                    const SizedBox(height: 12),
                    Text(qs.isEmpty ? 'Abhi naye sawal nahi hain. Kal check karein!' : 'Quiz khatam! Aapne $_earned coins kamaye.'),
                    const SizedBox(height: 12),
                    FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Wapas')),
                  ]),
                );
              }
              final q = qs[_index];
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text('Sawal ${_index + 1}/${qs.length}', style: Theme.of(context).textTheme.labelLarge),
                  const SizedBox(height: 8),
                  Text(q.question, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 16),
                  for (var i = 0; i < q.options.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.all(16),
                          alignment: Alignment.centerLeft,
                          backgroundColor: _correctIndex == null
                              ? (_selected == i ? cs.secondaryContainer : null)
                              : (i == _correctIndex
                                  ? Colors.green.withAlpha(60)
                                  : (i == _selected ? cs.errorContainer : null)),
                        ),
                        onPressed: () => _answer(q, i),
                        child: Text(q.options[i]),
                      ),
                    ),
                  if (_busy) const Center(child: CircularProgressIndicator()),
                  if (_correctIndex != null) ...[
                    const SizedBox(height: 8),
                    Text(_selected == _correctIndex ? 'Sahi jawab!' : 'Galat jawab.',
                        style: TextStyle(fontWeight: FontWeight.bold, color: _selected == _correctIndex ? Colors.green : cs.error)),
                    const SizedBox(height: 8),
                    FilledButton(onPressed: _next, child: const Text('Agla sawal')),
                  ],
                ],
              );
            },
          ),
    );
  }
}
