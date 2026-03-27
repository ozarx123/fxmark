import 'package:flutter/material.dart';
import '../models/wallet.dart';
import '../models/position.dart';
import '../services/api_client.dart';

class AppProvider extends ChangeNotifier {
  final ApiClient api;

  AppProvider({required this.api});

  WalletBalance _wallet = WalletBalance();
  List<Position> _positions = [];
  List<Position> _closedPositions = [];
  List<Order> _orders = [];
  List<WalletTransaction> _transactions = [];
  bool _loading = false;

  WalletBalance get wallet => _wallet;
  List<Position> get positions => _positions;
  List<Position> get closedPositions => _closedPositions;
  List<Order> get orders => _orders;
  List<WalletTransaction> get transactions => _transactions;
  bool get loading => _loading;

  void setToken(String? token) => api.setToken(token);

  Future<void> loadDashboard() async {
    _loading = true;
    notifyListeners();
    await Future.wait([fetchWallet(), fetchPositions(), fetchOrders()]);
    _loading = false;
    notifyListeners();
  }

  Future<void> fetchWallet() async {
    try {
      final data = await api.get('/wallet/balance');
      _wallet = WalletBalance.fromJson(data);
      notifyListeners();
    } catch (e) {
      debugPrint('[AppProvider] fetchWallet: $e');
    }
  }

  Future<void> fetchPositions() async {
    try {
      final data = await api.getList('/trading/positions');
      _positions = data.map((e) => Position.fromJson(e)).toList();
      notifyListeners();
    } catch (e) {
      debugPrint('[AppProvider] fetchPositions: $e');
    }
  }

  Future<void> fetchClosedPositions() async {
    try {
      final data = await api.getList('/trading/positions/closed');
      _closedPositions = data.map((e) => Position.fromJson(e)).toList();
      notifyListeners();
    } catch (e) {
      debugPrint('[AppProvider] fetchClosedPositions: $e');
    }
  }

  Future<void> fetchOrders() async {
    try {
      final data = await api.getList('/trading/orders');
      _orders = data.map((e) => Order.fromJson(e)).toList();
      notifyListeners();
    } catch (e) {
      debugPrint('[AppProvider] fetchOrders: $e');
    }
  }

  Future<void> fetchTransactions() async {
    try {
      final data = await api.getList('/wallet/deposits');
      _transactions = data.map((e) => WalletTransaction.fromJson(e)).toList();
      notifyListeners();
    } catch (e) {
      debugPrint('[AppProvider] fetchTransactions: $e');
    }
  }

  Future<bool> placeOrder({
    required String symbol,
    required String side,
    required double volume,
    String type = 'market',
    double? price,
    double? tp,
    double? sl,
  }) async {
    try {
      final body = <String, dynamic>{
        'symbol': symbol,
        'side': side,
        'volume': volume,
        'type': type,
      };
      if (price != null) body['price'] = price;
      if (tp != null) body['tp'] = tp;
      if (sl != null) body['sl'] = sl;

      final res = await api.post('/trading/orders', body);
      if (res.containsKey('error')) return false;
      await Future.wait([fetchPositions(), fetchOrders(), fetchWallet()]);
      return true;
    } catch (e) {
      debugPrint('[AppProvider] placeOrder: $e');
      return false;
    }
  }
}
