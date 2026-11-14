require('dotenv').config();
const store = require('./csv-store');

(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.log('Usage: npm run make-admin -- user@example.com');
    process.exit(1);
  }
  const users = await store.read('users');
  const user = users.find(u => u.email.toLowerCase() === email);
  if (!user) {
    console.error('No account found for that email. Register through the website first.');
    process.exit(1);
  }
  await store.update('users', u => u.email.toLowerCase() === email, u => ({ ...u, role: 'agronomist' }));
  console.log(`${email} is now an agronomist/admin. Sign out and sign in again.`);
})().catch(error => { console.error(error); process.exit(1); });
