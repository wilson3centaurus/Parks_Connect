import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/activity_logger.dart';
import '../services/api_service.dart';
import 'tourist_feedback_screen.dart';

class SelectParkScreen extends StatefulWidget {
  const SelectParkScreen({super.key});

  @override
  State<SelectParkScreen> createState() => _SelectParkScreenState();
}

class _SelectParkScreenState extends State<SelectParkScreen> {
  late Future<List<dynamic>> _futureParks;
  bool _usingCache = false;

  @override
  void initState() {
    super.initState();
    _futureParks = _load();
  }

  Future<List<dynamic>> _load() async {
    final api = context.read<ApiService>();
    ActivityLogger.action('Load parks (public)');
    try {
      final parks = await api.fetchParks();
      if (_usingCache) setState(() => _usingCache = false);
      await _cacheParks(parks);
      return parks;
    } catch (error) {
      final cached = await _loadCachedParks();
      if (cached != null && cached.isNotEmpty) {
        setState(() => _usingCache = true);
        ActivityLogger.action('Load parks (cached fallback)', data: {'count': cached.length});
        return cached;
      }
      rethrow;
    }
  }

  void _openFeedback(Map<String, dynamic> park) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TouristFeedbackScreen(
        parkId: park['id'] as int,
        parkName: park['name'] as String? ?? 'Park',
      ),
    ));
  }

  Future<void> _cacheParks(List<dynamic> parks) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('cachedPublicParks', jsonEncode(parks));
  }

  Future<List<dynamic>?> _loadCachedParks() async {
    final prefs = await SharedPreferences.getInstance();
    final data = prefs.getString('cachedPublicParks');
    if (data == null) return null;
    final decoded = jsonDecode(data);
    if (decoded is List) return decoded.cast<dynamic>();
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Select Park')),
      body: FutureBuilder<List<dynamic>>(
        future: _futureParks,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Unable to load parks'),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: () => setState(() => _futureParks = _load()),
                    child: const Text('Retry'),
                  )
                ],
              ),
            );
          }
          final parks = snapshot.data ?? [];
          if (parks.isEmpty) {
            return const Center(child: Text('No parks configured yet.'));
          }
          final showBanner = _usingCache;
          final bannerOffset = showBanner ? 1 : 0;
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemBuilder: (context, index) {
              if (showBanner && index == 0) {
                return Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.amber.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    'Offline mode: showing saved parks. Connect to refresh.',
                    style: TextStyle(color: Colors.black87),
                  ),
                );
              }
              final park = parks[index - bannerOffset] as Map<String, dynamic>;
              return ListTile(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: const BorderSide(color: Color(0xFFE5E7EB)),
                ),
                title: Text(park['name'] as String? ?? 'Park'),
                subtitle: Text(park['region'] as String? ?? ''),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _openFeedback(park),
              );
            },
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemCount: parks.length + bannerOffset,
          );
        },
      ),
    );
  }
}
