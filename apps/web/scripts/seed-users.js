// scripts/seed-users.js
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/lib/server/models/User.js';
import { Admin } from '../src/lib/server/models/Admin.js';
import { TreeStats } from '../src/lib/server/models/TreeStats.js';
import { treeService } from '../src/lib/server/services/treeService.js';

async function main() {
	await mongoose.connect(process.env.MONGODB_URI);
	await User.deleteMany({});
	await Admin.deleteMany({});
	await TreeStats.deleteMany({});

	console.log('Creating MLM tree structure...');

	// 샘플 데이터
	const sampleData = {
		banks: ['하나', 'KB', '신한', '우리', '농협'],
		insurances: ['삼성생명', '한화생명', 'KB생명', '교보생명'],
		branches: ['서울지사', '경기지사', '인천지사', '부산지사']
	};

	// 관리자 생성 (hong1)
	const adminPasswordHash = await bcrypt.hash('1234', 10);
	const admin = await Admin.create({
		name: '홍길동(관리자)',
		loginId: 'hong1',
		passwordHash: adminPasswordHash,
		phone: '010-1234-5678',
		permissions: ['full_access'],
		isActive: true
	});
	console.log('Created Admin: hong1');

	// 루트 사용자 생성 (최상위 User)
	const passwordHash = await bcrypt.hash('1234', 10);
	const root = await User.create({
		name: '홍길동2',
		loginId: 'hong2',
		passwordHash,
		phone: '010-1234-5679',
		parentId: null,
		position: null,
		rootAdminId: admin._id,  // Admin 참조
		bank: sampleData.banks[0],
		accountNumber: '1002-066-361313',
		branch: sampleData.branches[0],
		level: 1
	});

	const depth = 7; // 트리 깊이
	const queue = [{ user: root, level: 1 }];
	let seq = 2;
	const allUsers = [root];

	// BFS로 트리 생성
	while (queue.length > 0) {
		const { user: parent, level } = queue.shift();
		if (level >= depth) continue;

		// 왼쪽 자식
		const leftPhone = `010-${1000 + seq}-${5000 + seq}`;
		const left = await User.create({
			name: `홍길동${seq+1}`,
			loginId: `hong${seq+1}`,
			passwordHash,
			phone: leftPhone,
			parentId: parent._id,
			position: 'L',
			bank: sampleData.banks[seq % sampleData.banks.length],
			accountNumber: `1002-066-36${1000 + seq}`,
			branch: sampleData.branches[seq % sampleData.branches.length],
			insurance: sampleData.insurances[seq % sampleData.insurances.length],
			seller: parent.name,
			sellerPhone: parent.phone,
			level: level + 1
		});

		// 부모의 leftChildId 업데이트
		parent.leftChildId = left._id;
		await parent.save();

		allUsers.push(left);
		seq++;

		// 오른쪽 자식
		const rightPhone = `010-${1000 + seq}-${5000 + seq}`;
		const right = await User.create({
			name: `홍길동${seq+1}`,
			loginId: `hong${seq+1}`,
			passwordHash,
			phone: rightPhone,
			parentId: parent._id,
			position: 'R',
			bank: sampleData.banks[seq % sampleData.banks.length],
			accountNumber: `1002-066-36${1000 + seq}`,
			branch: sampleData.branches[seq % sampleData.branches.length],
			insurance: sampleData.insurances[seq % sampleData.insurances.length],
			seller: parent.name,
			sellerPhone: parent.phone,
			level: level + 1
		});

		// 부모의 rightChildId 업데이트
		parent.rightChildId = right._id;
		await parent.save();

		allUsers.push(right);
		seq++;

		// 다음 레벨 큐에 추가
		if (level + 1 < depth) {
			queue.push({ user: left, level: level + 1 });
			queue.push({ user: right, level: level + 1 });
		}
	}

	console.log(`Created ${allUsers.length} users`);
	console.log('Calculating grades and statistics...');

	// 모든 사용자에 대한 TreeStats 생성 및 계산
	for (const user of allUsers) {
		await treeService.onUserAdded(user._id);
	}

	// 전체 트리 재계산
	await treeService.recalculateEntireTree();

	// 등급별 통계
	const gradeStats = await treeService.getGradeStatistics();

	console.log('\n=== Seed Complete ===');
	console.log('Grade Statistics:');
	Object.entries(gradeStats).forEach(([grade, count]) => {
		if (count > 0) {
			console.log(`  ${grade}: ${count} users`);
		}
	});
	console.log('\nLogin Examples:');
	console.log('  Admin: hong1 / 1234 (관리자)');
	console.log('  User: hong2 / 1234 (최상위 유저)');
	console.log('  User: hong3 / 1234');
	console.log('  User: hong10 / 1234');
	console.log('=====================\n');

	await mongoose.disconnect();
}

main().catch((e) => {
	console.error('Seed error:', e);
	process.exit(1);
});
