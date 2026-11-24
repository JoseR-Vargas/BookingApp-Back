import { Inject, Injectable } from '@nestjs/common';
import { Result, ok } from '../../../../shared/domain/result';
import { Service } from '../../../domain/service';
import {
  ServiceInput,
  ensureProfessionalsExist,
  newService,
} from '../../../domain/service.rules';
import { slugCandidates, slugify } from '../../../domain/slug.rules';
import {
  BOOKING_ACTIVITY,
  BookingActivity,
} from '../../ports/booking-activity.port';
import {
  PROFESSIONAL_READER,
  ProfessionalReader,
} from '../../ports/professional.reader';
import { SERVICE_WRITER, ServiceWriter } from '../../ports/service.writer';

/** Creates a service under a slug of its name; every professional it names must exist. */
@Injectable()
export class CreateServiceUseCase {
  constructor(
    @Inject(SERVICE_WRITER) private readonly writer: ServiceWriter,
    @Inject(PROFESSIONAL_READER)
    private readonly professionals: ProfessionalReader,
    @Inject(BOOKING_ACTIVITY) private readonly activity: BookingActivity,
  ) {}

  /** `input` is already validated (see `validateServiceCreate`). */
  async execute(input: ServiceInput): Promise<Result<Service>> {
    const known = ensureProfessionalsExist(
      input.professionals,
      await this.professionals.existingIds(input.professionals),
    );
    if (!known.ok) return known;
    return ok(
      await this.writer.insert(
        this.unusedIds(slugify(input.name, 'service')),
        newService(input),
      ),
    );
  }

  /**
   * The candidate ids no booking points at: the id of a deleted service is
   * not handed to a new one while bookings cite it.
   */
  private async *unusedIds(base: string): AsyncGenerator<string> {
    for (const id of slugCandidates(base)) {
      if (!(await this.activity.hasAnyForService(id))) yield id;
    }
  }
}
