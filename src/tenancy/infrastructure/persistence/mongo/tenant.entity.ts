import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ObjectId } from 'mongoose';
import { TenantStatus } from '../../../domain/tenant';
import {
  DEFAULT_REMINDER_HOURS_BEFORE,
  DEFAULT_REMINDER_TEMPLATE,
  REMINDER_CHANNELS,
  ReminderChannel,
} from '../../../../shared/domain/reminders';

/** The reminder settings of a business (spec 24). */
@Schema({ _id: false })
export class TenantReminderSettings {
  @Prop({ type: Boolean, default: true })
  enabled: boolean;

  @Prop({
    type: [String],
    enum: REMINDER_CHANNELS,
    default: ['whatsapp', 'email'],
  })
  channels: ReminderChannel[];

  @Prop({ type: [Number], default: [...DEFAULT_REMINDER_HOURS_BEFORE] })
  hoursBefore: number[];

  @Prop({ type: String, default: DEFAULT_REMINDER_TEMPLATE })
  template: string;
}

/** A business stored in the `tenants` collection. */
@Schema({ collection: 'tenants', versionKey: false })
export class TenantRecord {
  /** The Mongo id; the domain knows it as the `id` of the business. */
  _id: ObjectId;
  /** The unique name of the business in a URL (`X-Tenant`). */
  @Prop({ type: String, required: true })
  slug: string;

  /** The name the business shows. */
  @Prop({ type: String, required: true })
  name: string;

  /** A suspended business does not answer requests. */
  @Prop({ type: String, enum: ['active', 'suspended'], default: 'active' })
  status: TenantStatus;

  /** Exactly one business has it: the one used when the request names none. */
  @Prop({ type: Boolean, default: false })
  isDefault: boolean;

  @Prop({ type: Date, required: true })
  createdAt: Date;

  /** End of the free trial; null (or absent) means "no trial" (spec 21). */
  @Prop({ type: Date, default: null })
  trialEndsAt: Date | null;

  /** Bookings the trial allows; null (or absent) means "no limit" (spec 21). */
  @Prop({ type: Number, default: null })
  bookingQuota: number | null;

  /** The cap of data in bytes; null (or absent) means "no cap" (spec 22). */
  @Prop({ type: Number, default: null })
  storageQuotaBytes: number | null;

  /** The size of its documents at the last measurement. */
  @Prop({ type: Number, default: 0 })
  storageUsedBytes: number;

  /** When the size was last measured; null (or absent) means never. */
  @Prop({ type: Date, default: null })
  storageMeasuredAt: Date | null;

  /**
   * How the business wants its reminders (spec 24). Absent on the businesses
   * made before it: they get the defaults.
   */
  @Prop({ type: TenantReminderSettings, required: false })
  reminders?: TenantReminderSettings;
}

export const TenantSchema = SchemaFactory.createForClass(TenantRecord);

TenantSchema.index({ slug: 1 }, { unique: true });

/** There is exactly one default business. */
TenantSchema.index(
  { isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);
