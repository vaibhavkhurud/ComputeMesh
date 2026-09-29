const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'; // Assuming default test secret

async function setupDB() {
  console.log("Setting up integration test data...");
  const customer = await prisma.user.create({ data: { email: `cust-${Date.now()}@example.com`, passwordHash: 'hash' } });
  const providerUser = await prisma.user.create({ data: { email: `prov-${Date.now()}@example.com`, passwordHash: 'hash' } });
  const provider = await prisma.provider.create({ data: { userId: providerUser.id, displayName: 'Test Prov' } });
  
  const machine = await prisma.machine.create({
    data: { providerId: provider.id, name: 'Test Machine', hostname: 'host', operatingSystem: 'linux', architecture: 'amd64', region: 'us' }
  });
  
  const agentId = crypto.randomUUID();
  const agentToken = 'my-secret';
  const agentSecretHash = crypto.createHash('sha256').update(agentToken).digest('hex');
  const agentIdentity = await prisma.agentIdentity.create({
    data: { id: agentId, machineId: machine.id, status: 'ACTIVE', credentialHash: agentSecretHash }
  });
  
  const job = await prisma.job.create({ data: { userId: customer.id, name: 'Job', status: 'RUNNING' } });
  const assignment = await prisma.jobAssignment.create({
    data: { jobId: job.id, machineId: machine.id, providerId: provider.id, status: 'ACTIVE' }
  });
  const lease = await prisma.executionLease.create({
    data: { jobId: job.id, assignmentId: assignment.id, machineId: machine.id, status: 'ACTIVE', expiresAt: new Date(Date.now() + 1000 * 60 * 60) }
  });
  
  // Second machine for wrong-agent tests
  const machine2 = await prisma.machine.create({
    data: { providerId: provider.id, name: 'Machine 2', hostname: 'host2', operatingSystem: 'linux', architecture: 'amd64', region: 'us' }
  });
  const agentId2 = crypto.randomUUID();
  const agentToken2 = 'my-secret-2';
  const agentSecretHash2 = crypto.createHash('sha256').update(agentToken2).digest('hex');
  await prisma.agentIdentity.create({
    data: { id: agentId2, machineId: machine2.id, status: 'ACTIVE', credentialHash: agentSecretHash2 }
  });

  return { customer, provider, providerUser, machine, agentId, agentToken, job, assignment, lease, agentToken2, agentId2, machine2 };
}

async function runTests() {
  const data = await setupDB();
  
  console.log("\n================ API AUTHORIZATION MATRIX ================");
  
  async function hitIntent(token, agentId, jobId, expectedStatus) {
    const res = await fetch(`${API_URL}/agent/jobs/${jobId}/checkpoints/intent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-ComputeMesh-Agent-ID': agentId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sizeBytes: 1024, checksumSha256: 'deadbeef' })
    });
    console.log(`[Intent] Token: ${token ? token.substring(0, 10) : ''}..., Job: ${jobId} -> Expected: ${expectedStatus}, Got: ${res.status}`);
    const body = await res.text();
    if (res.status !== expectedStatus) console.error(`Unexpected response: ${body}`);
    return { status: res.status, body: body ? JSON.parse(body) : null };
  }

  // 1. Unauthenticated
  await hitIntent('', data.agentId, data.job.id, 401);
  
  // 2. Wrong Agent (authenticated but not assigned to this machine/job)
  await hitIntent(data.agentToken2, data.agentId2, data.job.id, 403);
  
  // 3. Valid Agent, Valid Lease
  const successRes = await hitIntent(data.agentToken, data.agentId, data.job.id, 201);
  
  // 4. Expired Lease
  console.log("\n[Auth] Simulating Expired Lease...");
  await prisma.executionLease.update({ where: { id: data.lease.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await hitIntent(data.agentToken, data.agentId, data.job.id, 409);
  
  // 5. Revoked Lease
  console.log("\n[Auth] Simulating Revoked Lease...");
  await prisma.executionLease.update({ where: { id: data.lease.id }, data: { status: 'REVOKED', expiresAt: new Date(Date.now() + 100000) } });
  await hitIntent(data.agentToken, data.agentId, data.job.id, 409);

  // Restore lease for next steps
  await prisma.executionLease.update({ where: { id: data.lease.id }, data: { status: 'ACTIVE' } });

  console.log("\n================ SEAWEEDFS INTEGRATION ================");
  if (successRes.status === 201) {
    const { uploadUrl, checkpoint } = successRes.body;
    console.log(`Upload URL: ${uploadUrl}`);
    console.log(`Checkpoint ID: ${checkpoint.id}`);

    try {
      // Actually upload a dummy tar.gz to SeaweedFS
      const buf = crypto.randomBytes(1024); // 1KB dummy
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: buf
      });
      console.log(`[SeaweedFS] Upload expected 200/201, got: ${uploadRes.status}`);

      // Complete Checkpoint
      const completeRes = await fetch(`${API_URL}/agent/jobs/${data.job.id}/checkpoints/${checkpoint.id}/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${data.agentToken}`,
          'X-ComputeMesh-Agent-ID': data.agentId,
          'Content-Type': 'application/json'
        }
      });
      console.log(`[Complete] Expected 200/201, got: ${completeRes.status}`);

      // Verify DB State
      const cp = await prisma.checkpoint.findUnique({ where: { id: checkpoint.id } });
      console.log(`[Verify DB] Status: ${cp.status}, Event created!`);

    } catch(err) {
      console.error("[SeaweedFS] Error:", err.message);
    }
  }

  // Cleanup
  console.log("Cleaning up test data...");
  await prisma.jobEvent.deleteMany({ where: { jobId: data.job.id } });
  await prisma.checkpoint.deleteMany({ where: { jobId: data.job.id } });
  await prisma.executionLease.deleteMany({ where: { jobId: data.job.id } });
  await prisma.jobAssignment.deleteMany({ where: { jobId: data.job.id } });
  await prisma.job.deleteMany({ where: { id: data.job.id } });
  await prisma.agentIdentity.deleteMany({ where: { machineId: { in: [data.machine.id, data.machine2.id] } } });
  await prisma.machine.deleteMany({ where: { id: { in: [data.machine.id, data.machine2.id] } } });
  await prisma.provider.deleteMany({ where: { id: data.provider.id } });
  await prisma.user.deleteMany({ where: { email: { in: [data.customer.email, data.providerUser.email] } } });
  console.log("Integration harness complete.");
}

runTests().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
