/**
 * Test-only in-memory stand-ins for the catalog Mongoose models. They emulate
 * just the query surface the catalog code uses (equality and `$in` filters,
 * `$set` / `$setOnInsert`, upsert) so specs never need a database.
 */
import { Provider } from '@nestjs/common';
import { Model } from 'mongoose';
import { SystemClock } from '../shared/infrastructure/system.clock';
import { GetPublicCatalogUseCase } from './application/use-cases/get-public-catalog.use-case';
import { CreateProfessionalUseCase } from './application/use-cases/professionals/create-professional.use-case';
import { DeactivateProfessionalUseCase } from './application/use-cases/professionals/deactivate-professional.use-case';
import { DeleteProfessionalPermanentlyUseCase } from './application/use-cases/professionals/delete-professional-permanently.use-case';
import { FindActiveProfessionalUseCase } from './application/use-cases/professionals/find-active-professional.use-case';
import { GetProfessionalPhotoUseCase } from './application/use-cases/professionals/get-professional-photo.use-case';
import { ListProfessionalsForServiceUseCase } from './application/use-cases/professionals/list-professionals-for-service.use-case';
import { ListProfessionalsUseCase } from './application/use-cases/professionals/list-professionals.use-case';
import { ProfessionalWorksAtLocationUseCase } from './application/use-cases/professionals/professional-works-at-location.use-case';
import { RemoveProfessionalPhotoUseCase } from './application/use-cases/professionals/remove-professional-photo.use-case';
import { SetProfessionalPhotoUseCase } from './application/use-cases/professionals/set-professional-photo.use-case';
import { UpdateProfessionalUseCase } from './application/use-cases/professionals/update-professional.use-case';
import { ResolveServiceSelectionUseCase } from './application/use-cases/resolve-service-selection.use-case';
import { CreateServiceUseCase } from './application/use-cases/services/create-service.use-case';
import { DeactivateServiceUseCase } from './application/use-cases/services/deactivate-service.use-case';
import { DeleteServicePermanentlyUseCase } from './application/use-cases/services/delete-service-permanently.use-case';
import { FindActiveServiceUseCase } from './application/use-cases/services/find-active-service.use-case';
import { ListServicesUseCase } from './application/use-cases/services/list-services.use-case';
import { UpdateServiceUseCase } from './application/use-cases/services/update-service.use-case';
import { CreateLocationUseCase } from './application/use-cases/locations/create-location.use-case';
import { EnsurePrincipalLocationUseCase } from './application/use-cases/locations/ensure-principal-location.use-case';
import { GetLocationUseCase } from './application/use-cases/locations/get-location.use-case';
import { ListLocationsUseCase } from './application/use-cases/locations/list-locations.use-case';
import { ResolveDefaultLocationUseCase } from './application/use-cases/locations/resolve-default-location.use-case';
import { SaveLocationScheduleUseCase } from './application/use-cases/locations/save-location-schedule.use-case';
import { UpdateLocationUseCase } from './application/use-cases/locations/update-location.use-case';
import { GetPublicAvailabilityUseCase } from './application/use-cases/settings/get-public-availability.use-case';
import { SavePublicAvailabilityUseCase } from './application/use-cases/settings/save-public-availability.use-case';
import { CatalogAdminService } from './catalog-admin.service';
import { CatalogService } from './catalog.service';
import { MongoBookingActivityAdapter } from './infrastructure/bookings/mongo-booking-activity.adapter';
import { CatalogPhotoController } from './infrastructure/http/catalog-photo.controller';
import { ProfessionalPhotosAdminController } from './infrastructure/http/professional-photos-admin.controller';
import { ProfessionalsAdminController } from './infrastructure/http/professionals-admin.controller';
import { ServicesAdminController } from './infrastructure/http/services-admin.controller';
import { LocationsAdminController } from './infrastructure/http/locations-admin.controller';
import { PublicAvailabilityAdminController } from './infrastructure/http/public-availability-admin.controller';
import { ScheduleAdminController } from './infrastructure/http/schedule-admin.controller';
import { MongoBusinessSettingsRepository } from './infrastructure/persistence/mongo/mongo-business-settings.repository';
import { MongoLocationRepository } from './infrastructure/persistence/mongo/mongo-location.repository';
import { CatalogSeeder } from './infrastructure/persistence/mongo/catalog.seeder';
import { MongoProfessionalRepository } from './infrastructure/persistence/mongo/mongo-professional.repository';
import { MongoServiceRepository } from './infrastructure/persistence/mongo/mongo-service.repository';

