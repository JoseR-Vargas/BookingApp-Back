// ===== PUERTO: BITÁCORA DEL DUEÑO =====
// What the owner of the system did by hand: a suspension, a reactivation, an
// extension of a trial or a change of plan. It leaves a trace in the log of
// the system (spec 25).

/** The manual actions of the owner. */
export type PlatformAction =
  | 'suspend'
  | 'reactivate'
  | 'extend-trial'
  | 'change-plan'
  | 'delete';

/** One manual action, with what it changed. */
export interface PlatformAuditEntry {
  /** The business the action was about. */
  businessId: string;
  /** What the owner did. */
  action: PlatformAction;
  /** The plan before the change; null when there was none. */
  from: string | null;
  /** The plan after the change; null when there is none. */
  to: string | null;
  /** Extra detail for the log (the days added, the new deadline). */
  detail: string | null;
}

export interface PlatformAudit {
  /** Records a manual action of the owner in the log of the system. */
  record(entry: PlatformAuditEntry): Promise<void>;
}

export const PLATFORM_AUDIT = Symbol('PLATFORM_AUDIT');
