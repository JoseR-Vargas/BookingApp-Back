import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  DayOfWeek,
  DaySchedule,
} from '../../../../shared/domain/schedule/schedule';
import { tenantScopePlugin } from '../../../../shared/infrastructure/mongo/tenant-scope.plugin';

/** A business location (local) stored in the `locations` collection. */
@Schema({ collection: 'locations', versionKey: false })
export class LocationRecord {
  /** Slug generated from the name; unique and immutable. */
  @Prop({ type: String, required: true })
  id: string;

  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, default: '' })
  address: string;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  /** Keyed '0' (Sunday) to '6' (Saturday), same shape as the legacy schedule. */
  @Prop({ type: Object, required: true })
  weekly: Record<DayOfWeek, DaySchedule>;

  /** Fixed at 30; the admin cannot change it. */
  @Prop({ type: Number, default: 30 })
  slotIntervalMinutes: number;

  /** Minutes between the start times offered to the public. A multiple of 30. */
  @Prop({ type: Number, default: 30 })
  startIntervalMinutes: number;

  /** Decides which active location is the default (the oldest one). */
  @Prop({ type: Date, required: true })
  createdAt: Date;

  /** The business this document belongs to (spec 18). */
  @Prop({ type: Types.ObjectId, required: false, index: true })
  tenantId?: Types.ObjectId;
}

export const LocationSchema = SchemaFactory.createForClass(LocationRecord);

// Every document belongs to a business, and every query is filtered by it (spec 18).
tenantScopePlugin(LocationSchema);

LocationSchema.index({ id: 1 }, { unique: true });
