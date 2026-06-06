import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/activity_logger.dart';
import '../services/api_service.dart';
import '../services/app_state.dart';
import '../widgets/app_theme.dart';
import 'field_dashboard_screen.dart';
import 'staff_register_screen.dart';

class StaffLoginScreen extends StatefulWidget {
  const StaffLoginScreen({super.key});

  @override
  State<StaffLoginScreen> createState() => _StaffLoginScreenState();
}

class _StaffLoginScreenState extends State<StaffLoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
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
      setState(() => _error = err.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
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
                      title: 'Staff sign-in',
                      subtitle: 'Coordinate parks, track field data, and respond faster through one connected interface.',
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
                            Text('Login', style: titleStyle),
                            const SizedBox(height: 8),
                            Text(
                              'Use your assigned email and password to access park dashboards.',
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
                                border: OutlineInputBorder(),
                              ),
                              validator: (v) => (v ?? '').trim().isEmpty ? 'Password is required' : null,
                            ),
                            const SizedBox(height: 18),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed: _loading ? null : _login,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppColors.greenDark,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 14),
                                ),
                                child: Text(_loading ? 'Signing in...' : 'Sign in'),
                              ),
                            ),
                            const SizedBox(height: 8),
                            OutlinedButton(
                              onPressed: _loading
                                  ? null
                                  : () {
                                      Navigator.of(context).push(
                                        MaterialPageRoute(builder: (_) => const StaffRegisterScreen()),
                                      );
                                    },
                              style: OutlinedButton.styleFrom(
                                side: BorderSide(color: AppColors.greenDeep.withValues(alpha: 0.35)),
                                foregroundColor: AppColors.greenDeep,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                              ),
                              child: const Text('Create account'),
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
