async function testLogin() {
  try {
    const res = await fetch('http://localhost:3001/auth/moderator/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'admin@english-learning.local',
        password: 'EngLearnAdmin-2026-Reset!'
      })
    });
    const data = await res.json();
    if (res.ok) {
      console.log('Login success:', data);
    } else {
      console.error('Login failed:', res.status, data);
    }
  } catch (err) {
    console.error('Login error:', err);
  }
}

testLogin();
