const http = require('http');

const req = http.request(
  {
    hostname: 'localhost',
    port: 3001,
    path: '/auth/admin/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  },
  (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers, null, 2)}`);
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log(`BODY: ${data}`);
      
      const cookies = res.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        const tokenMatch = cookies[0].match(/access_token=([^;]+)/);
        if (tokenMatch) {
          const token = tokenMatch[1];
          console.log(`TOKEN: ${token}`);
          
          const meReq = http.request(
            {
              hostname: 'localhost',
              port: 3001,
              path: '/auth/me',
              method: 'GET',
              headers: {
                'Cookie': `access_token=${token}`,
              },
            },
            (meRes) => {
              console.log(`ME STATUS: ${meRes.statusCode}`);
              let meData = '';
              meRes.on('data', (chunk) => meData += chunk);
              meRes.on('end', () => console.log(`ME BODY: ${meData}`));
            }
          );
          meReq.end();
        }
      }
    });
  }
);

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify({ email: 'admin@english-learning.local', password: 'EngLearnAdmin-2026-Reset!' }));
req.end();
