import { Injectable } from '@nestjs/common';

@Injectable()
export class SmsValidatorHelper {
  // GSM 7-bit basic + extended character set regex
  private readonly gsmBasicRegExp =
    /^[a-zA-Z0-9\s@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞæÆßÉ!"#$%&'()*+,\-./:;<=>?¡¿ÄÖÑÜ§àäöñü\f^{}\[\]~\\|€]*$/;

  // Extended characters that take up 2 bytes/slots in GSM 7-bit encoding
  private readonly gsmExtendedChars = [
    '|',
    '^',
    '{',
    '}',
    '[',
    ']',
    '~',
    '\\',
    '€',
  ];

  /**
   * Sanitizes text to remove or replace common invalid/costly characters
   */
  sanitizeTemplateContent(text: string): string {
    if (!text) return '';
    return text
      .replace(/[“”]/g, '"') // Convert smart double quotes
      .replace(/[‘’]/g, "'") // Convert smart single quotes
      .replace(/\r?\n/g, '\n'); // Normalize line endings
  }

  /**
   * Analyzes text metrics for billing and UI display calculations
   */
  calculateSmsMetrics(text: string) {
    const sanitizedText = this.sanitizeTemplateContent(text);

    // 1. Determine Encoding
    const isGsm = this.gsmBasicRegExp.test(sanitizedText);

    let totalLength = 0;

    if (isGsm) {
      // Count basic characters as 1, extended characters as 2
      for (const char of sanitizedText) {
        totalLength +=
          this.gsmExtendedChars.includes(char) || char === '\f' ? 2 : 1;
      }

      // 2. Calculate segments for GSM
      // Single-part limit: 160. Multi-part splits: 153.
      const segments = totalLength <= 160 ? 1 : Math.ceil(totalLength / 153);

      return {
        encoding: 'GSM_7BIT',
        characterCount: totalLength,
        smsParts: segments,
        maxLengthForCurrentParts: segments === 1 ? 160 : segments * 153,
      };
    } else {
      // Unicode Encoding handles length uniformly by character count
      totalLength = sanitizedText.length;

      // Calculate segments for Unicode
      // Single-part limit: 70. Multi-part splits: 67.
      const segments = totalLength <= 70 ? 1 : Math.ceil(totalLength / 67);

      return {
        encoding: 'UNICODE',
        characterCount: totalLength,
        smsParts: segments,
        maxLengthForCurrentParts: segments === 1 ? 70 : segments * 67,
      };
    }
  }
}
