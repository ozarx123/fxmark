import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'config/theme.dart';
import 'config/api_config.dart';
import 'providers/auth_provider.dart';
import 'providers/app_provider.dart';
import 'services/auth_service.dart';
import 'services/api_client.dart';
import 'screens/auth/auth_screen.dart';
import 'screens/home_shell.dart';

void main() {
  final apiClient = ApiClient();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => AuthProvider(
            authService: AuthService(baseUrl: ApiConfig.baseUrl),
          )..tryAutoLogin(),
        ),
        ChangeNotifierProxyProvider<AuthProvider, AppProvider>(
          create: (_) => AppProvider(api: apiClient),
          update: (_, auth, app) {
            app!.setToken(auth.token);
            return app;
          },
        ),
      ],
      child: const FXMarkApp(),
    ),
  );
}

class FXMarkApp extends StatelessWidget {
  const FXMarkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FXMARK',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      initialRoute: '/auth',
      routes: {
        '/auth': (_) => const AuthScreen(),
        '/dashboard': (_) => const HomeShell(),
      },
    );
  }
}
