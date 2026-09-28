import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../src/health/health.module';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider('REDIS_CLIENT')
      .useValue({
        ping: jest.fn().mockResolvedValue('PONG'),
      })
      .overrideProvider('STORAGE_CLIENT')
      .useValue({
        send: jest.fn().mockResolvedValue(true),
      })
      .overrideProvider('DATABASE_CLIENT')
      .useValue({
        $queryRawUnsafe: jest.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({
        status: 'ok',
        service: 'computemesh-api',
      });
  });

  it('/health/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/health/ready')
      .expect(200)
      .expect({
        status: 'ok',
        dependencies: {
          postgres: 'up',
          redis: 'up',
          storage: 'up',
        },
      });
  });
});
