import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  runApp(const FXMarkApp());
}

class FXMarkApp extends StatelessWidget {
  const FXMarkApp({super.key, this.repository});

  final MarketDataRepository? repository;

  @override
  Widget build(BuildContext context) {
    const String appEnv = String.fromEnvironment('APP_ENV', defaultValue: 'dev');
    final bool isStaging = appEnv.toLowerCase() == 'staging';
    return MaterialApp(
      title: isStaging ? 'FXMARK STAGING' : 'FXMARK',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
        useMaterial3: true,
      ),
      home: ChartPage(repository: repository, isStaging: isStaging),
    );
  }
}

class ChartPage extends StatefulWidget {
  const ChartPage({super.key, this.repository, this.isStaging = false});

  final MarketDataRepository? repository;
  final bool isStaging;

  @override
  State<ChartPage> createState() => _ChartPageState();
}

class _ChartPageState extends State<ChartPage> {
  static const List<String> _symbols = <String>[
    'EURUSD',
    'GBPUSD',
    'USDJPY',
    'XAUUSD',
  ];
  static const List<String> _timeframes = <String>[
    '1m',
    '5m',
    '15m',
    '1h',
    '1d',
  ];

  late final MarketDataRepository _repository;
  late final bool _ownsRepository;

  String _selectedSymbol = _symbols.first;
  String _selectedTimeframe = _timeframes.first;
  List<Candle> _candles = const <Candle>[];
  bool _isLoading = true;
  bool _usingFallback = false;
  String? _statusMessage;

  @override
  void initState() {
    super.initState();
    _ownsRepository = widget.repository == null;
    _repository = widget.repository ?? MarketDataRepository();
    _loadChartData();
  }

  @override
  void dispose() {
    if (_ownsRepository) {
      _repository.dispose();
    }
    super.dispose();
  }

