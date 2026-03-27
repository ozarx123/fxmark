import 'package:flutter/foundation.dart' show kIsWeb;

class ApiConfig {
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:3000/api';
    return 'http://10.0.2.2:3000/api';
  }

  static const Duration timeout = Duration(seconds: 15);
}
