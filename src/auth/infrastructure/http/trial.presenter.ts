import { TrialStatus } from '../../../tenancy/domain/trial.rules';

/** What the API shows of a trial (spec 21). */
export interface PublicTrial {
  endsAt: string | null;
  daysLeft: number | null;
  bookingsMade: number;
  bookingQuota: number | null;
  blocked: boolean;
}

export const toPublicTrial = (trial: TrialStatus): PublicTrial => ({
  endsAt: trial.endsAt ? trial.endsAt.toISOString() : null,
  daysLeft: trial.daysLeft,
  bookingsMade: trial.bookingsMade,
  bookingQuota: trial.bookingQuota,
  blocked: trial.blocked,
});
