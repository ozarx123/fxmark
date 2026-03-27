import 'package:flutter_test/flutter_test.dart';

import 'package:fxmark_mobile/main.dart';

void main() {
  testWidgets('FXMarkApp renders', (WidgetTester tester) async {
    await tester.pumpWidget(const FXMarkApp());
    expect(find.text('FXMARK Mobile App'), findsOneWidget);
  });
}
