import { AsyncLocalStorageTenantContext } from '../../../shared/infrastructure/tenancy/async-local-storage-tenant-context';
import { Tenant } from '../../../tenancy/domain/tenant';
import { SendDueRemindersUseCase } from '../../application/use-cases/send-due-reminders.use-case';
import {
  DEFAULT_REMINDERS_INTERVAL_MINUTES,
  RemindersScheduler,
  remindersIntervalMinutes,
} from './reminders-scheduler';

const tenant = (slug: string, over: Partial<Tenant> = {}): Tenant => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  status: 'active',
  isDefault: false,
  createdAt: new Date('2026-03-24T10:00:00Z'),
  trialEndsAt: null,
  bookingQuota: null,
  storageQuotaBytes: null,
  storageUsedBytes: 0,
  storageMeasuredAt: null,
  ...over,
});

describe('RemindersScheduler', () => {
  const context = new AsyncLocalStorageTenantContext();
  let tenants: Tenant[];
  let seen: string[];
  let scheduler: RemindersScheduler;

  const build = (
    sendDue?: (slug: string) => Promise<void>,
    directory: Tenant[] = tenants,
  ) => {
    const useCase = {
      execute: async () => {
        const slug = context.current().slug;
        seen.push(slug);
        if (sendDue) await sendDue(slug);
        return {
          ok: true as const,
          value: { skipped: null, sent: 0, failed: 0 },
        };
      },
    } as unknown as SendDueRemindersUseCase;
    return new RemindersScheduler(
      {
        list: () => Promise.resolve(directory),
      } as never,
      context,
      useCase,
    );
  };

  beforeEach(() => {
    tenants = [tenant('sur'), tenant('norte')];
    seen = [];
    scheduler = build();
  });

  it('walks every business, one after the other', async () => {
    await scheduler.round();

    expect(seen).toEqual(['sur', 'norte']);
  });

  it('runs the round of a business inside its own scope', async () => {
    const inside: string[] = [];
    scheduler = build((slug) => {
      inside.push(context.current().slug);
      void slug;
      return Promise.resolve();
    });

    await scheduler.round();

    expect(inside).toEqual(['sur', 'norte']);
  });

  it('leaves a suspended business alone', async () => {
    scheduler = build(undefined, [
      tenant('sur'),
      tenant('norte', { status: 'suspended' }),
    ]);

    await scheduler.round();

    expect(seen).toEqual(['sur']);
  });

  it('never overlaps two rounds: the next one waits', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let running = 0;
    let maxRunning = 0;
    scheduler = build(async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await gate;
      running -= 1;
    });

    const first = scheduler.round();
    const second = scheduler.round();
    await Promise.resolve();
    await Promise.resolve();

    expect(maxRunning).toBe(1);
    release();
    await Promise.all([first, second]);
    expect(maxRunning).toBe(1);
    expect(seen).toHaveLength(4);
  });

  it('reads the minutes between rounds from the environment', () => {
    expect(remindersIntervalMinutes({})).toBe(
      DEFAULT_REMINDERS_INTERVAL_MINUTES,
    );
    expect(remindersIntervalMinutes({ REMINDERS_INTERVAL_MINUTES: '15' })).toBe(
      15,
    );
    expect(
      remindersIntervalMinutes({ REMINDERS_INTERVAL_MINUTES: 'nope' }),
    ).toBe(DEFAULT_REMINDERS_INTERVAL_MINUTES);
    expect(remindersIntervalMinutes({ REMINDERS_INTERVAL_MINUTES: '0' })).toBe(
      DEFAULT_REMINDERS_INTERVAL_MINUTES,
    );
  });

  it('starts and stops the timer without leaving it behind', () => {
    const spy = jest.spyOn(global, 'setInterval');
    const clear = jest.spyOn(global, 'clearInterval');

    scheduler.onModuleInit();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toBe(5 * 60_000);

    scheduler.onModuleDestroy();
    expect(clear).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    clear.mockRestore();
  });
});
