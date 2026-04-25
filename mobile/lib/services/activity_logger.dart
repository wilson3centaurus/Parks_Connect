import 'dart:convert';

import 'package:flutter/foundation.dart';

class ActivityLogger {
  static void log(String message, {Map<String, Object?>? data}) {
    final buffer = StringBuffer('[ParksConnect] ${DateTime.now().toIso8601String()} - $message');
    if (data != null && data.isNotEmpty) {
      try {
        buffer.write(' | ${jsonEncode(data)}');
      } catch (_) {
        buffer.write(' | $data');
      }
    }
    debugPrint(buffer.toString());
  }

  static void navigation(String destination, {Map<String, Object?>? data}) =>
      log('Navigation -> $destination', data: data);

  static void action(String action, {Map<String, Object?>? data}) => log('Action: $action', data: data);

  static void error(String context, Object error, StackTrace stack) {
    debugPrint('[ParksConnect] ${DateTime.now().toIso8601String()} - Error in $context: $error\n$stack');
  }
}
