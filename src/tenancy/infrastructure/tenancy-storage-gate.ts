import { Injectable } from '@nestjs/common';
import { StorageGate } from '../../shared/application/storage-gate.port';
import { GetStorageStatusUseCase } from '../application/use-cases/get-storage-status.use-case';

/**
 * Asks the tenancy whether the business in force is over its storage quota. A
 * business without a cap is never blocked; if the status cannot be resolved
 * the gate stays open (a booking is never lost to a lookup failure).
 */
@Injectable()
export class TenancyStorageGate implements StorageGate {
  constructor(private readonly storage: GetStorageStatusUseCase) {}

  async allowsNewData(): Promise<boolean> {
    const status = await this.storage.execute();
    return !(status.ok && status.value?.level === 'blocked');
  }
}
