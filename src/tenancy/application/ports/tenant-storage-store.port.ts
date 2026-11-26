// ===== PUERTO: GUARDAR LA MEDICIÓN =====
// Keeps the last measurement of the storage in the record of the business, so
// it survives a restart and is shared by the instances (spec 22).

export interface TenantStorageStore {
  saveMeasurement(
    tenantId: string,
    usedBytes: number,
    measuredAt: Date,
  ): Promise<void>;
}

export const TENANT_STORAGE_STORE = Symbol('TENANT_STORAGE_STORE');
