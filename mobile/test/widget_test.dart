import 'package:flutter_test/flutter_test.dart';
import 'package:parks_connect/main.dart';

void main() {
  testWidgets('App boots to landing screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ParksConnectRoot());
    await tester.pumpAndSettle();

    expect(find.text('Parks Connect'), findsOneWidget);
    expect(find.text('Tourist Feedback'), findsOneWidget);
  });
}
