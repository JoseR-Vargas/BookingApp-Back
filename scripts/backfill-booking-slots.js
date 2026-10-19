/**
 * Backfills `slots` on existing bookings and creates the unique slot index.
 *
 * Usage (requires a compiled build, the slot math is reused from dist/):
 *   npm run build
 *   MONGO_URI=mongodb://... npm run backfill:slots            # dry run
 *   MONGO_URI=mongodb://... npm run backfill:slots -- --apply # write
 *
 * Source of truth for the slot rules: src/availability/availability.calculator.ts
 * and src/catalog/catalog.config.ts (SCHEDULE). Index definition:
 * src/bookings/schemas/booking.schema.ts.
 *
 * For every booking it coerces numeric-string `service.duration` values to
 * numbers and computes `slots`. Bookings that cannot be backfilled safely are
 * REPORTED and left untouched:
 *   - invalid date, or a time that is not a valid start slot for its duration
 *     (off the grid, crossing lunch/closing, closed day);
 *   - missing or non-numeric duration;
 *   - missing professional id;
 *   - a confirmed booking whose slots collide with an earlier confirmed one
 *     (writing it would make the unique index build fail);
 *   - a status other than 'confirmed' / 'cancelled' (reported only).
 */
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const DIST = path.resolve(__dirname, '..', 'dist');
const STATUSES = ['confirmed', 'cancelled'];

function loadCompiled() {
  try {
    require('reflect-metadata');
    return {
      calculator: require(path.join(DIST, 'availability/availability.calculator.js')),
      catalog: require(path.join(DIST, 'catalog/catalog.config.js')),
      bookingSchema: require(path.join(DIST, 'bookings/schemas/booking.schema.js')),
    };
  } catch (error) {
    console.error('❌ Compiled sources not found. Run `npm run build` first.');
    console.error(error.message);
    process.exit(1);
  }
}

/** Number for numbers and numeric strings ('90'), otherwise null. */
function coerceDuration(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function sameSlots(a, b) {
  return Array.isArray(a) && a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Pure planning step: returns the updates to apply and the problems found.
 * Earlier-created confirmed bookings win a slot collision.
 */
function planBackfill(bookings, { calculator, schedule }) {
  const interval = schedule.slotIntervalMinutes;
  const updates = [];
  const problems = [];
  const taken = new Map(); // 'professional|date|slot' -> booking id

  const ordered = [...bookings].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );

  for (const booking of ordered) {
    const id = String(booking._id);
    const label = `${id} (${booking.date} ${booking.time}, ${booking.status})`;
    const report = (reason) => problems.push({ id, label, reason });

    if (!STATUSES.includes(booking.status)) {
      report(`unknown status '${booking.status}'`);
    }

    const professionalId = booking.professional && booking.professional.id;
    if (!professionalId) {
      report('missing professional.id');
      continue;
    }

    const rawDuration = booking.service && booking.service.duration;
    const duration = coerceDuration(rawDuration);
    if (duration === null) {
      report(`invalid service.duration ${JSON.stringify(rawDuration)}`);
      continue;
    }

    const dayOfWeek = calculator.dayOfWeekFromIsoDate(booking.date);
    if (dayOfWeek === null) {
      report('invalid date');
      continue;
    }
    const daySlots = calculator.buildDaySlots(dayOfWeek, schedule);
    const required = calculator.slotsRequired(duration, interval);
    const validStarts = calculator.freeStartTimes(daySlots, new Set(), required, interval);
    if (!validStarts.includes(booking.time)) {
      report(`time ${booking.time} is not a valid start for ${duration} min`);
      continue;
    }
    const start = daySlots.indexOf(booking.time);
    const slots = daySlots.slice(start, start + required);

    if (booking.status === 'confirmed') {
      const keys = slots.map((slot) => `${professionalId}|${booking.date}|${slot}`);
      const clash = keys.find((key) => taken.has(key));
      if (clash) {
        report(`collides with confirmed booking ${taken.get(clash)} at ${clash.split('|')[2]}`);
        continue;
      }
      keys.forEach((key) => taken.set(key, id));
    }

    const set = {};
    if (!sameSlots(booking.slots, slots)) {
      set.slots = slots;
    }
    if (rawDuration !== duration) {
      set['service.duration'] = duration;
    }
    if (Object.keys(set).length > 0) {
      updates.push({ id: booking._id, label, set });
    }
  }

  return { updates, problems };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { calculator, catalog, bookingSchema } = loadCompiled();
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/booking';

  const client = new MongoClient(uri);
  await client.connect();
  console.log(`✅ Conectado a MongoDB (${apply ? 'APPLY' : 'DRY RUN'})`);

  try {
    const collection = client.db().collection('bookings');
    const bookings = await collection.find().toArray();
    const { updates, problems } = planBackfill(bookings, {
      calculator,
      schedule: catalog.SCHEDULE,
    });

    console.log(`\n📊 Reservas: ${bookings.length}`);
    console.log(`📝 Actualizaciones planificadas: ${updates.length}`);
    updates.forEach((u) => console.log(`  - ${u.label}: ${JSON.stringify(u.set)}`));
    console.log(`\n⚠️  Reservas a revisar manualmente (no se modifican): ${problems.length}`);
    problems.forEach((p) => console.log(`  - ${p.label}: ${p.reason}`));

    if (!apply) {
      console.log('\nDry run: no se escribió nada. Usa --apply para aplicar.');
      return;
    }

    if (updates.length > 0) {
      const result = await collection.bulkWrite(
        updates.map((u) => ({ updateOne: { filter: { _id: u.id }, update: { $set: u.set } } })),
      );
      console.log(`\n✅ Modificadas: ${result.modifiedCount}`);
    }

    // Create the schema's indexes (not syncIndexes: it would drop indexes
    // created outside the schema).
    for (const [fields, options] of bookingSchema.BookingSchema.indexes()) {
      try {
        const name = await collection.createIndex(fields, options);
        console.log(`✅ Índice listo: ${name}`);
      } catch (error) {
        console.error(`❌ No se pudo crear el índice ${JSON.stringify(fields)}: ${error.message}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { planBackfill, coerceDuration };
