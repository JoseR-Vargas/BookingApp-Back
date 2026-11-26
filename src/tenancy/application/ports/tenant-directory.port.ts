// ===== PUERTO: DIRECTORIO DE NEGOCIOS =====
// Every business of the installation. The scheduler of the reminders walks
// them one by one, each one inside its own scope (spec 18, spec 24).

import { Tenant } from '../../domain/tenant';

export interface TenantDirectory {
  /** Every business of the installation, whatever its state. */
  list(): Promise<Tenant[]>;
}

export const TENANT_DIRECTORY = Symbol('TENANT_DIRECTORY');
