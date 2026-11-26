import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATED_MODULES } from './architecture/migrated-modules';
import { RESULT_MODULES } from './architecture/result-modules';
import { checkModule, formatViolation } from './architecture/scan-imports';

const SRC = __dirname;

/**
 * Layer rules of docs/architecture.md: domain and application never reach
 * frameworks, databases or infrastructure. `src/shared` is always checked;
 * a module is checked once its spec adds it to MIGRATED_MODULES.
 */
describe('architecture: layer boundaries', () => {
  it.each(['shared', ...MIGRATED_MODULES])(
    'src/%s respects the layer rules',
    (name) => {
      const violations = checkModule(join(SRC, name)).map((v) =>
        formatViolation(v, SRC),
      );
      expect(violations).toEqual([]);
    },
  );
});

/**
 * Modules in RESULT_MODULES return business failures as `Result`: no `throw`
 * in `domain/` nor in `application/use-cases/`. Infrastructure may still throw.
 */
describe('architecture: errors as values', () => {
  it('only migrated modules can return Result', () => {
    expect(
      RESULT_MODULES.filter((name) => !MIGRATED_MODULES.includes(name)),
    ).toEqual([]);
  });

  it('no throw in domain or use cases of RESULT_MODULES', () => {
    const violations = RESULT_MODULES.flatMap((name) =>
      checkModule(join(SRC, name), { noThrow: true }),
    ).map((v) => formatViolation(v, SRC));
    expect(violations).toEqual([]);
  });
});

/**
 * `src/shared/domain/schedule` is the schedule model and rules that `catalog`
 * and `availability` both import (spec 12): pure TypeScript, so no framework,
 * no `process.env`, no `new Date()` and no `throw`. It lives under
 * `shared/domain`, so the rules above already cover its imports; this pins the
 * folder and its `throw`-free rule.
 */
describe('architecture: shared schedule core', () => {
  const SCHEDULE_DIR = join(SRC, 'shared', 'domain', 'schedule');

  it('exists, with the model and the rules', () => {
    expect(readdirSync(SCHEDULE_DIR)).toEqual(
      expect.arrayContaining(['schedule.ts', 'schedule.rules.ts']),
    );
  });

  it('src/shared has no throw in domain or application', () => {
    const violations = checkModule(join(SRC, 'shared'), {
      noThrow: true,
    }).map((v) => formatViolation(v, SRC));
    expect(violations).toEqual([]);
  });
});

/**
 * The WhatsApp bot is gone (the owner decided): no module may import from
 * `src/whatsapp`, because that directory no longer exists.
 */
describe('architecture: whatsapp is gone', () => {
  const IMPORTS_WHATSAPP = /from\s+['"][^'"]*\/whatsapp(\/|['"])/;

  const filesIn = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? filesIn(join(dir, entry.name))
        : entry.name.endsWith('.ts')
          ? [join(dir, entry.name)]
          : [],
    );

  it('has no module of whatsapp left', () => {
    expect(existsSync(join(SRC, 'whatsapp'))).toBe(false);
  });

  it('imports nothing from a whatsapp module', () => {
    const files = ['admin', 'availability', 'billing', 'bookings', 'branding', 'catalog', 'email', 'platform', 'reminders', 'shared', 'tenancy']
      .flatMap((module) => filesIn(join(SRC, module)));
    const offenders = files.filter((file) =>
      IMPORTS_WHATSAPP.test(readFileSync(file, 'utf8')),
    );
    expect(files.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});
