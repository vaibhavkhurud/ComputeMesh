const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const http = require('http');

const prisma = new PrismaClient();
const API_BASE = 'http://localhost:3001';

async function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(API_BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function hashToken(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runM10Tests() {
  console.log('--- STARTING M10 INTEGRATION TESTS ---');

  // 1. Setup Fixtures
  console.log('Setting up fixtures...');
  const user = await prisma.user.upsert({
    where: { email: 'm10@test.com' },
    update: {},
    create: { email: 'm10@test.com', passwordHash: 'hash', role: 'CUSTOMER' }
  });

  const rand = crypto.randomUUID().slice(0, 8);
  const uA = await prisma.user.create({ data: { email: `pA_${rand}@test.com`, passwordHash: 'x', role: 'PROVIDER' } });
  const uB = await prisma.user.create({ data: { email: `pB_${rand}@test.com`, passwordHash: 'x', role: 'PROVIDER' } });
  const uC = await prisma.user.create({ data: { email: `pC_${rand}@test.com`, passwordHash: 'x', role: 'PROVIDER' } });
  const uD = await prisma.user.create({ data: { email: `pD_${rand}@test.com`, passwordHash: 'x', role: 'PROVIDER' } });

  const providerA = await prisma.provider.create({ data: { userId: uA.id, displayName: 'ProvA', status: 'ACTIVE' } });
  const providerB = await prisma.provider.create({ data: { userId: uB.id, displayName: 'ProvB', status: 'ACTIVE' } });
  const providerC = await prisma.provider.create({ data: { userId: uC.id, displayName: 'ProvC', status: 'ACTIVE' } });
  const providerD = await prisma.provider.create({ data: { userId: uD.id, displayName: 'ProvD', status: 'ACTIVE' } });

  const mA = await prisma.machine.create({ data: { name: 'mA', hostname: 'hA', operatingSystem: 'linux', architecture: 'amd64', providerId: providerA.id, status: 'REGISTERED', region: 'us-east' } });
  const mB = await prisma.machine.create({ data: { name: 'mB', hostname: 'hB', operatingSystem: 'linux', architecture: 'amd64', providerId: providerB.id, status: 'REGISTERED', region: 'us-east' } });
  const mC = await prisma.machine.create({ data: { name: 'mC', hostname: 'hC', operatingSystem: 'linux', architecture: 'amd64', providerId: providerC.id, status: 'REGISTERED', region: 'us-east' } });
  const mD = await prisma.machine.create({ data: { name: 'mD', hostname: 'hD', operatingSystem: 'linux', architecture: 'amd64', providerId: providerD.id, status: 'REGISTERED', region: 'us-east' } });

  const secA = 'secretA', secB = 'secretB', secC = 'secretC', secD = 'secretD';
  const idA = await prisma.agentIdentity.create({ data: { machineId: mA.id, credentialHash: hashToken(secA), status: 'ACTIVE', lastHeartbeatAt: new Date() } });
  const idB = await prisma.agentIdentity.create({ data: { machineId: mB.id, credentialHash: hashToken(secB), status: 'ACTIVE', lastHeartbeatAt: new Date() } });
  const idC = await prisma.agentIdentity.create({ data: { machineId: mC.id, credentialHash: hashToken(secC), status: 'ACTIVE', lastHeartbeatAt: new Date() } });
  const idD = await prisma.agentIdentity.create({ data: { machineId: mD.id, credentialHash: hashToken(secD), status: 'ACTIVE', lastHeartbeatAt: new Date() } });

  await prisma.machineDiscovery.create({ data: { machineId: mA.id, discoveryStatus: 'SUCCESS', cpuLogicalCores: 4, memoryMb: 8192 } });
  await prisma.machineDiscovery.create({ data: { machineId: mB.id, discoveryStatus: 'SUCCESS', cpuLogicalCores: 4, memoryMb: 8192 } });
  await prisma.machineDiscovery.create({ data: { machineId: mC.id, discoveryStatus: 'SUCCESS', cpuLogicalCores: 4, memoryMb: 8192 } });
  await prisma.machineDiscovery.create({ data: { machineId: mD.id, discoveryStatus: 'SUCCESS', cpuLogicalCores: 4, memoryMb: 8192 } });

  // Create Job
  const job = await prisma.job.create({
    data: {
      userId: user.id,
      name: 'M10-Failover-Test',
      status: 'QUEUED',
      recoveryAttempts: 0
    }
  });

  await prisma.jobRequirement.create({
    data: { jobId: job.id, cpuCoresMin: 2, memoryMbMin: 4096 }
  });

  await sleep(1000);

  // A. A -> B Failover E2E
  console.log('--- TEST: A -> B FAILOVER ---');
  
  const assignmentA = await prisma.jobAssignment.create({
    data: { jobId: job.id, machineId: mA.id, providerId: providerA.id, status: 'ACTIVE' }
  });
  await prisma.job.update({ where: { id: job.id }, data: { status: 'ASSIGNED' } });

  // Start Execution via Agent API
  let res = await request('POST', `/agent/assignments/${assignmentA.id}/start`, {}, { 'Authorization': `Bearer ${secA}`, 'X-ComputeMesh-Agent-ID': idA.id });
  console.log('Agent A Start:', res.status);
  
  res = await request('POST', `/agent/jobs/${job.id}/checkpoints/intent`, { sizeBytes: 100, checksumSha256: 'hash' }, { 'Authorization': `Bearer ${secA}`, 'X-ComputeMesh-Agent-ID': idA.id });
  const cpId = res.data?.checkpoint?.id;
  res = await request('POST', `/agent/jobs/${job.id}/checkpoints/${cpId}/complete`, {}, { 'Authorization': `Bearer ${secA}`, 'X-ComputeMesh-Agent-ID': idA.id });
  console.log('Agent A Checkpoint Created:', res.status, res.data);
  
  await prisma.checkpoint.update({ where: { id: cpId }, data: { status: 'VERIFIED' } });

  // Expire Lease for A (simulating failure)
  await prisma.executionLease.updateMany({ where: { assignmentId: assignmentA.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
  
  console.log('Waiting for sweeper to kick in... (up to 65s)');
  await sleep(65000);

  let jobState = await prisma.job.findUnique({ where: { id: job.id } });
  console.log('Job state after A failure:', jobState.status, 'Attempts:', jobState.recoveryAttempts);
  
  if (jobState.status !== 'ASSIGNED' || jobState.recoveryAttempts !== 1) {
    console.error('FAILED: Sweeper did not properly recover Job to B.');
  }

  // Find who B is
  let currentAssignment = await prisma.jobAssignment.findFirst({ where: { jobId: job.id, status: 'ACTIVE' } });
  console.log('New Assignment is for provider:', currentAssignment.providerId);
  if (currentAssignment.providerId === providerA.id) {
    console.error('FAILED: Excluded provider A was reselected!');
  }

  // --- STALE PROVIDER TESTS ---
  console.log('--- TEST: STALE PROVIDER A REJECTION ---');
  res = await request('POST', '/agents/heartbeat', { agentVersion: '1.0' }, { 'Authorization': `Bearer ${secA}`, 'X-ComputeMesh-Agent-ID': idA.id });
  console.log('Agent A Heartbeat:', res.status, res.status === 200 ? 'PASS' : 'FAIL');

  res = await request('POST', `/agent/assignments/${assignmentA.id}/renew-lease`, {}, { 'Authorization': `Bearer ${secA}`, 'X-ComputeMesh-Agent-ID': idA.id });
  console.log('Agent A RenewLease:', res.status, res.status === 409 ? 'PASS' : 'FAIL');

  res = await request('POST', `/agent/assignments/${assignmentA.id}/result`, { status: 'COMPLETED' }, { 'Authorization': `Bearer ${secA}`, 'X-ComputeMesh-Agent-ID': idA.id });
  console.log('Agent A ReportResult:', res.status, res.status === 409 ? 'PASS' : 'FAIL');

  // --- TEST: B FAILS -> C ---
  console.log('--- TEST: B -> C FAILOVER ---');
  // Need to start B to create a lease
  let idB = currentAssignment.providerId === providerB.id ? idB_ref : (currentAssignment.providerId === providerC.id ? idC_ref : idD_ref);
  // Actually, we can just look up the identity for B's machine
  const identB = await prisma.agentIdentity.findFirst({ where: { machineId: currentAssignment.machineId } });
  
  await request('POST', `/agent/assignments/${currentAssignment.id}/start`, {}, { 'Authorization': `Bearer ${secB}`, 'X-ComputeMesh-Agent-ID': identB.id });

  await prisma.executionLease.updateMany({ where: { assignmentId: currentAssignment.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
  
  console.log('Waiting for sweeper (65s)...');
  await sleep(65000);
  
  jobState = await prisma.job.findUnique({ where: { id: job.id } });
  console.log('Job state after B failure:', jobState.status, 'Attempts:', jobState.recoveryAttempts);
  let oldAssignment = currentAssignment;
  currentAssignment = await prisma.jobAssignment.findFirst({ where: { jobId: job.id, status: 'ACTIVE' } });
  console.log('New Assignment is for provider:', currentAssignment.providerId);
  if (currentAssignment.providerId === providerA.id || currentAssignment.providerId === oldAssignment.providerId) {
    console.error('FAILED: Excluded provider A or B was reselected!');
  }

  // --- TEST: C FAILS -> FAILED (Attempt Exhaustion) ---
  console.log('--- TEST: C -> FAILED (EXHAUSTION) ---');
  const identC = await prisma.agentIdentity.findFirst({ where: { machineId: currentAssignment.machineId } });
  await request('POST', `/agent/assignments/${currentAssignment.id}/start`, {}, { 'Authorization': `Bearer ${secC}`, 'X-ComputeMesh-Agent-ID': identC.id });

  await prisma.executionLease.updateMany({ where: { assignmentId: currentAssignment.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
  
  console.log('Waiting for sweeper (65s)...');
  await sleep(65000);
  
  jobState = await prisma.job.findUnique({ where: { id: job.id } });
  console.log('Job state after C failure:', jobState.status, 'Attempts:', jobState.recoveryAttempts);
  
  if (jobState.status !== 'FAILED') {
    console.error('FAILED: Job did not reach FAILED state after 3 attempts.');
  } else {
    console.log('PASS: Job reached FAILED state successfully.');
  }

  console.log('--- DONE ---');
}

runM10Tests().catch(console.error).finally(() => prisma.$disconnect());
