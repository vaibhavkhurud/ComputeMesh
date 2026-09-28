import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { createLogger } from '@computemesh/logger';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    {
      provide: 'LOGGER',
      useValue: createLogger('providers'),
    },
  ],
})
export class ProvidersModule {}
