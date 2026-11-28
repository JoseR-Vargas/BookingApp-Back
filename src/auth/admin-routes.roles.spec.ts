import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminController } from '../admin/admin.controller';
import { BookingsController } from '../bookings/infrastructure/http/bookings.controller';
import { BrandingAdminController } from '../branding/infrastructure/http/branding-admin.controller';
import { LocationsAdminController } from '../catalog/infrastructure/http/locations-admin.controller';
import { ProfessionalPhotosAdminController } from '../catalog/infrastructure/http/professional-photos-admin.controller';
import { ProfessionalsAdminController } from '../catalog/infrastructure/http/professionals-admin.controller';
import { PublicAvailabilityAdminController } from '../catalog/infrastructure/http/public-availability-admin.controller';
import { ScheduleAdminController } from '../catalog/infrastructure/http/schedule-admin.controller';
import { ServicesAdminController } from '../catalog/infrastructure/http/services-admin.controller';
import { SubscriptionController } from '../billing/infrastructure/http/subscription.controller';
import { AdminKeyGuard } from './admin-key.guard';
import { AdminSessionController } from './admin-session.controller';
import { AdminUsersController } from './infrastructure/http/admin-users.controller';
import { allowedRoles } from './infrastructure/http/roles.decorator';

type Ctor = { prototype: object; name: string };

/** Every guarded route of a controller, with the roles that may call it. */
function guardedRoutes(controller: Ctor): Record<string, string> {
  const classGuarded = (
    (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []
  ).includes(AdminKeyGuard);
  const routes: Record<string, string> = {};
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    const handler = (controller.prototype as Record<string, unknown>)[name];
    if (typeof handler !== 'function') continue;
    const method = Reflect.getMetadata('method', handler) as
      | RequestMethod
      | undefined;
    if (method === undefined) continue;
    const guarded =
      classGuarded ||
      (
        (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []
      ).includes(AdminKeyGuard);
    if (!guarded) continue;
    routes[`${RequestMethod[method]} ${name}`] = allowedRoles(
      handler,
      controller,
      RequestMethod[method],
    ).join('+');
  }
  return routes;
}

const OWNER_ONLY = 'owner';
const ALL = 'owner+staff+viewer';

/** The permission table of spec 20, checked on the real admin routes. */
describe('roles of the admin routes', () => {
  it.each([
    ['professionals', ProfessionalsAdminController],
    ['professional photos', ProfessionalPhotosAdminController],
    ['services', ServicesAdminController],
    ['locations', LocationsAdminController],
    ['schedules', ScheduleAdminController],
    ['public availability', PublicAvailabilityAdminController],
    ['branding', BrandingAdminController],
    ['user administration', AdminUsersController],
    ['subscription (spec 23)', SubscriptionController],
  ])('%s: every route is owner only', (_name, controller) => {
    const roles = Object.values(guardedRoutes(controller as Ctor));
    expect(roles.length).toBeGreaterThan(0);
    expect(new Set(roles)).toEqual(new Set([OWNER_ONLY]));
  });

  it('bookings: reads for every role, writes for staff and owner', () => {
    expect(guardedRoutes(BookingsController)).toEqual({
      'GET getStatistics': ALL,
      'GET findAll': ALL,
      'GET findOne': ALL,
      // The ids of the latest bookings (the poll of the panel): a read.
      'GET findRecentIds': ALL,
      'PATCH update': 'staff+owner',
      'DELETE remove': 'staff+owner',
    });
  });

  it('the admin catalog and the session status are readable by every role', () => {
    expect(guardedRoutes(AdminController)).toEqual({ 'GET getCatalog': ALL });
    expect(guardedRoutes(AdminSessionController)).toEqual({
      'GET getSession': ALL,
    });
  });
});
