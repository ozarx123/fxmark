import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/app_provider.dart';

class TradingScreen extends StatefulWidget {
  const TradingScreen({super.key});

  @override
  State<TradingScreen> createState() => _TradingScreenState();
}

class _TradingScreenState extends State<TradingScreen> with SingleTickerProviderStateMixin {
  late TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final app = context.read<AppProvider>();
      app.fetchPositions();
      app.fetchOrders();
      app.fetchClosedPositions();
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  void _showNewOrder() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const _OrderSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppProvider>();

    return Column(
      children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tab,
            labelColor: AppColors.primaryNavy,
            unselectedLabelColor: AppColors.mediumGrey,
            indicatorColor: AppColors.primaryNavy,
            labelStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            tabs: [
              Tab(text: 'Positions (${app.positions.length})'),
              Tab(text: 'Orders (${app.orders.length})'),
              Tab(text: 'History'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tab,
            children: [
              _buildPositions(app),
              _buildOrders(app),
              _buildHistory(app),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: ElevatedButton.icon(
            onPressed: _showNewOrder,
            icon: const Icon(Icons.add, size: 20),
            label: const Text('New Order'),
          ),
        ),
      ],
    );
  }

  Widget _buildPositions(AppProvider app) {
    if (app.positions.isEmpty) {
      return _empty('No open positions');
    }
    return RefreshIndicator(
      onRefresh: () => app.fetchPositions(),
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: app.positions.length,
        itemBuilder: (_, i) {
          final p = app.positions[i];
          final pnl = p.pnl ?? 0;
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: _sideChip(p.side),
              title: Text(p.symbol, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${p.volume} lots @ ${p.openPrice.toStringAsFixed(2)}'),
              trailing: Text(
                '${pnl >= 0 ? "+" : ""}\$${pnl.toStringAsFixed(2)}',
                style: TextStyle(fontWeight: FontWeight.w600, color: pnl >= 0 ? AppColors.buyGreen : AppColors.sellRed),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildOrders(AppProvider app) {
    if (app.orders.isEmpty) return _empty('No pending orders');
    return RefreshIndicator(
      onRefresh: () => app.fetchOrders(),
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: app.orders.length,
        itemBuilder: (_, i) {
          final o = app.orders[i];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: _sideChip(o.side),
              title: Text(o.symbol, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${o.type.toUpperCase()} • ${o.volume} lots'),
              trailing: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.warningOrange.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(o.status.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.warningOrange)),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildHistory(AppProvider app) {
    if (app.closedPositions.isEmpty) return _empty('No trade history');
    return RefreshIndicator(
      onRefresh: () => app.fetchClosedPositions(),
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: app.closedPositions.length,
        itemBuilder: (_, i) {
          final p = app.closedPositions[i];
          final pnl = p.pnl ?? 0;
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: _sideChip(p.side),
              title: Text(p.symbol, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${p.volume} lots • ${p.openPrice.toStringAsFixed(2)} → ${p.closePrice?.toStringAsFixed(2) ?? "-"}'),
              trailing: Text(
                '${pnl >= 0 ? "+" : ""}\$${pnl.toStringAsFixed(2)}',
                style: TextStyle(fontWeight: FontWeight.w600, color: pnl >= 0 ? AppColors.buyGreen : AppColors.sellRed),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _sideChip(String side) {
    final buy = side.toLowerCase() == 'buy';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: (buy ? AppColors.buyGreen : AppColors.sellRed).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(side.toUpperCase(),
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: buy ? AppColors.buyGreen : AppColors.sellRed)),
    );
  }

  Widget _empty(String msg) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inbox_outlined, size: 48, color: AppColors.mediumGrey),
          const SizedBox(height: 12),
          Text(msg, style: const TextStyle(color: AppColors.textSecondary, fontSize: 15)),
        ],
      ),
    );
  }
}

class _OrderSheet extends StatefulWidget {
  const _OrderSheet();

  @override
  State<_OrderSheet> createState() => _OrderSheetState();
}

class _OrderSheetState extends State<_OrderSheet> {
  String _symbol = 'XAUUSD';
  String _side = 'buy';
  final _volCtrl = TextEditingController(text: '0.01');
  bool _submitting = false;

  final _symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'USDJPY'];

  Future<void> _submit() async {
    setState(() => _submitting = true);
    final app = context.read<AppProvider>();
    final vol = double.tryParse(_volCtrl.text) ?? 0.01;
    final ok = await app.placeOrder(symbol: _symbol, side: _side, volume: vol);
    if (mounted) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ok ? 'Order placed' : 'Order failed'),
        backgroundColor: ok ? AppColors.buyGreen : AppColors.sellRed,
      ));
    }
  }

  @override
  void dispose() {
    _volCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(left: 24, right: 24, top: 24, bottom: MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('New Order', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            initialValue: _symbol,
            decoration: const InputDecoration(labelText: 'Symbol'),
            items: _symbols.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
            onChanged: (v) => setState(() => _symbol = v!),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _side = 'buy'),
                  child: Container(
                    height: 48,
                    decoration: BoxDecoration(
                      color: _side == 'buy' ? AppColors.buyGreen : AppColors.buyGreen.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    alignment: Alignment.center,
                    child: Text('BUY',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: _side == 'buy' ? Colors.white : AppColors.buyGreen)),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _side = 'sell'),
                  child: Container(
                    height: 48,
                    decoration: BoxDecoration(
                      color: _side == 'sell' ? AppColors.sellRed : AppColors.sellRed.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    alignment: Alignment.center,
                    child: Text('SELL',
                        style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: _side == 'sell' ? Colors.white : AppColors.sellRed)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _volCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'Volume (lots)'),
          ),
          const SizedBox(height: 20),
          SizedBox(
            height: 52,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: _side == 'buy' ? AppColors.buyGreen : AppColors.sellRed,
              ),
              child: _submitting
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                  : Text('Place ${_side.toUpperCase()} Order'),
            ),
          ),
        ],
      ),
    );
  }
}
