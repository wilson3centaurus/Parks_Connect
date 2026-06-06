import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/activity_logger.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../widgets/app_theme.dart';
import 'field_dashboard_screen.dart';

class StaffRegisterScreen extends StatefulWidget {
  const StaffRegisterScreen({super.key});

  @override
  State<StaffRegisterScreen> createState() => _StaffRegisterScreenState();
}

class _StaffRegisterScreenState extends State<StaffRegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _parkId = TextEditingController();
  final _password = TextEditingController();
  final _confirmPassword = TextEditingController();
  final _adminKey = TextEditingController();

  static const _roles = <String, String>{
    'authority_admin': 'Authority Admin',
    'environment_officer': 'Environment Officer',
    'tourism_operator': 'Tourism Operator',
  };

  String _role = 'environment_officer';
  bool _loading = false;
  String? _error;

  bool get _parkIdRequired => _role == 'environment_officer' || _role == 'tourism_operator';

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _parkId.dispose();
    _password.dispose();
    _confirmPassword.dispose();
    _adminKey.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final api = context.read<ApiService>();
      final state = context.read<AppState>();
      final parkId = _parkId.text.trim().isEmpty ? null : int.tryParse(_parkId.text.trim());

      final resp = await api.selfRegister(
        name: _name.text.trim(),
        email: _email.text.trim().toLowerCase(),
        password: _password.text.trim(),
        role: _role,
        itAdminKey: _adminKey.text.trim(),
        parkId: parkId,
      );

      final token = resp['token'] as String;
      final parks = await api.fetchParks(token: token, assignedOnly: true);
      final activeParkId = parks.isNotEmpty ? parks.first['id'] as int? : null;
      await state.setSession(
        token: token,
        parks: parks,
        parkId: activeParkId,
        user: resp['user'] as Map<String, dynamic>?,
      );
      ActivityLogger.action('Staff self register', data: {'role': _role, 'parks': parks.length});
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const FieldDashboardScreen()));
    } catch (err) {
      ActivityLogger.error('staff self register', err, StackTrace.current);
      setState(() => _error = err.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _isStrongPassword(String value) {
    if (value.length < 8) return false;
    final hasLetter = RegExp(r'[A-Za-z]').hasMatch(value);
    final hasNumber = RegExp(r'\d').hasMatch(value);
    return hasLetter && hasNumber;
  }

  @override
  Widget build(BuildContext context) {
    final titleStyle = Theme.of(context).textTheme.titleLarge?.copyWith(
          color: AppColors.textDark,
          fontWeight: FontWeight.w700,
        );

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF06211A), Color(0xFF0D3B2F)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _AuthHeroCard(
                      title: 'Create account',
                      subtitle: 'Same registration procedure as web portal, including role, park assignment, and IT admin key.',
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.97),
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Staff Registration', style: titleStyle),
                            const SizedBox(height: 8),
                            Text(
                              'Create a role-scoped account for the staff portal.',
                              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppColors.grayText),
                            ),
                            const SizedBox(height: 14),
                            if (_error != null)
                              Container(
                                width: double.infinity,
                                margin: const EdgeInsets.only(bottom: 10),
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFDE7E5),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(_error!, style: const TextStyle(color: Color(0xFFB42318))),
                              ),
                            TextFormField(
                              controller: _name,
                              decoration: const InputDecoration(labelText: 'Full name', border: OutlineInputBorder()),
                              validator: (v) {
                                final value = (v ?? '').trim();
                                if (value.length < 2) return 'Full name must be at least 2 characters';
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            DropdownButtonFormField<String>(
                              initialValue: _role,
                              decoration: const InputDecoration(labelText: 'Role', border: OutlineInputBorder()),
                              items: _roles.entries
                                  .map((entry) => DropdownMenuItem<String>(
                                        value: entry.key,
                                        child: Text(entry.value),
                                      ))
                                  .toList(),
                              onChanged: (value) {
                                if (value == null) return;
                                setState(() => _role = value);
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _parkId,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: 'Park ID',
                                hintText: 'Required for officer/operator',
                                border: OutlineInputBorder(),
                              ),
                              validator: (v) {
                                final value = (v ?? '').trim();
                                if (_parkIdRequired && value.isEmpty) return 'Park ID is required for this role';
                                if (value.isNotEmpty && int.tryParse(value) == null) return 'Park ID must be a number';
                                if (value.isNotEmpty && (int.tryParse(value) ?? 0) < 1) return 'Park ID must be at least 1';
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _email,
                              keyboardType: TextInputType.emailAddress,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                hintText: 'name@parksconnect.local',
                                border: OutlineInputBorder(),
                              ),
                              validator: (v) {
                                final value = (v ?? '').trim().toLowerCase();
                                if (value.isEmpty) return 'Email is required';
                                final isEmail = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value);
                                if (!isEmail) return 'Enter a valid email address';
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _password,
                              obscureText: true,
                              decoration: const InputDecoration(
                                labelText: 'Password',
                                hintText: 'At least 8 characters, letters + numbers',
                                border: OutlineInputBorder(),
                              ),
                              validator: (v) {
                                final value = (v ?? '').trim();
                                if (!_isStrongPassword(value)) {
                                  return 'Password must be 8+ chars with letters and numbers';
                                }
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _confirmPassword,
                              obscureText: true,
                              decoration: const InputDecoration(labelText: 'Confirm password', border: OutlineInputBorder()),
                              validator: (v) {
                                if ((v ?? '').trim() != _password.text.trim()) return 'Passwords do not match';
                                return null;
                              },
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _adminKey,
                              obscureText: true,
                              decoration: const InputDecoration(labelText: 'IT admin key', border: OutlineInputBorder()),
                              validator: (v) => (v ?? '').trim().isEmpty ? 'IT admin key is required' : null,
                            ),
                            const SizedBox(height: 18),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: _loading ? null : _register,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.greenDark,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                ),
                                child: Text(_loading ? 'Creating account...' : 'Create account'),
                              ),
                            ),
                            TextButton(
                              onPressed: _loading ? null : () => Navigator.of(context).pop(),
                              child: const Text('Back to staff login'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AuthHeroCard extends StatelessWidget {
  const _AuthHeroCard({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          colors: [Color(0xAAFFFFFF), Color(0x55FFFFFF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
                ),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'ZimParks | Parks Connect',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Image.asset(
              'assets/images/login-hero.png',
              height: 130,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: const TextStyle(
              color: Color(0xE6FFFFFF),
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
