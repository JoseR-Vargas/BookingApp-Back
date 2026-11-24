import { Injectable } from '@nestjs/common';
import { Result } from '../../../../shared/domain/result';
import { ProfessionalView } from './professional-view';
import { UpdateProfessionalUseCase } from './update-professional.use-case';

/** Soft delete: the professional stays in the store, inactive. */
@Injectable()
export class DeactivateProfessionalUseCase {
  constructor(private readonly update: UpdateProfessionalUseCase) {}

  execute(id: string): Promise<Result<ProfessionalView>> {
    return this.update.execute({ id, patch: { active: false } });
  }
}
