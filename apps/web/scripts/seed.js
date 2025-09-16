import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/server/db.js';
import { User } from '../src/lib/server/models/User.js';

await db();
const exists = await User.findOne({ loginId: 'admin' });
if (!exists) {
	const passwordHash = await bcrypt.hash('1111', 10);
	await User.create({ name: '관리자', loginId: 'admin', passwordHash, role: 'admin' });
	console.log('seeded: admin / 1111');
} else {
	console.log('admin already exists');
}
process.exit(0);
