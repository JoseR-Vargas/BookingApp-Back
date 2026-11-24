import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../shared/domain/result';
import {
  publicLocationIds,
  publicServiceProfessionals,
} from '../../domain/catalog.rules';
import { Service } from '../../domain/service';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../ports/professional.reader';
import { SERVICE_READER, ServiceReader } from '../ports/service.reader';
import { ProfessionalView } from './professionals/professional-view';

export interface GetPublicCatalogCommand {
  /** The active locations; a professional is shown only at those. */
  activeLocationIds: string[];
  /** Where a professional stored without locations works. */
  defaultLocationId: string;
}

export interface PublicCatalog {
  professionals: ProfessionalView[];
  services: Service[];
}

/** The professionals and services of the public catalog: active ones only. */
@Injectable()
export class GetPublicCatalogUseCase {
  constructor(
    @Inject(SERVICE_READER) private readonly services: ServiceReader,
    @Inject(PROFESSIONAL_READER)
    private readonly professionals: ProfessionalReader,
  ) {}

  async execute(
    command: GetPublicCatalogCommand,
  ): Promise<Result<PublicCatalog>> {
    const [professionals, services] = await Promise.all([
      this.professionals.list('active'),
      this.services.list('active'),
    ]);
    const activeIds = new Set(professionals.map(({ id }) => id));
    return ok({
      professionals: professionals.map((professional) => ({
        professional,
        locationIds: publicLocationIds(
          professional,
          command.defaultLocationId,
          command.activeLocationIds,
        ),
      })),
      services: services.map((service) => ({
        ...service,
        professionals: publicServiceProfessionals(service, activeIds),
      })),
    });
  }
}
