import { Test, TestingModule } from '@nestjs/testing';
import { ProvidersService } from './providers.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockDb = {
  provider: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  machine: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('@computemesh/database', () => ({
  getDatabaseClient: jest.fn(() => mockDb),
}));

describe('ProvidersService', () => {
  let service: ProvidersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: 'LOGGER', useValue: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } },
      ],
    }).compile();

    service = module.get<ProvidersService>(ProvidersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerProvider', () => {
    it('should block duplicate provider profiles', async () => {
      mockDb.provider.findUnique.mockResolvedValue({ id: 'existing-id' });
      await expect(service.registerProvider('user1', { displayName: 'Test' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should create provider successfully', async () => {
      mockDb.provider.findUnique.mockResolvedValue(null);
      mockDb.provider.create.mockResolvedValue({ id: 'new-id', displayName: 'Test' });

      const result = await service.registerProvider('user1', { displayName: 'Test' });
      expect(result).toHaveProperty('id', 'new-id');
    });
  });

  describe('createMachine', () => {
    it('should declare a machine starting in REGISTERED status', async () => {
      mockDb.provider.findUnique.mockResolvedValue({ id: 'prov-id' });
      mockDb.machine.create.mockResolvedValue({ id: 'mach-id', status: 'REGISTERED' });

      const result = await service.createMachine('user1', {
        name: 'Node1',
        hostname: 'node1',
        operatingSystem: 'linux',
        architecture: 'amd64',
        region: 'us-east',
        resources: { cpuCores: 8, memoryMb: 16384, storageGb: 256, gpuCount: 0 }
      });
      expect(result.status).toBe('REGISTERED');
      expect(mockDb.machine.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'REGISTERED', providerId: 'prov-id' })
      }));
    });
  });

  describe('Machine Retrieval and Ownership', () => {
    it('should retrieve own machine', async () => {
      mockDb.machine.findFirst.mockResolvedValue({ id: 'mach-id' });
      const result = await service.getMachine('user1', 'mach-id');
      expect(result.id).toBe('mach-id');
    });

    it('should throw NotFound when accessing another provider machine', async () => {
      mockDb.machine.findFirst.mockResolvedValue(null);
      await expect(service.getMachine('user1', 'mach-id')).rejects.toThrow(NotFoundException);
    });
  });
});
