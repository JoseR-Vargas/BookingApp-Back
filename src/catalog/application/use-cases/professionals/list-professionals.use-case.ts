import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { locationIdsOf } from '../../../domain/professional.rules';
import { ListScope } from '../../ports/list-scope';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../../ports/professional.reader';
import { ProfessionalView } from './professional-view';

export interface ListProfessionalsCommand {
  scope: ListScope;
  /** Where a professional stored without locations works. */
  defaultLocationId: string;
}

/** The professionals in creation order, each with its locations resolved. */
@Injectable()
export class ListProfessionalsUseCase {
  constructor(
    @Inject(PROFESSIONAL_READER) private readonly reader: ProfessionalReader,
  ) {}

  async execute(
    command: ListProfessionalsCommand,
  ): Promise<Result<ProfessionalView[]>> {
    const professionals = await this.reader.list(command.scope);
    return ok(
      professionals.map((professional) => ({
        professional,
        locationIds: locationIdsOf(professional, command.defaultLocationId),
      })),
    );
  }
}