type Doc = Record<string, any>;
type Filter = Record<string, any>;

const valueAt = (doc: Doc, path: string): unknown =>
  path.split('.').reduce<unknown>((value, part) => {
    if (value == null) return value;
    // A path through an array reads the field of every element, like Mongo.
    return Array.isArray(value)
      ? value.map((item: Doc) => item?.[part] as unknown)
      : (value as Doc)[part];
  }, doc);

/**
 * Equality (a scalar also matches an array containing it, like Mongo), `$in`,
 * `$gte` and `$ne` are honoured, on dotted paths too; any other operator
 * object matches all.
 */
const matches = (doc: Doc, filter: Filter): boolean =>
  Object.entries(filter).every(([key, expected]) => {
    const actual = valueAt(doc, key);
    if (expected !== null && typeof expected === 'object') {
      const ops = expected as { $in?: unknown[]; $gte?: string; $ne?: unknown };
      if (ops.$in) {
        return ops.$in.includes(actual);
      }
      if (ops.$gte !== undefined || ops.$ne !== undefined) {
        return (
          (ops.$gte === undefined || (actual as string) >= ops.$gte) &&
          (ops.$ne === undefined || actual !== ops.$ne)
        );
      }
      return true;
    }
    return Array.isArray(actual)
      ? actual.includes(expected)
      : actual === expected;
  });

/** Keeps Dates and binary data intact, like a real Mongo round trip. */
const clone = <T>(value: T): T => structuredClone(value);

/** Emulates the `-photo.data` projection; other projections are ignored. */
const project = <T>(value: T, projection: string): T => {
  if (projection !== '-photo.data') return value;
  const strip = (doc: Doc) => {
    const photo = doc?.photo as Doc | null | undefined;
    if (photo) delete photo.data;
  };
  if (Array.isArray(value)) value.forEach(strip);
  else if (value) strip(value as Doc);
  return value;
};

/** Thenable-free query double: `.sort().select().lean().exec()` in any order. */
const query = <T>(run: () => T) => {
  let projection = '';
  const chain = {
    sort: () => chain,
    lean: () => chain,
    select: (spec: string) => {
      projection = spec;
      return chain;
    },
    exec: () => Promise.resolve(project(run(), projection)),
  };
  return chain;
};

export interface FakeModel {
  docs: Doc[];
  find: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
  updateMany: jest.Mock;
  deleteOne: jest.Mock;
  countDocuments: jest.Mock;
  exists: jest.Mock;
}

