import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { Service } from '../../../domain/service';
import { SERVICE_READER, ServiceReader } from '../../ports/service.reader';

/** An active service by id; `null` when there is none or it is inactive. */
@Injectable()
export class FindActiveServiceUseCase {
  constructor(@Inject(SERVICE_READER) private readonly reader: ServiceReader) {}

  async execute(id: string): Promise<Result<Service | null>> {
    return ok(await this.reader.findActive(id));
  }
}
