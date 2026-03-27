class Position {
  final String id;
  final String symbol;
  final String side;
  final double volume;
  final double openPrice;
  final double? closePrice;
  final double? pnl;
  final double? tp;
  final double? sl;
  final DateTime? openedAt;
  final DateTime? closedAt;

  Position({
    required this.id,
    required this.symbol,
    required this.side,
    required this.volume,
    required this.openPrice,
    this.closePrice,
    this.pnl,
    this.tp,
    this.sl,
    this.openedAt,
    this.closedAt,
  });

  bool get isOpen => closedAt == null;
  bool get isBuy => side.toLowerCase() == 'buy';

  factory Position.fromJson(Map<String, dynamic> json) => Position(
        id: json['_id'] ?? json['id'] ?? '',
        symbol: json['symbol'] ?? '',
        side: json['side'] ?? 'buy',
        volume: (json['volume'] ?? 0).toDouble(),
        openPrice: (json['openPrice'] ?? 0).toDouble(),
        closePrice: json['closePrice']?.toDouble(),
        pnl: json['pnl']?.toDouble(),
        tp: json['tp']?.toDouble(),
        sl: json['sl']?.toDouble(),
        openedAt: json['openedAt'] != null
            ? DateTime.tryParse(json['openedAt'].toString())
            : null,
        closedAt: json['closedAt'] != null
            ? DateTime.tryParse(json['closedAt'].toString())
            : null,
      );
}

class Order {
  final String id;
  final String symbol;
  final String side;
  final String type;
  final double volume;
  final double? price;
  final String status;
  final DateTime? createdAt;

  Order({
    required this.id,
    required this.symbol,
    required this.side,
    required this.type,
    required this.volume,
    this.price,
    this.status = 'pending',
    this.createdAt,
  });

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        id: json['_id'] ?? json['id'] ?? '',
        symbol: json['symbol'] ?? '',
        side: json['side'] ?? 'buy',
        type: json['type'] ?? 'market',
        volume: (json['volume'] ?? 0).toDouble(),
        price: json['price']?.toDouble(),
        status: json['status'] ?? 'pending',
        createdAt: json['createdAt'] != null
            ? DateTime.tryParse(json['createdAt'].toString())
            : null,
      );
}
