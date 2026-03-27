import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/theme.dart';
import '../providers/auth_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Profile header
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: Colors.white, borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.cardBorder),
          ),
          child: Column(
            children: [
              CircleAvatar(
                radius: 36,
                backgroundColor: AppColors.primaryNavy,
                child: Text(
                  (user?.name ?? user?.email ?? 'U')[0].toUpperCase(),
                  style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(height: 12),
              Text(user?.name ?? 'Trader', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(user?.email ?? '', style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
              if (user?.accountNo != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primaryNavy.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(user!.accountNo!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.primaryNavy)),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Info cards
        _infoCard('Account Status', [
          _row('Role', (user?.role ?? 'USER').toUpperCase()),
          _row('KYC', user?.kycStatus?.toUpperCase() ?? 'PENDING'),
          _row('Email Verified', user?.emailVerified == true ? 'YES' : 'NO'),
          if (user?.createdAt != null)
            _row('Member Since', '${user!.createdAt!.day}/${user.createdAt!.month}/${user.createdAt!.year}'),
        ]),
        const SizedBox(height: 12),

        _infoCard('Settings', [
          _settingsTile(Icons.lock_outline, 'Change Password'),
          _settingsTile(Icons.language, 'Language'),
          _settingsTile(Icons.notifications_outlined, 'Notifications'),
          _settingsTile(Icons.shield_outlined, 'Security'),
          _settingsTile(Icons.help_outline, 'Help & Support'),
        ]),
        const SizedBox(height: 16),

        SizedBox(
          height: 52,
          child: OutlinedButton.icon(
            onPressed: () {
              auth.logout();
              Navigator.of(context).pushReplacementNamed('/auth');
            },
            icon: const Icon(Icons.logout, color: AppColors.sellRed),
            label: const Text('Log Out', style: TextStyle(color: AppColors.sellRed)),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AppColors.sellRed),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _infoCard(String title, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        ],
      ),
    );
  }

  Widget _settingsTile(IconData icon, String label) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.primaryNavy),
          const SizedBox(width: 14),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
          const Icon(Icons.chevron_right, size: 20, color: AppColors.mediumGrey),
        ],
      ),
    );
  }
}
