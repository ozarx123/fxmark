import 'package:flutter_test/flutter_test.dart';

import 'package:fxmark_mobile/main.dart';

class FakeMarketDataRepository extends MarketDataRepository {
  @override
  Future<CandleFetchResult> fetchCandles({
    required String symbol,
    required String timeframe,
  }) async {
    return CandleFetchResult(
      usingFallback: false,
      candles: <Candle>[
        Candle(
          time: DateTime.utc(2026, 1, 1, 0, 0),
          open: 1.08,
          high: 1.09,
          low: 1.07,
          close: 1.085,
          volume: 1000,
        ),
        Candle(
          time: DateTime.utc(2026, 1, 1, 0, 1),
          open: 1.085,
          high: 1.091,
          low: 1.082,
          close: 1.089,
          volume: 1100,
        ),
      ],
    );
  }
}

void main() {
  testWidgets('FXMarkApp renders connected chart UI', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(FXMarkApp(repository: FakeMarketDataRepository()));
    await tester.pumpAndSettle();

    expect(find.text('FXMARK Chart'), findsOneWidget);
    expect(find.byKey(const Key('symbolDropdown')), findsOneWidget);
    expect(find.byKey(const Key('timeframeDropdown')), findsOneWidget);
    expect(find.byKey(const Key('priceChartCanvas')), findsOneWidget);
    expect(find.byKey(const Key('refreshChartButton')), findsOneWidget);
  });
}
