import { Module, forwardRef } from '@nestjs/common';
import { UsersRepository } from './repositories/users.repository.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { AdminController } from './admin.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController, AdminController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
