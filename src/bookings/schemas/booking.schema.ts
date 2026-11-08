import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const BOOKING_STATUSES = ['confirmed', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface BookedService {
  id: string;
  name: string;
  price: number;
  duration: number;
}

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

  /** Services performed back-to-back, in order, as priced when booked. */
  @Prop({
    type: [
      {
        _id: false,
        id: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        duration: { type: Number, required: true },
      },
    ],
    required: true,
  })
  services: BookedService[];

  @Prop({ required: true })
  totalPrice: number;

  /** Sum of the service durations, in minutes. */
  @Prop({ required: true })
  totalDuration: number;

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

  /** Slot start times ('HH:MM') the booking occupies. Computed server-side. */
  @Prop({ type: [String], required: true })
  slots: string[];

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: String, enum: BOOKING_STATUSES, default: 'confirmed' })
  status: BookingStatus;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

/**
 * One confirmed booking per professional, date and slot. Being multikey on
 * `slots`, uniqueness applies to each array element across documents.
 * Cancelled bookings are not indexed, so they never block.
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
