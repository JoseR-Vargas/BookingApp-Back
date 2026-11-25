import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LEGACY_SCHEDULE_READER,
  LegacyScheduleReader,
} from '../../../application/ports/legacy-schedule.reader';
import { LocationReader } from '../../../application/ports/location.reader';
import { LocationWriter } from '../../../application/ports/location.writer';
import {
  Location,
  LocationPatch,
  NewLocation,
  ScheduleChange,
} from '../../../domain/location';
import { neverMigratedPrincipal } from '../../../domain/location.rules';
import { insertIfAbsent } from '../../../insert-if-absent';
import { LocationRecord } from './location.entity';
import {
  toLocation,
  toNewRecord,
  toScheduleFields,
  toSetFields,
} from './location.mapper';
import { CREATION_ORDER } from './mongo-queries';

/** Reads and writes the `locations` collection through its Mongoose model. */
@Injectable()
export class MongoLocationRepository implements LocationReader, LocationWriter {
  constructor(
    @InjectModel(LocationRecord.name)
    private readonly model: Model<LocationRecord>,
    @Inject(LEGACY_SCHEDULE_READER)
    private readonly legacy: LegacyScheduleReader,
  ) {}

  async list(): Promise<Location[]> {
    const records = await this.model
      .find({})
      .sort(CREATION_ORDER)
      .lean<LocationRecord[]>()
      .exec();
    if (records.length > 0) {
      return records.map(toLocation);
    }
    return [neverMigratedPrincipal(await this.legacy.readSchedule())];
  }

  async hasAny(): Promise<boolean> {
    return (await this.model.exists({}).exec()) !== null;
  }

  async insert(
    candidates: AsyncIterable<string>,
    draft: NewLocation,
  ): Promise<Location> {
    const fields = toNewRecord(draft);
    for await (const id of candidates) {
      if (await insertIfAbsent(this.model, { id }, fields)) {
        return toLocation({ id, ...fields });
      }
    }
    throw new Error('The candidates ended before one was free');
  }

  insertIfAbsent(location: Location): Promise<boolean> {
    const { id, ...fields } = location;
    return insertIfAbsent(this.model, { id }, fields);
  }

  update(id: string, patch: LocationPatch): Promise<Location | null> {
    return this.setFields(id, toSetFields(patch));
  }

  saveSchedule(id: string, change: ScheduleChange): Promise<Location | null> {
    return this.setFields(id, toScheduleFields(change));
  }

  private async setFields(
    id: string,
    fields: Record<string, unknown>,
  ): Promise<Location | null> {
    const updated = await this.model
      .findOneAndUpdate({ id }, { $set: fields }, { new: true })
      .lean<LocationRecord | null>()
      .exec();
    return updated ? toLocation(updated) : null;
  }
}
