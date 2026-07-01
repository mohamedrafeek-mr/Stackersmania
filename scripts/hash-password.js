// Usage: node scripts/hash-password.js "yourNewPassword"
// Copy the printed hash into ADMIN_PASS_HASH in your .env file,
// then you can safely delete/blank out ADMIN_PASS.
const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js "yourNewPassword"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\nAdd this line to your .env file:\n');
console.log(`ADMIN_PASS_HASH=${hash}\n`);
