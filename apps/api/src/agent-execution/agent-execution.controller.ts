import { Controller, Get, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { AgentExecutionService } from './agent-execution.service';
import { ZodValidationPipe } from '@computemesh/validation';
import { AgentAuthGuard } from '../agents/guards/agent-auth.guard';
import { AgentResultDto, agentResultSchema } from './dto/execution.dto';

@Controller('agent/assignments')
@UseGuards(AgentAuthGuard)
export class AgentExecutionController {
  constructor(private readonly executionService: AgentExecutionService) {}

  @Get()
  getAssignments(@Req() req: any) {
    return this.executionService.getAssignments(req.agent.machineId, req.agent.providerId);
  }

  @Get(':id/status')
  getStatus(@Req() req: any, @Param('id') assignmentId: string) {
    return this.executionService.getAssignmentStatus(req.agent.machineId, req.agent.providerId, assignmentId);
  }

  @Post(':id/start')
  startExecution(@Req() req: any, @Param('id') assignmentId: string) {
    return this.executionService.startExecution(req.agent.machineId, req.agent.providerId, assignmentId);
  }

  @Post(':id/running')
  reportRunning(@Req() req: any, @Param('id') assignmentId: string) {
    return this.executionService.reportRunning(req.agent.machineId, req.agent.providerId, assignmentId);
  }

  @Post(':id/result')
  reportResult(
    @Req() req: any, 
    @Param('id') assignmentId: string,
    @Body(new ZodValidationPipe(agentResultSchema)) dto: AgentResultDto
  ) {
    return this.executionService.reportResult(req.agent.machineId, req.agent.providerId, assignmentId, dto);
  }

  @Post(':id/renew-lease')
  renewLease(@Req() req: any, @Param('id') assignmentId: string) {
    return this.executionService.renewLease(req.agent.machineId, req.agent.providerId, assignmentId);
  }
}
