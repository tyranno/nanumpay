// scripts/seed-users.js
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/lib/server/models/User.js';

async function main() {
	await mongoose.connect(process.env.MONGODB_URI);
	await User.deleteMany({});

	const passwordHash = await bcrypt.hash('pass1234', 10);
	const root = await User.create({
		name: '홍길동1',
		loginId: 'root1',
		passwordHash,
		role: 'admin',
		parentId: null,
		position: null
	});

	const depth = 12;
	const q = [{ id: root._id, level: 1 }];
	let seq = 2;
	while (q.length) {
		const { id, level } = q.shift();
		if (level >= depth) continue;

		const left = await User.create({
			name: `홍길동${seq}`,
			loginId: `user${seq}`,
			passwordHash,
			parentId: id,
			position: 'L'
		});
		seq++;

		const right = await User.create({
			name: `홍길동${seq}`,
			loginId: `user${seq}`,
			passwordHash,
			parentId: id,
			position: 'R'
		});
		seq++;

		q.push({ id: left._id, level: level + 1 });
		q.push({ id: right._id, level: level + 1 });
	}

	console.log('seed done. loginId=root1 / pass=pass1234');
	await mongoose.disconnect();
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
