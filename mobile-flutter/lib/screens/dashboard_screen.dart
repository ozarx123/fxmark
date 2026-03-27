import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/app_provider.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppProvider>().loadDashboard();
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final app = context.watch<AppProvider>();
    final user = auth.user;
    final w = app.wallet;

    return RefreshIndicator(
      onRefresh: () => app.loadDashboard(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Balance card
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.darkNavy, AppColors.headerNavy],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        user?.accountNo ?? '',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const Spacer(),
                    Icon(Icons.notifications_none, color: Colors.white.withValues(alpha: 0.7), size: 22),
                  ],
                ),
                const SizedBox(height: 16),
                Text('Balance', style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12)),
                const SizedBox(height: 4),
                Text(
                  '\$${w.balance.toStringAsFixed(2)}',
                  style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _stat('Available', '\$${w.available.toStringAsFixed(2)}'),
                    const SizedBox(width: 32),
                    _stat('Locked', '\$${w.locked.toStringAsFixed(2)}'),
                    const Spacer(),
                    _stat('Positions', '${app.positions.length}'),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Quick actions
          const Text('Quick Actions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          Row(
            children: [
              _action(Icons.candlestick_chart, 'Trade', AppColors.accentGreen, () {}),
              const SizedBox(width: 10),
              _action(Icons.account_balance_wallet, 'Wallet', AppColors.primaryNavy, () {}),
              const SizedBox(width: 10),
              _action(Icons.trending_up, 'Markets', AppColors.warningOrange, () {}),
              const SizedBox(width: 10),
              _action(Icons.analytics_outlined, 'PAMM', AppColors.headerNavy, () {}),
            ],
          ),
          const SizedBox(height: 24),

          // Open positions
          Row(
            children: [
              const Text('Open Positions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
              const Spacer(),
              Text('${app.positions.length}', style: const TextStyle(color: AppColors.mediumGrey)),
            ],
          ),
          const SizedBox(height: 10),
          if (app.positions.isEmpty)
            _emptyCard('No open positions', 'Place a trade to get started')
          else
            ...app.positions.map((p) => _positionTile(p.symbol, p.side, p.volume, p.openPrice, p.pnl ?? 0)),

          const SizedBox(height: 24),

          // Popular markets
          const Text('Popular Markets', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          _marketTile('XAUUSD', 'Gold / US Dollar', '+0.09%', true),
          _marketTile('EURUSD', 'Euro / US Dollar', '-0.02%', false),
          _marketTile('BTCUSD', 'Bitcoin / US Dollar', '+1.32%', true),
          _marketTile('GBPUSD', 'British Pound / Dollar', '+0.15%', true),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 11)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _action(IconData icon, String label, Color c, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.cardBorder),
          ),
          child: Column(
            children: [
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(color: c.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(10)),
                child: Icon(icon, color: c, size: 20),
              ),
              const SizedBox(height: 6),
              Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emptyCard(String title, String sub) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        children: [
          const Icon(Icons.inbox_outlined, color: AppColors.mediumGrey, size: 36),
          const SizedBox(height: 8),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
          const SizedBox(height: 4),
          Text(sub, style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
        ],
      ),
    );
  }

  Widget _positionTile(String symbol, String side, double vol, double price, double pnl) {
    final isBuy = side.toLowerCase() == 'buy';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: (isBuy ? AppColors.buyGreen : AppColors.sellRed).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(side.toUpperCase(),
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isBuy ? AppColors.buyGreen : AppColors.sellRed)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(symbol, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                Text('${vol.toStringAsFixed(2)} lots @ ${price.toStringAsFixed(2)}',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Text(
            '${pnl >= 0 ? '+' : ''}\$${pnl.toStringAsFixed(2)}',
            style: TextStyle(fontWeight: FontWeight.w600, color: pnl >= 0 ? AppColors.buyGreen : AppColors.sellRed),
          ),
        ],
      ),
    );
  }

  Widget _marketTile(String symbol, String name, String change, bool up) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Row(
        children: [
          Icon(Icons.show_chart, color: up ? AppColors.buyGreen : AppColors.sellRed, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(symbol, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                Text(name, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: (up ? AppColors.buyGreen : AppColors.sellRed).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(change,
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: up ? AppColors.buyGreen : AppColors.sellRed)),
          ),
        ],
      ),
    );
  }
}
