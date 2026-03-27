import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/user.dart';

class AuthResult {
  final bool success;
  final User? user;
  final String? accessToken;
  final String? refreshToken;
  final String? error;
  final bool requiresEmailVerification;

  AuthResult({
    required this.success,
    this.user,
    this.accessToken,
    this.refreshToken,
    this.error,
    this.requiresEmailVerification = false,
  });
}

class AuthService {
  final String baseUrl;
  final http.Client _client;

  AuthService({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  Future<AuthResult> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _client
          .post(
            Uri.parse('$baseUrl/auth/login'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(const Duration(seconds: 15));

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode == 200) {
        return AuthResult(
          success: true,
          user: data['user'] != null ? User.fromJson(data['user']) : null,
          accessToken: data['accessToken'],
          refreshToken: data['refreshToken'],
        );
      }

      if (response.statusCode == 403) {
        final code = data['code'] ?? '';
        final msg = (data['error'] ?? data['message'] ?? '').toString().toLowerCase();
        if (code == 'EMAIL_NOT_VERIFIED' || msg.contains('verif')) {
          return AuthResult(
            success: false,
            error: 'Please verify your email before logging in.',
            requiresEmailVerification: true,
          );
        }
      }

      return AuthResult(
        success: false,
        error: data['error'] ?? data['message'] ?? 'Login failed',
      );
    } catch (e) {
      debugPrint('[AuthService] login error: $e');
      return AuthResult(success: false, error: _friendlyError(e));
    }
  }

  Future<AuthResult> register({
    required String email,
    required String password,
    String? name,
    String? phone,
    String? ref,
  }) async {
    try {
      final body = <String, dynamic>{
        'email': email,
        'password': password,
      };
      if (name != null && name.trim().isNotEmpty) body['name'] = name.trim();
      if (phone != null && phone.trim().isNotEmpty) body['phone'] = phone.trim();
      if (ref != null && ref.trim().isNotEmpty) body['ref'] = ref.trim();

      final response = await _client
          .post(
            Uri.parse('$baseUrl/auth/signup'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 15));

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode == 201 || response.statusCode == 200) {
        return AuthResult(
          success: true,
          user: data['user'] != null ? User.fromJson(data['user']) : null,
          accessToken: data['accessToken'],
          refreshToken: data['refreshToken'],
          requiresEmailVerification:
              data['requiresEmailVerification'] == true,
        );
      }

      return AuthResult(
        success: false,
        error: data['error'] ?? data['message'] ?? 'Registration failed',
      );
    } catch (e) {
      debugPrint('[AuthService] register error: $e');
      return AuthResult(success: false, error: _friendlyError(e));
    }
  }

  Future<Map<String, dynamic>?> getMe(String token) async {
    try {
      final response = await _client.get(
        Uri.parse('$baseUrl/auth/me'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        return jsonDecode(response.body) as Map<String, dynamic>;
      }
      return null;
    } catch (e) {
      debugPrint('[AuthService] getMe error: $e');
      return null;
    }
  }

  String _friendlyError(dynamic e) {
    final msg = e.toString();
    if (msg.contains('SocketException') || msg.contains('Connection refused')) {
      return 'Cannot reach the server. Please check your connection.';
    }
    if (msg.contains('TimeoutException')) {
      return 'Server took too long to respond. Please try again.';
    }
    return 'Something went wrong. Please try again.';
  }
}
