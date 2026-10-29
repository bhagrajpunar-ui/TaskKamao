import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/app_config.dart';
import 'core/theme.dart';
import 'features/auth/bootstrap_screen.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/main_shell.dart';
import 'providers/providers.dart';
import 'widgets/common.dart';

class TaskKamaoApp extends ConsumerWidget {
  const TaskKamaoApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      home: const AuthGate(),
    );
  }
}

/// Decides which screen to show: login -> account setup -> main app.
class AuthGate extends ConsumerWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);
    return auth.when(
      loading: () => const _Splash(),
      error: (e, _) => Scaffold(body: ErrorView(message: 'Login check nahi ho paya.\n$e')),
      data: (user) {
        if (user == null) return const LoginScreen();
        final profile = ref.watch(userDocProvider);
        return profile.when(
          loading: () => const _Splash(),
          error: (e, _) => Scaffold(
            body: ErrorView(message: 'Profile load nahi hua.', onRetry: () => ref.invalidate(userDocProvider)),
          ),
          data: (appUser) {
            if (appUser == null) return const BootstrapScreen();
            if (appUser.status != 'active') return _BlockedScreen(status: appUser.status);
            return const MainShell();
          },
        );
      },
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.monetization_on, size: 72, color: Colors.amber.shade700),
            const SizedBox(height: 12),
            Text(AppConfig.appName, style: Theme.of(context).textTheme.headlineMedium),
            const Text(AppConfig.tagline),
            const SizedBox(height: 24),
            const CircularProgressIndicator(),
          ]),
        ),
      );
}

class _BlockedScreen extends StatelessWidget {
  const _BlockedScreen({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.lock_outline, size: 56),
              const SizedBox(height: 12),
              Text(
                status == 'deletion_requested'
                    ? 'Aapne account delete karne ki request di hai. 30 din mein account delete ho jayega.'
                    : 'Aapka account review mein hai. Madad ke liye ${AppConfig.supportEmail} par email karein.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: () => FirebaseAuth.instance.signOut(), child: const Text('Logout')),
            ]),
          ),
        ),
      );
}
