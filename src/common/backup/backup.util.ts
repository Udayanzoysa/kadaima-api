import * as XLSX from 'xlsx';

export type Localized = { en: string; si: string; ta: string };

export function asLocalized(value: unknown, fallbackEn = ''): Localized {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      en: typeof o.en === 'string' ? o.en : fallbackEn,
      si: typeof o.si === 'string' ? o.si : '',
      ta: typeof o.ta === 'string' ? o.ta : '',
    };
  }
  if (typeof value === 'string') {
    return { en: value, si: '', ta: '' };
  }
  return { en: fallbackEn, si: '', ta: '' };
}

export function workbookToBuffer(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function sheetToRows(sheet: XLSX.WorkSheet): Record<string, string>[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      out[String(key).trim()] = value == null ? '' : String(value).trim();
    }
    return out;
  });
}

export function parseJsonBuffer(buffer: Buffer): unknown {
  return JSON.parse(buffer.toString('utf8'));
}

export function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'buffer' });
}

export function jsonDownload(
  payload: unknown,
  filename: string,
): { buffer: Buffer; contentType: string; filename: string } {
  return {
    buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    contentType: 'application/json; charset=utf-8',
    filename,
  };
}

export function xlsxDownload(
  workbook: XLSX.WorkBook,
  filename: string,
): { buffer: Buffer; contentType: string; filename: string } {
  return {
    buffer: workbookToBuffer(workbook),
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename,
  };
}