export function createFakeModel(initial: Doc[] = []): FakeModel & Model<any> {
  const docs: Doc[] = clone(initial);

  const equalityOf = (filter: Filter): Doc =>
    Object.fromEntries(
      Object.entries(filter).filter(
        ([, value]) => value === null || typeof value !== 'object',
      ),
    );

  const apply = (target: Doc, update: Doc, inserting: boolean) => {
    Object.assign(target, clone(update.$set ?? {}));
    if (inserting) {
      Object.assign(target, clone(update.$setOnInsert ?? {}));
    }
  };

  const model: FakeModel = {
    docs,
    countDocuments: jest.fn((filter: Filter = {}) =>
      query(() => docs.filter((doc) => matches(doc, filter)).length),
    ),
    exists: jest.fn((filter: Filter) =>
      query(() => (docs.some((doc) => matches(doc, filter)) ? {} : null)),
    ),
    deleteOne: jest.fn((filter: Filter) =>
      query(() => {
        const index = docs.findIndex((doc) => matches(doc, filter));
        if (index >= 0) docs.splice(index, 1);
        return { deletedCount: index >= 0 ? 1 : 0 };
      }),
    ),
    /** Only `$pull` of a scalar from a top-level array field. */
    updateMany: jest.fn((filter: Filter, update: Doc) =>
      query(() => {
        const targets = docs.filter((doc) => matches(doc, filter));
        for (const target of targets) {
          for (const [field, value] of Object.entries(
            (update.$pull ?? {}) as Doc,
          )) {
            target[field] = (target[field] as unknown[]).filter(
              (item) => item !== value,
            );
          }
        }
        return { modifiedCount: targets.length };
      }),
    ),
    find: jest.fn((filter: Filter = {}) =>
      query(() => clone(docs.filter((doc) => matches(doc, filter)))),
    ),
    findOne: jest.fn((filter: Filter) =>
      query(() => clone(docs.find((doc) => matches(doc, filter)) ?? null)),
    ),
    findOneAndUpdate: jest.fn(
      (filter: Filter, update: Doc, options: Doc = {}) =>
        query(() => {
          let target = docs.find((doc) => matches(doc, filter));
          if (!target && options.upsert) {
            target = equalityOf(filter);
            docs.push(target);
            apply(target, update, true);
          } else if (target) {
            apply(target, update, false);
          }
          return clone(target ?? null);
        }),
    ),
    updateOne: jest.fn((filter: Filter, update: Doc, options: Doc = {}) =>
      query(() => {
        const target = docs.find((doc) => matches(doc, filter));
        if (target) {
          apply(target, update, false);
          return { upsertedCount: 0, modifiedCount: 1 };
        }
        if (options.upsert) {
          const created = equalityOf(filter);
          docs.push(created);
          apply(created, update, true);
          return { upsertedCount: 1, modifiedCount: 0 };
        }
        return { upsertedCount: 0, modifiedCount: 0 };
      }),
    ),
  };
  return model as unknown as FakeModel & Model<any>;
}

/**
 * The catalog controllers that serve the professional, service, photo,
 * location, schedule and public availability routes. They need the use cases
 * of `createFakeCatalog().providers` and a `ScheduleImpactService`.
 */
export const CATALOG_ROUTE_CONTROLLERS = [
  CatalogPhotoController,
  ProfessionalsAdminController,
  ProfessionalPhotosAdminController,
  ServicesAdminController,
  LocationsAdminController,
  ScheduleAdminController,
  PublicAvailabilityAdminController,
];

/**
 * The whole catalog (facades, use cases and the MongoDB adapters) over the
 * fake models. `onModuleInit` seeds the models with the defaults.
 */
