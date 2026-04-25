import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/environment_log.dart';
import '../services/activity_logger.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/local_cache_service.dart';
import '../services/sync_service.dart';
import '../widgets/app_theme.dart';
import 'staff_login_screen.dart';

class FieldDashboardScreen extends StatefulWidget {
  const FieldDashboardScreen({super.key});

  @override
  State<FieldDashboardScreen> createState() => _FieldDashboardScreenState();
}

class _FieldDashboardScreenState extends State<FieldDashboardScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _incidentTitle = TextEditingController();
  final _incidentDescription = TextEditingController();
  String _incidentSeverity = 'medium';

  final _envDescription = TextEditingController();
  String _envCategory = 'waste';
  String _envSeverity = 'low';
  final _latController = TextEditingController();
  final _lngController = TextEditingController();

  bool _savingIncident = false;
  bool _savingEnv = false;
  bool _syncing = false;
  bool _online = true;
  List<dynamic> _alerts = [];
  File? _incidentPhoto;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    ActivityLogger.navigation('FieldDashboard');
    _tabController.addListener(() {
      if (_tabController.indexIsChanging) return;
      ActivityLogger.navigation('FieldDashboard tab', data: {'index': _tabController.index});
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().loadPendingCount();
      _refreshConnectivity();
      _loadAlerts();
    });
    _connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      final hasConnection = results.any((status) => status != ConnectivityResult.none);
      setState(() => _online = hasConnection);
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _incidentTitle.dispose();
    _incidentDescription.dispose();
    _envDescription.dispose();
    _latController.dispose();
    _lngController.dispose();
    _connectivitySub?.cancel();
    super.dispose();
  }

  Future<void> _saveIncident() async {
    setState(() => _savingIncident = true);
    final state = context.read<AppState>();
    final api = context.read<ApiService>();
    final parkId = state.activeParkId;
    if (parkId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a park before logging.')));
      setState(() => _savingIncident = false);
      return;
    }
    final description = '${_incidentTitle.text} - ${_incidentDescription.text}';
    final log = EnvironmentLog(
      category: 'incident',
      description: description,
      severity: _incidentSeverity,
      parkId: parkId,
      photoPath: _incidentPhoto?.path,
    );
    ActivityLogger.action('Incident submit', data: {
      'title': _incidentTitle.text,
      'severity': _incidentSeverity,
    });
    try {
      await api.submitEnvironmentLog(log, token: state.authToken, photo: _incidentPhoto);
      ActivityLogger.action('Incident synced online');
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Incident synced online.')));
      setState(() => _incidentPhoto = null);
    } catch (_) {
      await LocalCacheService.instance.addPending('environment', log.toJson());
      await state.loadPendingCount();
      ActivityLogger.action('Incident saved offline');
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Incident saved offline and will sync later.')));
    } finally {
      setState(() => _savingIncident = false);
      setState(() => _incidentPhoto = null);
    }
  }

  Future<void> _saveEnvironment() async {
    setState(() => _savingEnv = true);
    final state = context.read<AppState>();
    final api = context.read<ApiService>();
    final parkId = state.activeParkId;
    if (parkId == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Select a park before logging.')));
      setState(() => _savingEnv = false);
      return;
    }
    final log = EnvironmentLog(
      category: _envCategory,
      description: _envDescription.text,
      severity: _envSeverity,
      lat: double.tryParse(_latController.text),
      lng: double.tryParse(_lngController.text),
      parkId: parkId,
    );
    ActivityLogger.action('Environment submit', data: {
      'category': _envCategory,
      'severity': _envSeverity,
    });
    try {
      await api.submitEnvironmentLog(log, token: state.authToken);
      ActivityLogger.action('Environment log synced');
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Environment log synced.')));
    } catch (_) {
      await LocalCacheService.instance.addPending('environment', log.toJson());
      await state.loadPendingCount();
      ActivityLogger.action('Environment log saved offline');
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Saved offline. Will sync when online.')));
    } finally {
      setState(() => _savingEnv = false);
    }
  }

  Future<void> _syncNow() async {
    setState(() => _syncing = true);
    final state = context.read<AppState>();
    ActivityLogger.action('Manual sync started');
    final synced = await context.read<SyncService>().syncPending(token: state.authToken);
    await state.loadPendingCount();
    await _loadAlerts();
    setState(() => _syncing = false);
    ActivityLogger.action('Manual sync finished', data: {'items': synced});
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Synced $synced items.')));
  }

  Future<void> _refreshConnectivity() async {
    final status = await Connectivity().checkConnectivity();
    setState(() => _online = status != ConnectivityResult.none);
  }

  Future<void> _loadAlerts() async {
    final token = context.read<AppState>().authToken;
    if (token == null || token.isEmpty) return;
    try {
      final alerts = await context.read<ApiService>().fetchNotifications(token);
      setState(() => _alerts = alerts);
    } catch (_) {
      // ignore fetch errors for alerts
    }
  }

  Future<void> _pickIncidentPhoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.camera);
    if (picked != null) {
      setState(() => _incidentPhoto = File(picked.path));
      ActivityLogger.action('Incident photo attached', data: {'path': picked.path});
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final parks = state.parks;
    final activeParkId = state.activeParkId;
    if (state.authToken == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Field Staff Dashboard')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Sign in to access field dashboards'),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () {
                  Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => const StaffLoginScreen()),
                  );
                },
                child: const Text('Go to login'),
              )
            ],
          ),
        ),
      );
    }
    if (_alerts.isEmpty && state.authToken != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadAlerts());
    }
    final activeParkName =
        (parks.isNotEmpty ? parks.firstWhere((p) => p['id'] == activeParkId, orElse: () => parks.first) : const {})['name']
                as String? ??
            'Park';
    return Scaffold(
      appBar: AppBar(
        title: const Text('Field Staff Dashboard'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.green,
          labelColor: AppColors.greenDeep,
          tabs: const [
            Tab(text: 'Incidents'),
            Tab(text: 'Environment'),
            Tab(text: 'Sync'),
          ],
        ),
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(color: Colors.white, boxShadow: [
              BoxShadow(color: AppColors.shadowColor, blurRadius: 6, offset: Offset(0, 2)),
            ]),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(_online ? Icons.check_circle : Icons.offline_bolt,
                        size: 18, color: _online ? AppColors.green : Colors.red),
                    const SizedBox(width: 6),
                    Text(_online ? 'Online' : 'Offline', style: const TextStyle(fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Text('Pending: ${state.pendingCount}', style: const TextStyle(color: AppColors.grayText, fontSize: 12)),
                  ],
                ),
                if (parks.isNotEmpty)
                  Row(
                    children: [
                      const Text('Park:', style: TextStyle(fontSize: 12, color: AppColors.grayText)),
                      const SizedBox(width: 8),
                      DropdownButton<int>(
                        value: activeParkId ?? parks.first['id'] as int?,
                        items: parks
                            .map((p) => DropdownMenuItem<int>(
                                  value: p['id'] as int,
                                  child: Text(p['name'] as String? ?? 'Park'),
                                ))
                            .toList(),
                        onChanged: (id) => context.read<AppState>().setActivePark(id),
                      ),
                    ],
                  ),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _IncidentForm(
                  titleController: _incidentTitle,
                  descriptionController: _incidentDescription,
                  severity: _incidentSeverity,
                  parkName: activeParkName,
                  photo: _incidentPhoto,
                  onPickPhoto: _pickIncidentPhoto,
                  onSeverityChanged: (v) {
                    setState(() => _incidentSeverity = v);
                    ActivityLogger.action('Incident severity changed', data: {'severity': v});
                  },
                  onSave: _savingIncident ? null : _saveIncident,
                ),
                _EnvironmentForm(
                  descriptionController: _envDescription,
                  category: _envCategory,
                  severity: _envSeverity,
                  latController: _latController,
                  lngController: _lngController,
                  parkName: activeParkName,
                  onCategoryChanged: (v) {
                    setState(() => _envCategory = v);
                    ActivityLogger.action('Environment category changed', data: {'category': v});
                  },
                  onSeverityChanged: (v) {
                    setState(() => _envSeverity = v);
                    ActivityLogger.action('Environment severity changed', data: {'severity': v});
                  },
                  onSave: _savingEnv ? null : _saveEnvironment,
                ),
                _SyncPanel(
                  syncing: _syncing,
                  online: _online,
                  pendingCount: state.pendingCount,
                  parkName: activeParkName,
                  alerts: _alerts,
                  onSync: _syncNow,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _IncidentForm extends StatelessWidget {
  final TextEditingController titleController;
  final TextEditingController descriptionController;
  final String severity;
  final VoidCallback? onSave;
  final ValueChanged<String> onSeverityChanged;
  final String parkName;
  final File? photo;
  final VoidCallback onPickPhoto;

  const _IncidentForm({
    required this.titleController,
    required this.descriptionController,
    required this.severity,
    required this.onSeverityChanged,
    required this.onSave,
    required this.parkName,
    required this.photo,
    required this.onPickPhoto,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Log incident · $parkName',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        TextFormField(
          controller: titleController,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Title'),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: descriptionController,
          maxLines: 4,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Description'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Severity'),
          value: severity,
          items: const [
            DropdownMenuItem(value: 'low', child: Text('Low')),
            DropdownMenuItem(value: 'medium', child: Text('Medium')),
            DropdownMenuItem(value: 'high', child: Text('High')),
            DropdownMenuItem(value: 'critical', child: Text('Critical')),
          ],
          onChanged: (v) => onSeverityChanged(v ?? 'medium'),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            ElevatedButton.icon(
              onPressed: onPickPhoto,
              icon: const Icon(Icons.camera_alt_outlined),
              label: const Text('Attach photo'),
            ),
            const SizedBox(width: 12),
            if (photo != null) const Text('Photo attached', style: TextStyle(color: AppColors.greenDeep)),
          ],
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: onSave,
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.green),
          child: const Text('Save Incident'),
        )
      ],
    );
  }
}

