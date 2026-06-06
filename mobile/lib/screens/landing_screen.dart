import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/app_state.dart';
import '../services/activity_logger.dart';
import '../widgets/app_theme.dart';
import 'field_dashboard_screen.dart';
import 'staff_login_screen.dart';
import 'select_park_screen.dart';

class LandingScreen extends StatelessWidget {
  const LandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [AppColors.bgGradientStart, AppColors.bgGradientEnd],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),
                Text(
                  'Parks Connect',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        color: AppColors.greenDeep,
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Tourists and field staff can submit feedback, report incidents, and keep parks thriving.',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: AppColors.grayText,
                      ),
                ),
                const SizedBox(height: 24),
                Expanded(
                  child: Consumer<AppState>(
                    builder: (context, state, _) {
                      return GridView.count(
                        crossAxisCount: 1,
                        childAspectRatio: 1.2,
                        mainAxisSpacing: 20,
                        children: [
                          _LandingCard(
                            title: 'Tourist Feedback',
                            subtitle:
                                'Select your park, rate the visit, add photos or report issues.',
                            icon: Icons.favorite_border,
                            builder: (context) => const SelectParkScreen(),
                          ),
                          _LandingCard(
                            title: 'Field Staff',
                            subtitle: state.authToken == null
                                ? 'Login to sync park incidents, wildlife counts, and alerts.'
                                : 'Logged in · Capture incidents, sync offline data.',
                            icon: Icons.shield_outlined,
                            builder: (context) => state.authToken == null
                                ? const StaffLoginScreen()
                                : const FieldDashboardScreen(),
                            footer:
                                'Pending offline items: ${state.pendingCount}',
                          ),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _LandingCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final WidgetBuilder builder;
  final String? footer;

  const _LandingCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.builder,
    this.footer,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        ActivityLogger.navigation(title);
        Navigator.of(context).push(MaterialPageRoute(builder: builder));
      },
      child: Card(
        elevation: 6,
        shadowColor: AppColors.shadowColor,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                backgroundColor: AppColors.green.withValues(alpha: 0.1),
                child: Icon(icon, color: AppColors.greenDeep),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    subtitle,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppColors.grayText,
                        ),
                  ),
                ],
              ),
              Row(
                children: [
                  const Text('Open'),
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_forward, size: 18),
                  if (footer != null) ...[
                    const Spacer(),
                    Text(
                      footer!,
                      style: const TextStyle(
                          fontSize: 10, color: AppColors.grayText),
                    )
                  ]
                ],
              )
            ],
          ),
        ),
      ),
    );
  }
}
