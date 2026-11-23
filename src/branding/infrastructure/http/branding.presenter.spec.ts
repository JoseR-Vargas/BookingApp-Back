import { DEFAULT_COLORS, defaultBranding } from '../../domain/branding';
import { LOGO_PATH, toPublicBranding } from './branding.presenter';

describe('toPublicBranding', () => {
  it('answers name, colors and no logo URL without a logo', () => {
    expect(toPublicBranding(defaultBranding())).toEqual({
      businessName: null,
      colors: DEFAULT_COLORS,
      logoUrl: null,
    });
  });

  it('versions the logo URL with the logo timestamp, and never exposes the bytes', () => {
    const view = toPublicBranding({
      ...defaultBranding(),
      logo: {
        mimeType: 'image/png',
        data: Buffer.from([1]),
        updatedAt: new Date(1_700_000_000_123),
      },
    });
    expect(LOGO_PATH).toBe('/api/branding/logo');
    expect(view.logoUrl).toBe('/api/branding/logo?v=1700000000123');
    expect(view).not.toHaveProperty('logo');
  });
});