class _EnvironmentForm extends StatelessWidget {
  final TextEditingController descriptionController;
  final TextEditingController latController;
  final TextEditingController lngController;
  final String category;
  final String severity;
  final VoidCallback? onSave;
  final ValueChanged<String> onCategoryChanged;
  final ValueChanged<String> onSeverityChanged;
  final String parkName;

  const _EnvironmentForm({
    required this.descriptionController,
    required this.latController,
    required this.lngController,
    required this.category,
    required this.severity,
    required this.onSave,
    required this.onCategoryChanged,
    required this.onSeverityChanged,
    required this.parkName,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Environment report · $parkName',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          value: category,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Category'),
          items: const [
            DropdownMenuItem(value: 'waste', child: Text('Waste')),
            DropdownMenuItem(value: 'water', child: Text('Water')),
            DropdownMenuItem(value: 'wildlife', child: Text('Wildlife')),
            DropdownMenuItem(value: 'fire', child: Text('Fire')),
          ],
          onChanged: (v) => onCategoryChanged(v ?? 'waste'),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: descriptionController,
          maxLines: 3,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Description'),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: severity,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Severity'),
          items: const [
            DropdownMenuItem(value: 'low', child: Text('Low')),
            DropdownMenuItem(value: 'medium', child: Text('Medium')),
            DropdownMenuItem(value: 'high', child: Text('High')),
            DropdownMenuItem(value: 'critical', child: Text('Critical')),
          ],
          onChanged: (v) => onSeverityChanged(v ?? 'low'),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: latController,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Latitude (optional)'),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: lngController,
          decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Longitude (optional)'),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: onSave,
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.green),
          child: const Text('Save Environment Log'),
        )
      ],
    );
  }
}

