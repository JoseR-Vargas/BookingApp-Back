import { DEFAULT_COLORS } from '../../domain/branding';
import {
  BRANDING_MESSAGES,
  InvalidBrandingError,
  InvalidLogoError,
  LogoNotFoundError,
} from '../../domain/branding.errors';
import { Result } from '../../../shared/domain/result';
import { InMemoryBrandingRepository } from '../../infrastructure/persistence/in-memory/in-memory-branding.repository';
import { Clock } from '../ports/clock.port';
import { DeleteLogoUseCase } from './delete-logo.use-case';
import { GetBrandingUseCase } from './get-branding.use-case';
import { GetLogoUseCase } from './get-logo.use-case';
import { SaveBrandingUseCase } from './save-branding.use-case';
import { SaveLogoUseCase } from './save-logo.use-case';

const COLORS = {
  accent: '#3366ff',
  background: '#ffffff',
  text: '#1a1a1a',
  button: '#0044cc',
};

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

/** The value of a result that must have succeeded (fails the test otherwise). */
const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(`expected Ok, got Err: ${result.error.message}`);
  }
  return result.value;
};

/** The use case answers an Err (it does not throw) of that class and message. */
const expectErr = async (
  pending: Promise<Result<unknown>>,
  error: new (...args: never[]) => unknown,
  message: string,
) => {
  const result = await pending;
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toBeInstanceOf(error);
    expect(result.error.message).toBe(message);
  }
};

/** A clock the test moves by hand. */
class FixedClock implements Clock {
  constructor(public current = new Date(1_700_000_000_000)) {}
  now(): Date {
    return this.current;
  }
}

function setup() {
  const repo = new InMemoryBrandingRepository();
  const clock = new FixedClock();
  return {
    repo,
    clock,
    get: new GetBrandingUseCase(repo),
    getLogo: new GetLogoUseCase(repo),
    save: new SaveBrandingUseCase(repo),
    saveLogo: new SaveLogoUseCase(repo, clock),
    deleteLogo: new DeleteLogoUseCase(repo),
  };
}

describe('GetBranding', () => {
  it('answers the defaults when nothing is saved, and stores nothing', async () => {
    const { get, getLogo, repo } = setup();
    expect(valueOf(await get.execute())).toEqual({
      businessName: null,
      colors: { ...DEFAULT_COLORS },
      logo: null,
    });
    await expectErr(getLogo.execute(), LogoNotFoundError, 'Logo not found');
    expect(repo.docs).toHaveLength(0);
  });

  it('answers what was saved', async () => {
    const { get, save } = setup();
    await save.execute({ businessName: 'Don Pepe', colors: COLORS });
    expect(valueOf(await get.execute())).toEqual({
      businessName: 'Don Pepe',
      colors: COLORS,
      logo: null,
    });
  });
});

