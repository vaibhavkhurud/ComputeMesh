async function main() {
  const baseUrl = 'http://localhost:3001';
  const email = `customer-${Date.now()}@example.com`;

  // Register Customer
  await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', name: 'Customer User' })
  });
  
  // Login Customer
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!' })
  });
  const { accessToken: customerToken } = await loginRes.json();
  
  // Create Job
  const createJobRes = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${customerToken}` },
    body: JSON.stringify({
      name: 'Test Job',
      trustedImage: 'hello-world',
      requirements: {
        cpuCoresMin: 1,
        memoryMbMin: 512
      }
    })
  });
  const job = await createJobRes.json();
  console.log('Job created res:', job);
  const jobId = job.id || job.jobId;

  // Now create Admin
  const adminEmail = `admin-${Date.now()}@example.com`;
  await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: 'Password123!', name: 'Admin User' })
  });
  
  // We need to promote admin in DB! We will write the email to a file so we can promote it.
  const fs = require('fs');
  fs.writeFileSync('admin-email.txt', adminEmail);
  fs.writeFileSync('job-id.txt', jobId);

  console.log('Job ID:', jobId, 'Admin Email:', adminEmail);
}
main().catch(console.error);
