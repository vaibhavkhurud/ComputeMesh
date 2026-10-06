import { Module } from '@nestjs/common';
import { ProvidersController } from './providers.controller';
import { ProvidersService } from './providers.service';
import { createLogger } from '@computemesh/logger';
import { AuthModule } from '../auth/auth.module';
import { databaseProvider } from './database.provider';

@Module({
  imports: [AuthModule],
  controllers: [ProvidersController],
  providers: [
    ProvidersService,
    databaseProvider,
    {
      provide: 'LOGGER',
      useValue: createLogger('providers'),
    },
  ],
  exports: [ProvidersService, databaseProvider, 'LOGGER'],
})
export class ProvidersModule {}
