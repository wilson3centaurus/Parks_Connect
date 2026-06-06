import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../models/environment_log.dart';
import '../models/feedback_entry.dart';

class ApiService {
  ApiService({String? baseUrl}) : baseUrl = _normalizeBaseUrl(baseUrl ?? _resolveBaseUrl());
  final String baseUrl;

  static String _normalizeBaseUrl(String value) {
    final trimmed = value.trim();
    if (trimmed.endsWith('/')) {
      return trimmed.substring(0, trimmed.length - 1);
    }
    return trimmed;
  }

  // Prefer a compile-time API_BASE override; otherwise choose a sensible default per platform.
  static String _resolveBaseUrl() {
    const env = String.fromEnvironment('API_BASE');
    if (env.isNotEmpty) return env;
    return 'https://parks-connect-api.vercel.app';
  }

  Future<Map<String, dynamic>> login(String email, String password) async {
    final resp = await http.post(
      Uri.parse('$baseUrl/api/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (resp.statusCode >= 400) {
      throw Exception(_extractMessage(resp, fallback: 'Login failed (${resp.statusCode})'));
    }
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> selfRegister({
    required String name,
    required String email,
    required String password,
    required String role,
    required String itAdminKey,
    int? parkId,
  }) async {
    final resp = await http.post(
      Uri.parse('$baseUrl/api/auth/self-register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'name': name,
        'email': email,
        'password': password,
        'role': role,
        'it_admin_key': itAdminKey,
        'park_id': parkId,
      }),
    );
    if (resp.statusCode >= 400) {
      throw Exception(_extractMessage(resp, fallback: 'Registration failed (${resp.statusCode})'));
    }
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  Future<List<dynamic>> fetchParks({String? token, bool assignedOnly = false}) async {
    final uri = Uri.parse('$baseUrl/api/parks${assignedOnly ? '/assigned' : ''}');
    final resp = await http.get(uri, headers: {
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    });
    if (resp.statusCode >= 400) {
      throw Exception('Failed to load parks');
    }
    return jsonDecode(resp.body) as List<dynamic>;
  }

  Future<List<dynamic>> fetchNotifications(String token) async {
    final resp = await http.get(
      Uri.parse('$baseUrl/api/notifications?resolved=false'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (resp.statusCode >= 400) throw Exception('Failed to load alerts');
    return jsonDecode(resp.body) as List<dynamic>;
  }

  Future<void> submitFeedback(FeedbackEntry entry, {File? photo, String? deviceId}) async {
    final uri = Uri.parse('$baseUrl/api/mobile/feedback');
    final resolvedDeviceId = deviceId ?? entry.deviceId ?? '';
    if (photo != null) {
      final request = http.MultipartRequest('POST', uri);
      request.fields.addAll({
        'submitted_by': entry.submittedBy ?? '',
        'type': entry.type,
        'rating': entry.rating.toString(),
        'comments': entry.comments,
        'gps_lat': entry.gpsLat?.toString() ?? '',
        'gps_lng': entry.gpsLng?.toString() ?? '',
        'park_id': entry.parkId?.toString() ?? '',
        'device_id': resolvedDeviceId,
      });
      request.files.add(await http.MultipartFile.fromPath(
        'photo',
        photo.path,
        contentType: MediaType('image', 'jpeg'),
      ));
      final resp = await request.send();
      if (resp.statusCode >= 400) throw Exception('Failed to submit feedback');
    } else {
      final resp = await http.post(uri, body: {
        'submitted_by': entry.submittedBy ?? '',
        'type': entry.type,
        'rating': entry.rating.toString(),
        'comments': entry.comments,
        'gps_lat': entry.gpsLat?.toString() ?? '',
        'gps_lng': entry.gpsLng?.toString() ?? '',
        'park_id': entry.parkId?.toString() ?? '',
        'device_id': resolvedDeviceId,
      });
      if (resp.statusCode >= 400) throw Exception('Failed to submit feedback');
    }
  }

  Future<Map<String, dynamic>> submitMobileIncident({
    required int parkId,
    required String incidentType,
    required String description,
    required String severity,
    required String deviceId,
    double? gpsLat,
    double? gpsLng,
    File? photo,
  }) async {
    final uri = Uri.parse('$baseUrl/api/mobile/incidents');
    if (photo != null) {
      final request = http.MultipartRequest('POST', uri);
      request.fields.addAll({
        'park_id': parkId.toString(),
        'incident_type': incidentType,
        'description': description,
        'severity': severity,
        'device_id': deviceId,
        'gps_lat': gpsLat?.toString() ?? '',
        'gps_lng': gpsLng?.toString() ?? '',
      });
      request.files.add(await http.MultipartFile.fromPath(
        'photo',
        photo.path,
        contentType: MediaType('image', 'jpeg'),
      ));
      final resp = await request.send();
      final body = await resp.stream.bytesToString();
      if (resp.statusCode >= 400) {
        throw Exception('Failed to submit incident (${resp.statusCode})');
      }
      if (body.isEmpty) return {};
      return jsonDecode(body) as Map<String, dynamic>;
    }

    final resp = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'park_id': parkId,
        'incident_type': incidentType,
        'description': description,
        'severity': severity,
        'device_id': deviceId,
        'gps_lat': gpsLat,
        'gps_lng': gpsLng,
      }),
    );
    if (resp.statusCode >= 400) {
      throw Exception('Failed to submit incident (${resp.statusCode})');
    }
    if (resp.body.isEmpty) return {};
    return jsonDecode(resp.body) as Map<String, dynamic>;
  }

  Future<void> submitEnvironmentLog(EnvironmentLog log, {String? token, File? photo}) async {
    final uri = Uri.parse('$baseUrl/api/environmental-logs');
    if (photo != null) {
      final request = http.MultipartRequest('POST', uri);
      if (token != null && token.isNotEmpty) {
        request.headers['Authorization'] = 'Bearer $token';
      }
      request.fields.addAll({
        'category': log.category,
        'description': log.description,
        'severity': log.severity,
        'location_lat': log.lat?.toString() ?? '',
        'location_lng': log.lng?.toString() ?? '',
        'park_id': log.parkId?.toString() ?? '',
      });
      request.files.add(await http.MultipartFile.fromPath(
        'photo',
        photo.path,
        contentType: MediaType('image', 'jpeg'),
      ));
      final resp = await request.send();
      if (resp.statusCode >= 400) {
        throw Exception('Failed to submit log (${resp.statusCode})');
      }
    } else {
      final resp = await http.post(
        uri,
        headers: {
          if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
          'Content-Type': 'application/json'
        },
        body: jsonEncode(log.toJson()),
      );
      if (resp.statusCode >= 400) {
        throw Exception('Failed to submit log (${resp.statusCode})');
      }
    }
  }

  String _extractMessage(http.Response resp, {required String fallback}) {
    try {
      final parsed = jsonDecode(resp.body);
      if (parsed is Map<String, dynamic>) {
        final message = parsed['message'];
        if (message is String && message.trim().isNotEmpty) {
          return message.trim();
        }
      }
    } catch (_) {
      // ignore json parse errors
    }
    return fallback;
  }
}
