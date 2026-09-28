import { Controller, Post, Put, Body, UseGuards, Req } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { ZodValidationPipe } from '@computemesh/validation';
import { 
  AgentEnrollDto, agentEnrollSchema, 
  AgentHeartbeatDto, agentHeartbeatSchema, 
  AgentCapabilitiesDto, agentCapabilitiesSchema 
} from './dto/agent.dto';
import { AgentAuthGuard } from './guards/agent-auth.guard';

@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post('enroll')
  enroll(@Body(new ZodValidationPipe(agentEnrollSchema)) dto: AgentEnrollDto) {
    return this.agentsService.enroll(dto);
  }

  @Post('heartbeat')
  @UseGuards(AgentAuthGuard)
  heartbeat(@Req() req: any, @Body(new ZodValidationPipe(agentHeartbeatSchema)) dto: AgentHeartbeatDto) {
    return this.agentsService.heartbeat(req.agent.id, dto);
  }

  @Put('capabilities')
  @UseGuards(AgentAuthGuard)
  updateCapabilities(@Req() req: any, @Body(new ZodValidationPipe(agentCapabilitiesSchema)) dto: AgentCapabilitiesDto) {
    return this.agentsService.updateCapabilities(req.agent.machineId, dto);
  }
}
