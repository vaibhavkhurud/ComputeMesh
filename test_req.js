const fetch = require('node-fetch');
(async () => {
  try {
    const res = await fetch('http://localhost:3001/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'Password123!' })
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e);
  }
})();
