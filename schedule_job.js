async function main() {
  const baseUrl = 'http://localhost:3001';
  const fs = require('fs');
  const adminEmail = fs.readFileSync('admin-email.txt', 'utf8').trim();
  const jobId = fs.readFileSync('job-id.txt', 'utf8').trim();
  const machineId = fs.readFileSync('test-machine-id.txt', 'utf8').trim();

  // Login Admin
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: 'Password123!' })
  });
  const { accessToken: adminToken } = await loginRes.json();

  // Schedule Job (assign to our machine)
  const scheduleRes = await fetch(`${baseUrl}/admin/jobs/${jobId}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ machineId })
  });
  console.log('Schedule res status:', scheduleRes.status);
  console.log('Schedule res body:', await scheduleRes.json());
}
main().catch(console.error);
