/**
 * Integration tests: only `*.int.spec.ts`, against the Docker Mongo
 * (`booking-e2e-mongo`, port 27018). Run with `npm run test:int`.
 * `npm test` skips them (see testPathIgnorePatterns in package.json).
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.int\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  testTimeout: 15000,
  setupFilesAfterEnv: ['<rootDir>/shared/testing/int-tenant-scope.setup.ts'],
};
