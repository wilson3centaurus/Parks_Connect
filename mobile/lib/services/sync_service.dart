import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';

import '../models/environment_log.dart';
import '../models/feedback_entry.dart';
import '../models/pending_item.dart';
import 'api_service.dart';
import 'local_cache_service.dart';

class SyncService {
  SyncService(this.api);
  final ApiService api;

  Future<bool> _online() async {
    final status = await Connectivity().checkConnectivity();
    return !status.contains(ConnectivityResult.none);
  }

  Future<int> syncPending({String? token}) async {
    if (!await _online()) return 0;
    final pending = await LocalCacheService.instance.getPending();
    int synced = 0;
    for (final PendingItem item in pending) {
      try {
        if (item.type == 'feedback') {
          final entry = FeedbackEntry(
            submittedBy: item.payload['submitted_by'] as String?,
            type: item.payload['type'] as String? ?? 'tourist',
            rating: (item.payload['rating'] as num?)?.toDouble() ?? 0,
            comments: item.payload['comments'] as String? ?? '',
            gpsLat: (item.payload['gps_lat'] as num?)?.toDouble(),
            gpsLng: (item.payload['gps_lng'] as num?)?.toDouble(),
            photoPath: item.payload['photo_path'] as String?,
            parkId: (item.payload['park_id'] as num?)?.toInt(),
            deviceId: item.payload['device_id'] as String?,
          );
          await api.submitFeedback(
            entry,
            photo: entry.photoPath != null ? File(entry.photoPath!) : null,
            deviceId: entry.deviceId,
          );
          await LocalCacheService.instance.removePending(item.id);
          synced++;
        } else if (item.type == 'environment') {
          if (token == null || token.isEmpty) continue;
          final photoPath = item.payload['photo_path'] as String?;
          final log = EnvironmentLog(
            category: item.payload['category'] as String? ?? 'incident',
            description: item.payload['description'] as String? ?? '',
            severity: item.payload['severity'] as String? ?? 'low',
            lat: (item.payload['location_lat'] as num?)?.toDouble(),
            lng: (item.payload['location_lng'] as num?)?.toDouble(),
            parkId: (item.payload['park_id'] as num?)?.toInt(),
            photoPath: photoPath,
          );
          await api.submitEnvironmentLog(log, token: token, photo: photoPath != null ? File(photoPath) : null);
          await LocalCacheService.instance.removePending(item.id);
          synced++;
        }
      } catch (err) {
        // keep item queued
      }
    }
    return synced;
  }
}
