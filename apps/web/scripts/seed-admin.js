import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Admin } from '../src/lib/server/models/Admin.js';

async function main() {
	await mongoose.connect(process.env.MONGODB_URI);

	// 기본 관리자 계정 생성
	const passwordHash = await bcrypt.hash('admin1234', 10);

	const existingAdmin = await Admin.findOne({ loginId: 'admin' });
	if (!existingAdmin) {
		await Admin.create({
			name: '시스템 관리자',
			loginId: 'admin',
			passwordHash,
			email: 'admin@nanumpay.com',
			permissions: ['full_access'],
			isActive: true
		});
		console.log('관리자 계정 생성 완료: admin / admin1234');
	} else {
		console.log('관리자 계정이 이미 존재합니다.');
	}

	await mongoose.disconnect();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});