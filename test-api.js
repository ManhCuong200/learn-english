const http = require('http');

const data = JSON.stringify({
  email: 'admin@english-learning.local',
  password: 'EngLearnAdmin-2026-Reset!'
});

const req = http.request('http://localhost:3001/auth/admin/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, (res) => {
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  console.log('Cookie:', cookie);
  
  const catData = JSON.stringify({
    name: 'test category',
    slug: 'test-category'
  });
  
  const req2 = http.request('http://localhost:3001/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': catData.length,
      'Cookie': cookie
    }
  }, (res2) => {
    let body = '';
    res2.on('data', chunk => body += chunk);
    res2.on('end', () => console.log('Response:', res2.statusCode, body));
  });
  
  req2.write(catData);
  req2.end();
});

req.write(data);
req.end();
