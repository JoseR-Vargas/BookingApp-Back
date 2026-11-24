import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { Professional } from '../../../domain/professional';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../../ports/professional.reader';

/** An active professional by id; `null` when there is none or it is inactive. */
@Injectable()
export class FindActiveProfessionalUseCase {
  constructor(
    @Inject(PROFESSIONAL_READER) private readonly reader: ProfessionalReader,
  ) {}

  async execute(id: string): Promise<Result<Professional | null>> {
    return ok(await this.reader.findActive(id));
  }
}
