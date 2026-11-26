import {
  StorageLevel,
  StorageStatus,
} from '../../../tenancy/domain/storage.rules';

/** What the API shows of the storage quota of a business (spec 22). */
export interface PublicStorage {
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  level: StorageLevel;
}

export const toPublicStorage = (storage: StorageStatus): PublicStorage => ({
  usedBytes: storage.usedBytes,
  quotaBytes: storage.quotaBytes,
  percent: storage.percent,
  level: storage.level,
});
