import {
  DEFAULT_TEST_MONGO_URI,
  TEST_DATABASE,
  connectTestMongo,
  resolveTestTarget,
} from './mongo-test-connection';

describe('resolveTestTarget', () => {
  it('defaults to the Docker e2e Mongo and the dedicated test database', () => {
    expect(resolveTestTarget(undefined)).toEqual({
      uri: DEFAULT_TEST_MONGO_URI,
      dbName: 'booking_int_test',
    });
    expect(DEFAULT_TEST_MONGO_URI).toBe('mongodb://localhost:27018');
    expect(TEST_DATABASE.endsWith('_int_test')).toBe(true);
  });

  it('takes the host from the override and keeps the dedicated database', () => {
    expect(resolveTestTarget('mongodb://other:27017')).toEqual({
      uri: 'mongodb://other:27017',
      dbName: 'booking_int_test',
    });
  });

  it('accepts an override that names a *_int_test database', () => {
    expect(resolveTestTarget('mongodb://other:27017/ci_int_test?x=1')).toEqual({
      uri: 'mongodb://other:27017/ci_int_test?x=1',
      dbName: 'ci_int_test',
    });
  });

  it.each([
    'mongodb://other:27017/bookings',
    'mongodb://u:p@cluster.example.net/production?retryWrites=true',
    'mongodb+srv://cluster.example.net/booking',
  ])('refuses %s: the database name does not end with _int_test', (uri) => {
    expect(() => resolveTestTarget(uri)).toThrow(/_int_test/);
  });
});

describe('connectTestMongo', () => {
  it('fails loudly and clearly when Mongo is unreachable', async () => {
    const saved = process.env.TEST_MONGO_URI;
    process.env.TEST_MONGO_URI = 'mongodb://127.0.0.1:1';
    try {
      await expect(connectTestMongo({ timeoutMs: 300 })).rejects.toThrow(
        /MongoDB is not reachable at mongodb:\/\/127\.0\.0\.1:1.*booking-e2e-mongo/s,
      );
    } finally {
      if (saved === undefined) delete process.env.TEST_MONGO_URI;
      else process.env.TEST_MONGO_URI = saved;
    }
  });
});
