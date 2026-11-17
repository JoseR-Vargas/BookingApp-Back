import { BadRequestException } from '@nestjs/common';
import {
  BRANDING_MESSAGES,
  MAX_LOGO_BYTES,
  contrastRatio,
  parseBrandingInput,
  parseLogoDataUrl,
} from './branding-validation';
import { DEFAULT_COLORS } from './schemas/branding.schema';

const rejects = (fn: () => unknown, message: string | RegExp) => {
  expect(fn).toThrow(BadRequestException);
  expect(fn).toThrow(message);
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

const dataUrl = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString('base64')}`;

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

describe('parseBrandingInput', () => {
  it('accepts the defaults without button', () => {
    expect(
      parseBrandingInput({ businessName: null, colors: validColors() }),
    ).toEqual({ businessName: null, colors: validColors() });
  });

  it('accepts an button and stores every color lowercase', () => {
    expect(
      parseBrandingInput({
        businessName: 'Barbería Don Pepe',
        colors: {
          accent: '#C9A96E',
          background: '#0D0D0D',
          text: '#F5F0E8',
          button: '#E0C08A',
        },
      }),
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
    expect(parseBrandingInput({ colors }).colors.button).toBeNull();
  });

  it.each(['accent', 'background', 'text'] as const)(
    'rejects a missing %s',
    (field) => {
      const colors: Record<string, unknown> = validColors();
      delete colors[field];
      rejects(
        () => parseBrandingInput({ colors }),
        BRANDING_MESSAGES.requiredColor[field],
      );
    },
  );

  it('rejects missing colors altogether', () => {
    rejects(
      () => parseBrandingInput({ businessName: 'x' }),
      BRANDING_MESSAGES.requiredColor.accent,
    );
    rejects(() => parseBrandingInput(null), BRANDING_MESSAGES.invalidBody);
    rejects(() => parseBrandingInput([]), BRANDING_MESSAGES.invalidBody);
  });

  it('accepts the default colors', () => {
    expect(
      parseBrandingInput({ colors: { ...DEFAULT_COLORS } }).colors,
    ).toEqual(DEFAULT_COLORS);
  });

  it.each(['#fff', 'c9a96e', '#c9a96g', '#c9a96e0', 'red', 12, ''])(
    'rejects the malformed color %p',
    (bad) => {
      for (const field of ['accent', 'background', 'text', 'button'] as const) {
        rejects(
          () =>
            parseBrandingInput({ colors: { ...validColors(), [field]: bad } }),
          BRANDING_MESSAGES.invalidColor[field],
        );
      }
    },
  );

  it('rejects text that does not reach 4.5:1 against the background', () => {
    rejects(
      () =>
        parseBrandingInput({
          colors: { ...validColors(), text: '#777777', background: '#888888' },
        }),
      'El texto no contrasta lo suficiente con el fondo (mínimo 4.5:1).',
    );
    rejects(
      () =>
        parseBrandingInput({
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
      parseBrandingInput({
        colors: {
          accent: '#000000',
          text: '#767676',
          background: '#ffffff',
          button: null,
        },
      }).colors.text,
    ).toBe('#767676');
  });

  it('rejects an accent that does not reach 3:1 against the background', () => {
    rejects(
      () =>
        parseBrandingInput({ colors: { ...validColors(), accent: '#222222' } }),
      'El acento no contrasta lo suficiente con el fondo (mínimo 3:1).',
    );
    const light = { text: '#000000', background: '#ffffff' };
    rejects(
      () =>
        parseBrandingInput({
          colors: { ...light, accent: '#959595', button: null },
        }),
      BRANDING_MESSAGES.accentContrast,
    );
    expect(
      parseBrandingInput({
        colors: { ...light, accent: '#949494', button: null },
      }).colors.accent,
    ).toBe('#949494');
  });

  it('accepts a button color below 3:1 against the background, down to 2:1 (the label is what must be readable)', () => {
    const colors = {
      ...validColors(),
      background: '#111111',
      button: '#295294',
    };
    expect(parseBrandingInput({ colors }).colors.button).toBe('#295294');
  });

  it('rejects a button that does not reach 2:1 against the background', () => {
    rejects(
      () =>
        parseBrandingInput({
          colors: { ...validColors(), button: '#222222' },
        }),
      'El color de los botones no contrasta lo suficiente con el fondo (mínimo 2:1).',
    );
  });

  it('trims the business name; empty or blank becomes null', () => {
    const parse = (businessName: unknown) =>
      parseBrandingInput({ businessName, colors: validColors() }).businessName;
    expect(parse('  Don Pepe  ')).toBe('Don Pepe');
    expect(parse('')).toBeNull();
    expect(parse('    ')).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse(undefined)).toBeNull();
  });

  it('accepts 60 characters and rejects 61', () => {
    const parse = (businessName: unknown) =>
      parseBrandingInput({ businessName, colors: validColors() }).businessName;
    expect(parse('a'.repeat(60))).toBe('a'.repeat(60));
    expect(parse(`  ${'a'.repeat(60)}  `)).toBe('a'.repeat(60));
    rejects(
      () => parse('a'.repeat(61)),
      'El nombre del negocio puede tener hasta 60 caracteres.',
    );
  });

  it('rejects a business name that is not text', () => {
    rejects(
      () => parseBrandingInput({ businessName: 42, colors: validColors() }),
      BRANDING_MESSAGES.invalidBusinessName,
    );
  });
});

describe('parseLogoDataUrl', () => {
  const LOGO = 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.';

  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['image/webp', WEBP],
  ])('accepts a %s whose bytes match', (mime, header) => {
    const bytes = image(header);
    const logo = parseLogoDataUrl({ dataUrl: dataUrl(mime, bytes) });
    expect(logo.mimeType).toBe(mime);
    expect(Buffer.compare(logo.data, bytes)).toBe(0);
  });

  it('accepts exactly 200 KB and rejects one byte more', () => {
    expect(MAX_LOGO_BYTES).toBe(200 * 1024);
    expect(
      parseLogoDataUrl({
        dataUrl: dataUrl('image/png', image(PNG, MAX_LOGO_BYTES)),
      }).data.length,
    ).toBe(MAX_LOGO_BYTES);
    rejects(
      () =>
        parseLogoDataUrl({
          dataUrl: dataUrl('image/png', image(PNG, MAX_LOGO_BYTES + 1)),
        }),
      LOGO,
    );
  });

  it('rejects an SVG', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    rejects(
      () => parseLogoDataUrl({ dataUrl: dataUrl('image/svg+xml', svg) }),
      LOGO,
    );
    rejects(
      () => parseLogoDataUrl({ dataUrl: dataUrl('image/png', svg) }),
      LOGO,
    );
  });

  it('rejects a ".png" that is not a PNG', () => {
    rejects(
      () =>
        parseLogoDataUrl({
          dataUrl: dataUrl('image/png', Buffer.from('hello')),
        }),
      LOGO,
    );
  });

  it('rejects bytes that disagree with the declared type', () => {
    rejects(
      () => parseLogoDataUrl({ dataUrl: dataUrl('image/png', image(JPEG)) }),
      LOGO,
    );
    rejects(
      () => parseLogoDataUrl({ dataUrl: dataUrl('image/webp', image(PNG)) }),
      LOGO,
    );
  });

  it('rejects a RIFF file that is not WebP', () => {
    const wav = image([
      ...Buffer.from('RIFF'),
      0,
      0,
      0,
      0,
      ...Buffer.from('WAVE'),
    ]);
    rejects(
      () => parseLogoDataUrl({ dataUrl: dataUrl('image/webp', wav) }),
      LOGO,
    );
  });

  it.each([
    undefined,
    null,
    {},
    { dataUrl: 42 },
    { dataUrl: '' },
    { dataUrl: 'not a data url' },
    { dataUrl: 'data:image/png,plain-text' },
    { dataUrl: 'data:image/png;base64,' },
    { dataUrl: 'data:image/png;base64,@@@@' },
  ])('rejects the malformed payload %p', (body) => {
    rejects(() => parseLogoDataUrl(body), LOGO);
  });
});
