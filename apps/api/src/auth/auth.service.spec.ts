import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// Mock dependencies
const mockDb = {
  securityEvent: { create: jest.fn() }, user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  session: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('@computemesh/database', () => ({
  getDatabaseClient: jest.fn(() => mockDb),
}));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('mockJwt') } },
        { provide: ConfigService, useValue: { get: jest.fn((_k, def) => def || 'mockSecret') } },
        { provide: 'LOGGER', useValue: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('password hashing', () => {
    it('should hash and verify passwords', async () => {
      const password = 'mySecretPassword!';
      const hash = await service.hashPassword(password);
      expect(hash).not.toEqual(password);
      expect(await service.verifyPassword(hash, password)).toBe(true);
      expect(await service.verifyPassword(hash, 'wrong')).toBe(false);
    });
  });

  describe('registration', () => {
    it('should normalize email on register', async () => {
      mockDb.user.findUnique.mockResolvedValue(null);
      mockDb.user.create.mockResolvedValue({ id: '1', email: 'test@example.com', role: 'CUSTOMER' });
      mockDb.session.create.mockResolvedValue({ id: 's1' });

      await service.register({ email: ' TEST@Example.COM ', password: 'pass' });
      expect(mockDb.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('should throw on duplicate registration without enumerating directly', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: '1' });
      await expect(service.register({ email: 'test@example.com', password: 'pass' }))
        .rejects.toThrow('Registration failed or email already in use');
    });
  });

  describe('login', () => {
    it('should normalize email on login', async () => {
      mockDb.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: ' TEST@Example.COM ', password: 'pass' }))
        .rejects.toThrow('Invalid credentials');
      expect(mockDb.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('should block suspended account', async () => {
      mockDb.user.findUnique.mockResolvedValue({ id: '1', status: 'SUSPENDED' });
      await expect(service.login({ email: 'test@example.com', password: 'pass' }))
        .rejects.toThrow('Account is not active');
    });

    it('should reject invalid password', async () => {
      const hash = await service.hashPassword('realPass');
      mockDb.user.findUnique.mockResolvedValue({ id: '1', status: 'ACTIVE', passwordHash: hash });
      await expect(service.login({ email: 'test@example.com', password: 'wrongPass' }))
        .rejects.toThrow('Invalid credentials');
    });
  });

  describe('refresh & token reuse', () => {
    it('should detect token reuse and revoke family', async () => {
      mockDb.session.findUnique.mockResolvedValue({
        id: '1', familyId: 'fam1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 10000)
      });
      await expect(service.refresh('someToken')).rejects.toThrow('Invalid or expired refresh token');
      expect(mockDb.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: 'fam1' } })
      );
    });

    it('should check expiration', async () => {
      mockDb.session.findUnique.mockResolvedValue({
        id: '1', expiresAt: new Date(Date.now() - 10000)
      });
      await expect(service.refresh('someToken')).rejects.toThrow('Invalid or expired refresh token');
    });
  });

  describe('logout ownership', () => {
    it('should not revoke if userId mismatches', async () => {
      mockDb.session.findUnique.mockResolvedValue({ id: '1', userId: 'userA' });
      await service.logout('1', 'userB');
      expect(mockDb.session.update).not.toHaveBeenCalled();
    });

    it('should revoke if userId matches', async () => {
      mockDb.session.findUnique.mockResolvedValue({ id: '1', userId: 'userA' });
      await service.logout('1', 'userA');
      expect(mockDb.session.update).toHaveBeenCalled();
    });
  });
});
