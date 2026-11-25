import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  DayOfWeek,
  DaySchedule,
} from '../../../../shared/domain/schedule/schedule';
import { PublicAvailabilitySettings } from '../../../domain/public-availability';
import { tenantScopePlugin } from '../../../../shared/infrastructure/mongo/tenant-scope.plugin';

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

  /** The business this document belongs to (spec 18). */
  @Prop({ type: Types.ObjectId, required: false, index: true })
  tenantId?: Types.ObjectId;
}

export const BusinessSettingsSchema = SchemaFactory.createForClass(
  BusinessSettingsRecord,
);

// Every document belongs to a business, and every query is filtered by it (spec 18).
tenantScopePlugin(BusinessSettingsSchema);

BusinessSettingsSchema.index({ key: 1 }, { unique: true });
