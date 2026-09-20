import { parseDecimalAmount } from './parse-decimal-amount';

/**
 * Parse amount string and return numeric value in cents (integer)
 * Supports various formats: 1234.56, 1,234.56, -1234.56, (1234.56), 1234.56-
 *
 * Digits and separators are read by `parseDecimalAmount`, so a lone separator before exactly
 * three digits (`1,234`, `1.500`) is ambiguous and returns null rather than a guessed value.
 */
export function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;

  // Banks export U+2212 minus, en/em dashes, and other hyphen look-alikes as the sign
  const dashes = '\\u2010-\\u2015\\u2212\\uFE63\\uFF0D';
  let cleanStr = amountStr
    .trim()
    .replace(new RegExp(`^[${dashes}]`), '-')
    .replace(new RegExp(`[${dashes}]$`), '-');

  // Handle parentheses as negative (accounting format)
  const isNegativeParens = cleanStr.startsWith('(') && cleanStr.endsWith(')');
  if (isNegativeParens) {
    cleanStr = cleanStr.slice(1, -1);
  }

  // Handle explicit negative sign, leading or trailing (`100-`)
  const isNegativeSign = cleanStr.startsWith('-') || cleanStr.endsWith('-');
  if (isNegativeSign) {
    cleanStr = cleanStr.replace(/^-|-$/g, '');
  }

  // Handle explicit positive sign
  if (cleanStr.startsWith('+')) {
    cleanStr = cleanStr.slice(1);
  }

  // Remove currency symbols and spaces
  cleanStr = cleanStr.replace(/[$€£¥₴₽\s]/g, '');

  const parsed = parseDecimalAmount({ raw: cleanStr });

  if (parsed === null) {
    return null;
  }

  // Apply negative sign
  const finalValue = isNegativeParens || isNegativeSign ? -parsed : parsed;

  // Convert to cents (integer) - amounts are stored as integers in the system
  // Multiply by 100 and round to avoid floating point issues
  return Math.round(finalValue * 100);
}
