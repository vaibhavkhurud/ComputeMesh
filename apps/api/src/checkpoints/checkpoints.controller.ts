import { Controller, Post, Get, Param, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { CheckpointsService } from './checkpoints.service';
import { AgentAuthGuard } from '../agents/guards/agent-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
export class CheckpointsController {
  constructor(private readonly checkpointsService: CheckpointsService) {}

  @UseGuards(AgentAuthGuard)
  @Post('agent/jobs/:jobId/checkpoints/intent')
  async createIntent(
    @Param('jobId') jobId: string,
    @Body() body: { sizeBytes: number; checksumSha256: string },
    @Req() req: any
  ) {
    // req.agent contains authenticated agent info
    return this.checkpointsService.createIntent(jobId, req.agent.machineId, body.sizeBytes, body.checksumSha256);
  }

  @UseGuards(AgentAuthGuard)
  @Post('agent/jobs/:jobId/checkpoints/:checkpointId/complete')
  @HttpCode(HttpStatus.OK)
  async completeUpload(
    @Param('jobId') jobId: string,
    @Param('checkpointId') checkpointId: string,
    @Req() req: any
  ) {
    return this.checkpointsService.completeUpload(jobId, checkpointId, req.agent.machineId);
  }

  @UseGuards(AgentAuthGuard)
  @Post('agent/jobs/:jobId/checkpoints/:checkpointId/fail')
  @HttpCode(HttpStatus.OK)
  async failUpload(
    @Param('jobId') jobId: string,
    @Param('checkpointId') checkpointId: string,
    @Body() body: { reason: string }
  ) {
    return this.checkpointsService.failUpload(jobId, checkpointId, body.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Get('api/jobs/:jobId/checkpoints')
  async listCheckpoints(@Param('jobId') jobId: string, @Req() req: any): Promise<any> {
    return this.checkpointsService.listCheckpoints(jobId, req.user.id);
  }
}
