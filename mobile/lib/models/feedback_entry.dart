class FeedbackEntry {
  final String? submittedBy;
  final String type;
  final double rating;
  final String comments;
  final double? gpsLat;
  final double? gpsLng;
  final String? photoPath;
  final int? parkId;
  final String? deviceId;

  FeedbackEntry({
    this.submittedBy,
    required this.type,
    required this.rating,
    required this.comments,
    this.gpsLat,
    this.gpsLng,
    this.photoPath,
    this.parkId,
    this.deviceId,
  });

  Map<String, dynamic> toJson() {
    return {
      'submitted_by': submittedBy,
      'type': type,
      'rating': rating,
      'comments': comments,
      'gps_lat': gpsLat,
      'gps_lng': gpsLng,
      'photo_path': photoPath,
      'park_id': parkId,
      'device_id': deviceId,
    };
  }
}
