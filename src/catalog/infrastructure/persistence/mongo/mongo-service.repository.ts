import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ListScope } from '../../../application/ports/list-scope';
import { ServiceReader } from '../../../application/ports/service.reader';
import { ServiceWriter } from '../../../application/ports/service.writer';
import { NewService, Service, ServicePatch } from '../../../domain/service';
import { insertIfAbsent } from '../../../insert-if-absent';
import { CREATION_ORDER } from './mongo-queries';
import { ServiceRecord } from './service.entity';
import {
  toNewServiceRecord,
  toService,
  toServiceSetFields,
} from './service.mapper';

/** Reads and writes the `services` collection through its Mongoose model. */
@Injectable()
export class MongoServiceRepository implements ServiceReader, ServiceWriter {
  constructor(
    @InjectModel(ServiceRecord.name)
    private readonly model: Model<ServiceRecord>,
  ) {}

  async list(scope: ListScope): Promise<Service[]> {
    const records = await this.model
      .find(scope === 'active' ? { active: true } : {})
      .sort(CREATION_ORDER)
      .lean<ServiceRecord[]>()
      .exec();
    return records.map(toService);
  }

  find(id: string): Promise<Service | null> {
    return this.findOne({ id });
  }

  findActive(id: string): Promise<Service | null> {
    return this.findOne({ id, active: true });
  }

  async findActiveByIds(ids: string[]): Promise<Service[]> {
    const records = await this.model
      .find({ id: { $in: ids }, active: true })
      .lean<ServiceRecord[]>()
      .exec();
    return records.map(toService);
  }

  async offeredBy(professionalId: string): Promise<Service[]> {
    const records = await this.model
      .find({ professionals: professionalId })
      .sort(CREATION_ORDER)
      .lean<ServiceRecord[]>()
      .exec();
    return records.map(toService);
  }

  async insert(
    candidates: AsyncIterable<string>,
    draft: NewService,
  ): Promise<Service> {
    const fields = toNewServiceRecord(draft);
    for await (const id of candidates) {
      if (await insertIfAbsent(this.model, { id }, fields)) {
        return toService({ id, ...fields });
      }
    }
    throw new Error('The candidates ended before one was free');
  }

  async update(id: string, patch: ServicePatch): Promise<Service | null> {
    const updated = await this.model
      .findOneAndUpdate(
        { id },
        { $set: toServiceSetFields(patch) },
        { new: true },
      )
      .lean<ServiceRecord | null>()
      .exec();
    return updated ? toService(updated) : null;
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ id }).exec();
  }

  async removeProfessional(professionalId: string): Promise<void> {
    await this.model
      .updateMany(
        { professionals: professionalId },
        { $pull: { professionals: professionalId } },
      )
      .exec();
  }

  private async findOne(
    filter: Record<string, unknown>,
  ): Promise<Service | null> {
    const record = await this.model
      .findOne(filter)
      .lean<ServiceRecord | null>()
      .exec();
    return record ? toService(record) : null;
  }
}
