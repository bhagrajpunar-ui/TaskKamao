import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/providers.dart';
import '../../widgets/common.dart';

/// MUST match SPIN_SEGMENTS (coins, same order) in functions/src/config.ts.
/// The server picks the result; the wheel only animates to it.
const kSpinSegments = <int>[5, 10, 2, 20, 0, 30, 50, 100];

class SpinWheelScreen extends ConsumerStatefulWidget {
  const SpinWheelScreen({super.key});
  @override
  ConsumerState<SpinWheelScreen> createState() => _SpinWheelScreenState();
}

class _SpinWheelScreenState extends ConsumerState<SpinWheelScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(seconds: 4));
  late Animation<double> _anim = const AlwaysStoppedAnimation<double>(0.0);
  double _current = 0;
  bool _spinning = false;
  String? _result;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _spin() async {
    setState(() {
      _spinning = true;
      _result = null;
    });
    final res = await runWithFeedback(context, () => ref.read(functionsProvider).spinWheel());
    if (!mounted) return;
    if (res == null) {
      setState(() => _spinning = false);
      return;
    }
    final index = (res['segmentIndex'] as num).toInt();
    final coins = (res['coins'] as num).toInt();
    final sweep = 2 * pi / kSpinSegments.length;
    // Rotate so the centre of the winning segment ends under the top pointer, plus 5 full turns.
    final base = _current % (2 * pi);
    final target = _current - base + 2 * pi * 5 + (2 * pi - (index + 0.5) * sweep);
    _anim = Tween<double>(begin: _current, end: target).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _ctrl.reset();
    await _ctrl.forward();
    _current = target;
    if (!mounted) return;
    setState(() {
      _spinning = false;
      _result = coins > 0 ? 'Badhai ho! +$coins coins' : 'Is baar kuch nahi. Kal phir try karein!';
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = [Colors.orange, Colors.teal, Colors.pink, Colors.indigo, Colors.grey, Colors.green, Colors.purple, Colors.red];
    return Scaffold(
      appBar: AppBar(title: const Text('Daily Spin')),
      body: Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.arrow_drop_down, size: 56),
          SizedBox(
            width: 300,
            height: 300,
            child: AnimatedBuilder(
              animation: _ctrl,
              builder: (_, __) => Transform.rotate(
                angle: _anim.value,
                child: CustomPaint(painter: _WheelPainter(kSpinSegments, colors)),
              ),
            ),
          ),
          const SizedBox(height: 24),
          if (_result != null) Text(_result!, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: _spinning ? null : _spin,
            icon: const Icon(Icons.casino),
            label: const Text('Spin karo'),
          ),
          const SizedBox(height: 8),
          const Text('Din mein 1 spin. Result server decide karta hai.'),
        ]),
      ),
    );
  }
}

class _WheelPainter extends CustomPainter {
  _WheelPainter(this.segments, this.colors);
  final List<int> segments;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.shortestSide / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final sweep = 2 * pi / segments.length;
    for (var i = 0; i < segments.length; i++) {
      final start = -pi / 2 + i * sweep; // segment 0 starts at the top
      canvas.drawArc(rect, start, sweep, true, Paint()..color = colors[i % colors.length]);
      final mid = start + sweep / 2;
      final tp = TextPainter(
        text: TextSpan(
          text: segments[i] == 0 ? 'Try\nagain' : '${segments[i]}',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      )..layout();
      final pos = center + Offset(cos(mid), sin(mid)) * radius * 0.65;
      canvas.save();
      canvas.translate(pos.dx, pos.dy);
      canvas.rotate(mid + pi / 2);
      tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      canvas.restore();
    }
    canvas.drawCircle(center, 18, Paint()..color = Colors.white);
  }

  @override
  bool shouldRepaint(covariant _WheelPainter old) => false;
}
