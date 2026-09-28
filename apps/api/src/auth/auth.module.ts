import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createLogger } from '@computemesh/logger';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
        },
      }),
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 50,
    }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAuthGuard,
    {
      provide: 'LOGGER',
      useValue: createLogger('auth'),
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
