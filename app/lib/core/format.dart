import 'package:intl/intl.dart';

import 'app_config.dart';

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '\u20B9', decimalDigits: 2);
final _num = NumberFormat.decimalPattern('en_IN');
final _date = DateFormat('d MMM yyyy, h:mm a');

String coinsText(num coins) => _num.format(coins);
String rupeesFromCoins(num coins) => _rupee.format(coins / AppConfig.coinsPerRupee);
String rupees(num r) => _rupee.format(r);
String dateText(DateTime? d) => d == null ? '' : _date.format(d.toLocal());

/// Today's date in India (IST) as yyyy-MM-dd - same format the server uses for daily limits.
String istToday() {
  final ist = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
  return '${ist.year.toString().padLeft(4, '0')}-${ist.month.toString().padLeft(2, '0')}-${ist.day.toString().padLeft(2, '0')}';
}