  Future<void> _loadChartData() async {
    setState(() {
      _isLoading = true;
    });

    final CandleFetchResult result = await _repository.fetchCandles(
      symbol: _selectedSymbol,
      timeframe: _selectedTimeframe,
    );

    if (!mounted) {
      return;
    }

    setState(() {
      _candles = result.candles;
      _usingFallback = result.usingFallback;
      _statusMessage = result.message;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isStaging ? 'FXMARK Chart (STAGING)' : 'FXMARK Chart'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('refreshChartButton'),
        onPressed: _loadChartData,
        icon: const Icon(Icons.refresh),
        label: const Text('Refresh'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: <Widget>[
              _ChartControls(
                selectedSymbol: _selectedSymbol,
                selectedTimeframe: _selectedTimeframe,
                symbols: _symbols,
                timeframes: _timeframes,
                onSymbolChanged: (String value) {
                  setState(() {
                    _selectedSymbol = value;
                  });
                  _loadChartData();
                },
                onTimeframeChanged: (String value) {
                  setState(() {
                    _selectedTimeframe = value;
                  });
                  _loadChartData();
                },
              ),
              const SizedBox(height: 12),
              if (_statusMessage != null)
                _StatusBanner(
                  message: _statusMessage!,
                  isWarning: _usingFallback,
                ),
              const SizedBox(height: 12),
              Expanded(
                child: _isLoading
                    ? const Center(
                        child: CircularProgressIndicator(
                          key: Key('chartLoadingIndicator'),
                        ),
                      )
                    : Column(
                        children: <Widget>[
                          Expanded(
                            child: Card(
                              clipBehavior: Clip.antiAlias,
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: _candles.isEmpty
                                    ? const Center(
                                        child: Text(
                                          'No candle data available.',
                                        ),
                                      )
                                    : PriceChart(candles: _candles),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (_candles.isNotEmpty)
                            ChartStats(
                              symbol: _selectedSymbol,
                              timeframe: _selectedTimeframe,
                              candles: _candles,
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChartControls extends StatelessWidget {
  const _ChartControls({
    required this.selectedSymbol,
    required this.selectedTimeframe,
    required this.symbols,
    required this.timeframes,
    required this.onSymbolChanged,
    required this.onTimeframeChanged,
  });

  final String selectedSymbol;
  final String selectedTimeframe;
  final List<String> symbols;
  final List<String> timeframes;
  final ValueChanged<String> onSymbolChanged;
  final ValueChanged<String> onTimeframeChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Expanded(
          child: DropdownButtonFormField<String>(
            key: const Key('symbolDropdown'),
            initialValue: selectedSymbol,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              labelText: 'Symbol',
            ),
            items: symbols
                .map(
                  (String symbol) => DropdownMenuItem<String>(
                    value: symbol,
                    child: Text(symbol),
                  ),
                )
                .toList(),
            onChanged: (String? value) {
              if (value != null) {
                onSymbolChanged(value);
              }
            },
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: DropdownButtonFormField<String>(
            key: const Key('timeframeDropdown'),
            initialValue: selectedTimeframe,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              labelText: 'Timeframe',
            ),
            items: timeframes
                .map(
                  (String tf) =>
                      DropdownMenuItem<String>(value: tf, child: Text(tf)),
                )
                .toList(),
            onChanged: (String? value) {
              if (value != null) {
                onTimeframeChanged(value);
              }
            },
          ),
        ),
      ],
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.message, required this.isWarning});

  final String message;
  final bool isWarning;

  @override
  Widget build(BuildContext context) {
    final Color background = isWarning
        ? Colors.amber.withValues(alpha: 0.2)
        : Colors.red.withValues(alpha: 0.15);
    final Color border = isWarning ? Colors.amber : Colors.red;
    final IconData icon = isWarning ? Icons.info_outline : Icons.error_outline;
    return Container(
      key: const Key('chartStatusBanner'),
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18),
          const SizedBox(width: 8),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}

class ChartStats extends StatelessWidget {
  const ChartStats({
    super.key,
    required this.symbol,
    required this.timeframe,
    required this.candles,
  });

  final String symbol;
  final String timeframe;
  final List<Candle> candles;

  @override
  Widget build(BuildContext context) {
    final Candle last = candles.last;
    final double high = candles
        .map((Candle c) => c.high)
        .reduce(
          (double value, double element) => value > element ? value : element,
        );
    final double low = candles
        .map((Candle c) => c.low)
        .reduce(
          (double value, double element) => value < element ? value : element,
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text('$symbol · $timeframe'),
            Text('Last: ${_formatPrice(symbol, last.close)}'),
            Text(
              'Range: ${_formatPrice(symbol, low)} - ${_formatPrice(symbol, high)}',
            ),
          ],
        ),
      ),
    );
  }
}

class PriceChart extends StatelessWidget {
  const PriceChart({super.key, required this.candles});

  final List<Candle> candles;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      key: const Key('priceChartCanvas'),
      painter: PriceChartPainter(
        candles: candles,
        colorScheme: Theme.of(context).colorScheme,
      ),
      child: const SizedBox.expand(),
    );
  }
}

class PriceChartPainter extends CustomPainter {
  PriceChartPainter({required this.candles, required this.colorScheme});

  final List<Candle> candles;
  final ColorScheme colorScheme;

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty || size.width <= 0 || size.height <= 0) {
      return;
    }

    final Paint gridPaint = Paint()
      ..color = colorScheme.outlineVariant
      ..strokeWidth = 1;
    for (int i = 1; i < 5; i++) {
      final double y = size.height * i / 5;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    double minPrice = candles
        .map((Candle c) => c.low)
        .reduce(
          (double value, double element) => value < element ? value : element,
        );
    double maxPrice = candles
        .map((Candle c) => c.high)
        .reduce(
          (double value, double element) => value > element ? value : element,
        );

    if ((maxPrice - minPrice).abs() < 0.0000001) {
      maxPrice += 1;
      minPrice -= 1;
    }

    final double range = maxPrice - minPrice;
    final Path path = Path();
    for (int i = 0; i < candles.length; i++) {
      final double x = candles.length == 1
          ? size.width / 2
          : (i / (candles.length - 1)) * size.width;
      final double normalized = (candles[i].close - minPrice) / range;
      final double y = size.height - (normalized * size.height);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    final Paint linePaint = Paint()
      ..color = colorScheme.primary
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke
      ..isAntiAlias = true;
    canvas.drawPath(path, linePaint);

    final Candle last = candles.last;
    final double lastY =
        size.height - (((last.close - minPrice) / range) * size.height);
    final Paint markerPaint = Paint()..color = colorScheme.primary;
    canvas.drawCircle(Offset(size.width, lastY), 3.5, markerPaint);
  }

  @override
  bool shouldRepaint(covariant PriceChartPainter oldDelegate) {
    return oldDelegate.candles != candles ||
        oldDelegate.colorScheme != colorScheme;
  }
}

class Candle {
  const Candle({
    required this.time,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volume,
  });

  final DateTime time;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volume;

  static Candle fromJson(Map<String, dynamic> json) {
    return Candle(
      time: _parseTime(json['time']),
      open: _toDouble(json['open']),
      high: _toDouble(json['high']),
      low: _toDouble(json['low']),
      close: _toDouble(json['close']),
      volume: _toDouble(json['volume']),
    );
  }

  static DateTime _parseTime(Object? value) {
    if (value is num) {
      return DateTime.fromMillisecondsSinceEpoch(
        (value * 1000).round(),
        isUtc: true,
      );
    }
    if (value is String) {
      final String normalized = value.contains('T')
          ? value
          : value.replaceFirst(' ', 'T');
      return DateTime.parse(
        normalized.endsWith('Z') ? normalized : '${normalized}Z',
      ).toUtc();
    }
    throw const FormatException('Unsupported candle time format');
  }

  static double _toDouble(Object? value) {
    if (value is num) {
      return value.toDouble();
    }
    if (value is String) {
      return double.tryParse(value) ?? 0;
    }
    return 0;
  }
}

class CandleFetchResult {
  const CandleFetchResult({
    required this.candles,
    required this.usingFallback,
    this.message,
  });

  final List<Candle> candles;
  final bool usingFallback;
  final String? message;
}

class MarketDataRepository {
  MarketDataRepository({String? baseUrl, http.Client? client})
    : baseUrl =
          baseUrl ??
          const String.fromEnvironment(
            'API_BASE_URL',
            defaultValue: 'http://localhost:3000',
          ),
      _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;
  int _fallbackSequence = 0;

  Future<CandleFetchResult> fetchCandles({
    required String symbol,
    required String timeframe,
  }) async {
    final Uri uri = Uri.parse('$baseUrl/api/market/candles').replace(
      queryParameters: <String, String>{'symbol': symbol, 'tf': timeframe},
    );

    try {
      final http.Response response = await _client.get(uri);
      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is List) {
          final List<Candle> candles = decoded
              .whereType<Map<String, dynamic>>()
              .map(Candle.fromJson)
              .toList(growable: false);
          if (candles.isNotEmpty) {
            return CandleFetchResult(candles: candles, usingFallback: false);
          }
        }
        return CandleFetchResult(
          candles: _buildFallbackCandles(
            symbol,
            timeframe,
            sequence: _nextFallbackSequence(),
          ),
          usingFallback: true,
          message: 'Backend returned no candles, showing demo chart.',
        );
      }

      return CandleFetchResult(
        candles: _buildFallbackCandles(
          symbol,
          timeframe,
          sequence: _nextFallbackSequence(),
        ),
        usingFallback: true,
        message:
            'Backend ${response.statusCode}: ${_extractError(response.body)}',
      );
    } catch (_) {
      return CandleFetchResult(
        candles: _buildFallbackCandles(
          symbol,
          timeframe,
          sequence: _nextFallbackSequence(),
        ),
        usingFallback: true,
        message: 'Unable to reach backend, showing demo chart.',
      );
    }
  }

  int _nextFallbackSequence() {
    _fallbackSequence += 1;
    return _fallbackSequence;
  }

  String _extractError(String body) {
    try {
      final dynamic decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic> && decoded['error'] is String) {
        return decoded['error'] as String;
      }
    } catch (_) {
      // Ignore malformed JSON body.
    }
    return 'request failed';
  }

  List<Candle> _buildFallbackCandles(
    String symbol,
    String timeframe, {
    required int sequence,
  }) {
    final int symbolSeed = symbol.codeUnits.fold<int>(
      0,
      (int a, int b) => a + b,
    );
    final int timeframeSeed = timeframe.codeUnits.fold<int>(
      0,
      (int a, int b) => a + b,
    );
    final int seed = symbolSeed + (timeframeSeed * 3) + (sequence * 17);
    final Duration step = _durationForTimeframe(timeframe);
    final DateTime now = DateTime.now().toUtc();
    final double basePrice = switch (symbol) {
      'EURUSD' => 1.08,
      'GBPUSD' => 1.27,
      'USDJPY' => 151.4,
      'XAUUSD' => 3050,
      _ => 100,
    };

    final List<Candle> candles = <Candle>[];
    double lastClose = basePrice;
    for (int i = 60; i >= 1; i--) {
      final double waveScale = _timeframeWaveScale(timeframe);
      final double driftScale = _timeframeDriftScale(timeframe);
      final double wave =
          math.sin((i + seed) / (5 * waveScale)) * _symbolVolatility(symbol);
      final double drift =
          math.cos((i + seed) / (9 * driftScale)) *
          _symbolVolatility(symbol) *
          0.4;
      final double open = lastClose;
      final double close = math.max(0.0001, open + wave + drift);
      final double high =
          math.max(open, close) + _symbolVolatility(symbol) * 0.5;
      final double low =
          math.min(open, close) - _symbolVolatility(symbol) * 0.5;
      candles.add(
        Candle(
          time: now.subtract(step * i),
          open: open,
          high: high,
          low: math.max(0.0001, low),
          close: close,
          volume: (1000 + (seed * i) % 5000).toDouble(),
        ),
      );
      lastClose = close;
    }
    return candles;
  }

  double _symbolVolatility(String symbol) {
    return switch (symbol) {
      'XAUUSD' => 4.0,
      'USDJPY' => 0.09,
      _ => 0.0025,
    };
  }

  double _timeframeWaveScale(String timeframe) {
    return switch (timeframe) {
      '1m' => 0.85,
      '5m' => 1.0,
      '15m' => 1.2,
      '1h' => 1.5,
      '1d' => 1.9,
      _ => 1.0,
    };
  }

  double _timeframeDriftScale(String timeframe) {
    return switch (timeframe) {
      '1m' => 0.9,
      '5m' => 1.05,
      '15m' => 1.25,
      '1h' => 1.55,
      '1d' => 2.0,
      _ => 1.0,
    };
  }

  Duration _durationForTimeframe(String timeframe) {
    return switch (timeframe) {
      '1m' => const Duration(minutes: 1),
      '5m' => const Duration(minutes: 5),
      '15m' => const Duration(minutes: 15),
      '1h' => const Duration(hours: 1),
      '1d' => const Duration(days: 1),
      _ => const Duration(minutes: 1),
    };
  }

  void dispose() {
    _client.close();
  }
}

String _formatPrice(String symbol, double value) {
  final int digits = switch (symbol) {
    'XAUUSD' => 2,
    'USDJPY' => 3,
    _ => 5,
  };
  return value.toStringAsFixed(digits);
}
