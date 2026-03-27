import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/app_provider.dart';

class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key});

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final app = context.read<AppProvider>();
      app.fetchWallet();
      app.fetchTransactions();
    });
  }

  @override
  Widget build(BuildContext context) {
    final app = context.watch<AppProvider>();
    final w = app.wallet;

    return RefreshIndicator(
      onRefresh: () async {
        await app.fetchWallet();
        await app.fetchTransactions();
      },
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Balance card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [AppColors.darkNavy, AppColors.primaryNavy]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              children: [
                const Text('Total Balance', style: TextStyle(color: Colors.white70, fontSize: 13)),
                const SizedBox(height: 6),
                Text('\$${w.balance.toStringAsFixed(2)}',
                    style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w700)),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _balChip('Available', w.available),
                    const SizedBox(width: 24),
                    _balChip('Locked', w.locked),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Action buttons
          Row(
            children: [
              _actionBtn(Icons.arrow_downward, 'Deposit', AppColors.buyGreen),
              const SizedBox(width: 12),
              _actionBtn(Icons.arrow_upward, 'Withdraw', AppColors.sellRed),
              const SizedBox(width: 12),
              _actionBtn(Icons.swap_horiz, 'Transfer', AppColors.primaryNavy),
            ],
          ),
          const SizedBox(height: 24),

          const Text('Recent Transactions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),

          if (app.transactions.isEmpty)
            Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white, borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.cardBorder),
              ),
              child: const Column(
                children: [
                  Icon(Icons.receipt_long_outlined, size: 40, color: AppColors.mediumGrey),
                  SizedBox(height: 8),
                  Text('No transactions yet', style: TextStyle(color: AppColors.textSecondary)),
                ],
              ),
            )
          else
            ...app.transactions.map((t) {
              final isDeposit = t.type.contains('deposit') || t.amount > 0;
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
                      width: 40, height: 40,
                      decoration: BoxDecoration(
                        color: (isDeposit ? AppColors.buyGreen : AppColors.sellRed).withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(isDeposit ? Icons.arrow_downward : Icons.arrow_upward,
                          color: isDeposit ? AppColors.buyGreen : AppColors.sellRed, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t.type.replaceAll('_', ' ').toUpperCase(),
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                          if (t.createdAt != null)
                            Text('${t.createdAt!.day}/${t.createdAt!.month}/${t.createdAt!.year}',
                                style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                    Text(
                      '${isDeposit ? "+" : "-"}\$${t.amount.abs().toStringAsFixed(2)}',
                      style: TextStyle(fontWeight: FontWeight.w600, color: isDeposit ? AppColors.buyGreen : AppColors.sellRed),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _balChip(String label, double val) {
    return Column(
      children: [
        Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12)),
        const SizedBox(height: 2),
        Text('\$${val.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _actionBtn(IconData icon, String label, Color c) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(12)),
        child: Column(
          children: [
            Icon(icon, color: Colors.white, size: 22),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
