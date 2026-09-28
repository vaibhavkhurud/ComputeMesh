import { Controller, Post, Get, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@computemesh/database';
import { Request } from 'express';
import { ZodValidationPipe } from '@computemesh/validation';
import { CreateJobDto, createJobSchema } from './dto/job.dto';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Roles(UserRole.CUSTOMER)
  createJob(@Req() req: Request, @Body(new ZodValidationPipe(createJobSchema)) dto: CreateJobDto) {
    const userId = (req as any).user.sub;
    return this.jobsService.createJob(userId, dto);
  }

  @Get()
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  getJobs(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status?: string,
  ) {
    const user = (req as any).user;
    const isAdmin = user.role === 'ADMIN';
    const userId = isAdmin ? null : user.sub;
    
    let p = parseInt(page, 10);
    if (isNaN(p) || p < 1) p = 1;
    
    let l = parseInt(limit, 10);
    if (isNaN(l) || l < 1) l = 20;
    if (l > 100) l = 100;

    return this.jobsService.getJobs(userId, isAdmin, p, l, status);
  }

  @Get(':id')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  getJob(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;
    const isAdmin = user.role === 'ADMIN';
    const userId = isAdmin ? null : user.sub;

    return this.jobsService.getJob(userId, isAdmin, id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.CUSTOMER)
  cancelJob(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.sub;
    return this.jobsService.cancelJob(userId, id);
  }

  @Get(':id/events')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  getJobEvents(@Req() req: Request, @Param('id') id: string): Promise<any[]> {
    const user = (req as any).user;
    const isAdmin = user.role === 'ADMIN';
    const userId = isAdmin ? null : user.sub;

    return this.jobsService.getJobEvents(userId, isAdmin, id);
  }
}
