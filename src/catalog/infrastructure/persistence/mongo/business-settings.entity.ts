import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  DayOfWeek,
  DaySchedule,
} from '../../../../shared/domain/schedule/schedule';
import { PublicAvailabilitySettings } from '../../../domain/public-availability';

/** Key of the single document that holds the weekly schedule. */
export const SCHEDULE_KEY = 'schedule';

/** Singleton settings document of the `business_settings` collection. */
@Schema({ collection: 'business_settings', versionKey: false })
export class BusinessSettingsRecord {
  @Prop({ type: String, required: true, default: SCHEDULE_KEY })
  key: string;

  /** Keyed '0' (Sunday) to '6' (Saturday). */
  @Prop({ type: Object, required: true })
  weekly: Record<DayOfWeek, DaySchedule>;

  /** Fixed at 30; the admin cannot change it. */
  @Prop({ type: Number, default: 30 })
  slotIntervalMinutes: number;

  /** Minutes between the start times offered to the public. A multiple of 30. */
  @Prop({ type: Number, default: 30 })
  startIntervalMinutes: number;

  /** Public availability page settings; absent on documents stored before it existed. */
  @Prop({ type: Object })
  publicAvailability?: PublicAvailabilitySettings;
}

export const BusinessSettingsSchema = SchemaFactory.createForClass(
  BusinessSettingsRecord,
);

BusinessSettingsSchema.index({ key: 1 }, { unique: true });
