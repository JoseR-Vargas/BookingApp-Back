import {
  InvalidBrandingError,
  InvalidLogoError,
} from '../../domain/branding.errors';
import { BRANDING_MESSAGES } from '../../domain/branding.errors';
import { MAX_LOGO_BYTES } from '../../domain/branding.rules';
import { parseBrandingInput, parseLogoInput } from './branding.input';

const LOGO = 'El logo debe ser PNG, JPG o WebP de hasta 200 KB.';

const rejects = (
  fn: () => unknown,
  message: string,
  error: new (...args: never[]) => Error,
) => {
  expect(fn).toThrow(error);
  expect(fn).toThrow(message);
};

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const image = (header: number[], size = 64): Buffer => {
  const bytes = Buffer.alloc(size);
  Buffer.from(header).copy(bytes);
  return bytes;
};
const dataUrl = (mime: string, bytes: Buffer) =>
  `data:${mime};base64,${bytes.toString('base64')}`;

describe('parseBrandingInput (shape of the body)', () => {
  it('passes name and colors through untouched, for the domain to validate', () => {
    const colors = { accent: '#C9A96E', background: 1 };
    expect(parseBrandingInput({ businessName: ' x ', colors })).toEqual({
      businessName: ' x ',
      colors,
    });
  });

  it.each([null, undefined, [], 'text', 42])(
    'rejects the body %p as invalid',
    (body) => {
      rejects(
        () => parseBrandingInput(body),
        BRANDING_MESSAGES.invalidBody,
        InvalidBrandingError,
      );
    },
  );

  it.each([undefined, null, 'x', 7, []])(
    'treats colors %p as no colors',
    (colors) => {
      expect(parseBrandingInput({ colors }).colors).toEqual({});
    },
  );
});

describe('parseLogoInput (data URL of the logo)', () => {
  it('decodes the type and the bytes', () => {
    const bytes = image(PNG, 128);
    const command = parseLogoInput({ dataUrl: dataUrl('image/png', bytes) });
    expect(command.mimeType).toBe('image/png');
    expect(Buffer.compare(command.data, bytes)).toBe(0);
  });

  it('leaves the type to the domain (an SVG decodes; the rule refuses it)', () => {
    const command = parseLogoInput({
      dataUrl: dataUrl('image/svg+xml', Buffer.from('<svg/>')),
    });
    expect(command.mimeType).toBe('image/svg+xml');
  });

  it('accepts a 200 KB file and refuses an oversized payload before decoding', () => {
    expect(
      parseLogoInput({
        dataUrl: dataUrl('image/png', image(PNG, MAX_LOGO_BYTES)),
      }).data.length,
    ).toBe(MAX_LOGO_BYTES);
    rejects(
      () =>
        parseLogoInput({
          dataUrl: dataUrl('image/png', image(PNG, MAX_LOGO_BYTES + 3000)),
        }),
      LOGO,
      InvalidLogoError,
    );
  });

  it.each([
    undefined,
    null,
    {},
    [],
    'x',
    { dataUrl: 42 },
    { dataUrl: '' },
    { dataUrl: 'not a data url' },
    { dataUrl: 'data:image/png,plain-text' },
    { dataUrl: 'data:image/png;base64,' },
    { dataUrl: 'data:image/png;base64,@@@@' },
  ])('rejects the malformed payload %p', (body) => {
    rejects(() => parseLogoInput(body), LOGO, InvalidLogoError);
  });
});
