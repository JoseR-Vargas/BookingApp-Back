import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { Service } from '../../../domain/service';
import { ListScope } from '../../ports/list-scope';
import { SERVICE_READER, ServiceReader } from '../../ports/service.reader';

/** The services in creation order: all of them (admin) or only the active ones. */
@Injectable()
export class ListServicesUseCase {
  constructor(@Inject(SERVICE_READER) private readonly reader: ServiceReader) {}

  async execute(command: { scope: ListScope }): Promise<Result<Service[]>> {
    return ok(await this.reader.list(command.scope));
  }
}
