import { Controller, Post, Body, Get, Patch, Delete, Param, UseGuards, Req, UsePipes } from '@nestjs/common';
import { ProvidersService } from './providers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@computemesh/database';
import { Request } from 'express';
import { ZodValidationPipe } from '@computemesh/validation';
import { 
  registerProviderSchema, 
  updateProviderSchema, 
  createMachineSchema, 
  updateMachineSchema,
  RegisterProviderDto,
  UpdateProviderDto,
  CreateMachineDto,
  UpdateMachineDto
} from './dto/provider.dto';

@Controller('providers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post()
  @Roles(UserRole.PROVIDER)
  @UsePipes(new ZodValidationPipe(registerProviderSchema))
  register(@Req() req: Request, @Body() dto: RegisterProviderDto) {
    const userId = (req as any).user.sub;
    return this.providersService.registerProvider(userId, dto);
  }

  @Get('me')
  @Roles(UserRole.PROVIDER)
  getMyProvider(@Req() req: Request) {
    const userId = (req as any).user.sub;
    return this.providersService.getMyProvider(userId);
  }

  @Patch('me')
  @Roles(UserRole.PROVIDER)
  @UsePipes(new ZodValidationPipe(updateProviderSchema))
  updateMyProvider(@Req() req: Request, @Body() dto: UpdateProviderDto) {
    const userId = (req as any).user.sub;
    return this.providersService.updateMyProvider(userId, dto);
  }

  @Post('me/machines')
  @Roles(UserRole.PROVIDER)
  @UsePipes(new ZodValidationPipe(createMachineSchema))
  createMachine(@Req() req: Request, @Body() dto: CreateMachineDto) {
    const userId = (req as any).user.sub;
    return this.providersService.createMachine(userId, dto);
  }

  @Get('me/machines')
  @Roles(UserRole.PROVIDER)
  getMyMachines(@Req() req: Request) {
    const userId = (req as any).user.sub;
    return this.providersService.getMyMachines(userId);
  }

  @Get('me/machines/:id')
  @Roles(UserRole.PROVIDER)
  getMachine(@Req() req: Request, @Param('id') machineId: string) {
    const userId = (req as any).user.sub;
    return this.providersService.getMachine(userId, machineId);
  }

  @Patch('me/machines/:id')
  @Roles(UserRole.PROVIDER)
  updateMachine(@Req() req: Request, @Param('id') machineId: string, @Body(new ZodValidationPipe(updateMachineSchema)) dto: UpdateMachineDto) {
    const userId = (req as any).user.sub;
    return this.providersService.updateMachine(userId, machineId, dto);
  }

  @Delete('me/machines/:id')
  @Roles(UserRole.PROVIDER)
  disableMachine(@Req() req: Request, @Param('id') machineId: string) {
    const userId = (req as any).user.sub;
    return this.providersService.disableMachine(userId, machineId);
  }

  @Post('me/machines/:id/enrollment')
  @Roles(UserRole.PROVIDER)
  generateEnrollmentToken(@Req() req: Request, @Param('id') machineId: string) {
    const userId = (req as any).user.sub;
    return this.providersService.generateEnrollmentToken(userId, machineId);
  }

  @Post('me/machines/:id/agent/revoke')
  @Roles(UserRole.PROVIDER)
  revokeAgent(@Req() req: Request, @Param('id') machineId: string) {
    const userId = (req as any).user.sub;
    return this.providersService.revokeAgent(userId, machineId);
  }
}
