import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ProvidersModule (e2e)', () => {
  let app: INestApplication;
  let customerToken: string;
  let providerTokenA: string;
  let providerTokenB: string;
  let machineIdA: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    // Create users & get tokens
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();

    // CUSTOMER
    const cEmail = `customer_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: cEmail, password: 'Pass123!@#' });
    const resC = await request(app.getHttpServer()).post('/auth/login').send({ email: cEmail, password: 'Pass123!@#' });
    customerToken = resC.body.accessToken;

    // PROVIDER A
    const pEmailA = `providerA_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: pEmailA, password: 'Pass123!@#' });
    await db.user.update({ where: { email: pEmailA.toLowerCase() }, data: { role: 'PROVIDER' } });
    const resPA = await request(app.getHttpServer()).post('/auth/login').send({ email: pEmailA, password: 'Pass123!@#' });
    providerTokenA = resPA.body.accessToken;

    // PROVIDER B
    const pEmailB = `providerB_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: pEmailB, password: 'Pass123!@#' });
    await db.user.update({ where: { email: pEmailB.toLowerCase() }, data: { role: 'PROVIDER' } });
    const resPB = await request(app.getHttpServer()).post('/auth/login').send({ email: pEmailB, password: 'Pass123!@#' });
    providerTokenB = resPB.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Unauthenticated user cannot create provider', () => {
    return request(app.getHttpServer())
      .post('/providers')
      .send({ displayName: 'Anon Provider' })
      .expect(401);
  });

  it('2. CUSTOMER cannot create provider (RolesGuard)', () => {
    return request(app.getHttpServer())
      .post('/providers')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ displayName: 'Customer Provider' })
      .expect(403);
  });

  it('3. PROVIDER can create provider', () => {
    return request(app.getHttpServer())
      .post('/providers')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({ displayName: 'Provider A Core' })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.status).toBe('REGISTERED');
      });
  });

  it('4. PROVIDER cannot create duplicate provider', () => {
    return request(app.getHttpServer())
      .post('/providers')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({ displayName: 'Duplicate' })
      .expect(400);
  });

  it('5. PROVIDER can retrieve /providers/me', () => {
    return request(app.getHttpServer())
      .get('/providers/me')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.displayName).toBe('Provider A Core');
      });
  });

  it('6. PROVIDER can create machine', () => {
    return request(app.getHttpServer())
      .post('/providers/me/machines')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({
        name: 'Node Alpha',
        hostname: 'node-a.local',
        operatingSystem: 'Ubuntu 22.04',
        architecture: 'x86_64',
        region: 'us-east-1',
        resources: {
          cpuCores: 16,
          memoryMb: 32768,
          storageGb: 1000,
          gpuCount: 0
        }
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body.status).toBe('REGISTERED');
        expect(res.body.resource.cpuCores).toBe(16);
        machineIdA = res.body.id;
      });
  });

  it('7. PROVIDER can list own machines', () => {
    return request(app.getHttpServer())
      .get('/providers/me/machines')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });
  });

  it('8. PROVIDER can retrieve own machine', () => {
    return request(app.getHttpServer())
      .get(`/providers/me/machines/${machineIdA}`)
      .set('Authorization', `Bearer ${providerTokenA}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.id).toBe(machineIdA);
      });
  });

  it('9. PROVIDER can update own machine', () => {
    return request(app.getHttpServer())
      .patch(`/providers/me/machines/${machineIdA}`)
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({
        name: 'Node Alpha V2'
      })
      .expect((res) => {
        if (res.status !== 200) console.log(res.body);
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Node Alpha V2');
      });
  });

  it('10. Provider A cannot retrieve Provider B\'s machine', async () => {
    // Make sure B has a profile
    await request(app.getHttpServer())
      .post('/providers')
      .set('Authorization', `Bearer ${providerTokenB}`)
      .send({ displayName: 'Provider B Core' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/providers/me/machines/${machineIdA}`)
      .set('Authorization', `Bearer ${providerTokenB}`)
      .expect(404); // Not Found / Access Denied
  });

  it('11. Provider A cannot update Provider B\'s machine', () => {
    return request(app.getHttpServer())
      .patch(`/providers/me/machines/${machineIdA}`)
      .set('Authorization', `Bearer ${providerTokenB}`)
      .send({ name: 'Hacked Node' })
      .expect((res) => {
        if (res.status !== 404) console.log(res.body);
        expect(res.status).toBe(404);
      });
  });

  it('12. Invalid machine data returns validation error', () => {
    return request(app.getHttpServer())
      .post('/providers/me/machines')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({
        name: '',
        hostname: '',
        operatingSystem: 'Ubuntu',
        architecture: 'x86_64',
        region: 'us-east',
        resources: { cpuCores: 2, memoryMb: 4096, storageGb: 10, gpuCount: 0 }
      })
      .expect(400); // Zod rejection
  });

  it('13. Negative resource values rejected', () => {
    return request(app.getHttpServer())
      .post('/providers/me/machines')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({
        name: 'Bad Node',
        hostname: 'bad',
        operatingSystem: 'Ubuntu',
        architecture: 'x86_64',
        region: 'us-east',
        resources: { cpuCores: -2, memoryMb: 4096, storageGb: 10, gpuCount: 0 }
      })
      .expect(400); // Zod rejection
  });

  it('14. GPU consistency validation', () => {
    return request(app.getHttpServer())
      .post('/providers/me/machines')
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({
        name: 'Bad GPU Node',
        hostname: 'bad',
        operatingSystem: 'Ubuntu',
        architecture: 'x86_64',
        region: 'us-east',
        resources: { cpuCores: 2, memoryMb: 4096, storageGb: 10, gpuCount: 0, gpuMemoryMb: 8000 }
      })
      .expect(400); // gpuCount=0 but memory > 0
  });

  it('15. Provider cannot manipulate protected status', () => {
    return request(app.getHttpServer())
      .patch(`/providers/me/machines/${machineIdA}`)
      .set('Authorization', `Bearer ${providerTokenA}`)
      .send({ status: 'AVAILABLE' })
      .expect((res) => {
        if (res.status !== 200) console.log(res.body);
        expect(res.status).toBe(200);
        // Status remains REGISTERED because it's stripped by DTO
        expect(res.body.status).toBe('REGISTERED');
      });
  });

  it('16. ADMIN behavior works according to policy (Admin cannot use provider routes)', async () => {
    // Create ADMIN
    const { getDatabaseClient } = require('@computemesh/database');
    const db = getDatabaseClient();
    
    const adminEmail = `admin_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: adminEmail, password: 'Pass123!@#' });
    await db.user.update({ where: { email: adminEmail.toLowerCase() }, data: { role: 'ADMIN' } });
    const resAdmin = await request(app.getHttpServer()).post('/auth/login').send({ email: adminEmail, password: 'Pass123!@#' });
    const adminToken = resAdmin.body.accessToken;

    // Admin should get 403 on provider endpoints because of strict role segregation
    await request(app.getHttpServer())
      .post('/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displayName: 'Admin Provider' })
      .expect(403);
  });
});
