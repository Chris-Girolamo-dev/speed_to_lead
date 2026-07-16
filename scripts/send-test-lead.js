// Fire a test lead at a running Speed-to-Lead server.
//
// Usage:
//   npm run test:lead                                     (localhost, sample data)
//   node scripts/send-test-lead.js --url https://x.onrender.com/api/leads --token SECRET
//   node scripts/send-test-lead.js --phone +15551234567 --email you@example.com
//   node scripts/send-test-lead.js --raw '{"your-name":"Jane Doe","your-email":"j@x.com"}'
//
// --phone/--email let you point the follow-ups at YOUR OWN phone/inbox
// during Day 5 go-live testing. --raw sends an arbitrary payload to
// verify the client's fieldMap normalizes it correctly.

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const url = arg('url') || 'http://localhost:3000/api/leads';
const token = arg('token') || process.env.INTAKE_TOKEN || '';

let payload;
if (arg('raw')) {
  payload = JSON.parse(arg('raw'));
} else {
  payload = {
    firstName: 'Test',
    lastName: 'Lead',
    company: 'Example Biopharma',
    phone: arg('phone') || '5550100001',
    email: arg('email') || 'test.lead@example.com'
  };
}

const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
if (token) headers['X-STL-Token'] = token;

console.log(`POST ${url}`);
console.log(JSON.stringify(payload, null, 2));

fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  .then(async res => {
    const body = await res.text();
    console.log(`\nStatus: ${res.status}`);
    console.log(`Body:   ${body}`);
    process.exit(res.ok ? 0 : 1);
  })
  .catch(err => {
    console.error(`Request failed: ${err.message}`);
    console.error('Is the server running? Start it with: npm start');
    process.exit(1);
  });