class _SyncPanel extends StatelessWidget {
  final bool syncing;
  final VoidCallback onSync;
  final bool online;
  final int pendingCount;
  final List<dynamic> alerts;
  final String parkName;

  const _SyncPanel({
    required this.syncing,
    required this.online,
    required this.pendingCount,
    required this.alerts,
    required this.parkName,
    required this.onSync,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Offline cache & alerts',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            children: [
              Icon(online ? Icons.cloud_done : Icons.cloud_off, color: online ? AppColors.green : Colors.red),
              const SizedBox(width: 8),
              Text(online ? 'Online for sync' : 'Offline · queued', style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 8),
          Text('Pending items: $pendingCount', style: const TextStyle(color: AppColors.grayText)),
          Text('Park: $parkName', style: const TextStyle(color: AppColors.grayText)),
          const SizedBox(height: 12),
          Row(
            children: [
              ElevatedButton(
                onPressed: syncing ? null : onSync,
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.green),
                child: Text(syncing ? 'Syncing...' : 'Sync now'),
              ),
              const SizedBox(width: 12),
              OutlinedButton(
                onPressed: () async {
                  ActivityLogger.action('Clear offline cache');
                  await LocalCacheService.instance.clearPending();
                  await context.read<AppState>().loadPendingCount();
                },
                child: const Text('Clear cache'),
              )
            ],
          ),
          const SizedBox(height: 12),
          Text('Critical alerts', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          if (alerts.isEmpty)
            const Text('No open alerts for this park.', style: TextStyle(color: AppColors.grayText))
          else
            Container(
              constraints: const BoxConstraints(maxHeight: 160),
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: alerts.length,
                itemBuilder: (context, index) {
                  final alert = alerts[index] as Map<String, dynamic>;
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(alert['message'] as String? ?? '', style: const TextStyle(fontSize: 14)),
                    subtitle: Text(alert['severity'] as String? ?? '', style: const TextStyle(fontSize: 12)),
                  );
                },
              ),
            )
        ],
      ),
    );
  }
}
