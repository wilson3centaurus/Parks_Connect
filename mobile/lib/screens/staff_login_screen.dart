import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/activity_logger.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import 'field_dashboard_screen.dart';

class StaffLoginScreen extends StatefulWidget {
  const StaffLoginScreen({super.key});

  @override
  State<StaffLoginScreen> createState() => _StaffLoginScreenState();
}

class _StaffLoginScreenState extends State<StaffLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController(text: 'officer1@parksconnect.local');
  final _password = TextEditingController(text: 'env12345');
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>();
      final state = context.read<AppState>();
      final resp = await api.login(_email.text.trim(), _password.text.trim());
      final token = resp['token'] as String;
      final parks = await api.fetchParks(token: token, assignedOnly: true);
      final parkId = parks.isNotEmpty ? parks.first['id'] as int? : null;
      await state.setSession(token: token, parks: parks, parkId: parkId, user: resp['user'] as Map<String, dynamic>?);
      ActivityLogger.action('Staff login', data: {'parks': parks.length});
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const FieldDashboardScreen()));
    } catch (err) {
      ActivityLogger.error('staff login', err, StackTrace.current);
      setState(() => _error = 'Login failed. Check credentials or connectivity.');
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Staff Login')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Sign in', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('Access park-specific dashboards, alerts, and offline sync.',
                  style: Theme.of(context).textTheme.bodyMedium),
              const SizedBox(height: 16),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
              TextFormField(
                controller: _email,
                decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
                validator: (v) => v == null || v.isEmpty ? 'Required' : null,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading ? null : _login,
                  child: Text(_loading ? 'Signing in...' : 'Sign in'),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }
}
