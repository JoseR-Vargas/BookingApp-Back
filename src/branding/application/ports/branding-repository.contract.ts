import { BrandLogo, Branding } from '../../domain/branding';
import { DEFAULT_COLORS } from '../../domain/branding';
import { BrandingReader } from './branding.reader';
import { BrandingWriter } from './branding.writer';

/** A document as an older version of the app stored it: no `button` color. */
export interface LegacyBrandingDocument {
  businessName: string | null;
  colors: Record<string, string>;
  logo: null;
}

/** What the contract needs from an adapter under test, on an empty store. */
export interface BrandingRepositoryFixture {
  reader: BrandingReader;
  writer: BrandingWriter;
  /** Stores the document exactly as given, bypassing the port. */
  seedLegacyDocument(document: LegacyBrandingDocument): Promise<void>;
  /** How many branding documents the store holds. */
  countDocuments(): Promise<number>;
}

const COLORS = {
  accent: '#3366ff',
  background: '#ffffff',
  text: '#1a1a1a',
  button: '#0044cc',
};

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

const logo = (updatedAt = new Date(1_700_000_000_123)): BrandLogo => ({
  mimeType: 'image/png',
  data: PNG_BYTES,
  updatedAt,
});

const expectLogo = (actual: BrandLogo | null, expected: BrandLogo) => {
  expect(actual?.mimeType).toBe(expected.mimeType);
  expect(Buffer.isBuffer(actual?.data)).toBe(true);
  expect(Buffer.compare(actual!.data, expected.data)).toBe(0);
  expect(actual?.updatedAt).toBeInstanceOf(Date);
  expect(actual?.updatedAt.getTime()).toBe(expected.updatedAt.getTime());
};

/**
 * Behavior every BrandingReader + BrandingWriter adapter must honor. Each
 * adapter's own spec calls it with a factory that answers a fixture over an
 * EMPTY store (the in-memory spec for `npm test`, MongoDB for `npm run test:int`).
 */
export function describeBrandingRepositoryContract(
  name: string,
  factory: () => Promise<BrandingRepositoryFixture>,
): void {
  describe(`BrandingReader + BrandingWriter contract: ${name}`, () => {
    let repo: BrandingRepositoryFixture;

    beforeEach(async () => {
      repo = await factory();
    });

    it('finds nothing when no branding is saved', async () => {
      await expect(repo.reader.find()).resolves.toBeNull();
      await expect(repo.countDocuments()).resolves.toBe(0);
    });

    it('saves name and colors and reads them back', async () => {
      const saved = await repo.writer.saveBranding({
        businessName: 'Don Pepe',
        colors: COLORS,
      });
      expect(saved).toEqual({
        businessName: 'Don Pepe',
        colors: COLORS,
        logo: null,
      });
      await expect(repo.reader.find()).resolves.toEqual(saved);
    });

    it('keeps a null business name and a null button color', async () => {
      await repo.writer.saveBranding({
        businessName: null,
        colors: { ...COLORS, button: null },
      });
      await expect(repo.reader.find()).resolves.toEqual({
        businessName: null,
        colors: { ...COLORS, button: null },
        logo: null,
      });
    });

    it('repeated saves update the one document', async () => {
      await repo.writer.saveBranding({ businessName: 'A', colors: COLORS });
      await repo.writer.saveBranding({
        businessName: 'B',
        colors: DEFAULT_COLORS,
      });
      await repo.writer.saveLogo(logo());
      await repo.writer.deleteLogo();
      await expect(repo.countDocuments()).resolves.toBe(1);
      await expect(repo.reader.find()).resolves.toMatchObject({
        businessName: 'B',
        colors: DEFAULT_COLORS,
        logo: null,
      });
    });

    it('saving name and colors keeps an existing logo', async () => {
      await repo.writer.saveLogo(logo());
      const saved = await repo.writer.saveBranding({
        businessName: 'Don Pepe',
        colors: COLORS,
      });
      expect(saved.businessName).toBe('Don Pepe');
      expectLogo(saved.logo, logo());
      expectLogo((await repo.reader.find())!.logo, logo());
    });

    it('saving a logo first creates the branding with the defaults', async () => {
      const saved = await repo.writer.saveLogo(logo());
      expect(saved.businessName).toBeNull();
      expect(saved.colors).toEqual(DEFAULT_COLORS);
      expectLogo(saved.logo, logo());
      await expect(repo.countDocuments()).resolves.toBe(1);
    });

    it('saving a logo keeps name and colors', async () => {
      await repo.writer.saveBranding({
        businessName: 'Don Pepe',
        colors: COLORS,
      });
      const saved = await repo.writer.saveLogo(logo());
      expect(saved).toMatchObject({ businessName: 'Don Pepe', colors: COLORS });
      const found = (await repo.reader.find()) as Branding;
      expect(found).toMatchObject({ businessName: 'Don Pepe', colors: COLORS });
      expectLogo(found.logo, logo());
    });

    it('replaces the logo, with its new timestamp', async () => {
      await repo.writer.saveLogo(logo());
      const newer = logo(new Date(1_700_000_999_000));
      await repo.writer.saveLogo(newer);
      expectLogo((await repo.reader.find())!.logo, newer);
    });

    it('deletes the logo and keeps the rest', async () => {
      await repo.writer.saveBranding({
        businessName: 'Don Pepe',
        colors: COLORS,
      });
      await repo.writer.saveLogo(logo());
      await expect(repo.writer.deleteLogo()).resolves.toEqual({
        businessName: 'Don Pepe',
        colors: COLORS,
        logo: null,
      });
      await expect(repo.reader.find()).resolves.toMatchObject({ logo: null });
    });

    it('deleting the logo with nothing saved answers the defaults', async () => {
      await expect(repo.writer.deleteLogo()).resolves.toEqual({
        businessName: null,
        colors: DEFAULT_COLORS,
        logo: null,
      });
      await expect(repo.countDocuments()).resolves.toBe(1);
    });

    it('reads a document saved before the button color existed: buttons follow the accent', async () => {
      await repo.seedLegacyDocument({
        businessName: 'Don Pepe',
        colors: {
          accent: '#c9a96e',
          background: '#0d0d0d',
          text: '#f5f0e8',
          accentSecondary: '#dfc08a',
        },
        logo: null,
      });
      const found = await repo.reader.find();
      expect(found?.colors).toEqual({
        accent: '#c9a96e',
        background: '#0d0d0d',
        text: '#f5f0e8',
        button: null,
      });
      expect(found?.colors).not.toHaveProperty('accentSecondary');
    });
  });
}
