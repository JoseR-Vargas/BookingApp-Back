import { DefaultTenantScope } from '../../../../tenancy/infrastructure/default-tenant.scope';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EnsurePrincipalLocationUseCase } from '../../../application/use-cases/locations/ensure-principal-location.use-case';
import { PROFESSIONALS, SCHEDULE, SERVICES } from '../../../catalog.config';
import { insertIfAbsent } from '../../../insert-if-absent';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './business-settings.entity';
import { ProfessionalRecord } from './professional.entity';
import { ServiceRecord } from './service.entity';

/**
 * Seeds the defaults of catalog.config.ts. Each document is inserted only if
 * its key is absent ($setOnInsert), so admin edits survive restarts and
 * concurrent instances can seed at the same time. The order is fixed:
 * professionals, services, settings, then the principal location (the
 * `EnsurePrincipalLocationUseCase` migration, which copies the settings'
 * schedule).
 */
@Injectable()
export class CatalogSeeder {
  constructor(
    @InjectModel(ProfessionalRecord.name)
    private readonly professionalModel: Model<ProfessionalRecord>,
    @InjectModel(ServiceRecord.name)
    private readonly serviceModel: Model<ServiceRecord>,
    @InjectModel(BusinessSettingsRecord.name)
    private readonly settingsModel: Model<BusinessSettingsRecord>,
    private readonly ensurePrincipalLocation: EnsurePrincipalLocationUseCase,
    private readonly defaultTenant: DefaultTenantScope,
  ) {}

  /** The seeding belongs to the default business (spec 18). */
  async seed(): Promise<void> {
    await this.defaultTenant.run(() => this.seedInDefaultTenant());
  }

  private async seedInDefaultTenant(): Promise<void> {
    for (const { available, id, ...fields } of PROFESSIONALS) {
      await insertIfAbsent(
        this.professionalModel,
        { id },
        { ...fields, active: available },
      );
    }
    for (const { id, ...fields } of SERVICES) {
      await insertIfAbsent(
        this.serviceModel,
        { id },
        { ...fields, active: true },
      );
    }
    await insertIfAbsent(
      this.settingsModel,
      { key: SCHEDULE_KEY },
      {
        weekly: SCHEDULE.weekly,
        slotIntervalMinutes: SCHEDULE.slotIntervalMinutes,
        startIntervalMinutes: SCHEDULE.startIntervalMinutes,
      },
    );
    // After the settings: "principal" copies their schedule.
    await this.ensurePrincipalLocation.execute();
  }
}
