import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ListScope } from '../../../application/ports/list-scope';
import { ProfessionalPhotoStore } from '../../../application/ports/professional-photo.store';
import { ProfessionalReader } from '../../../application/ports/professional.reader';
import { ProfessionalWriter } from '../../../application/ports/professional.writer';
import {
  NewProfessional,
  Professional,
  ProfessionalPatch,
  StoredPhoto,
} from '../../../domain/professional';
import { insertIfAbsent } from '../../../insert-if-absent';
import { CREATION_ORDER, WITHOUT_PHOTO_BYTES } from './mongo-queries';
import { ProfessionalRecord } from './professional.entity';
import {
  toNewRecord,
  toPhotoRecord,
  toProfessional,
  toSetFields,
  toStoredPhoto,
} from './professional.mapper';

/** Reads and writes the `professionals` collection through its Mongoose model. */
@Injectable()
export class MongoProfessionalRepository
  implements ProfessionalReader, ProfessionalWriter, ProfessionalPhotoStore
{
  constructor(
    @InjectModel(ProfessionalRecord.name)
    private readonly model: Model<ProfessionalRecord>,
  ) {}

  async list(scope: ListScope): Promise<Professional[]> {
    const records = await this.model
      .find(scope === 'active' ? { active: true } : {})
      .select(WITHOUT_PHOTO_BYTES)
      .sort(CREATION_ORDER)
      .lean<ProfessionalRecord[]>()
      .exec();
    return records.map(toProfessional);
  }

  find(id: string): Promise<Professional | null> {
    return this.findOneWithoutBytes({ id });
  }

  findActive(id: string): Promise<Professional | null> {
    return this.findOneWithoutBytes({ id, active: true });
  }

  async existingIds(ids: string[]): Promise<string[]> {
    const records = await this.model
      .find({ id: { $in: ids } })
      .select('id')
      .lean<ProfessionalRecord[]>()
      .exec();
    return records.map((record) => record.id);
  }

  async insert(
    candidates: AsyncIterable<string>,
    draft: NewProfessional,
  ): Promise<Professional> {
    const fields = toNewRecord(draft);
    for await (const id of candidates) {
      if (await insertIfAbsent(this.model, { id }, fields)) {
        return toProfessional({ id, ...fields });
      }
    }
    throw new Error('The candidates ended before one was free');
  }

  async update(
    id: string,
    patch: ProfessionalPatch,
  ): Promise<Professional | null> {
    return this.setFields(id, toSetFields(patch));
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ id }).exec();
  }

  async findPhoto(id: string): Promise<StoredPhoto | null> {
    const record = await this.model
      .findOne({ id })
      .lean<ProfessionalRecord | null>()
      .exec();
    return record ? toStoredPhoto(record) : null;
  }

  savePhoto(id: string, photo: StoredPhoto): Promise<Professional | null> {
    return this.setFields(id, { photo: toPhotoRecord(photo) });
  }

  removePhoto(id: string): Promise<Professional | null> {
    return this.setFields(id, { photo: null });
  }

  private async findOneWithoutBytes(
    filter: Record<string, unknown>,
  ): Promise<Professional | null> {
    const record = await this.model
      .findOne(filter)
      .select(WITHOUT_PHOTO_BYTES)
      .lean<ProfessionalRecord | null>()
      .exec();
    return record ? toProfessional(record) : null;
  }

  private async setFields(
    id: string,
    fields: Record<string, unknown>,
  ): Promise<Professional | null> {
    const updated = await this.model
      .findOneAndUpdate({ id }, { $set: fields }, { new: true })
      .select(WITHOUT_PHOTO_BYTES)
      .lean<ProfessionalRecord | null>()
      .exec();
    return updated ? toProfessional(updated) : null;
  }
}
