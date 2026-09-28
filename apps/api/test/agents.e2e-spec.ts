import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getDatabaseClient } from '@computemesh/database';

describe('AgentsModule (e2e)', () => {
  let app: INestApplication;
  let providerTokenA: string;
  let providerTokenB: string;
  let machineIdA: string;
  let machineIdB: string;
  let rawTokenA: string;
  let agentIdA: string;
  let agentSecretA: string;
  const db = getDatabaseClient();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Setup Providers
    const pEmailA = `providerA_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: pEmailA, password: 'Pass123!@#' });
    await db.user.update({ where: { email: pEmailA.toLowerCase() }, data: { role: 'PROVIDER' } });
    const resPA = await request(app.getHttpServer()).post('/auth/login').send({ email: pEmailA, password: 'Pass123!@#' });
    providerTokenA = resPA.body.accessToken;

    const pEmailB = `providerB_${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/auth/register').send({ email: pEmailB, password: 'Pass123!@#' });
    await db.user.update({ where: { email: pEmailB.toLowerCase() }, data: { role: 'PROVIDER' } });
    const resPB = await request(app.getHttpServer()).post('/auth/login').send({ email: pEmailB, password: 'Pass123!@#' });
    providerTokenB = resPB.body.accessToken;

    // Create Profiles & Machines
    await request(app.getHttpServer()).post('/providers').set('Authorization', `Bearer ${providerTokenA}`).send({ displayName: 'Provider A' });
    await request(app.getHttpServer()).post('/providers').set('Authorization', `Bearer ${providerTokenB}`).send({ displayName: 'Provider B' });

    const mResA = await request(app.getHttpServer()).post('/providers/me/machines').set('Authorization', `Bearer ${providerTokenA}`).send({
      name: 'Node A', hostname: 'node-a', operatingSystem: 'Ubuntu', architecture: 'x86_64', region: 'us-east',
      resources: { cpuCores: 4, memoryMb: 8192, storageGb: 100, gpuCount: 0 }
    });
    machineIdA = mResA.body.id;

    const mResB = await request(app.getHttpServer()).post('/providers/me/machines').set('Authorization', `Bearer ${providerTokenB}`).send({
      name: 'Node B', hostname: 'node-b', operatingSystem: 'Ubuntu', architecture: 'x86_64', region: 'us-east',
      resources: { cpuCores: 4, memoryMb: 8192, storageGb: 100, gpuCount: 0 }
    });
    machineIdB = mResB.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Provider A can generate enrollment token for Machine A', async () => {
    const res = await request(app.getHttpServer())
      .post(`/providers/me/machines/${machineIdA}/enrollment`)
      .set('Authorization', `Bearer ${providerTokenA}`)
      .expect(201);
    expect(res.body).toHaveProperty('token');
    rawTokenA = res.body.token;
  });

  it('2. Provider B cannot generate token for Machine A', async () => {
    await request(app.getHttpServer())
      .post(`/providers/me/machines/${machineIdA}/enrollment`)
      .set('Authorization', `Bearer ${providerTokenB}`)
      .expect(404); // Not found or access denied
  });

  it('3. Agent can enroll using valid token', async () => {
    const res = await request(app.getHttpServer())
      .post('/agents/enroll')
      .send({ token: rawTokenA })
      .expect(201);
    expect(res.body).toHaveProperty('agentId');
    expect(res.body).toHaveProperty('agentSecret');
    agentIdA = res.body.agentId;
    agentSecretA = res.body.agentSecret;
  });

  it('4. Enrollment token cannot be reused', async () => {
    await request(app.getHttpServer())
      .post('/agents/enroll')
      .send({ token: rawTokenA })
      .expect(400); // Already used
  });

  it('5. Cannot generate new token while active agent exists', async () => {
    await request(app.getHttpServer())
      .post(`/providers/me/machines/${machineIdA}/enrollment`)
      .set('Authorization', `Bearer ${providerTokenA}`)
      .expect(400);
  });

  it('6. Active agent can send heartbeat', async () => {
    await request(app.getHttpServer())
      .post('/agents/heartbeat')
      .set('X-ComputeMesh-Agent-ID', agentIdA)
      .set('Authorization', `Bearer ${agentSecretA}`)
      .send({ agentVersion: '0.1.0' })
      .expect(201);
  });

  it('7. Active agent can update capabilities', async () => {
    await request(app.getHttpServer())
      .put('/agents/capabilities')
      .set('X-ComputeMesh-Agent-ID', agentIdA)
      .set('Authorization', `Bearer ${agentSecretA}`)
      .send({
        cpuLogicalCores: 8,
        cpuArchitecture: 'x86_64',
        memoryMb: 8192,
        operatingSystem: 'Linux Ubuntu',
        gpuCount: 0,
        gpuDiscoveryStatus: 'SUCCESS',
        discoveryStatus: 'SUCCESS'
      })
      .expect(200);

    // Verify it updated DB
    const discovery = await db.machineDiscovery.findUnique({ where: { machineId: machineIdA } });
    expect(discovery?.cpuLogicalCores).toBe(8);
  });

  it('8. Provider B cannot revoke Machine A agent', async () => {
    await request(app.getHttpServer())
      .post(`/providers/me/machines/${machineIdA}/agent/revoke`)
      .set('Authorization', `Bearer ${providerTokenB}`)
      .expect(404);
  });

  it('9. Provider A can revoke Agent', async () => {
    await request(app.getHttpServer())
      .post(`/providers/me/machines/${machineIdA}/agent/revoke`)
      .set('Authorization', `Bearer ${providerTokenA}`)
      .expect(201);
  });

  it('10. Revoked agent cannot send heartbeat', async () => {
    await request(app.getHttpServer())
      .post('/agents/heartbeat')
      .set('X-ComputeMesh-Agent-ID', agentIdA)
      .set('Authorization', `Bearer ${agentSecretA}`)
      .send({ agentVersion: '0.1.0' })
      .expect(403);
  });

  it('11. Disabled machine rejects valid agent', async () => {
    // Generate new agent
    const tRes = await request(app.getHttpServer()).post(`/providers/me/machines/${machineIdA}/enrollment`).set('Authorization', `Bearer ${providerTokenA}`);
    if (tRes.status !== 201) console.log(tRes.body);
    const enrollRes = await request(app.getHttpServer()).post('/agents/enroll').send({ token: tRes.body.token });
    if (enrollRes.status !== 201) console.log(enrollRes.body);
    const { agentId, agentSecret } = enrollRes.body;

    // Heartbeat works
    await request(app.getHttpServer()).post('/agents/heartbeat').set('X-ComputeMesh-Agent-ID', agentId).set('Authorization', `Bearer ${agentSecret}`).send({ agentVersion: '0.1.0' }).expect(201);

    // Disable machine
    await request(app.getHttpServer()).delete(`/providers/me/machines/${machineIdA}`).set('Authorization', `Bearer ${providerTokenA}`).expect(200);

    // Heartbeat fails
    await request(app.getHttpServer()).post('/agents/heartbeat').set('X-ComputeMesh-Agent-ID', agentId).set('Authorization', `Bearer ${agentSecret}`).send({ agentVersion: '0.1.0' }).expect(403);
  });

  it('12. Concurrent enrollment replay results in exactly one success', async () => {
    const tRes = await request(app.getHttpServer()).post(`/providers/me/machines/${machineIdB}/enrollment`).set('Authorization', `Bearer ${providerTokenB}`);
    const rawToken = tRes.body.token;

    const req1 = request(app.getHttpServer()).post('/agents/enroll').send({ token: rawToken });
    const req2 = request(app.getHttpServer()).post('/agents/enroll').send({ token: rawToken });

    const results = await Promise.all([req1, req2]);
    const codes = results.map(r => r.status);
    expect(codes).toContain(201);
    expect(codes).toContain(400); // the other one fails
  });
});
