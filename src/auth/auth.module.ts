import { Module } from '@nestjs/common';
import { AdminSessionController } from './admin-session.controller';

@Module({
  controllers: [AdminSessionController],
})
export class AuthModule {}
