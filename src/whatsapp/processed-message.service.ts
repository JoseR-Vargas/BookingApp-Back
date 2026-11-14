import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProcessedMessage } from './schemas/processed-message.schema';

const DUPLICATE_KEY_ERROR = 11000;

/** Idempotency guard: Meta redelivers a webhook until it gets a 2xx. */
@Injectable()
export class ProcessedMessageService {
  constructor(
    @InjectModel(ProcessedMessage.name)
    private readonly model: Model<ProcessedMessage>,
  ) {}

  /** True the first time a message id is seen, false for a duplicate. */
  async claim(messageId: string): Promise<boolean> {
    try {
      await this.model.create({ messageId });
      return true;
    } catch (error) {
      if ((error as { code?: number })?.code === DUPLICATE_KEY_ERROR) {
        return false;
      }
      throw error;
    }
  }
}
