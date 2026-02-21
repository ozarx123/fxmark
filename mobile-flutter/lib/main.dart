
import 'package:flutter/material.dart';

void main() {
  runApp(const FXMarkApp());
}

class FXMarkApp extends StatelessWidget {
  const FXMarkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(
      home: Scaffold(
        body: Center(child: Text('FXMARK Mobile App')),
      ),
    );
  }
}
