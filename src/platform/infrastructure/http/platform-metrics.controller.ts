// The metrics of the installation (spec 25). They are cached for a minute, so
// the answer says when they were computed and when they expire.

import { Controller, Get, UseGuards } from '@nestjs/common';
import { respond } from '../../../shared/infrastructure/http/respond';
import { GetPlatformMetricsUseCase } from '../../application/use-cases/get-platform-metrics.use-case';
import { PlatformKeyGuard } from './platform-key.guard';
import { PlatformMetricsJson, toMetricsJson } from './platform.presenter';

@Controller('platform/metrics')
@UseGuards(PlatformKeyGuard)
export class PlatformMetricsController {
  constructor(private readonly metrics: GetPlatformMetricsUseCase) {}

  @Get()
  async get(): Promise<PlatformMetricsJson> {
    const entry = respond(await this.metrics.execute());
    return toMetricsJson(entry.metrics, entry.expiresAt);
  }
}
