import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

@Schema({ timestamps: true })
export class Booking extends Document {
  @Prop({
    type: {
      name: { type: String, required: true },
      id: { type: String, required: false },
      // Optional: WhatsApp bookings only provide a phone number.
      email: { type: String, required: false },
      phone: { type: String, required: true },
    },
    required: true,
  })
  client: {
    name: string;
    id?: string;
    email?: string;
    phone: string;
  };

  @Prop({
    type: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      duration: { type: Number, required: true },
    },
    required: true,
  })
  service: {
    id: string;
    name: string;
    price: number;
    duration: number;
  };

  @Prop({
    type: {
      id: { type: String, required: true },
      name: { type: String, required: true },
    },
    required: true,
  })
  professional: {
    id: string;
    name: string;
  };

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  time: string;

  /**
   * Hourly slot labels ('HH:00') occupied by the booking. Always computed
   * server-side. No default so legacy documents stay without the field
   * (an empty array would be indexed and collide in the unique index).
   */
  @Prop({ type: [String], default: undefined })
  slots?: string[];

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: String, enum: BOOKING_STATUSES, default: 'confirmed' })
  status: BookingStatus;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

/**
 * One confirmed booking per professional, date and slot. Being multikey on
 * `slots`, uniqueness applies to each array element across documents.
 * Cancelled bookings and legacy documents without `slots` are not indexed,
 * so they never block (run `npm run backfill:slots` to cover legacy data).
 */
BookingSchema.index(
  { 'professional.id': 1, date: 1, slots: 1 },
  {
    name: 'uniq_confirmed_professional_date_slot',
    unique: true,
    partialFilterExpression: {
      status: 'confirmed',
      slots: { $exists: true },
    },
  },
);
