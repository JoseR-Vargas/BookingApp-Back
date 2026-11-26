import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { respond } from '../../../shared/infrastructure/http/respond';
import { AdminKeyGuard } from '../../admin-key.guard';
import { ChangeAdminUserRoleUseCase } from '../../application/use-cases/change-admin-user-role.use-case';
import { CreateAdminUserUseCase } from '../../application/use-cases/create-admin-user.use-case';
import { DeactivateAdminUserUseCase } from '../../application/use-cases/deactivate-admin-user.use-case';
import { ListAdminUsersUseCase } from '../../application/use-cases/list-admin-users.use-case';
import { RotateAdminPasswordUseCase } from '../../application/use-cases/rotate-admin-password.use-case';
import {
  parseCreateUserInput,
  parsePasswordInput,
  parseRoleInput,
} from './admin-user.input';
import { PublicAdminUser, toPublicAdminUser } from './admin-user.presenter';
import { Roles } from './roles.decorator';

/** Account administration of the business. Owner only (the legacy key counts as owner). */
@Controller('admin/users')
@UseGuards(AdminKeyGuard)
@Roles('owner')
export class AdminUsersController {
  constructor(
    private readonly listUsers: ListAdminUsersUseCase,
    private readonly createUser: CreateAdminUserUseCase,
    private readonly changeRole: ChangeAdminUserRoleUseCase,
    private readonly deactivateUser: DeactivateAdminUserUseCase,
    private readonly rotatePassword: RotateAdminPasswordUseCase,
  ) {}

  @Get()
  async list(): Promise<PublicAdminUser[]> {
    return respond(await this.listUsers.execute()).map(toPublicAdminUser);
  }

  @Post()
  async create(@Body() body: unknown): Promise<PublicAdminUser> {
    return toPublicAdminUser(
      respond(await this.createUser.execute(parseCreateUserInput(body))),
    );
  }

  @Patch(':id/role')
  async role(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PublicAdminUser> {
    return toPublicAdminUser(
      respond(await this.changeRole.execute(id, parseRoleInput(body))),
    );
  }

  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string): Promise<PublicAdminUser> {
    return toPublicAdminUser(respond(await this.deactivateUser.execute(id)));
  }

  @Put(':id/password')
  async password(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PublicAdminUser> {
    return toPublicAdminUser(
      respond(await this.rotatePassword.execute(id, parsePasswordInput(body))),
    );
  }
}
