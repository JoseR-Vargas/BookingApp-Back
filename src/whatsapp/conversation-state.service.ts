import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConversationState } from './schemas/conversation-state.schema';

export interface StoredConversation {
  step: string;
  data: Record<string, unknown>;
}

/** Generic per-phone conversation storage; the bot defines steps and data. */
@Injectable()
export class ConversationStateService {
  constructor(
    @InjectModel(ConversationState.name)
    private readonly model: Model<ConversationState>,
  ) {}

  async get(phone: string): Promise<StoredConversation | null> {
    const doc = await this.model.findOne({ phone }).lean().exec();
    if (!doc) return null;
    return { step: doc.step, data: doc.data ?? {} };
  }

  async save(
    phone: string,
    step: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await this.model
      .findOneAndUpdate(
        { phone },
        { $set: { step, data, updatedAt: new Date() } },
        { upsert: true },
      )
      .exec();
  }

  async clear(phone: string): Promise<void> {
    await this.model.deleteOne({ phone }).exec();
  }
}
