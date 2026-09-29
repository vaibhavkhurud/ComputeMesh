async function main() {
  const baseUrl = 'http://localhost:3001';
  const email = 'test-provider@example.com';

  // 1. Register a user (ignore if already exists)
  await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: 'Password123!', name: 'Test User' })
  });


  // 2. Login
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: 'Password123!' })
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Login token acquired');

  // 3. Create Provider Profile
  await fetch(`${baseUrl}/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ displayName: 'Test Provider', website: 'https://test.com', type: 'INDIVIDUAL' })
  });
  console.log('Provider profile created');

  // 4. Register Machine
  const machineRes = await fetch(`${baseUrl}/providers/me/machines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ 
      name: 'Test Machine',
      hostname: 'test-machine-01',
      operatingSystem: 'linux',
      architecture: 'amd64',
      region: 'us-east',
      resources: {
        cpuCores: 4,
        memoryMb: 8192,
        storageGb: 50,
        gpuCount: 0
      }
    })
  });
  const machine = await machineRes.json();
  console.log('Machine res:', machine);
  const machineId = machine.id || machine.machineId;
  console.log('Machine created:', machineId);

  // 5. Generate Enrollment Token
  const enrollRes = await fetch(`${baseUrl}/providers/me/machines/${machineId}/enrollment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  });
  const enrollData = await enrollRes.json();
  console.log('Enrollment token:', enrollData.token);

  // 6. Output to a file for the agent to pick up
  const fs = require('fs');
  fs.writeFileSync('test-enrollment-token.txt', enrollData.token);
  fs.writeFileSync('test-machine-id.txt', machine.id);
  fs.writeFileSync('test-auth-token.txt', token);

  console.log('Setup complete!');
}

main().catch(console.error);
