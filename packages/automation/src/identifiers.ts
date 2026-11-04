/**
 * Detects text that looks like a nine-digit NDIS participant number (digits may be separated by single spaces or hyphens).
 * Heuristic used to keep identifiers out of messages, vacancy copy and LLM prompts. Returns a boolean only: never the match.
 * Longer digit runs (e.g. ten-digit phone numbers) are not treated as NDIS-number-like.
 */
const NINE_DIGITS = /(?<!\d)(?:\d[\s-]?){8}\d(?!\d)/;

export function containsNdisNumberLike(text: string): boolean {
  return NINE_DIGITS.test(text);
}