export function createFakeCatalog(initial?: {
  professionals?: Doc[];
  services?: Doc[];
  settings?: Doc[];
  bookings?: Doc[];
  locations?: Doc[];
}) {
  const professionalModel = createFakeModel(initial?.professionals);
  const serviceModel = createFakeModel(initial?.services);
  const settingsModel = createFakeModel(initial?.settings);
  const bookingModel = createFakeModel(initial?.bookings);
  const locationModel = createFakeModel(initial?.locations);

  const professionals = new MongoProfessionalRepository(professionalModel);
  const services = new MongoServiceRepository(serviceModel);
  const activity = new MongoBookingActivityAdapter(bookingModel);
  const settings = new MongoBusinessSettingsRepository(settingsModel);
  const locations = new MongoLocationRepository(locationModel, settings);
  const clock = new SystemClock();
  const ensurePrincipalLocation = new EnsurePrincipalLocationUseCase(
    locations,
    locations,
    settings,
    clock,
  );

  const updateProfessional = new UpdateProfessionalUseCase(
    professionals,
    locations,
  );
  const updateService = new UpdateServiceUseCase(services, professionals);
  const useCases = {
    listLocations: new ListLocationsUseCase(locations),
    getLocation: new GetLocationUseCase(locations),
    resolveDefaultLocation: new ResolveDefaultLocationUseCase(locations),
    ensurePrincipalLocation,
    createLocation: new CreateLocationUseCase(locations, clock),
    updateLocation: new UpdateLocationUseCase(locations, locations),
    saveLocationSchedule: new SaveLocationScheduleUseCase(
      locations,
      locations,
      ensurePrincipalLocation,
    ),
    getPublicAvailability: new GetPublicAvailabilityUseCase(settings),
    savePublicAvailability: new SavePublicAvailabilityUseCase(
      services,
      settings,
    ),
    listProfessionals: new ListProfessionalsUseCase(professionals),
    createProfessional: new CreateProfessionalUseCase(
      professionals,
      locations,
      activity,
      clock,
    ),
    updateProfessional,
    deactivateProfessional: new DeactivateProfessionalUseCase(
      updateProfessional,
    ),
    setProfessionalPhoto: new SetProfessionalPhotoUseCase(
      professionals,
      locations,
      clock,
    ),
    removeProfessionalPhoto: new RemoveProfessionalPhotoUseCase(
      professionals,
      locations,
    ),
    getProfessionalPhoto: new GetProfessionalPhotoUseCase(professionals),
    deleteProfessionalPermanently: new DeleteProfessionalPermanentlyUseCase(
      professionals,
      professionals,
      services,
      services,
      activity,
    ),
    findActiveProfessional: new FindActiveProfessionalUseCase(professionals),
    listProfessionalsForService: new ListProfessionalsForServiceUseCase(
      services,
      professionals,
    ),
    professionalWorksAtLocation: new ProfessionalWorksAtLocationUseCase(
      professionals,
      locations,
    ),
    listServices: new ListServicesUseCase(services),
    createService: new CreateServiceUseCase(services, professionals, activity),
    updateService,
    deactivateService: new DeactivateServiceUseCase(updateService),
    deleteServicePermanently: new DeleteServicePermanentlyUseCase(
      services,
      services,
      activity,
    ),
    findActiveService: new FindActiveServiceUseCase(services),
    resolveServiceSelection: new ResolveServiceSelectionUseCase(
      services,
      professionals,
      locations,
    ),
    getPublicCatalog: new GetPublicCatalogUseCase(services, professionals),
  };
  // The seeding runs in the default business (spec 18); the tests run without
  // a business in the context, so the scope is a pass-through here.
  const defaultTenant = {
    run: <T>(fn: () => Promise<T>) => fn(),
  };
  const seeder = new CatalogSeeder(
    professionalModel,
    serviceModel,
    settingsModel,
    ensurePrincipalLocation,
    defaultTenant as never,
  );
  const catalog = new CatalogService(
    seeder,
    useCases.listLocations,
    useCases.getLocation,
    useCases.getPublicAvailability,
    useCases.getPublicCatalog,
    useCases.listProfessionals,
    useCases.listServices,
    useCases.findActiveProfessional,
    useCases.findActiveService,
    useCases.getProfessionalPhoto,
    useCases.listProfessionalsForService,
    useCases.professionalWorksAtLocation,
    useCases.resolveServiceSelection,
  );
  const admin = new CatalogAdminService(
    useCases.saveLocationSchedule,
    useCases.createLocation,
    useCases.updateLocation,
    useCases.savePublicAvailability,
  );

  /** For `Test.createTestingModule({ providers })`: the use cases above, by class. */
  const useCaseProviders: Provider[] = Object.values(useCases).map(
    (useCase) => ({
      provide: (useCase as object).constructor,
      useValue: useCase,
    }),
  );
  /** The use cases and both facades (Nest runs `onModuleInit` of the catalog, which seeds). */
  const providers: Provider[] = [
    { provide: CatalogService, useValue: catalog },
    { provide: CatalogAdminService, useValue: admin },
    ...useCaseProviders,
  ];
  return {
    catalog,
    admin,
    useCases,
    providers,
    useCaseProviders,
    professionalModel,
    serviceModel,
    settingsModel,
    bookingModel,
    locationModel,
  };
}

/** A CatalogService already seeded with the defaults of catalog.config.ts. */
export async function createSeededCatalogService(): Promise<CatalogService> {
  const { catalog } = createFakeCatalog();
  await catalog.onModuleInit();
  return catalog;
}
