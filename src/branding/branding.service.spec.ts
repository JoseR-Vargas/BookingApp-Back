import { mongo } from 'mongoose';
import { toBuffer } from './branding.service';
import { createFakeBranding } from './branding.testing';
import { BRANDING_KEY, DEFAULT_COLORS } from './schemas/branding.schema';

const COLORS = {
  accent: '#3366ff',
  background: '#ffffff',
  text: '#1a1a1a',
  button: '#0044cc',
};

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

describe('BrandingService', () => {
  it('returns the defaults when nothing is saved', async () => {
    const { service, model } = createFakeBranding();
    await expect(service.getBranding()).resolves.toEqual({
      businessName: null,
      colors: { ...DEFAULT_COLORS },
      logoUrl: null,
    });
    await expect(service.getLogo()).resolves.toBeNull();
    expect(model.docs).toHaveLength(0);
  });

  it('reads a document saved before the button color existed: buttons follow the accent', async () => {
    const { service } = createFakeBranding([
      {
        key: BRANDING_KEY,
        businessName: 'Don Pepe',
        colors: {
          accent: '#c9a96e',
          background: '#0d0d0d',
          text: '#f5f0e8',
          accentSecondary: '#dfc08a',
        },
        logo: null,
      },
    ]);
    const branding = await service.getBranding();
    expect(branding.colors).toEqual({
      accent: '#c9a96e',
      background: '#0d0d0d',
      text: '#f5f0e8',
      button: null,
    });
    expect(branding.colors).not.toHaveProperty('accentSecondary');
  });

  it('saves colors and name in the single branding document', async () => {
    const { service, model } = createFakeBranding();
    const saved = await service.saveBranding({
      businessName: 'Don Pepe',
      colors: COLORS,
    });
    expect(saved).toEqual({
      businessName: 'Don Pepe',
      colors: COLORS,
      logoUrl: null,
    });
    await expect(service.getBranding()).resolves.toEqual(saved);

    await service.saveBranding({ businessName: null, colors: DEFAULT_COLORS });
    expect(model.docs).toHaveLength(1);
    expect(model.docs[0]).toMatchObject({
      key: BRANDING_KEY,
      businessName: null,
      colors: DEFAULT_COLORS,
      logo: null,
    });
  });

  it('stores the logo with a timestamp and exposes a versioned URL', async () => {
    const { service, model } = createFakeBranding();
    const before = Date.now();
    const saved = await service.saveLogo({
      mimeType: 'image/png',
      data: PNG_BYTES,
    });
    const after = Date.now();

    expect(saved.businessName).toBeNull();
    expect(saved.colors).toEqual(DEFAULT_COLORS);
    const version = Number(
      /^\/api\/branding\/logo\?v=(\d+)$/.exec(saved.logoUrl!)?.[1],
    );
    expect(version).toBeGreaterThanOrEqual(before);
    expect(version).toBeLessThanOrEqual(after);
    expect(model.docs[0].logo?.updatedAt.getTime()).toBe(version);

    const logo = await service.getLogo();
    expect(logo?.mimeType).toBe('image/png');
    expect(Buffer.isBuffer(logo?.data)).toBe(true);
    expect(Buffer.compare(logo!.data, PNG_BYTES)).toBe(0);
  });

  it('keeps the logo when colors are saved, and the colors when the logo changes', async () => {
    const { service } = createFakeBranding();
    await service.saveBranding({ businessName: 'Don Pepe', colors: COLORS });
    const withLogo = await service.saveLogo({
      mimeType: 'image/webp',
      data: PNG_BYTES,
    });
    expect(withLogo).toMatchObject({
      businessName: 'Don Pepe',
      colors: COLORS,
    });

    const recolored = await service.saveBranding({
      businessName: 'Don Pepe',
      colors: DEFAULT_COLORS,
    });
    expect(recolored.logoUrl).toBe(withLogo.logoUrl);
  });

  it('deletes the logo and keeps the rest', async () => {
    const { service, model } = createFakeBranding();
    await service.saveBranding({ businessName: 'Don Pepe', colors: COLORS });
    await service.saveLogo({ mimeType: 'image/jpeg', data: PNG_BYTES });

    await expect(service.deleteLogo()).resolves.toEqual({
      businessName: 'Don Pepe',
      colors: COLORS,
      logoUrl: null,
    });
    expect(model.docs[0].logo).toBeNull();
    await expect(service.getLogo()).resolves.toBeNull();
  });

  it('deleting the logo with nothing saved answers the defaults', async () => {
    const { service } = createFakeBranding();
    await expect(service.deleteLogo()).resolves.toEqual({
      businessName: null,
      colors: DEFAULT_COLORS,
      logoUrl: null,
    });
  });
});

describe('toBuffer', () => {
  it('reads Buffers, Uint8Arrays and BSON Binary values', () => {
    const bytes = Buffer.from([1, 2, 3, 4]);
    expect(Buffer.compare(toBuffer(bytes), bytes)).toBe(0);
    expect(Buffer.compare(toBuffer(new Uint8Array(bytes)), bytes)).toBe(0);
    const binary = new mongo.Binary(bytes);
    expect(Buffer.compare(toBuffer(binary), bytes)).toBe(0);
  });
});
