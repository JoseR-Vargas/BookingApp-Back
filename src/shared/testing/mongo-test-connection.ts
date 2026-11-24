import { Connection, createConnection } from 'mongoose';

/** The Docker container `booking-e2e-mongo` publishes MongoDB on this port. */
export const DEFAULT_TEST_MONGO_URI = 'mongodb://localhost:27018';

/** Dedicated database of the integration tests; nothing else is ever touched. */
export const TEST_DATABASE = 'booking_int_test';

const REQUIRED_SUFFIX = '_int_test';
const DEFAULT_TIMEOUT_MS = 3000;

export interface TestTarget {
  uri: string;
  dbName: string;
}

/** Database named in the path of a connection string, if any. */
const databaseOf = (uri: string): string | undefined =>
  /^mongodb(?:\+srv)?:\/\/[^/?]+\/([^?]+)/.exec(uri)?.[1];

/** The connection string without credentials, safe to print. */
const redact = (uri: string): string => uri.replace(/\/\/[^@/]*@/, '//***@');

/**
 * Where the integration tests connect: `TEST_MONGO_URI` or the Docker Mongo.
 * Refuses any database whose name does not end with `_int_test`, so a wrong
 * variable can never point the tests (which empty collections) at real data.
 */
export function resolveTestTarget(
  uri: string | undefined = process.env.TEST_MONGO_URI,
): TestTarget {
  const target = uri || DEFAULT_TEST_MONGO_URI;
  const named = databaseOf(target);
  if (named !== undefined && !named.endsWith(REQUIRED_SUFFIX)) {
    throw new Error(
      `Refusing to run integration tests on database "${named}": its name must end with "${REQUIRED_SUFFIX}".`,
    );
  }
  return { uri: target, dbName: named ?? TEST_DATABASE };
}

/**
 * Connects to the test database. Never skips: when MongoDB is down the
 * returned promise rejects with a message that says how to start it.
 */
export async function connectTestMongo(
  options: { timeoutMs?: number } = {},
): Promise<Connection> {
  const { uri, dbName } = resolveTestTarget();
  try {
    const connection = await createConnection(uri, {
      dbName,
      serverSelectionTimeoutMS: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }).asPromise();
    if (!connection.name.endsWith(REQUIRED_SUFFIX)) {
      await connection.close();
      throw new Error(
        `Connected to "${connection.name}", not a *${REQUIRED_SUFFIX} database.`,
      );
    }
    return connection;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Connected to')) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Integration tests need MongoDB, but MongoDB is not reachable at ${redact(uri)} (${reason}). ` +
        'Start the Docker container with "docker start booking-e2e-mongo" (port 27018) or set TEST_MONGO_URI.',
    );
  }
}

/** Empties every collection of the test database (it keeps indexes). */
export async function clearTestCollections(
  connection: Connection,
): Promise<void> {
  if (!connection.name.endsWith(REQUIRED_SUFFIX)) {
    throw new Error(
      `Refusing to clear "${connection.name}": not a *${REQUIRED_SUFFIX} database.`,
    );
  }
  const collections = await connection.db.listCollections().toArray();
  await Promise.all(
    collections.map(({ name }) => connection.collection(name).deleteMany({})),
  );
}

export async function closeTestMongo(connection: Connection): Promise<void> {
  await connection.close();
}
