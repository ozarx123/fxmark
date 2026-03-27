class User {
  final String id;
  final String email;
  final String? name;
  final String role;
  final String? kycStatus;
  final bool profileComplete;
  final bool emailVerified;
  final String? accountNo;
  final DateTime? createdAt;

  User({
    required this.id,
    required this.email,
    this.name,
    this.role = 'user',
    this.kycStatus,
    this.profileComplete = false,
    this.emailVerified = false,
    this.accountNo,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? json['_id'] ?? '',
      email: json['email'] ?? '',
      name: json['name'],
      role: json['role'] ?? 'user',
      kycStatus: json['kycStatus'],
      profileComplete: json['profileComplete'] == true,
      emailVerified: json['emailVerified'] == true,
      accountNo: json['accountNo'],
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'name': name,
        'role': role,
        'kycStatus': kycStatus,
        'profileComplete': profileComplete,
        'emailVerified': emailVerified,
        'accountNo': accountNo,
        'createdAt': createdAt?.toIso8601String(),
      };
}
