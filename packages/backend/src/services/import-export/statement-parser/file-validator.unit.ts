import { describe, expect, it } from '@jest/globals';

import { validateFileBuffer } from './file-validator';

describe('validateFileBuffer', () => {
  it('accepts valid UTF-8 text pasted from a broker statement', () => {
    const buffer = Buffer.from(
      'Data;Descrizione;Quantità;Prezzo\n2026-01-15;Acquisto Société Générale;2;100,50 €',
      'utf8',
    );

    const result = validateFileBuffer({ buffer });

    expect(result).toMatchObject({ valid: true, fileType: 'csv', fileBuffer: buffer });
  });

  it('rejects binary data that is not a supported statement format', () => {
    const buffer = Buffer.concat([Buffer.from([0, 1, 2, 3, 255]), Buffer.alloc(20, 0)]);

    const result = validateFileBuffer({ buffer });

    expect(result).toMatchObject({
      valid: false,
      error: { code: 'UNSUPPORTED_TYPE' },
    });
  });
});
