import 'package:flutter/material.dart';

class AppColors {
  static const Color green = Color(0xFF0F9D58);
  static const Color greenDark = Color(0xFF0B7A44);
  static const Color greenDeep = Color(0xFF0C8449);
  static const Color yellow = Color(0xFFF4B400);
  static const Color yellowDeep = Color(0xFFC88C00);
  static const Color white = Color(0xFFFFFFFF);
  static const Color grayBg = Color(0xFFF5F6F8);
  static const Color grayBorder = Color(0xFFE5E7EB);
  static const Color grayText = Color(0xFF4B5563);
  static const Color textDark = Color(0xFF111827);
  static const Color bgGradientStart = Color(0xFFF8FAFC);
  static const Color bgGradientEnd = Color(0xFFEEF2F7);
  static const Color shadowColor = Color.fromRGBO(0, 0, 0, 0.06);
}

ThemeData buildTheme() {
  return ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.green,
      primary: AppColors.green,
      secondary: AppColors.yellow,
      surface: AppColors.white,
      background: AppColors.grayBg,
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: AppColors.grayBg,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.textDark,
      elevation: 0,
    ),
    cardTheme: const CardThemeData(
      color: AppColors.white,
      shadowColor: AppColors.shadowColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
      ),
    ),
    useMaterial3: true,
    fontFamily: 'Roboto',
  );
}
