import { Inject, Injectable } from '@nestjs/common';
import { Result, err, ok } from '../../../../shared/domain/result';
import { ServiceNotFoundError } from '../../../domain/catalog.errors';
import { Service } from '../../../domain/service';
import {
  ServiceInput,
  ensureProfessionalsExist,
} from '../../../domain/service.rules';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../../ports/professional.reader';
import { SERVICE_WRITER, ServiceWriter } from '../../ports/service.writer';

export interface UpdateServiceCommand {
  id: string;
  /** Already validated (see `validateServiceUpdate`). */
  patch: Partial<ServiceInput>;
}

/** Edits a service: only the given fields change; given professionals must exist. */
@Injectable()
export class UpdateServiceUseCase {
  constructor(
    @Inject(SERVICE_WRITER) private readonly writer: ServiceWriter,
    @Inject(PROFESSIONAL_READER)
    private readonly professionals: ProfessionalReader,
  ) {}

  async execute(command: UpdateServiceCommand): Promise<Result<Service>> {
    const { professionals } = command.patch;
    if (professionals) {
      const known = ensureProfessionalsExist(
        professionals,
        await this.professionals.existingIds(professionals),
      );
      if (!known.ok) return known;
    }
    const updated = await this.writer.update(command.id, command.patch);
    return updated ? ok(updated) : err(new ServiceNotFoundError(command.id));
  }
}
