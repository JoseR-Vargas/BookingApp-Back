import { Types } from 'mongoose';

/**
 * The business every integration test file runs in (see
 * `int-tenant-scope.setup.ts`). Raw seeds must carry it, because the Mongoose
 * plugin filters every read by the business in force (spec 18).
 */
export const TEST_TENANT_ID = new Types.ObjectId();
