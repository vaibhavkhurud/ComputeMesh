import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return { status: 'ok', service: 'computemesh-api' };
  }

  @Get('ready')
  async getReady() {
    return this.healthService.checkAll();
  }
}
