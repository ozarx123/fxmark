import 'package:flutter/material.dart';

class AppColors {
  static const Color primaryNavy = Color(0xFF1B2A4A);
  static const Color darkNavy = Color(0xFF0F1B2D);
  static const Color headerNavy = Color(0xFF243B5E);
  static const Color accentGreen = Color(0xFF2E8B57);
  static const Color buyGreen = Color(0xFF4CAF50);
  static const Color sellRed = Color(0xFFE53935);
  static const Color warningOrange = Color(0xFFFFA726);
  static const Color white = Color(0xFFFFFFFF);
  static const Color offWhite = Color(0xFFF5F6FA);
  static const Color lightGrey = Color(0xFFE0E3EB);
  static const Color mediumGrey = Color(0xFF9CA3AF);
  static const Color darkGrey = Color(0xFF6B7280);
  static const Color textPrimary = Color(0xFF1F2937);
  static const Color textSecondary = Color(0xFF6B7280);
  static const Color cardBorder = Color(0xFFE5E7EB);
  static const Color inputFill = Color(0xFFF9FAFB);
  static const Color errorRed = Color(0xFFDC2626);
}

class AppTheme {
  static ThemeData get light => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        primaryColor: AppColors.primaryNavy,
        scaffoldBackgroundColor: AppColors.offWhite,
        colorScheme: const ColorScheme.light(
          primary: AppColors.primaryNavy,
          secondary: AppColors.accentGreen,
          surface: AppColors.white,
          error: AppColors.errorRed,
          onPrimary: AppColors.white,
          onSecondary: AppColors.white,
          onSurface: AppColors.textPrimary,
        ),
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.primaryNavy,
          foregroundColor: AppColors.white,
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            color: AppColors.white,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.accentGreen,
            foregroundColor: AppColors.white,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.primaryNavy,
            minimumSize: const Size(double.infinity, 52),
            side: const BorderSide(color: AppColors.cardBorder),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.inputFill,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.cardBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.cardBorder),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide:
                const BorderSide(color: AppColors.primaryNavy, width: 1.5),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: const BorderSide(color: AppColors.errorRed),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide:
                const BorderSide(color: AppColors.errorRed, width: 1.5),
          ),
          hintStyle: const TextStyle(color: AppColors.mediumGrey, fontSize: 14),
          labelStyle:
              const TextStyle(color: AppColors.darkGrey, fontSize: 14),
        ),
        cardTheme: CardThemeData(
          color: AppColors.white,
          elevation: 1,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: const BorderSide(color: AppColors.cardBorder, width: 0.5),
          ),
        ),
        dividerTheme: const DividerThemeData(
          color: AppColors.lightGrey,
          thickness: 1,
        ),
      );
}
