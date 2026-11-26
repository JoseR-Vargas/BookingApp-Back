// ===== PUERTO: CICLO DE VIDA DEL NEGOCIO =====
// The owner of the system changes the state of a business by hand (spec 25):
// it is suspended, reactivated or its trial is extended. The collection
// `tenants` belongs to this module, so the writes live here.

import { Tenant, TenantStatus } from '../../domain/tenant';

export interface TenantLifecycleWriter {
  /** Changes the state of the business (active or suspended) and answers it. */
  setStatus(id: string, status: TenantStatus): Promise<Tenant>;
  /** Changes the deadline of the trial of the business and answers it. */
  setTrialEndsAt(id: string, trialEndsAt: Date): Promise<Tenant>;
}

export const TENANT_LIFECYCLE_WRITER = Symbol('TENANT_LIFECYCLE_WRITER');
