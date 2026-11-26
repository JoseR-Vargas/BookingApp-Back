// The list and the detail of the businesses of the installation (spec 25).
// The owner of the system sees the signals of every business: never the data
// of a client.

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { respond } from '../../../shared/infrastructure/http/respond';
import { GetBusinessDetailUseCase } from '../../application/use-cases/get-business-detail.use-case';
import { ListBusinessesUseCase } from '../../application/use-cases/list-businesses.use-case';
import { PlatformKeyGuard } from './platform-key.guard';
import {
  PlatformBusinessJson,
  toBusinessJson,
  toDetailJson,
} from './platform.presenter';

@Controller('platform/tenants')
@UseGuards(PlatformKeyGuard)
export class PlatformTenantsController {
  constructor(
    private readonly list: ListBusinessesUseCase,
    private readonly detail: GetBusinessDetailUseCase,
  ) {}

  /** Every business of the installation, with its signals. */
  @Get()
  async listBusinesses(): Promise<{ businesses: PlatformBusinessJson[] }> {
    const businesses = respond(await this.list.execute());
    return { businesses: businesses.map(toBusinessJson) };
  }

  /** One business, with the breakdown of its bookings. */
  @Get(':id')
  async business(@Param('id') id: string): Promise<{
    business: PlatformBusinessJson;
    breakdown: ReturnType<typeof toDetailJson>['breakdown'];
  }> {
    return toDetailJson(respond(await this.detail.execute(id)));
  }
}