describe('SaveBranding', () => {
  it('validates, normalises and saves in the single document', async () => {
    const { save, repo } = setup();
    const saved = valueOf(
      await save.execute({
        businessName: '  Don Pepe ',
        colors: { ...COLORS, accent: '#3366FF' },
      }),
    );
    expect(saved).toEqual({
      businessName: 'Don Pepe',
      colors: COLORS,
      logo: null,
    });

    await save.execute({ businessName: null, colors: DEFAULT_COLORS });
    expect(repo.docs).toHaveLength(1);
    expect(repo.docs[0]).toMatchObject({
      businessName: null,
      colors: DEFAULT_COLORS,
      logo: null,
    });
  });

  it('rejects an invalid draft and stores nothing', async () => {
    const { save, repo } = setup();
    await expectErr(
      save.execute({
        businessName: 'x',
        colors: { ...COLORS, accent: '#eeeeee' },
      }),
      InvalidBrandingError,
      BRANDING_MESSAGES.accentContrast,
    );
    expect(repo.docs).toHaveLength(0);
  });

  it.each([
    [
      'a name that is not text',
      { businessName: 42, colors: COLORS },
      BRANDING_MESSAGES.invalidBusinessName,
    ],
    [
      'a name that is too long',
      { businessName: 'a'.repeat(61), colors: {} },
      BRANDING_MESSAGES.businessNameTooLong,
    ],
    [
      'a missing color',
      { colors: { background: '#ffffff', text: '#1a1a1a' } },
      BRANDING_MESSAGES.requiredColor.accent,
    ],
    [
      'a malformed color',
      { colors: { ...COLORS, text: '#12' } },
      BRANDING_MESSAGES.invalidColor.text,
    ],
    [
      'low text contrast',
      { colors: { ...COLORS, text: '#777777', background: '#888888' } },
      BRANDING_MESSAGES.textContrast,
    ],
    [
      'low button contrast',
      { colors: { ...COLORS, button: '#eeeeee' } },
      BRANDING_MESSAGES.buttonContrast,
    ],
  ])('answers an Err for %s and stores nothing', async (_c, draft, message) => {
    const { save, repo } = setup();
    await expectErr(save.execute(draft), InvalidBrandingError, message);
    expect(repo.docs).toHaveLength(0);
  });

  it('keeps the logo', async () => {
    const { save, saveLogo } = setup();
    const withLogo = valueOf(
      await saveLogo.execute({ mimeType: 'image/webp', data: webp() }),
    );
    const recolored = valueOf(
      await save.execute({ businessName: 'Don Pepe', colors: DEFAULT_COLORS }),
    );
    expect(recolored.logo).toEqual(withLogo.logo);
  });
});

const webp = () =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.alloc(4),
    Buffer.from('WEBPVP8 '),
  ]);

describe('SaveLogo', () => {
  it('stamps the logo with the clock, not with the system time', async () => {
    const { saveLogo, getLogo, clock } = setup();
    clock.current = new Date(1_234_567_890_123);
    const saved = valueOf(
      await saveLogo.execute({ mimeType: 'image/png', data: PNG_BYTES }),
    );

    expect(saved.businessName).toBeNull();
    expect(saved.colors).toEqual(DEFAULT_COLORS);
    expect(saved.logo?.updatedAt.getTime()).toBe(1_234_567_890_123);
    const logo = valueOf(await getLogo.execute());
    expect(logo?.mimeType).toBe('image/png');
    expect(Buffer.compare(logo!.data, PNG_BYTES)).toBe(0);
  });

  it('keeps name and colors', async () => {
    const { save, saveLogo } = setup();
    await save.execute({ businessName: 'Don Pepe', colors: COLORS });
    const saved = valueOf(
      await saveLogo.execute({ mimeType: 'image/png', data: PNG_BYTES }),
    );
    expect(saved).toMatchObject({ businessName: 'Don Pepe', colors: COLORS });
  });

  it.each([
    ['an unsupported type', 'image/svg+xml', Buffer.from('<svg/>')],
    ['bytes of another type', 'image/jpeg', PNG_BYTES],
    [
      'more than 200 KB',
      'image/png',
      Buffer.concat([PNG_BYTES, Buffer.alloc(200 * 1024)]),
    ],
  ])('rejects %s and stores nothing', async (_case, mimeType, data) => {
    const { saveLogo, repo } = setup();
    await expectErr(
      saveLogo.execute({ mimeType, data }),
      InvalidLogoError,
      BRANDING_MESSAGES.invalidLogo,
    );
    expect(repo.docs).toHaveLength(0);
  });
});

describe('DeleteLogo', () => {
  it('deletes the logo and keeps the rest', async () => {
    const { save, saveLogo, deleteLogo, getLogo, repo } = setup();
    await save.execute({ businessName: 'Don Pepe', colors: COLORS });
    await saveLogo.execute({
      mimeType: 'image/jpeg',
      data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    });

    expect(valueOf(await deleteLogo.execute())).toEqual({
      businessName: 'Don Pepe',
      colors: COLORS,
      logo: null,
    });
    expect(repo.docs[0].logo).toBeNull();
    await expectErr(getLogo.execute(), LogoNotFoundError, 'Logo not found');
  });

  it('with nothing saved answers the defaults', async () => {
    const { deleteLogo } = setup();
    expect(valueOf(await deleteLogo.execute())).toEqual({
      businessName: null,
      colors: DEFAULT_COLORS,
      logo: null,
    });
  });
});
