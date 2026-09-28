import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { getDatabaseClient } from '@computemesh/database';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private db = getDatabaseClient();

  constructor(private jwtService: JwtService, private configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);
    
    if (!token) {
      throw new UnauthorizedException('Token not found');
    }
    
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      const session = await this.db.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: true }
      });

      if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session is invalid or revoked');
      }

      if (session.user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active');
      }

      (request as any)['user'] = payload;
    } catch (e: any) {
      throw new UnauthorizedException(e.message || 'Invalid token');
    }
    
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
