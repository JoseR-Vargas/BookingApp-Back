import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminKeyGuard } from './admin-key.guard';

/** Lets the admin UI check that a key is valid before storing it. */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminSessionController {
  @Get('session')
  getSession(): { ok: true } {
    return { ok: true };
  }
}
