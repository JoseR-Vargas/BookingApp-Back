import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PaymentEventEntry,
  PaymentEventLog,
} from '../../../application/ports/payment-event-log.port';
import { PaymentEventRecord } from './payment-event.entity';

/** MongoDB duplicate key error code. */
const DUPLICATE_KEY = 11000;

/** The global `payment_events` collection (not tenant-scoped, see the entity). */
@Injectable()
export class MongoPaymentEventLog implements PaymentEventLog {
  constructor(
    @InjectModel(PaymentEventRecord.name)
    private readonly model: Model<PaymentEventRecord>,
  ) {}

  async has(externalEventId: string): Promise<boolean> {
    return (await this.model.exists({ externalEventId }).exec()) !== null;
  }

  async tryRecord(entry: PaymentEventEntry): Promise<boolean> {
    try {
      await this.model.create(entry);
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }
}
