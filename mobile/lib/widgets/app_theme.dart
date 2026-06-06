import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  static const Color green = Color(0xFF1D9E75);
  static const Color greenDark = Color(0xFF085041);
  static const Color greenDeep = Color(0xFF085041);
  static const Color greenLight = Color(0xFFE1F5EE);
  static const Color yellow = Color(0xFFEF9F27);
  static const Color yellowDeep = Color(0xFF854F0B);
  static const Color red = Color(0xFFE24B4A);
  static const Color white = Color(0xFFFFFFFF);
  static const Color grayBg = Color(0xFFF7F8F6);
  static const Color grayBorder = Color(0xFFE5E7EB);
  static const Color grayText = Color(0xFF6B7280);
  static const Color textDark = Color(0xFF1A1F1C);
  static const Color bgGradientStart = Color(0xFFF7F8F6);
  static const Color bgGradientEnd = Color(0xFFEFF6F2);
  static const Color shadowColor = Color.fromRGBO(0, 0, 0, 0.06);
}

ThemeData buildTheme() {
  final baseTextTheme = GoogleFonts.dmSansTextTheme();
  return ThemeData(
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.green,
      primary: AppColors.green,
      secondary: AppColors.yellow,
      surface: AppColors.white,
      brightness: Brightness.light,
    ),
    scaffoldBackgroundColor: AppColors.grayBg,
    textTheme: baseTextTheme.apply(
      bodyColor: AppColors.textDark,
      displayColor: AppColors.textDark,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.greenDark,
      foregroundColor: AppColors.white,
      elevation: 0,
    ),
    cardTheme: const CardThemeData(
      color: AppColors.white,
      shadowColor: AppColors.shadowColor,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(16)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFD0D5DD)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFD0D5DD)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.green),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.green,
        foregroundColor: AppColors.white,
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: GoogleFonts.dmSans(fontSize: 16, fontWeight: FontWeight.w700),
      ),
    ),
    useMaterial3: true,
    fontFamily: GoogleFonts.dmSans().fontFamily,
  );
}
