import { Injectable, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { getDatabaseClient } from '@computemesh/database';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Logger } from '@computemesh/logger';

@Injectable()
export class AuthService {
  private db = getDatabaseClient();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('LOGGER') private readonly logger: Logger,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.db.user.findUnique({ where: { email } });
    if (existingUser) {
      // Obfuscated registration error to prevent enumeration
      throw new BadRequestException('Registration failed or email already in use');
    }

    const passwordHash = await this.hashPassword(dto.password);
    
    const user = await this.db.user.create({
      data: {
        email,
        passwordHash,
      },
    });
    
    return this.generateTokens(user);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.db.user.findUnique({ where: { email } });
    
    if (!user) {
      await this.db.securityEvent.create({ data: { type: 'AUTH_FAILURE', actorType: 'USER', ipAddress: 'unknown', metadata: { email } } });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      await this.db.securityEvent.create({ data: { type: 'AUTH_FAILURE', actorType: 'USER', actorId: user.id, metadata: { reason: 'Inactive account' } } });
      throw new UnauthorizedException('Account is not active');
    }
    
    const isPasswordValid = await this.verifyPassword(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      await this.db.securityEvent.create({ data: { type: 'AUTH_FAILURE', actorType: 'USER', actorId: user.id, ipAddress: 'unknown', metadata: { email } } });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    
    return this.generateTokens(user);
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    
    const session = await this.db.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.revokedAt) {
      // Token reuse detected on revoked session!
      // Revoke all sessions in this family
      await this.db.session.updateMany({
        where: { familyId: session.familyId },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Token reuse detected for user ${session.userId}. Family ${session.familyId} revoked.`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    // Revoke the old session to complete the rotation atomically
    const updateResult = await this.db.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    if (updateResult.count === 0) {
      // Concurrent token reuse detected!
      await this.db.session.updateMany({
        where: { familyId: session.familyId },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(`Concurrent token reuse detected for user ${session.userId}. Family ${session.familyId} revoked.`);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return this.generateTokens(session.user, session.familyId);
  }

  async logout(sessionId: string, userId: string) {
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) {
      return; // Do nothing if session doesn't exist or doesn't belong to the user
    }

    await this.db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password);
  }

  async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  private hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async generateTokens(user: any, familyId?: string) {
    try {
      const plainRefreshToken = crypto.randomBytes(32).toString('base64url');
      const tokenHash = this.hashRefreshToken(plainRefreshToken);
      
      const refreshExpiresInDays = parseInt(this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN', '7').replace('d', ''), 10) || 7;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + refreshExpiresInDays);

      const actualFamilyId = familyId || crypto.randomUUID();

      const newSession = await this.db.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          familyId: actualFamilyId,
        },
      });

      const payload = { 
        sub: user.id, 
        email: user.email, 
        role: user.role,
        sessionId: newSession.id 
      };
      
      const accessToken = await this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      });

      return {
        accessToken,
        refreshToken: plainRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        }
      };
    } catch (e) {
      throw e;
    }
  }
}
