require('dotenv').config();
const bcrypt = require('bcryptjs');
const store = require('./csv-store');

(async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const password = process.argv[3] || '';
  const name = (process.argv[4] || 'TerraGrow Administrator').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    console.log('Usage: npm run create-admin -- admin@example.com "StrongPassword123" "Admin Name"');
    console.log('Password must contain at least 8 characters.');
    process.exit(1);
  }
  const users = await store.read('users');
  const existing = users.find(u => u.email.toLowerCase() === email);
  const passwordHash = await bcrypt.hash(password, 12);
  if (existing) {
    await store.update('users', u => u.email.toLowerCase() === email, u => ({
      ...u, name, role: 'agronomist', passwordHash
    }));
    console.log(`Admin account updated for ${email}. You can now sign in with the new password.`);
  } else {
    const user = await store.insert('users', {
      name, role: 'agronomist', email, passwordHash,
      phone: '', location: '', createdAt: new Date().toISOString()
    }, 'userId');
    console.log(`Admin account created for ${email} (ID ${user.userId}).`);
  }
})().catch(error => { console.error(error); process.exit(1); });
