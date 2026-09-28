import { Controller, Post, Param, UseGuards } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@computemesh/database';

@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post(':id/schedule')
  @Roles(UserRole.ADMIN)
  async scheduleJob(@Param('id') id: string) {
    return await this.schedulerService.scheduleJob(id);
  }
}
