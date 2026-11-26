import {
  Body,
  Controller,
  Delete,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminKeyGuard } from '../../../auth/admin-key.guard';
import { Roles } from '../../../auth/infrastructure/http/roles.decorator';
import { respond } from '../../../shared/infrastructure/http/respond';
import { RemoveProfessionalPhotoUseCase } from '../../application/use-cases/professionals/remove-professional-photo.use-case';
import { SetProfessionalPhotoUseCase } from '../../application/use-cases/professionals/set-professional-photo.use-case';
import { AdminProfessional, toAdminProfessional } from './catalog.presenter';
import { parseProfessionalPhotoInput } from './professional.input';

/** Photo endpoints of a professional in the admin panel, behind the admin key. */
@Controller('admin/professionals')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class ProfessionalPhotosAdminController {
  constructor(
    private readonly setProfessionalPhoto: SetProfessionalPhotoUseCase,
    private readonly removeProfessionalPhoto: RemoveProfessionalPhotoUseCase,
  ) {}

  @Put(':id/photo')
  async setPhoto(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AdminProfessional> {
    return toAdminProfessional(
      respond(
        await this.setProfessionalPhoto.execute({
          id,
          photo: parseProfessionalPhotoInput(body),
        }),
      ),
    );
  }

  @Delete(':id/photo')
  async removePhoto(@Param('id') id: string): Promise<AdminProfessional> {
    return toAdminProfessional(
      respond(await this.removeProfessionalPhoto.execute(id)),
    );
  }
}
