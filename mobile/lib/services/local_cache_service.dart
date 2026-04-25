import 'dart:convert';

import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import '../models/pending_item.dart';

class LocalCacheService {
  LocalCacheService._();
  static final LocalCacheService instance = LocalCacheService._();

  Database? _db;

  Future<Database> _database() async {
    if (_db != null) return _db!;
    final dir = await getApplicationDocumentsDirectory();
    final path = join(dir.path, 'offline_cache.db');
    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE pending (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        ''');
      },
    );
    return _db!;
  }

  Future<int> addPending(String type, Map<String, dynamic> payload) async {
    final db = await _database();
    return db.insert('pending', {'type': type, 'payload': jsonEncode(payload)});
  }

  Future<List<PendingItem>> getPending() async {
    final db = await _database();
    final rows = await db.query('pending', orderBy: 'created_at DESC');
    return rows
        .map((r) => PendingItem(
              id: r['id'] as int,
              type: r['type'] as String,
              payload: jsonDecode(r['payload'] as String) as Map<String, dynamic>,
              createdAt: DateTime.tryParse(r['created_at'] as String? ?? '') ?? DateTime.now(),
            ))
        .toList();
  }

  Future<int> countPending() async {
    final db = await _database();
    final result = await db.rawQuery('SELECT COUNT(*) as count FROM pending');
    return Sqflite.firstIntValue(result) ?? 0;
  }

  Future<void> removePending(int id) async {
    final db = await _database();
    await db.delete('pending', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> clearPending() async {
    final db = await _database();
    await db.delete('pending');
  }
}
