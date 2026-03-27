class WalletBalance {
  final double balance;
  final double locked;
  final String currency;

  WalletBalance({this.balance = 0, this.locked = 0, this.currency = 'USD'});

  double get available => balance - locked;

  factory WalletBalance.fromJson(Map<String, dynamic> json) => WalletBalance(
        balance: (json['balance'] ?? 0).toDouble(),
        locked: (json['locked'] ?? 0).toDouble(),
        currency: json['currency'] ?? 'USD',
      );
}

class WalletTransaction {
  final String id;
  final String type;
  final double amount;
  final String currency;
  final String status;
  final DateTime? createdAt;
  final String? reference;

  WalletTransaction({
    required this.id,
    required this.type,
    required this.amount,
    this.currency = 'USD',
    this.status = 'completed',
    this.createdAt,
    this.reference,
  });

  factory WalletTransaction.fromJson(Map<String, dynamic> json) =>
      WalletTransaction(
        id: json['_id'] ?? json['id'] ?? '',
        type: json['type'] ?? '',
        amount: (json['amount'] ?? 0).toDouble(),
        currency: json['currency'] ?? 'USD',
        status: json['status'] ?? 'completed',
        createdAt: json['createdAt'] != null
            ? DateTime.tryParse(json['createdAt'].toString())
            : null,
        reference: json['reference'],
      );
}
