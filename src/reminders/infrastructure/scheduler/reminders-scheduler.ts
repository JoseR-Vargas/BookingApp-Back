// ===== PROGRAMADOR DE RECORDATORIOS =====
// The round that sends the reminders runs inside the backend, every X minutes
// (spec 24). It walks the businesses one by one and each one reads its own
// data inside its own scope, so a business never sees the data of another.

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  TENANT_SCOPE,
  TenantScope,
} from '../../../shared/application/tenant-context.port';
import {
  TENANT_DIRECTORY,
  TenantDirectory,
} from '../../../tenancy/application/ports/tenant-directory.port';
import { SendDueRemindersUseCase } from '../../application/use-cases/send-due-reminders.use-case';

/** How many minutes between rounds when the environment does not say. */
export const DEFAULT_REMINDERS_INTERVAL_MINUTES = 5;

/** The minutes between rounds, from the environment. */
export const remindersIntervalMinutes = (
  env: NodeJS.ProcessEnv = process.env,
): number => {
  const raw = Number(env.REMINDERS_INTERVAL_MINUTES);
  return Number.isInteger(raw) && raw > 0
    ? raw
    : DEFAULT_REMINDERS_INTERVAL_MINUTES;
};

@Injectable()
export class RemindersScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersScheduler.name);

  private timer: ReturnType<typeof setInterval> | null = null;
  /** The rounds run one after the other: the next waits for the one in progress. */
  private chain: Promise<void> = Promise.resolve();

  constructor(
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectory,
    @Inject(TENANT_SCOPE) private readonly scope: TenantScope,
    private readonly sendDue: SendDueRemindersUseCase,
  ) {}

  onModuleInit(): void {
    const minutes = remindersIntervalMinutes();
    this.timer = setInterval(() => this.enqueue(), minutes * 60_000);
    // The timer must not keep the process alive.
    this.timer.unref?.();
    this.logger.log(`The reminders will be checked every ${minutes} minutes`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Queues a round; the next one waits for the one in progress. */
  private enqueue(): void {
    void this.round();
  }

  /**
   * A round, queued: the next one waits for this one to finish, so two
   * rounds never run at the same time.
   */
  round(): Promise<void> {
    const next = this.chain
      .then(() => this.runRound())
      .catch((error) => {
        this.logger.error(
          `The round of the reminders failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    this.chain = next;
    return next;
  }

  /**
   * The work of a round: every active business, one after the other, each one
   * inside its own scope. The bookings of a business are read inside that
   * scope, never outside it.
   */
  private async runRound(): Promise<void> {
    const tenants = await this.directory.list();
    for (const tenant of tenants) {
      if (tenant.status !== 'active') {
        continue;
      }
      await this.scope.run(
        {
          id: tenant.id,
          slug: tenant.slug,
          isDefault: tenant.isDefault,
        },
        async () => {
          const result = await this.sendDue.execute();
          if (!result.ok) {
            this.logger.error(
              `The reminders of ${tenant.slug} failed: ${result.error.message}`,
            );
            return;
          }
          const { sent, failed, skipped } = result.value;
          if (skipped) {
            this.logger.log(
              `The reminders of ${tenant.slug} were not sent (${skipped})`,
            );
            return;
          }
          this.logger.log(
            `The reminders of ${tenant.slug}: ${sent} sent, ${failed} failed`,
          );
        },
      );
    }
  }
}
