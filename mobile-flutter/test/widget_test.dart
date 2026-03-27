import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:fxmark_mobile/providers/auth_provider.dart';
import 'package:fxmark_mobile/providers/app_provider.dart';
import 'package:fxmark_mobile/services/auth_service.dart';
import 'package:fxmark_mobile/services/api_client.dart';
import 'package:fxmark_mobile/screens/auth/auth_screen.dart';
import 'package:fxmark_mobile/config/theme.dart';

void main() {
  testWidgets('Auth screen renders login and signup tabs', (WidgetTester tester) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(
            create: (_) => AuthProvider(
              authService: AuthService(baseUrl: 'http://localhost:3000/api'),
            ),
          ),
          ChangeNotifierProvider(
            create: (_) => AppProvider(api: ApiClient()),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          home: const AuthScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('FXMARK'), findsOneWidget);
    expect(find.text('Login'), findsOneWidget);
    expect(find.text('Sign Up'), findsOneWidget);
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.byType(TextFormField), findsWidgets);
  });
}
