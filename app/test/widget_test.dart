import 'package:flutter_test/flutter_test.dart';
import 'package:taskkamao/core/validators.dart';

void main() {
  test('UPI validation', () {
    expect(Validators.upi('bhagraj@okaxis'), isNull);
    expect(Validators.upi('bad upi'), isNotNull);
  });
  test('PAN validation', () {
    expect(Validators.pan('ABCDE1234F'), isNull);
    expect(Validators.pan('ABCD1234F'), isNotNull);
  });
  test('Phone validation', () {
    expect(Validators.phone('9876543210'), isNull);
    expect(Validators.phone('1234567890'), isNotNull);
  });
}
