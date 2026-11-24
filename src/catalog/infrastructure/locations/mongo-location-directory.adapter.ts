import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationDirectory } from '../../application/ports/location-directory.port';
import { activeLocations, loadLocations } from '../../locations';
import { BusinessSettingsRecord } from '../../schemas/business-settings.schema';
import { LocationRecord } from '../../schemas/location.schema';

/**
 * Answers which locations are active by reading the locations collection (an
 * installation that was never migrated reads as the one "principal" location).
 * TEMPORARY, until `locations` is migrated (spec 12) and answers by itself.
 */
@Injectable()
export class MongoLocationDirectoryAdapter implements LocationDirectory {
  constructor(
    @InjectModel(LocationRecord.name)
    private readonly locationModel: Model<LocationRecord>,
    @InjectModel(BusinessSettingsRecord.name)
    private readonly settingsModel: Model<BusinessSettingsRecord>,
  ) {}

  async activeIds(): Promise<string[]> {
    return (await this.active()).map((location) => location.id);
  }

  async defaultId(): Promise<string | null> {
    return (await this.active())[0]?.id ?? null;
  }

  private async active(): Promise<LocationRecord[]> {
    return activeLocations(
      await loadLocations(this.locationModel, this.settingsModel),
    );
  }
}
