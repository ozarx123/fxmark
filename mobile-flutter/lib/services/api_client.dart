import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class ApiClient {
  final http.Client _client;
  String? _token;

  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  void setToken(String? token) => _token = token;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Future<Map<String, dynamic>> get(String path) async {
    final res = await _client
        .get(Uri.parse('${ApiConfig.baseUrl}$path'), headers: _headers)
        .timeout(ApiConfig.timeout);
    return _handle(res);
  }

  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) async {
    final res = await _client
        .post(Uri.parse('${ApiConfig.baseUrl}$path'),
            headers: _headers, body: body != null ? jsonEncode(body) : null)
        .timeout(ApiConfig.timeout);
    return _handle(res);
  }

  Future<List<dynamic>> getList(String path) async {
    final res = await _client
        .get(Uri.parse('${ApiConfig.baseUrl}$path'), headers: _headers)
        .timeout(ApiConfig.timeout);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      final decoded = jsonDecode(res.body);
      if (decoded is List) return decoded;
      if (decoded is Map && decoded.containsKey('data')) return decoded['data'] as List;
      return [];
    }
    debugPrint('[API] ${res.statusCode}: ${res.body}');
    return [];
  }

  Map<String, dynamic> _handle(http.Response res) {
    final body = jsonDecode(res.body);
    if (body is Map<String, dynamic>) return body;
    return {'data': body};
  }
}
