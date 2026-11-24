import { WeeklySchedule } from '../../../shared/domain/schedule/schedule';
import { PublicAvailabilitySettings } from '../../domain/public-availability';
import { SEED_SCHEDULE } from '../../domain/seed-schedule';
import { LegacyScheduleReader } from './legacy-schedule.reader';
import { PublicAvailabilityReader } from './public-availability.reader';
import { PublicAvailabilityWriter } from './public-availability.writer';

/** The singleton `business_settings` document, as the contract sees it. */
export interface StoredSettings {
  weekly?: WeeklySchedule['weekly'];
  slotIntervalMinutes?: number;
  startIntervalMinutes?: number;
  publicAvailability?: PublicAvailabilitySettings;
}

/** What the contract needs from the adapters under test, on an EMPTY store. */
export interface BusinessSettingsFixture {
  publicReader: PublicAvailabilityReader;
  publicWriter: PublicAvailabilityWriter;
  legacy: LegacyScheduleReader;
  /** Stores the settings document exactly as given, bypassing the ports. */
  seed(settings: StoredSettings): Promise<void>;
  /** The stored document, or null when there is none. */
  stored(): Promise<StoredSettings | null>;
}

const WEEK: WeeklySchedule['weekly'] = {
  ...SEED_SCHEDULE.weekly,
  1: { closed: false, open: '10:00', close: '14:00' },
  6: { closed: true },
};

const SETTINGS: PublicAvailabilitySettings = {
  enabled: true,
  days: 10,
  serviceIds: ['corte'],
};

/**
 * Behavior of the three ports that read and write the settings document
 * (PublicAvailabilityReader/Writer and LegacyScheduleReader), which share it.
 */
export function describeBusinessSettingsContract(
  name: string,
  factory: () => Promise<BusinessSettingsFixture>,
): void {
  describe(`Business settings contract: ${name}`, () => {
    let fixture: BusinessSettingsFixture;

    beforeEach(async () => {
      fixture = await factory();
    });

    describe('PublicAvailabilityReader', () => {
      it('answers the default (off, 7 days, every service) when no document is stored', async () => {
        await expect(fixture.publicReader.read()).resolves.toEqual({
          enabled: false,
          days: 7,
          serviceIds: null,
        });
      });

      it('answers the default when the document has no settings', async () => {
        await fixture.seed({ weekly: WEEK, slotIntervalMinutes: 30 });
        await expect(fixture.publicReader.read()).resolves.toEqual({
          enabled: false,
          days: 7,
          serviceIds: null,
        });
      });

      it('answers the stored settings', async () => {
        await fixture.seed({
          weekly: WEEK,
          slotIntervalMinutes: 30,
          publicAvailability: SETTINGS,
        });
        await expect(fixture.publicReader.read()).resolves.toEqual(SETTINGS);
      });
    });

    describe('PublicAvailabilityWriter', () => {
      it('stores the settings and the reader answers them', async () => {
        await fixture.publicWriter.save(SETTINGS);
        await expect(fixture.publicReader.read()).resolves.toEqual(SETTINGS);
      });

      it('replaces earlier settings', async () => {
        await fixture.publicWriter.save(SETTINGS);
        await fixture.publicWriter.save({
          enabled: false,
          days: 3,
          serviceIds: null,
        });
        await expect(fixture.publicReader.read()).resolves.toEqual({
          enabled: false,
          days: 3,
          serviceIds: null,
        });
      });

      it('leaves the stored schedule untouched', async () => {
        await fixture.seed({
          weekly: WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 90,
        });
        await fixture.publicWriter.save(SETTINGS);
        await expect(fixture.stored()).resolves.toEqual({
          weekly: WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 90,
          publicAvailability: SETTINGS,
        });
      });

      it('creates the document when none exists, keeping the legacy schedule at its seed', async () => {
        await fixture.publicWriter.save(SETTINGS);
        await expect(fixture.legacy.readSchedule()).resolves.toEqual(
          SEED_SCHEDULE,
        );
      });
    });

    describe('LegacyScheduleReader', () => {
      it('answers the seed schedule when none was ever stored', async () => {
        await expect(fixture.legacy.readSchedule()).resolves.toEqual(
          SEED_SCHEDULE,
        );
      });

      it('answers the stored schedule', async () => {
        await fixture.seed({
          weekly: WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 120,
        });
        await expect(fixture.legacy.readSchedule()).resolves.toEqual({
          weekly: WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 120,
        });
      });

      it('reads a start interval stored without as 30', async () => {
        await fixture.seed({ weekly: WEEK, slotIntervalMinutes: 30 });
        await expect(fixture.legacy.readSchedule()).resolves.toEqual({
          weekly: WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 30,
        });
      });

      it('never modifies the document', async () => {
        const doc = {
          weekly: WEEK,
          slotIntervalMinutes: 30,
          startIntervalMinutes: 120,
        };
        await fixture.seed(doc);
        await fixture.legacy.readSchedule();
        await expect(fixture.stored()).resolves.toEqual(doc);
      });
    });
  });
}
