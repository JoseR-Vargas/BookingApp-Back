import { DEFAULT_COLORS } from './branding';
import { BRANDING_MESSAGES, InvalidBrandingError } from './branding.errors';
import {
  MAX_LOGO_BYTES,
  completeColors,
  contrastRatio,
  validateBranding,
  validateLogo,
} from './branding.rules';
import { InvalidLogoError } from './branding.errors';
import { Result } from '../../shared/domain/result';

/** The value of a result that must have succeeded (fails the test otherwise). */
const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(`expected Ok, got Err: ${result.error.message}`);
  }
  return result.value;
};

/** A rule must answer an Err of that class with exactly the message, and never throw. */
const rejects = (
  fn: () => Result<unknown>,
  message: string,
  error: new (...args: never[]) => unknown = InvalidBrandingError,
) => {
  const result = fn();
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(error);
    expect(result.error.message).toBe(message);
  }
};

/** Every rejection is a validation DomainError. */
const kindOf = (fn: () => Result<unknown>) => {
  const result = fn();
  return result.ok ? undefined : result.error.kind;
};

const validColors = () => ({
  accent: '#c9a96e',
  background: '#0d0d0d',
  text: '#f5f0e8',
  button: null as string | null,
});

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')];

/** Image-like bytes: the magic header padded with zeros to `size` bytes. */
const image = (header: number[], size = 64): Buffer => {
  const bytes = Buffer.alloc(size);
  Buffer.from(header).copy(bytes);
  return bytes;
};

describe('contrastRatio (WCAG 2.1 relative luminance)', () => {
  it.each([
    ['#ffffff', '#000000', 21],
    ['#000000', '#ffffff', 21],
    ['#777777', '#777777', 1],
  ])('%s vs %s = %p', (a, b, ratio) => {
    expect(contrastRatio(a, b)).toBeCloseTo(ratio, 5);
  });

  it('matches known reference values', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#777777', '#888888')).toBeCloseTo(1.26, 2);
  });
});

describe('validateBranding', () => {
  it('accepts the defaults without button', () => {
    expect(
      valueOf(validateBranding({ businessName: null, colors: validColors() })),
    ).toEqual({ businessName: null, colors: validColors() });
  });

  it('accepts an button and stores every color lowercase', () => {
    expect(
      valueOf(
        validateBranding({
          businessName: 'Barbería Don Pepe',
          colors: {
            accent: '#C9A96E',
            background: '#0D0D0D',
            text: '#F5F0E8',
            button: '#E0C08A',
          },
        }),
      ),
    ).toEqual({
      businessName: 'Barbería Don Pepe',
      colors: {
        accent: '#c9a96e',
        background: '#0d0d0d',
        text: '#f5f0e8',
        button: '#e0c08a',
      },
    });
  });

  it('treats an absent button as null', () => {
    const colors: Record<string, unknown> = validColors();
    delete colors.button;
    expect(valueOf(validateBranding({ colors })).colors.button).toBeNull();
  });

  it.each(['accent', 'background', 'text'] as const)(
    'rejects a missing %s',
    (field) => {
      const colors: Record<string, unknown> = validColors();
      delete colors[field];
      rejects(
        () => validateBranding({ colors }),
        BRANDING_MESSAGES.requiredColor[field],
      );
    },
  );

  it('rejects missing colors altogether', () => {
    rejects(
      () => validateBranding({ businessName: 'x', colors: {} }),
      BRANDING_MESSAGES.requiredColor.accent,
    );
  });

  it('accepts the default colors', () => {
    expect(
      valueOf(validateBranding({ colors: { ...DEFAULT_COLORS } })).colors,
    ).toEqual(DEFAULT_COLORS);
  });

  it.each(['#fff', 'c9a96e', '#c9a96g', '#c9a96e0', 'red', 12, ''])(
    'rejects the malformed color %p',
    (bad) => {
      for (const field of ['accent', 'background', 'text', 'button'] as const) {
        rejects(
          () =>
            validateBranding({ colors: { ...validColors(), [field]: bad } }),
          BRANDING_MESSAGES.invalidColor[field],
        );
      }
    },
  );

  it('rejects text that does not reach 4.5:1 against the background', () => {
    rejects(
      () =>
        validateBranding({
          colors: { ...validColors(), text: '#777777', background: '#888888' },
        }),
      'El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).',
    );
    rejects(
      () =>
        validateBranding({
          colors: {
            accent: '#000000',
            text: '#777777',
            background: '#ffffff',
            button: null,
          },
        }),
      BRANDING_MESSAGES.textContrast,
    );
    expect(
      valueOf(
        validateBranding({
          colors: {
            accent: '#000000',
            text: '#767676',
            background: '#ffffff',
            button: null,
          },
        }),
      ).colors.text,
    ).toBe('#767676');
  });

  it('rejects an accent that does not reach 3:1 against the background', () => {
    rejects(
      () =>
        validateBranding({ colors: { ...validColors(), accent: '#222222' } }),
      'El acento no contrasta lo suficiente con el fondo (mínimo 3:1).',
    );
    const light = { text: '#000000', background: '#ffffff' };
    rejects(
      () =>
        validateBranding({
          colors: { ...light, accent: '#959595', button: null },
        }),
      BRANDING_MESSAGES.accentContrast,
    );
    expect(
      valueOf(
        validateBranding({
          colors: { ...light, accent: '#949494', button: null },
        }),
      ).colors.accent,
    ).toBe('#949494');
  });

  it('accepts a button color below 3:1 against the background, down to 2:1 (the label is what must be readable)', () => {
    const colors = {
      ...validColors(),
      background: '#111111',
      button: '#295294',
    };
    expect(valueOf(validateBranding({ colors })).colors.button).toBe('#295294');
  });

  it('rejects a button that does not reach 2:1 against the background', () => {
    rejects(
      () =>
        validateBranding({
          colors: { ...validColors(), button: '#222222' },
        }),
      'El color de los botones no contrasta lo suficiente con el fondo (mínimo 2:1).',
    );
  });

  it('trims the business name; empty or blank becomes null', () => {
    const parse = (businessName: unknown) =>
      valueOf(validateBranding({ businessName, colors: validColors() }))
        .businessName;
    expect(parse('  Don Pepe  ')).toBe('Don Pepe');
    expect(parse('')).toBeNull();
    expect(parse('    ')).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse(undefined)).toBeNull();
  });

  it('accepts 60 characters and rejects 61', () => {
    const parse = (businessName: unknown) =>
      valueOf(validateBranding({ businessName, colors: validColors() }))
        .businessName;
    expect(parse('a'.repeat(60))).toBe('a'.repeat(60));
    expect(parse(`  ${'a'.repeat(60)}  `)).toBe('a'.repeat(60));
    rejects(
      () =>
        validateBranding({
          businessName: 'a'.repeat(61),
          colors: validColors(),
        }),
      'El nombre del negocio puede tener hasta 60 caracteres.',
    );
  });

  it('rejects a business name that is not text', () => {
    rejects(
      () => validateBranding({ businessName: 42, colors: validColors() }),
      BRANDING_MESSAGES.invalidBusinessName,
    );
  });

  it('checks the name before the colors', () => {
    rejects(
      () => validateBranding({ businessName: 'a'.repeat(61), colors: {} }),
      BRANDING_MESSAGES.businessNameTooLong,
    );
  });

  it('raises validation domain errors, never HTTP exceptions', () => {
    expect(kindOf(() => validateBranding({ colors: {} }))).toBe('validation');
  });
});

