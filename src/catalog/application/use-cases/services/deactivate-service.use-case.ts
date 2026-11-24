import { Injectable } from '@nestjs/common';
import { Result } from '../../../../shared/domain/result';
import { Service } from '../../../domain/service';
import { UpdateServiceUseCase } from './update-service.use-case';

/** Soft delete: the service stays in the store, inactive. */
@Injectable()
export class DeactivateServiceUseCase {
  constructor(private readonly update: UpdateServiceUseCase) {}

  execute(id: string): Promise<Result<Service>> {
    return this.update.execute({ id, patch: { active: false } });
  }
}
