import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../models/feedback_entry.dart';
import '../services/activity_logger.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../services/local_cache_service.dart';
import '../widgets/app_theme.dart';

class TouristFeedbackScreen extends StatefulWidget {
  const TouristFeedbackScreen(
      {super.key, required this.parkId, required this.parkName});

  final int parkId;
  final String parkName;

  @override
  State<TouristFeedbackScreen> createState() => _TouristFeedbackScreenState();
}

class _TouristFeedbackScreenState extends State<TouristFeedbackScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _commentsController = TextEditingController();
  double _rating = 4;
  bool _includeLocation = false;
  Position? _position;
  File? _imageFile;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    ActivityLogger.navigation('TouristFeedback');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _commentsController.dispose();
    super.dispose();
  }

  Future<void> _getLocation() async {
    final permission = await Geolocator.requestPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      ActivityLogger.action('Location permission denied');
      return;
    }
    final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high);
    setState(() => _position = pos);
    ActivityLogger.action('Location fetched', data: {
      'lat': pos.latitude,
      'lng': pos.longitude,
    });
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.camera);
    if (picked != null) {
      setState(() {
        _imageFile = File(picked.path);
      });
      ActivityLogger.action('Photo captured', data: {'path': picked.path});
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    final state = context.read<AppState>();
    final api = context.read<ApiService>();
    final entry = FeedbackEntry(
      submittedBy: _nameController.text.isEmpty ? null : _nameController.text,
      type: 'tourist',
      rating: _rating,
      comments: _commentsController.text,
      gpsLat: _includeLocation ? _position?.latitude : null,
      gpsLng: _includeLocation ? _position?.longitude : null,
      photoPath: _imageFile?.path,
      parkId: widget.parkId,
      deviceId: state.deviceId,
    );

    ActivityLogger.action('Feedback submit', data: {
      'rating': _rating,
      'withLocation': _includeLocation && _position != null,
      'hasPhoto': _imageFile != null,
    });
    try {
      await api.submitFeedback(entry,
          photo: _imageFile, deviceId: state.deviceId);
      if (!mounted) return;
      ActivityLogger.action('Feedback sent online');
      await showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Thank you'),
          content:
              const Text('Your park experience was submitted successfully.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Close'),
            )
          ],
        ),
      );
    } catch (_) {
      await LocalCacheService.instance.addPending('feedback', entry.toJson());
      await state.loadPendingCount();
      if (!mounted) return;
      ActivityLogger.action('Feedback saved offline');
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Saved offline. We will sync when online.')));
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tourist Feedback'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.green.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.park, color: AppColors.green),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text('Park: ${widget.parkName}',
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Text(
                'Share your experience',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(
                  labelText: 'Name (optional)',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _commentsController,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Comments / Issues',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please add a short note.';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Rating: ${_rating.toStringAsFixed(1)}'),
                  Expanded(
                    child: Slider(
                      value: _rating,
                      min: 1,
                      max: 5,
                      divisions: 8,
                      activeColor: AppColors.green,
                      label: _rating.toStringAsFixed(1),
                      onChanged: (val) {
                        setState(() => _rating = val);
                        ActivityLogger.action('Rating changed',
                            data: {'rating': val});
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SwitchListTile(
                activeThumbColor: AppColors.green,
                title: const Text('Include GPS location'),
                subtitle: Text(_position != null
                    ? 'Lat: ${_position!.latitude.toStringAsFixed(4)}, Lng: ${_position!.longitude.toStringAsFixed(4)}'
                    : 'Optional for incident tracking'),
                value: _includeLocation,
                onChanged: (v) async {
                  setState(() => _includeLocation = v);
                  ActivityLogger.action('Location toggle',
                      data: {'enabled': v});
                  if (v) {
                    await _getLocation();
                  } else {
                    setState(() => _position = null);
                  }
                },
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  ElevatedButton.icon(
                    onPressed: _pickImage,
                    icon: const Icon(Icons.camera_alt_outlined),
                    label: const Text('Add Photo'),
                  ),
                  const SizedBox(width: 12),
                  if (_imageFile != null)
                    const Text('Photo attached',
                        style: TextStyle(color: AppColors.greenDeep)),
                ],
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.green,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: _submitting
                      ? const CircularProgressIndicator.adaptive()
                      : const Text('Save Feedback'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
