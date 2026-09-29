async function main() {
  const baseUrl = 'http://localhost:3001';
  const fs = require('fs');
  const token = fs.readFileSync('test-auth-token.txt', 'utf8').trim();

  // Create Job
  const createJobRes = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Test Job',
      trustedImage: 'hello-world',
      inputBucket: 'computemesh-inputs',
      inputKey: 'test-input.zip'
    })
  });
  const job = await createJobRes.json();
  console.log('Job created:', job);
  const jobId = job.id || job.jobId;

  // Wait 1 second
  await new Promise(r => setTimeout(r, 1000));

  // Schedule Job (assign to our machine)
  const machineId = fs.readFileSync('test-machine-id.txt', 'utf8').trim();
  const scheduleRes = await fetch(`${baseUrl}/admin/jobs/${jobId}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, // Note: /admin route might need ADMIN role, but let's see
    body: JSON.stringify({ machineId })
  });
  console.log('Schedule res status:', scheduleRes.status);
  console.log('Schedule res body:', await scheduleRes.json());
}
main().catch(console.error);
