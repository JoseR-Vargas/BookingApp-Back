import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { currentBusinessDate } from '../../../admin/schedule-impact';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { respond } from '../../../shared/infrastructure/http/respond';
import { CreateProfessionalUseCase } from '../../application/use-cases/professionals/create-professional.use-case';
import { DeactivateProfessionalUseCase } from '../../application/use-cases/professionals/deactivate-professional.use-case';
import { DeleteProfessionalPermanentlyUseCase } from '../../application/use-cases/professionals/delete-professional-permanently.use-case';
import { UpdateProfessionalUseCase } from '../../application/use-cases/professionals/update-professional.use-case';
import { AdminProfessional, toAdminProfessional } from './catalog.presenter';
import {
  parseCreateProfessionalInput,
  parseUpdateProfessionalInput,
} from './professional.input';

/** Professional endpoints of the admin panel, all behind the admin key. */
@Controller('admin/professionals')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class ProfessionalsAdminController {
  constructor(
    private readonly createProfessional: CreateProfessionalUseCase,
    private readonly updateProfessional: UpdateProfessionalUseCase,
    private readonly deactivateProfessional: DeactivateProfessionalUseCase,
    private readonly deleteProfessional: DeleteProfessionalPermanentlyUseCase,
  ) {}

  @Post()
  async create(@Body() body: unknown): Promise<AdminProfessional> {
    return toAdminProfessional(
      respond(
        await this.createProfessional.execute(
          parseCreateProfessionalInput(body),
        ),
      ),
    );
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminProfessional> {
    return toAdminProfessional(
      respond(
        await this.updateProfessional.execute({
          id,
          patch: parseUpdateProfessionalInput(body),
        }),
      ),
    );
  }

  /** Soft delete: the professional stays in the database, inactive. */
  @Delete(':id')
  async deactivate(@Param('id') id: string): Promise<AdminProfessional> {
    return toAdminProfessional(
      respond(await this.deactivateProfessional.execute(id)),
    );
  }

  /**
   * Hard delete. Refused with 409 while the professional has future confirmed
   * bookings or is the only professional of a service.
   */
  @Delete(':id/permanent')
  async deletePermanently(
    @Param('id') id: string,
  ): Promise<{ id: string; deleted: true }> {
    return respond(
      await this.deleteProfessional.execute({
        id,
        today: currentBusinessDate(),
      }),
    );
  }
}
