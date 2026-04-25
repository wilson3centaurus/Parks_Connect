import 'dart:io';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:parks_connect/screens/landing_screen.dart';
import 'package:parks_connect/services/activity_logger.dart';
import 'package:parks_connect/services/api_service.dart';
import 'package:parks_connect/services/app_state.dart';
import 'package:parks_connect/services/local_cache_service.dart';
import 'package:parks_connect/services/sync_service.dart';
import 'package:parks_connect/widgets/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await LocalCacheService.instance.countPending();
  await _logStartupInfo();
  runApp(const ParksConnectRoot());
}

Future<void> _logStartupInfo() async {
  final api = ApiService();
  final baseUri = Uri.parse(api.baseUrl);
  final localhostUrl = baseUri.replace(host: 'localhost').toString();

  ActivityLogger.log('App starting', data: {'baseUrl': api.baseUrl});
  ActivityLogger.log('Localhost link', data: {'url': localhostUrl});

  final deviceUrls = <String>{};
  try {
    final interfaces = await NetworkInterface.list(
      includeLinkLocal: false,
      includeLoopback: false,
      type: InternetAddressType.IPv4,
    );
    for (final iface in interfaces) {
      for (final addr in iface.addresses) {
        deviceUrls.add(baseUri.replace(host: addr.address).toString());
      }
    }
  } catch (error, stack) {
    ActivityLogger.error('startup network lookup', error, stack);
  }

  ActivityLogger.log(
    'Mobile/LAN links',
    data: {'urls': deviceUrls.isEmpty ? ['<no LAN IPv4 detected>'] : deviceUrls.toList()},
  );
}

class ParksConnectRoot extends StatelessWidget {
  const ParksConnectRoot({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AppState()
          ..loadPendingCount()
          ..restoreSession()),
        Provider(create: (_) => ApiService()),
        ProxyProvider<ApiService, SyncService>(
          update: (_, api, __) => SyncService(api),
        ),
      ],
      child: const ParksConnectApp(),
    );
  }
}

class ParksConnectApp extends StatelessWidget {
  const ParksConnectApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Parks Connect',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const LandingScreen(),
    );
  }
}
