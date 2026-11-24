import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { Professional } from '../../../domain/professional';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../../ports/professional.reader';
import { SERVICE_READER, ServiceReader } from '../../ports/service.reader';

/** The active professionals that offer an active service; none for an unknown or inactive one. */
@Injectable()
export class ListProfessionalsForServiceUseCase {
  constructor(
    @Inject(SERVICE_READER) private readonly services: ServiceReader,
    @Inject(PROFESSIONAL_READER)
    private readonly professionals: ProfessionalReader,
  ) {}

  async execute(serviceId: string): Promise<Result<Professional[]>> {
    const service = await this.services.findActive(serviceId);
    if (!service) return ok([]);
    const active = await this.professionals.list('active');
    return ok(
      active.filter((professional) =>
        service.professionals.includes(professional.id),
      ),
    );
  }
}
