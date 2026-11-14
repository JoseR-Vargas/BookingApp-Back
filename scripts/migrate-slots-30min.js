#!/usr/bin/env node
/**
 * Recomputes `slots` of future confirmed bookings for the 30-minute grid.
 *
 * Rule: a booking occupies ceil(totalDuration / 30) consecutive 30-minute
 * blocks starting at `time`. The old hourly grid stored one slot per hour, so
 * new windows never cover more time than the old ones and the unique index
 * (professional.id, date, slots) is not expected to conflict.
 *
 * Usage (reads MONGODB_URI from the environment):
 *   node scripts/migrate-slots-30min.js             # dry run (default)
 *   node scripts/migrate-slots-30min.js --dry-run   # dry run, explicit
 *   node scripts/migrate-slots-30min.js --apply     # writes to the database
 */
const SLOT_MINUTES = 30;
const TIME = /^(\d{1,2}):(\d{2})$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * Slot start times for a booking, or null when `time` is not a valid
 * on-grid start (HH:00 / HH:30) or `totalDuration` is not a positive number.
 */
function computeSlots(time, totalDuration, slotMinutes = SLOT_MINUTES) {
  const match = TIME.exec(time ?? '');
  if (
    !match ||
    typeof totalDuration !== 'number' ||
    !Number.isFinite(totalDuration) ||
    totalDuration <= 0
  ) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59 || minutes % slotMinutes !== 0) {
    return null;
  }
  const start = hours * 60 + minutes;
  const blocks = Math.ceil(totalDuration / slotMinutes);
  const slots = [];
  for (let index = 0; index < blocks; index++) {
    const at = start + index * slotMinutes;
    if (at >= 24 * 60) {
      return null;
    }
    slots.push(`${pad(Math.floor(at / 60))}:${pad(at % 60)}`);
  }
  return slots;
}

const sameSlots = (a, b) =>
  Array.isArray(a) &&
  a.length === b.length &&
  a.every((slot, index) => slot === b[index]);

const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Parses argv into { apply }; throws on contradictory or unknown flags. */
function parseArgs(argv) {
  const flags = new Set(argv);
  const unknown = argv.filter(
    (arg) => arg !== '--apply' && arg !== '--dry-run',
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  }
  if (flags.has('--apply') && flags.has('--dry-run')) {
    throw new Error('Use either --dry-run or --apply, not both');
  }
  return { apply: flags.has('--apply') };
}

async function run({ apply }) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }
  // Required lazily so the pure helpers can be imported without a database.
  const mongoose = require('mongoose');
  const today = todayUtc();
  const mode = apply ? 'APPLY' : 'DRY RUN';
  console.log(`[${mode}] confirmed bookings with date >= ${today}`);

  await mongoose.connect(uri);
  const bookings = mongoose.connection.collection('bookings');
  const stats = {
    scanned: 0,
    unchanged: 0,
    toUpdate: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  try {
    const cursor = bookings.find(
      { status: 'confirmed', date: { $gte: today } },
      {
        projection: {
          date: 1,
          time: 1,
          totalDuration: 1,
          slots: 1,
          professional: 1,
        },
      },
    );
    for await (const booking of cursor) {
      stats.scanned++;
      const label = `${booking._id} ${booking.date} ${booking.time} ${booking.professional?.id ?? '?'}`;
      const next = computeSlots(booking.time, booking.totalDuration);
      if (!next) {
        stats.skipped++;
        console.warn(
          `SKIP ${label}: cannot recompute (time=${booking.time}, totalDuration=${booking.totalDuration})`,
        );
        continue;
      }
      if (sameSlots(booking.slots, next)) {
        stats.unchanged++;
        continue;
      }
      stats.toUpdate++;
      console.log(
        `${label}: [${(booking.slots ?? []).join(', ')}] -> [${next.join(', ')}]`,
      );
      if (!apply) {
        continue;
      }
      try {
        await bookings.updateOne(
          { _id: booking._id },
          { $set: { slots: next } },
        );
        stats.updated++;
      } catch (error) {
        stats.failed++;
        console.error(`FAILED ${label}: ${error.message}`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }

  console.log(`[${mode}] summary: ${JSON.stringify(stats)}`);
  if (!apply) {
    console.log(
      'Dry run only: nothing was written. Re-run with --apply to write.',
    );
  }
  return stats;
}

if (require.main === module) {
  Promise.resolve()
    .then(() => run(parseArgs(process.argv.slice(2))))
    .then((stats) => {
      process.exitCode = stats.failed > 0 ? 1 : 0;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { computeSlots, parseArgs, sameSlots, SLOT_MINUTES };
