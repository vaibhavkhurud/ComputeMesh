import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getDatabaseClient } from '@computemesh/database';

jest.setTimeout(30000);

describe('JobsModule (e2e)', () => {
  let app: INestApplication;
  let customerTokenA: string;
  let customerTokenB: string;
  let adminToken: string;
  let providerToken: string;
  let jobIdA: string;
  const db = getDatabaseClient();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Customer A
    const cEmailA = `customerA_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: cEmailA, password: 'Pass123!@#' });
    const resCA = await request(app.getHttpServer()).post('/auth/login').send({ email: cEmailA, password: 'Pass123!@#' });
    customerTokenA = resCA.body.accessToken;

    // Customer B
    const cEmailB = `customerB_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: cEmailB, password: 'Pass123!@#' });
    const resCB = await request(app.getHttpServer()).post('/auth/login').send({ email: cEmailB, password: 'Pass123!@#' });
    customerTokenB = resCB.body.accessToken;

    // Admin
    const aEmail = `admin_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: aEmail, password: 'Pass123!@#' });
    await db.user.update({ where: { email: aEmail.toLowerCase() }, data: { role: 'ADMIN' } });
    const resA = await request(app.getHttpServer()).post('/auth/login').send({ email: aEmail, password: 'Pass123!@#' });
    adminToken = resA.body.accessToken;

    // Provider
    const pEmail = `provider_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: pEmail, password: 'Pass123!@#' });
    await db.user.update({ where: { email: pEmail.toLowerCase() }, data: { role: 'PROVIDER' } });
    const resP = await request(app.getHttpServer()).post('/auth/login').send({ email: pEmail, password: 'Pass123!@#' });
    providerToken = resP.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Provider cannot access jobs API', async () => {
    await request(app.getHttpServer())
      .get('/jobs')
      .set('Authorization', `Bearer ${providerToken}`)
      .expect(403);
  });

  it('2. Customer creates job atomically (BigInt serialization)', async () => {
    const res = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${customerTokenA}`)
      .send({
        name: 'Training Job',
        inputKey: 'my-dataset.zip',
        inputSize: 1024 * 1024 * 50, // 50MB
        requirements: {
          cpuCoresMin: 4,
          gpuCount: 1
        }
      })
      .expect(201);
    
    expect(res.body.name).toBe('Training Job');
    expect(res.body.status).toBe('QUEUED');
    expect(res.body.inputSize).toBe('52428800'); // BigInt serialization
    expect(res.body.requirement.gpuRequired).toBe(true); // Derived automatically
    
    jobIdA = res.body.id;
  });

  it('3. Job creation yielded exactly CREATED and QUEUED events', async () => {
    const res = await request(app.getHttpServer())
      .get(`/jobs/${jobIdA}/events`)
      .set('Authorization', `Bearer ${customerTokenA}`)
      .expect(200);
    
    expect(res.body.length).toBe(2);
    expect(res.body[0].eventType).toBe('CREATED');
    expect(res.body[1].eventType).toBe('STATUS_CHANGED');
    expect(res.body[1].toStatus).toBe('QUEUED');
  });

  it('4. Customer B cannot access Customer A job', async () => {
    await request(app.getHttpServer())
      .get(`/jobs/${jobIdA}`)
      .set('Authorization', `Bearer ${customerTokenB}`)
      .expect(404);
  });

  it('5. Admin has read-only access to global jobs', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .get(`/jobs/${jobIdA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('6. Admin cannot cancel jobs', async () => {
    await request(app.getHttpServer())
      .post(`/jobs/${jobIdA}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('7. Pagination and status filtering', async () => {
    const res = await request(app.getHttpServer())
      .get('/jobs?page=1&limit=10&status=QUEUED')
      .set('Authorization', `Bearer ${customerTokenA}`)
      .expect(200);
    
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].status).toBe('QUEUED');
  });

  it('8. Object-key traversal rejection', async () => {
    await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${customerTokenA}`)
      .send({
        name: 'Hacker Job',
        inputKey: '../../other-user/secret.txt'
      })
      .expect(400);
  });

  it('9. Concurrent cancellation (Exactly one event)', async () => {
    const req1 = request(app.getHttpServer())
      .post(`/jobs/${jobIdA}/cancel`)
      .set('Authorization', `Bearer ${customerTokenA}`);
      
    const req2 = request(app.getHttpServer())
      .post(`/jobs/${jobIdA}/cancel`)
      .set('Authorization', `Bearer ${customerTokenA}`);

    const results = await Promise.all([req1, req2]);
    const codes = results.map(r => r.status);
    
    expect(codes).toContain(201);
    expect(codes).toContain(400); // One fails because state shifted

    const eventRes = await request(app.getHttpServer())
      .get(`/jobs/${jobIdA}/events`)
      .set('Authorization', `Bearer ${customerTokenA}`)
      .expect(200);

    const cancelEvents = eventRes.body.filter((e: any) => e.toStatus === 'CANCELLED');
    expect(cancelEvents.length).toBe(1);
  });

  it('10. Invalid transitions rejected', async () => {
    await request(app.getHttpServer())
      .post(`/jobs/${jobIdA}/cancel`)
      .set('Authorization', `Bearer ${customerTokenA}`)
      .expect(400); // Already cancelled
  });
});
