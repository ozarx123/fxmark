import 'package:flutter/material.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import '../services/token_storage.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthProvider extends ChangeNotifier {
  final AuthService _authService;
  final TokenStorage _tokenStorage;

  AuthStatus _status = AuthStatus.unknown;
  User? _user;
  String? _token;
  bool _loading = false;
  String? _error;

  AuthProvider({
    required AuthService authService,
    TokenStorage? tokenStorage,
  })  : _authService = authService,
        _tokenStorage = tokenStorage ?? TokenStorage();

  AuthStatus get status => _status;
  User? get user => _user;
  String? get token => _token;
  bool get loading => _loading;
  String? get error => _error;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  Future<void> tryAutoLogin() async {
    final storedToken = await _tokenStorage.getAccessToken();
    final storedUser = await _tokenStorage.getUser();

    if (storedToken != null && storedUser != null) {
      _token = storedToken;
      _user = storedUser;
      _status = AuthStatus.authenticated;
    } else {
      _status = AuthStatus.unauthenticated;
    }
    notifyListeners();
  }

  Future<bool> login({
    required String email,
    required String password,
  }) async {
    _loading = true;
    _error = null;
    notifyListeners();

    final result = await _authService.login(
      email: email,
      password: password,
    );

    _loading = false;

    if (result.success && result.accessToken != null) {
      _user = result.user;
      _token = result.accessToken;
      _status = AuthStatus.authenticated;
      await _tokenStorage.saveTokens(
        accessToken: result.accessToken!,
        refreshToken: result.refreshToken,
      );
      if (result.user != null) {
        await _tokenStorage.saveUser(result.user!);
      }
      notifyListeners();
      return true;
    }

    _error = result.error ?? 'Login failed';
    _status = AuthStatus.unauthenticated;
    notifyListeners();
    return false;
  }

  Future<bool> register({
    required String email,
    required String password,
    String? name,
    String? phone,
  }) async {
    _loading = true;
    _error = null;
    notifyListeners();

    final result = await _authService.register(
      email: email,
      password: password,
      name: name,
      phone: phone,
    );

    _loading = false;

    if (result.success && result.accessToken != null) {
      _user = result.user;
      _token = result.accessToken;
      _status = AuthStatus.authenticated;
      await _tokenStorage.saveTokens(
        accessToken: result.accessToken!,
        refreshToken: result.refreshToken,
      );
      if (result.user != null) {
        await _tokenStorage.saveUser(result.user!);
      }
      notifyListeners();
      return true;
    }

    _error = result.error ?? 'Registration failed';
    notifyListeners();
    return false;
  }

  Future<void> logout() async {
    _user = null;
    _token = null;
    _status = AuthStatus.unauthenticated;
    _error = null;
    await _tokenStorage.clear();
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}
