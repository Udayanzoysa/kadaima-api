import { BadRequestException } from '@nestjs/common';

/**
 * Validates and normalizes Sri Lankan mobile numbers.
 * Allowed formats:
 * - Domestic: 0771234567 -> 94771234567
 * - International: +94771234567 or 94771234567 -> 94771234567
 * - Short (Local): 771234567 -> 94771234567
 * 
 * Valid operator codes: 70, 71, 72, 74, 75, 76, 77, 78
 */
export function validateAndCleanSriLankanNumber(phone: string): string {
  if (!phone) {
    throw new BadRequestException('Phone number is required');
  }

  // Strip all spaces, dashes, parentheses, plus sign and non-alphanumeric chars
  const sanitized = phone.replace(/[^\d+]/g, '');

  // Combined Regex for Sri Lankan mobile numbers: ^(?:0|94|\+94)?(7[01245678]\d{7})$
  const match = sanitized.match(/^(?:0|94|\+94)?(7[01245678]\d{7})$/);
  if (!match) {
    throw new BadRequestException(
      `Invalid Sri Lankan mobile number: "${phone}". Must be a valid mobile number starting with 07, 947, +947, or 7 with operator codes: 70, 71, 72, 74, 75, 76, 77, 78.`,
    );
  }

  // Save format: 94 + captured subscriber number
  return '94' + match[1];
}
