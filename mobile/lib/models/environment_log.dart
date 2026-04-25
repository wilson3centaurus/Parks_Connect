class EnvironmentLog {
  final String category;
  final String description;
  final String severity;
  final double? lat;
  final double? lng;
  final int? parkId;
  final String? photoPath;

  EnvironmentLog({
    required this.category,
    required this.description,
    required this.severity,
    this.lat,
    this.lng,
    this.parkId,
    this.photoPath,
  });

  Map<String, dynamic> toJson() {
    return {
      'category': category,
      'description': description,
      'severity': severity,
      'location_lat': lat,
      'location_lng': lng,
      'park_id': parkId,
      'photo_path': photoPath,
    };
  }
}
