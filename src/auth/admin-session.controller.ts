import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';
import { AdminRequest } from './infrastructure/http/admin-actor';
import {
  PublicAdminUser,
  toPublicAdminUser,
} from './infrastructure/http/admin-user.presenter';

/**
 * Status of the admin session. With the shared key it answers `{ ok: true }`
 * (what the panel has always checked); with a session cookie it also answers
 * the account, without any secret.
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminSessionController {
  @Get('session')
  getSession(
    @Req() request?: AdminRequest,
  ): { ok: true } | { ok: true; user: PublicAdminUser } {
    const actor = request?.adminActor;
    return actor?.kind === 'session'
      ? { ok: true, user: toPublicAdminUser(actor.user) }
      : { ok: true };
  }
}
