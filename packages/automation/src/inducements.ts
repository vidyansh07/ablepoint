/**
 * Inducement and rating-steering lint (guardrail G-02; docs/09 A8, A12).
 * Returns labels only, never the surrounding text.
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/\b(reward|rewards|rewarded)\b/i, 'reward'],
  [/\bgifts?\b/i, 'gift'],
  [/\bvouchers?\b/i, 'voucher'],
  [/\bdiscount(s|ed)?\b/i, 'discount'],
  [/\bcoupons?\b/i, 'coupon'],
  [/\b(prize|prizes|raffle|giveaway|lottery|sweepstake)\b/i, 'prize'],
  [/\bbonus(es)?\b/i, 'bonus'],
  [/\bcash(back)?\b/i, 'cash'],
  [/\b\d+\s?% off\b/i, 'percent_off'],
  [/\$\s?\d+/, 'dollar_amount'],
  [/\bin (return|exchange)\b/i, 'quid_pro_quo'],
  [/\bincentives?\b/i, 'incentive'],
  [/\brefer a friend\b/i, 'refer_a_friend'],
  [/\benter(ed)? (to|into) (win|the draw)\b/i, 'draw_entry'],
  [/(?<!feel )\bfree\b(?! to\b)/i, 'free'],
  // Steering: only asking for favourable reviews is not a compliant review request.
  [/\b(5|five)[- ]star\b/i, 'rating_steering'],
  [/\b(positive|good|glowing|great) (review|feedback|rating)s?\b/i, 'rating_steering'],
];

export function findInducements(text: string): string[] {
  const found = new Set<string>();
  for (const [re, label] of PATTERNS) if (re.test(text)) found.add(label);
  return [...found];
}
