import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getDatabaseClient } from '@computemesh/database';
import * as crypto from 'crypto';

jest.setTimeout(60000);

describe('AgentExecutionModule (e2e)', () => {
  let app: INestApplication;
  const db = getDatabaseClient();
  let agentSecret = 'test_agent_secret';
  let agentId: string;
  let machineId: string;
  let providerId: string;
  let adminToken: string;
  let cEmail = 'cust_exec@test.com';
  let customerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await db.jobEvent.deleteMany();
    await db.jobAssignment.deleteMany();
    await db.jobRequirement.deleteMany();
    await db.job.deleteMany();
    await db.machineDiscovery.deleteMany();
    await db.agentIdentity.deleteMany();
    await db.enrollmentToken.deleteMany();
    await db.machine.deleteMany();
    await db.provider.deleteMany();
    await db.user.deleteMany({ where: { email: { startsWith: 'prov_' } } });

    // Ensure users exist
    let admin = await db.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      admin = await db.user.create({ data: { email: 'admin_exec@test.com', passwordHash: 'x', role: 'ADMIN' } });
    }
    const resA = await request(app.getHttpServer()).post('/auth/login').send({ email: admin.email, password: 'x' });
    adminToken = resA.body.accessToken || 'x'; // mock

    let cust = await db.user.findFirst({ where: { email: cEmail } });
    if (!cust) {
      cust = await db.user.create({ data: { email: cEmail, passwordHash: 'x', role: 'CUSTOMER' } });
    }

    const providerUser = await db.user.create({ data: { email: `prov_${Date.now()}@test.com`, passwordHash: 'x', role: 'PROVIDER' } });
    const provider = await db.provider.create({ data: { userId: providerUser.id, displayName: 'P1', status: 'ACTIVE' } });
    providerId = provider.id;

    const machine = await db.machine.create({
      data: { providerId: provider.id, name: 'M1', hostname: 'm1', operatingSystem: 'linux', architecture: 'amd64', region: 'us-east', status: 'REGISTERED' }
    });
    machineId = machine.id;

    const secretHash = crypto.createHash('sha256').update(agentSecret).digest('hex');
    const identity = await db.agentIdentity.create({
      data: { machineId: machine.id, credentialHash: secretHash, status: 'ACTIVE', lastHeartbeatAt: new Date() }
    });
    agentId = identity.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createJobAndAssign() {
    const cust = await db.user.findFirst({ where: { email: cEmail } });
    const job = await db.job.create({
      data: {
        userId: cust!.id,
        name: 'test execution job',
        status: 'ASSIGNED',
        assignments: {
          create: {
            machineId,
            providerId,
            status: 'ACTIVE'
          }
        }
      },
      include: { assignments: true }
    });
    return job;
  }

  it('Agent can fetch active assignments', async () => {
    const job = await createJobAndAssign();
    
    const res = await request(app.getHttpServer())
      .get('/agent/assignments')
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`)
      .expect(200);

    expect(res.body.length).toBe(1);
    expect(res.body[0].jobId).toBe(job.id);
  });

  it('Agent cannot fetch another machine\'s assignments', async () => {
    const job = await createJobAndAssign();
    const otherMachine = await db.machine.create({
      data: { providerId: providerId, name: 'M2', hostname: 'm2', operatingSystem: 'linux', architecture: 'amd64', region: 'us-east', status: 'REGISTERED' }
    });
    await db.jobAssignment.updateMany({ data: { machineId: otherMachine.id } });
    
    const res = await request(app.getHttpServer())
      .get('/agent/assignments')
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`)
      .expect(200);

    expect(res.body.length).toBe(0);
  });

  it('Agent atomic start claims execution', async () => {
    const job = await createJobAndAssign();
    const assignmentId = job.assignments[0].id;

    const res = await request(app.getHttpServer())
      .post(`/agent/assignments/${assignmentId}/start`)
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`)
      .expect(201);
    
    expect(res.body.success).toBe(true);

    const j = await db.job.findUnique({ where: { id: job.id } });
    expect(j!.status).toBe('STARTING');

    const e = await db.jobEvent.findFirst({ where: { jobId: job.id, toStatus: 'STARTING' } });
    expect(e).toBeTruthy();
  });

  it('Agent atomic running transitions successfully', async () => {
    const job = await createJobAndAssign();
    const assignmentId = job.assignments[0].id;

    await request(app.getHttpServer()).post(`/agent/assignments/${assignmentId}/start`)
      .set('x-computemesh-agent-id', agentId).set('Authorization', `Bearer ${agentSecret}`);

    const res = await request(app.getHttpServer())
      .post(`/agent/assignments/${assignmentId}/running`)
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`)
      .expect(201);
    
    expect(res.body.success).toBe(true);

    const j = await db.job.findUnique({ where: { id: job.id } });
    expect(j!.status).toBe('RUNNING');
  });

  it('Terminal result releases assignment correctly', async () => {
    const job = await createJobAndAssign();
    const assignmentId = job.assignments[0].id;

    await request(app.getHttpServer()).post(`/agent/assignments/${assignmentId}/start`)
      .set('x-computemesh-agent-id', agentId).set('Authorization', `Bearer ${agentSecret}`);

    const res = await request(app.getHttpServer())
      .post(`/agent/assignments/${assignmentId}/result`)
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`)
      .send({ status: 'COMPLETED', outputSize: 1024 })
      .expect(201);
    
    expect(res.body.success).toBe(true);

    const j = await db.job.findUnique({ where: { id: job.id } });
    expect(j!.status).toBe('COMPLETED');
    expect(j!.completedAt).not.toBeNull();

    const a = await db.jobAssignment.findUnique({ where: { id: assignmentId } });
    expect(a!.status).toBe('RELEASED');
  });

  it('Cancellation race A: Agent claiming STARTING fails if job is already CANCELLED', async () => {
    const job = await createJobAndAssign();
    const assignmentId = job.assignments[0].id;

    // Simulate cancellation
    await db.job.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });

    const res = await request(app.getHttpServer())
      .post(`/agent/assignments/${assignmentId}/start`)
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`);
    
    expect(res.status).toBe(409); // ConflictException
  });

  it('Cancellation race B: Agent transitions to RUNNING fails if job is CANCELLED during STARTING', async () => {
    const job = await createJobAndAssign();
    const assignmentId = job.assignments[0].id;

    await request(app.getHttpServer()).post(`/agent/assignments/${assignmentId}/start`)
      .set('x-computemesh-agent-id', agentId).set('Authorization', `Bearer ${agentSecret}`);

    await db.job.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });

    const res = await request(app.getHttpServer())
      .post(`/agent/assignments/${assignmentId}/running`)
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`);
    
    expect(res.status).toBe(409);
  });

  it('Cancellation race C: Terminal result ignores if already CANCELLED', async () => {
    const job = await createJobAndAssign();
    const assignmentId = job.assignments[0].id;

    await request(app.getHttpServer()).post(`/agent/assignments/${assignmentId}/start`).set('x-computemesh-agent-id', agentId).set('Authorization', `Bearer ${agentSecret}`);
    await request(app.getHttpServer()).post(`/agent/assignments/${assignmentId}/running`).set('x-computemesh-agent-id', agentId).set('Authorization', `Bearer ${agentSecret}`);

    await db.job.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });

    // Agent finishes and tries to report COMPLETED
    const res = await request(app.getHttpServer())
      .post(`/agent/assignments/${assignmentId}/result`)
      .set('x-computemesh-agent-id', agentId)
      .set('Authorization', `Bearer ${agentSecret}`)
      .send({ status: 'COMPLETED' })
      .expect(201);
    
    const j = await db.job.findUnique({ where: { id: job.id } });
    expect(j!.status).toBe('CANCELLED'); // Original terminal state won

    const a = await db.jobAssignment.findUnique({ where: { id: assignmentId } });
    expect(a!.status).toBe('RELEASED'); // Assignment still gets released
  });
});
