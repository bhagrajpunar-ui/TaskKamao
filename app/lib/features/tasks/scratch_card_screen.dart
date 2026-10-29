import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/providers.dart';
import '../../widgets/common.dart';

/// The server decides the prize (and credits it) when the card is issued; scratching just reveals it.
class ScratchCardScreen extends ConsumerStatefulWidget {
  const ScratchCardScreen({super.key});
  @override
  ConsumerState<ScratchCardScreen> createState() => _ScratchCardScreenState();
}

class _ScratchCardScreenState extends ConsumerState<ScratchCardScreen> {
  int? _coins;
  int? _remaining;
  bool _busy = false;
  bool _revealed = false;
  final List<Offset> _points = [];

  Future<void> _getCard() async {
    setState(() => _busy = true);
    final res = await runWithFeedback(context, () => ref.read(functionsProvider).scratchCard());
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (res != null) {
        _coins = (res['coins'] as num).toInt();
        _remaining = (res['remaining'] as num?)?.toInt();
        _revealed = false;
        _points.clear();
      }
    });
  }

  void _scratch(Offset p) {
    if (_revealed) return;
    setState(() {
      _points.add(p);
      if (_points.length > 60) _revealed = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Scratch Card')),
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (_coins == null)
            const Text('Card lene ke liye button dabayein')
          else
            SizedBox(
              width: 280,
              height: 180,
              child: Stack(children: [
                Positioned.fill(
                  child: Container(
                    decoration: BoxDecoration(color: cs.tertiaryContainer, borderRadius: BorderRadius.circular(16)),
                    alignment: Alignment.center,
                    child: Text(_coins! > 0 ? '+$_coins coins' : 'Better luck\nnext time',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold)),
                  ),
                ),
                if (!_revealed)
                  Positioned.fill(
                    child: GestureDetector(
                      onPanStart: (d) => _scratch(d.localPosition),
                      onPanUpdate: (d) => _scratch(d.localPosition),
                      child: CustomPaint(painter: _CoverPainter(List.of(_points), Colors.blueGrey)),
                    ),
                  ),
              ]),
            ),
          const SizedBox(height: 24),
          if (_revealed && _coins != null)
            Text(_coins! > 0 ? 'Coins aapke wallet mein add ho gaye!' : 'Kal phir try karein'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _busy || (_coins != null && !_revealed) ? null : _getCard,
            child: Text(_coins == null ? 'Scratch card lo' : 'Agla card lo'),
          ),
          if (_remaining != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Aaj baaki: $_remaining')),
        ]),
      ),
    );
  }
}

class _CoverPainter extends CustomPainter {
  _CoverPainter(this.points, this.color);
  final List<Offset> points;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.saveLayer(rect, Paint());
    canvas.drawRRect(RRect.fromRectAndRadius(rect, const Radius.circular(16)), Paint()..color = color);
    final tp = TextPainter(
      text: const TextSpan(text: 'Yahan scratch karo', style: TextStyle(color: Colors.white, fontSize: 18)),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset((size.width - tp.width) / 2, (size.height - tp.height) / 2));
    final clear = Paint()..blendMode = BlendMode.clear;
    for (final p in points) {
      canvas.drawCircle(p, 22, clear);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _CoverPainter old) => old.points.length != points.length;
}
