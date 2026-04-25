import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'local_cache_service.dart';

class AppState extends ChangeNotifier {
  static const _tokenKey = 'authToken';
  static const _parksKey = 'parksAssigned';
  static const _activeParkKey = 'activeParkId';
  static const _userKey = 'userProfile';
  static const _deviceIdKey = 'deviceId';

  int pendingCount = 0;
  String? authToken;
  String? deviceId;
  List<dynamic> parks = [];
  int? activeParkId;
  Map<String, dynamic>? user;

  Future<void> loadPendingCount() async {
    pendingCount = await LocalCacheService.instance.countPending();
    notifyListeners();
  }

  Future<void> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    authToken = prefs.getString(_tokenKey);
    deviceId = await _ensureDeviceId(prefs);
    final parksJson = prefs.getString(_parksKey);
    if (parksJson != null) {
      final decoded = jsonDecode(parksJson);
      if (decoded is List) {
        parks = decoded.cast<dynamic>();
      }
    }
    activeParkId = prefs.getInt(_activeParkKey);
    final userJson = prefs.getString(_userKey);
    if (userJson != null) {
      final decoded = jsonDecode(userJson);
      if (decoded is Map) {
        user = Map<String, dynamic>.from(decoded as Map);
      }
    }
    notifyListeners();
  }

  Future<void> setSession({
    required String token,
    List<dynamic>? parks,
    int? parkId,
    Map<String, dynamic>? user,
  }) async {
    authToken = token;
    this.parks = parks ?? this.parks;
    activeParkId = parkId ?? activeParkId ?? (this.parks.isNotEmpty ? this.parks.first['id'] as int? : null);
    this.user = user ?? this.user;
    notifyListeners();
    await _persistSession();
  }

  Future<void> setActivePark(int? parkId) async {
    activeParkId = parkId;
    notifyListeners();
    await _persistSession();
  }

  Future<void> clearSession() async {
    authToken = null;
    parks = [];
    activeParkId = null;
    user = null;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_parksKey);
    await prefs.remove(_activeParkKey);
    await prefs.remove(_userKey);
  }

  Future<String> _ensureDeviceId(SharedPreferences prefs) async {
    final existing = prefs.getString(_deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;

    final random = Random();
    final generated =
        'device_${DateTime.now().millisecondsSinceEpoch}_${random.nextInt(999999).toString().padLeft(6, '0')}';
    await prefs.setString(_deviceIdKey, generated);
    return generated;
  }

  Future<void> _persistSession() async {
    final prefs = await SharedPreferences.getInstance();
    if (authToken != null && authToken!.isNotEmpty) {
      await prefs.setString(_tokenKey, authToken!);
    } else {
      await prefs.remove(_tokenKey);
    }
    await prefs.setString(_parksKey, jsonEncode(parks));
    if (activeParkId != null) {
      await prefs.setInt(_activeParkKey, activeParkId!);
    } else {
      await prefs.remove(_activeParkKey);
    }
    if (user != null) {
      await prefs.setString(_userKey, jsonEncode(user));
    } else {
      await prefs.remove(_userKey);
    }
  }
}
