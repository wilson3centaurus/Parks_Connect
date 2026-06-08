import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/environment_log.dart';
import '../services/activity_logger.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/local_cache_service.dart';
import '../services/sync_service.dart';
import '../widgets/app_theme.dart';
import 'alerts_screen.dart';
import 'incident_report_screen.dart';
import 'profile_screen.dart';
import 'staff_login_screen.dart';

class FieldDashboardScreen extends StatefulWidget {
  const FieldDashboardScreen({super.key});

  @override
  State<FieldDashboardScreen> createState() => _FieldDashboardScreenState();
}

class _FieldDashboardScreenState extends State<FieldDashboardScreen> {
  final _speciesController = TextEditingController();
  final _countController = TextEditingController();
  final _notesController = TextEditingController();
  final _latController = TextEditingController();
  final _lngController = TextEditingController();
  final _picker = ImagePicker();

  StreamSubscription<List<ConnectivityResult>>? _connectivitySub;

  String _envCategory = 'wildlife';
  int _conditionRating = 3;
  bool _saving = false;
  bool _syncing = false;
  bool _online = true;
  int _selectedNavIndex = 1;
  File? _environmentPhoto;
  List<dynamic> _alerts = [];

  @override
  void initState() {
    super.initState();
    ActivityLogger.navigation('EnvironmentalObservation');
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final state = context.read<AppState>();
      await state.loadPendingCount();
      await _refreshConnectivity();
      await _loadCurrentLocation();
      await _loadAlerts();
    });

    _connectivitySub = Connectivity().onConnectivityChanged.listen((results) {
      final hasConnection = results.any((status) => status != ConnectivityResult.none);
      if (!mounted) return;
      setState(() => _online = hasConnection);
    });
  }

  @override
  void dispose() {
    _speciesController.dispose();
    _countController.dispose();
    _notesController.dispose();
    _latController.dispose();
    _lngController.dispose();
    _connectivitySub?.cancel();
    super.dispose();
  }

  Future<void> _refreshConnectivity() async {
    final status = await Connectivity().checkConnectivity();
    if (!mounted) return;
    setState(() => _online = !status.contains(ConnectivityResult.none));
  }

  Future<void> _loadAlerts() async {
    final token = context.read<AppState>().authToken;
    if (token == null || token.isEmpty) return;
    try {
      final alerts = await context.read<ApiService>().fetchNotifications(token);
      if (!mounted) return;
      setState(() => _alerts = alerts);
    } catch (_) {
      // Alert loading is best-effort for the mobile shell.
    }
  }

  Future<void> _loadCurrentLocation() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return;

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
        return;
      }

      final position = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      if (!mounted) return;
      setState(() {
        _latController.text = position.latitude.toStringAsFixed(4);
        _lngController.text = position.longitude.toStringAsFixed(4);
      });
    } catch (_) {
      // Location is optional. The screen stays usable if GPS lookup fails.
    }
  }

  Future<void> _pickEnvironmentPhoto() async {
    final picked = await _picker.pickImage(source: ImageSource.camera, imageQuality: 88);
    if (picked == null || !mounted) return;
    setState(() => _environmentPhoto = File(picked.path));
    ActivityLogger.action('Observation photo attached', data: {'path': picked.path});
  }

  Future<void> _clearPhoto() async {
    setState(() => _environmentPhoto = null);
  }

  String _severityFromRating(int rating) {
    if (rating <= 1) return 'critical';
    if (rating == 2) return 'high';
    if (rating == 3) return 'medium';
    return 'low';
  }

  Future<void> _saveEnvironment() async {
    final state = context.read<AppState>();
    final api = context.read<ApiService>();
    final parkId = state.activeParkId;

    if (parkId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select a park before submitting an observation.')),
      );
      return;
    }

    if (_speciesController.text.trim().isEmpty || _countController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Species/indicator and count/reading are required.')),
      );
      return;
    }

    setState(() => _saving = true);
    final description = [
      'Species/Indicator: ${_speciesController.text.trim()}',
      'Count/Reading: ${_countController.text.trim()}',
      if (_notesController.text.trim().isNotEmpty) 'Notes: ${_notesController.text.trim()}',
      'Condition Rating: $_conditionRating/5'
    ].join(' | ');

    final log = EnvironmentLog(
      category: _envCategory,
      description: description,
      severity: _severityFromRating(_conditionRating),
      lat: double.tryParse(_latController.text),
      lng: double.tryParse(_lngController.text),
      parkId: parkId,
      photoPath: _environmentPhoto?.path,
    );

    try {
      await api.submitEnvironmentLog(log, token: state.authToken, photo: _environmentPhoto);
      ActivityLogger.action('Environment observation synced');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Observation synced successfully.')),
      );
    } catch (_) {
      await LocalCacheService.instance.addPending('environment', log.toJson());
      await state.loadPendingCount();
      ActivityLogger.action('Environment observation saved offline');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Observation saved offline and will sync later.')),
      );
    } finally {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _speciesController.clear();
        _countController.clear();
        _notesController.clear();
        _environmentPhoto = null;
        _conditionRating = 3;
      });
    }
  }

  Future<void> _syncNow() async {
    setState(() => _syncing = true);
    final state = context.read<AppState>();
    final synced = await context.read<SyncService>().syncPending(token: state.authToken);
    await state.loadPendingCount();
    await _loadAlerts();
    if (!mounted) return;
    setState(() => _syncing = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Synced $synced items.')),
    );
  }

  Widget _buildTopHeader(String parkName, int pendingCount) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: const BoxDecoration(
        color: AppColors.greenDark,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(26)),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () {},
                  style: IconButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    foregroundColor: Colors.white,
                  ),
                  icon: const Icon(Icons.menu, size: 30),
                ),
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        width: 54,
                        height: 54,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(6),
                          child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'ZIMPARKS',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.02,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              'WILDLIFE · HERITAGE · HOSPITALITY',
                              style: TextStyle(
                                color: Color(0xD9FFFFFF),
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(_online ? Icons.cloud_queue : Icons.cloud_off_outlined, color: Colors.white, size: 22),
                        const SizedBox(width: 8),
                        const Text(
                          'Offline Mode',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _online ? 'Data will sync when online' : 'Offline - will sync',
                      style: const TextStyle(color: Color(0xD9FFFFFF), fontSize: 12),
                    ),
                  ],
                )
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.park_outlined, color: Colors.white, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            parkName,
                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Text(
                    'Queued: $pendingCount',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }

  Widget _buildCategoryTile({
    required String id,
    required String label,
    required IconData icon,
  }) {
    final selected = _envCategory == id;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _envCategory = id),
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: selected ? AppColors.green : const Color(0xFFDADDE4)),
            color: selected ? AppColors.greenLight : Colors.white,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: selected ? AppColors.green : const Color(0xFF3F4652), size: 30),
              const SizedBox(height: 10),
              Text(
                label,
                style: TextStyle(
                  color: selected ? AppColors.greenDark : AppColors.textDark,
                  fontWeight: FontWeight.w600,
                ),
              )
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFieldLabel(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: RichText(
        text: TextSpan(
          style: const TextStyle(color: AppColors.textDark, fontSize: 15, fontWeight: FontWeight.w700),
          children: [
            TextSpan(text: text),
            const TextSpan(text: ' *', style: TextStyle(color: AppColors.red)),
          ],
        ),
      ),
    );
  }

  Widget _buildStarSelector() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: List.generate(5, (index) {
        final rating = index + 1;
        final selected = rating == _conditionRating;
        return GestureDetector(
          onTap: () => setState(() => _conditionRating = rating),
          child: Column(
            children: [
              Container(
                width: 52,
                height: 52,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFDADDE4)),
                  color: Colors.white,
                ),
                child: Icon(
                  selected ? Icons.star : Icons.star_border,
                  color: selected ? AppColors.green : const Color(0xFF9CA3AF),
                  size: 36,
                ),
              ),
              const SizedBox(height: 8),
              Text('$rating')
            ],
          ),
        );
      }),
    );
  }

  Widget _buildBottomNav() {
    final items = const [
      (Icons.home_outlined, 'Dashboard'),
      (Icons.eco_outlined, 'Observations'),
      (Icons.add, 'New'),
      (Icons.map_outlined, 'Map'),
      (Icons.person_outline, 'Profile'),
    ];

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.grayBorder)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(items.length, (index) {
          final item = items[index];
          final selected = _selectedNavIndex == index;
          final isCenter = index == 2;

          if (isCenter) {
            return GestureDetector(
              onTap: () => setState(() => _selectedNavIndex = index),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 60,
                    height: 60,
                    decoration: const BoxDecoration(
                      color: AppColors.green,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.add, color: Colors.white, size: 34),
                  ),
                  const SizedBox(height: 6),
                  const Text('New')
                ],
              ),
            );
          }

          return GestureDetector(
            onTap: () => setState(() => _selectedNavIndex = index),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(item.$1, color: selected ? AppColors.green : const Color(0xFF3F4652), size: 30),
                const SizedBox(height: 6),
                Text(
                  item.$2,
                  style: TextStyle(
                    color: selected ? AppColors.green : const Color(0xFF3F4652),
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          );
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.authToken == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Environmental Observation')),
        body: Center(
          child: ElevatedButton(
            onPressed: () {
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => const StaffLoginScreen()),
              );
            },
            child: const Text('Go to login'),
          ),
        ),
      );
    }

    final parks = state.parks;
    final activeParkId = state.activeParkId;
    final activeParkName = (parks.isNotEmpty
            ? parks.firstWhere((p) => p['id'] == activeParkId, orElse: () => parks.first)
            : const {})['name'] as String? ??
        'Selected Park';
    final locationText = _latController.text.isNotEmpty && _lngController.text.isNotEmpty
        ? '${_latController.text}, ${_lngController.text}'
        : 'Tap the GPS icon to detect location';
    final notesCount = _notesController.text.trim().length;

    return Scaffold(
      backgroundColor: AppColors.grayBg,
      body: Column(
        children: [
          _buildTopHeader(activeParkName, state.pendingCount),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 74,
                      height: 74,
                      decoration: BoxDecoration(
                        color: AppColors.greenLight,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Icon(Icons.eco_outlined, color: AppColors.green, size: 34),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Environmental Observation',
                            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Record environmental conditions in the field',
                            style: TextStyle(color: AppColors.grayText),
                          ),
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            decoration: BoxDecoration(
                              color: AppColors.greenLight,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              _online ? 'Works Offline' : 'Offline – will sync',
                              style: const TextStyle(color: AppColors.greenDark, fontWeight: FontWeight.w700),
                            ),
                          )
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.grayBorder),
                    boxShadow: const [
                      BoxShadow(color: AppColors.shadowColor, blurRadius: 10, offset: Offset(0, 3)),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildFieldLabel('Category'),
                      Row(
                        children: [
                          _buildCategoryTile(id: 'wildlife', label: 'Wildlife', icon: Icons.pets),
                          const SizedBox(width: 10),
                          _buildCategoryTile(id: 'water', label: 'Water', icon: Icons.water_drop_outlined),
                          const SizedBox(width: 10),
                          _buildCategoryTile(id: 'vegetation', label: 'Vegetation', icon: Icons.park_outlined),
                          const SizedBox(width: 10),
                          _buildCategoryTile(id: 'waste', label: 'Waste', icon: Icons.delete_outline),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _buildFieldLabel('Location (Auto-detected)'),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: TextEditingController(text: locationText),
                              readOnly: true,
                              decoration: const InputDecoration(
                                prefixIcon: Icon(Icons.location_on_outlined),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          InkWell(
                            onTap: _loadCurrentLocation,
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: const Color(0xFFD0D5DD)),
                              ),
                              child: const Icon(Icons.gps_fixed, color: AppColors.green),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      _buildFieldLabel('Species / Indicator'),
                      TextField(
                        controller: _speciesController,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.pets_outlined),
                          hintText: 'Enter species name or indicator',
                        ),
                      ),
                      const SizedBox(height: 20),
                      _buildFieldLabel('Count / Reading'),
                      TextField(
                        controller: _countController,
                        decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.tag),
                          hintText: 'Enter count or measurement',
                        ),
                      ),
                      const SizedBox(height: 20),
                      _buildFieldLabel('Condition / Rating'),
                      _buildStarSelector(),
                      const SizedBox(height: 8),
                      const Center(
                        child: Text(
                          '1 = Poor    5 = Excellent',
                          style: TextStyle(color: AppColors.grayText, fontWeight: FontWeight.w500),
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Notes',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                      ),
                      TextField(
                        controller: _notesController,
                        maxLines: 4,
                        maxLength: 300,
                        decoration: InputDecoration(
                          hintText: 'Enter additional notes (optional)',
                          counterText: '$notesCount/300',
                        ),
                        onChanged: (_) => setState(() {}),
                      ),
                      const SizedBox(height: 12),
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Attach Photo (Optional)',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                      ),
                      Row(
                        children: [
                          if (_environmentPhoto != null)
                            Expanded(
                              child: Container(
                                height: 154,
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: AppColors.grayBorder),
                                ),
                                child: Stack(
                                  children: [
                                    Positioned.fill(
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(10),
                                        child: Image.file(_environmentPhoto!, fit: BoxFit.cover),
                                      ),
                                    ),
                                    Positioned(
                                      top: 6,
                                      right: 6,
                                      child: InkWell(
                                        onTap: _clearPhoto,
                                        child: Container(
                                          width: 30,
                                          height: 30,
                                          decoration: const BoxDecoration(
                                            color: Colors.white,
                                            shape: BoxShape.circle,
                                          ),
                                          child: const Icon(Icons.close, size: 18),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          if (_environmentPhoto != null) const SizedBox(width: 12),
                          Expanded(
                            child: InkWell(
                              onTap: _pickEnvironmentPhoto,
                              borderRadius: BorderRadius.circular(14),
                              child: Container(
                                height: 154,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: AppColors.green, style: BorderStyle.solid),
                                  color: Colors.white,
                                ),
                                child: const Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.add_a_photo_outlined, color: AppColors.green, size: 32),
                                    SizedBox(height: 10),
                                    Text(
                                      'Tap to take photo or choose from gallery',
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        color: AppColors.greenDark,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    SizedBox(height: 10),
                                    Text(
                                      'Photos help improve data quality',
                                      style: TextStyle(color: AppColors.grayText),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      ElevatedButton.icon(
                        onPressed: _saving ? null : _saveEnvironment,
                        icon: const Icon(Icons.send_outlined),
                        label: Text(_saving ? 'Submitting...' : 'Submit Observation'),
                      ),
                      const SizedBox(height: 12),
                      Center(
                        child: Text(
                          _online ? 'Will sync automatically when online' : 'Offline – will sync when connection is available',
                          style: const TextStyle(color: AppColors.grayText, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppColors.grayBorder),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text(
                            'Offline Queue & Alerts',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                          ),
                          const Spacer(),
                          TextButton(
                            onPressed: _syncing ? null : _syncNow,
                            child: Text(_syncing ? 'Syncing...' : 'Sync now'),
                          )
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('Pending items: ${state.pendingCount}', style: const TextStyle(color: AppColors.grayText)),
                      const SizedBox(height: 12),
                      if (_alerts.isEmpty)
                        const Text('No active alerts for this park.', style: TextStyle(color: AppColors.grayText))
                      else
                        ..._alerts.take(3).map((alert) {
                          final severity = ((alert as Map<String, dynamic>)['severity'] ?? 'medium').toString().toLowerCase();
                          final color = severity == 'critical'
                              ? AppColors.red
                              : severity == 'high'
                                  ? AppColors.yellow
                                  : AppColors.green;
                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: color.withValues(alpha: 0.28)),
                              color: color.withValues(alpha: 0.08),
                            ),
                            child: Row(
                              children: [
                                Icon(Icons.notifications_active_outlined, color: color),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        (alert['message'] ?? 'Alert').toString(),
                                        style: const TextStyle(fontWeight: FontWeight.w700),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${alert['park_name'] ?? 'Park'} · ${alert['severity'] ?? 'medium'}',
                                        style: const TextStyle(color: AppColors.grayText),
                                      ),
                                    ],
                                  ),
                                )
                              ],
                            ),
                          );
                        }),
                    ],
                  ),
                )
              ],
            ),
          ),
          _buildBottomNav(),
        ],
      ),
    );
  }
}
