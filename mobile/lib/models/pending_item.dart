class PendingItem {
  final int id;
  final String type;
  final Map<String, dynamic> payload;
  final DateTime createdAt;

  PendingItem({
    required this.id,
    required this.type,
    required this.payload,
    required this.createdAt,
  });
}
