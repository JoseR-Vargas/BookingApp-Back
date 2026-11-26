// ===== ADAPTADOR: USO DE LOS NEGOCIOS =====
// What every business of the installation did, read across businesses (the
// owner of the system, spec 25).
//
// The reads use the raw driver, like `MongoPlanUsageReader` does, and they
// run inside the explicit `unscoped` escape: the owner of the system is the
// only caller allowed to read across businesses. Every query is READ ONLY and
// counts things: the documents of a client are never read, only counted.

import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { unscoped } from '../../../../shared/infrastructure/tenancy/unscoped';
import { Period } from '../../../domain/period.rules';
import {
  BreakdownEntry,
  PlatformBreakdown,
  PlatformCatalogSize,
  PlatformUsage,
} from '../../../domain/platform-usage';
import { PlatformUsageReader } from '../../../application/ports/platform-usage.port';

/** One line of a grouped read: the business it counts and how many. */
interface TenantGroup {
  _id: Types.ObjectId | string | null;
  bookings: number;
  lastUseAt?: Date;
}

/** One line of a grouped read: the id it counts and how many. */
interface IdGroup {
  _id: string | null;
  bookings: number;
}

@Injectable()
export class MongoPlatformUsageReader implements PlatformUsageReader {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * The bookings of every business in the period and the last booking of each
   * one (its last use). One grouped read over the whole collection.
   */
  async usage(period: Period): Promise<PlatformUsage> {
    const rows = await unscoped(
      'the usage of the businesses of the owner of the system',
      () =>
        this.connection
          .collection('bookings')
          .aggregate([
            {
              $group: {
                _id: '$tenantId',
                bookings: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ['$createdAt', period.start] },
                          { $lt: ['$createdAt', period.end] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                lastUseAt: { $max: '$createdAt' },
              },
            },
          ])
          .toArray(),
    );
    const bookingsByBusiness = new Map<string, number>();
    const lastUseByBusiness = new Map<string, Date>();
    for (const row of rows as TenantGroup[]) {
      if (!row._id) continue;
      const tenantId =
        typeof row._id === 'string' ? row._id : row._id.toHexString();
      bookingsByBusiness.set(tenantId, row.bookings);
      if (row.lastUseAt) lastUseByBusiness.set(tenantId, row.lastUseAt);
    }
    return { bookingsByBusiness, lastUseByBusiness };
  }

  /** The bookings of one business in the period, counted three ways. */
  async breakdown(
    tenantId: string,
    period: Period,
  ): Promise<PlatformBreakdown> {
    const rows = await unscoped(
      'the breakdown of the bookings of a business of the owner of the system',
      () =>
        this.connection
          .collection('bookings')
          .aggregate([
            {
              $match: {
                tenantId: new Types.ObjectId(tenantId),
                createdAt: { $gte: period.start, $lt: period.end },
              },
            },
            {
              $facet: {
                professionals: [
                  {
                    $group: { _id: '$professional.id', bookings: { $sum: 1 } },
                  },
                  { $sort: { _id: 1 } },
                ],
                services: [
                  { $unwind: '$services' },
                  { $group: { _id: '$services.id', bookings: { $sum: 1 } } },
                  { $sort: { _id: 1 } },
                ],
                locations: [
                  { $group: { _id: '$location.id', bookings: { $sum: 1 } } },
                  { $sort: { _id: 1 } },
                ],
              },
            },
          ])
          .toArray(),
    );
    const facet = (rows[0] ?? {}) as {
      professionals?: IdGroup[];
      services?: IdGroup[];
      locations?: IdGroup[];
    };
    return {
      professionals: toEntries(facet.professionals),
      services: toEntries(facet.services),
      locations: toEntries(facet.locations),
    };
  }

  /** How many professionals, services and locations the business has. */
  async catalogSize(tenantId: string): Promise<PlatformCatalogSize> {
    const tenant = new Types.ObjectId(tenantId);
    const count = (collection: string): Promise<number> =>
      unscoped('the catalog of a business of the owner of the system', () =>
        this.connection
          .collection(collection)
          .countDocuments({ tenantId: tenant, active: true }),
      );
    const [professionals, services, locations] = await Promise.all([
      count('professionals'),
      count('services'),
      count('locations'),
    ]);
    return { professionals, services, locations };
  }
}

/** The lines of a grouped read: the id and the count, never a name. */
const toEntries = (rows: IdGroup[] | undefined): BreakdownEntry[] =>
  (rows ?? [])
    .filter((row) => row._id !== null && row._id !== undefined)
    .map((row) => ({ id: row._id as string, bookings: row.bookings }));