describe('validateLogo', () => {
  const LOGO = 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.';
  const reject = (mime: string, bytes: Buffer) =>
    rejects(() => validateLogo(mime, bytes), LOGO, InvalidLogoError);

  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/webp', WEBP],
  ])('accepts a %s whose bytes match', (mime, header) => {
    const bytes = image(header);
    const logo = valueOf(validateLogo(mime, bytes));
    expect(logo.mimeType).toBe(mime);
    expect(Buffer.compare(logo.data, bytes)).toBe(0);
  });

  it('accepts exactly 200 KB and rejects one byte more', () => {
    expect(MAX_LOGO_BYTES).toBe(200 * 1024);
    expect(
      valueOf(validateLogo('image/png', image(PNG, MAX_LOGO_BYTES))).data
        .length,
    ).toBe(MAX_LOGO_BYTES);
    reject('image/png', image(PNG, MAX_LOGO_BYTES + 1));
  });

  it('rejects an SVG, by type and disguised as a PNG', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    reject('image/svg+xml', svg);
    reject('image/png', svg);
  });

  it('rejects a ".png" that is not a PNG', () => {
    reject('image/png', Buffer.from('hello'));
  });

  it('rejects bytes that disagree with the declared type', () => {
    reject('image/png', image(JPEG));
    reject('image/webp', image(PNG));
  });

  it('rejects a RIFF file that is not WebP', () => {
    reject(
      'image/webp',
      image([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]),
    );
  });

  it('rejects an empty file', () => {
    reject('image/png', Buffer.alloc(0));
  });

  it('raises a validation domain error', () => {
    expect(kindOf(() => validateLogo('image/gif', Buffer.alloc(3)))).toBe(
      'validation',
    );
  });
});

describe('completeColors', () => {
  it('answers the defaults when there is nothing stored', () => {
    expect(completeColors(undefined)).toEqual(DEFAULT_COLORS);
    expect(completeColors(undefined)).not.toBe(DEFAULT_COLORS);
  });

  it('keeps the stored colors', () => {
    expect(
      completeColors({
        accent: '#111111',
        background: '#222222',
        text: '#333333',
        button: '#444444',
      }),
    ).toEqual({
      accent: '#111111',
      background: '#222222',
      text: '#333333',
      button: '#444444',
    });
  });

  it('a color saved before the button existed: buttons follow the accent (button null)', () => {
    expect(
      completeColors({
        accent: '#c9a96e',
        background: '#0d0d0d',
        text: '#f5f0e8',
      }),
    ).toEqual({
      accent: '#c9a96e',
      background: '#0d0d0d',
      text: '#f5f0e8',
      button: null,
    });
  });

  it('ignores keys that are not colors', () => {
    const legacy = {
      accent: '#c9a96e',
      background: '#0d0d0d',
      text: '#f5f0e8',
      accentSecondary: '#dfc08a',
    };
    expect(completeColors(legacy)).not.toHaveProperty('accentSecondary');
  });
});
