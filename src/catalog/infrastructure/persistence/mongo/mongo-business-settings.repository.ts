import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WeeklySchedule } from '../../../../shared/domain/schedule/schedule';
import { LegacyScheduleReader } from '../../../application/ports/legacy-schedule.reader';
import { PublicAvailabilityReader } from '../../../application/ports/public-availability.reader';
import { PublicAvailabilityWriter } from '../../../application/ports/public-availability.writer';
import {
  DEFAULT_PUBLIC_AVAILABILITY,
  PublicAvailabilitySettings,
} from '../../../domain/public-availability';
import {
  BusinessSettingsRecord,
  SCHEDULE_KEY,
} from './business-settings.entity';
import { toLegacySchedule } from './business-settings.mapper';

/**
 * Reads and writes the singleton `business_settings` document through its
 * Mongoose model. The one document backs three ports: the public availability
 * settings (read and write) and the legacy schedule (read, for the migration).
 */
@Injectable()
export class MongoBusinessSettingsRepository
  implements
    PublicAvailabilityReader,
    PublicAvailabilityWriter,
    LegacyScheduleReader
{
  constructor(
    @InjectModel(BusinessSettingsRecord.name)
    private readonly model: Model<BusinessSettingsRecord>,
  ) {}

  async read(): Promise<PublicAvailabilitySettings> {
    const stored = await this.findDocument();
    return stored?.publicAvailability ?? { ...DEFAULT_PUBLIC_AVAILABILITY };
  }

  async save(settings: PublicAvailabilitySettings): Promise<void> {
    await this.model
      .updateOne(
        { key: SCHEDULE_KEY },
        { $set: { publicAvailability: settings } },
        { upsert: true },
      )
      .exec();
  }

  async readSchedule(): Promise<WeeklySchedule> {
    return toLegacySchedule(await this.findDocument());
  }

  private findDocument(): Promise<BusinessSettingsRecord | null> {
    return this.model
      .findOne({ key: SCHEDULE_KEY })
      .lean<BusinessSettingsRecord | null>()
      .exec();
  }
}
