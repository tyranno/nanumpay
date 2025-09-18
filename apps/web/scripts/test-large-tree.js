// scripts/test-large-tree.js
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/lib/server/models/User.js';
import { TreeStats } from '../src/lib/server/models/TreeStats.js';
import { treeService } from '../src/lib/server/services/treeService.js';

/**
 * 대규모 트리 구조 테스트
 * F1~F8 모든 등급이 나오도록 대규모 트리 생성
 */
async function main() {
	console.log('🚀 Starting LARGE SCALE tree structure test...\n');
	console.log('📌 Goal: Create a tree with F1~F8 grades and test performance with thousands of users\n');

	await mongoose.connect(process.env.MONGODB_URI);

	// 기존 데이터 삭제
	await User.deleteMany({});
	await TreeStats.deleteMany({});

	const passwordHash = await bcrypt.hash('1234', 10);
	const startTime = Date.now();

	console.log('🌳 Building large balanced tree structure...\n');

	// 전략: 완전 이진 트리를 깊이 7-8까지 생성
	// 이렇게 하면 약 255-511명의 사용자가 생성되고 F8까지 도달 가능

	let userCount = 0;
	const users = [];

	// BFS로 트리 생성
	const queue = [];

	// 루트 노드
	const root = await createUser('CEO', 'ceo', passwordHash);
	users.push(root);
	userCount++;
	queue.push({ user: root, level: 1 });

	const maxLevel = 8; // 8레벨까지 생성
	const targetUsers = 500; // 목표 사용자 수

	console.log(`📊 Creating balanced tree up to level ${maxLevel}...`);

	while (queue.length > 0 && userCount < targetUsers) {
		const { user: parent, level } = queue.shift();

		if (level >= maxLevel) continue;

		// 왼쪽 자식
		const leftName = `L${level}_${userCount}`;
		const left = await createUser(leftName, leftName.toLowerCase(), passwordHash, parent._id, 'L');
		users.push(left);
		userCount++;

		// 오른쪽 자식
		const rightName = `R${level}_${userCount}`;
		const right = await createUser(rightName, rightName.toLowerCase(), passwordHash, parent._id, 'R');
		users.push(right);
		userCount++;

		// 다음 레벨 큐에 추가
		if (level < maxLevel - 1) {
			queue.push({ user: left, level: level + 1 });
			queue.push({ user: right, level: level + 1 });
		}

		// 진행 상황 표시
		if (userCount % 50 === 0) {
			console.log(`  Created ${userCount} users...`);
		}
	}

	console.log(`\n✅ Tree structure created with ${userCount} users`);
	const createTime = Date.now() - startTime;
	console.log(`⏱️ Creation time: ${createTime}ms (${(createTime/userCount).toFixed(2)}ms per user)\n`);

	// 더 큰 트리 생성 (수천 명 테스트용)
	if (userCount < 1000) {
		console.log('🚀 Expanding tree to test with 1000+ users...');

		const expandStart = Date.now();
		const leafNodes = users.filter(u => u.level === maxLevel - 1);

		for (let i = 0; i < Math.min(leafNodes.length, 250) && userCount < 1000; i++) {
			const parent = leafNodes[i];

			// 왼쪽 자식
			if (userCount < 1000) {
				const leftName = `EL_${userCount}`;
				const left = await createUser(leftName, leftName.toLowerCase(), passwordHash, parent._id, 'L');
				users.push(left);
				userCount++;
			}

			// 오른쪽 자식
			if (userCount < 1000) {
				const rightName = `ER_${userCount}`;
				const right = await createUser(rightName, rightName.toLowerCase(), passwordHash, parent._id, 'R');
				users.push(right);
				userCount++;
			}

			if (userCount % 100 === 0) {
				console.log(`  Expanded to ${userCount} users...`);
			}
		}

		const expandTime = Date.now() - expandStart;
		console.log(`✅ Expanded to ${userCount} users in ${expandTime}ms\n`);
	}

	// TreeStats 초기화
	console.log('📈 Initializing TreeStats for all users...');
	const statsInitStart = Date.now();

	for (const user of users) {
		const stats = await TreeStats.findOrCreateForUser(user._id);
		await stats.updateComposition();
	}

	const statsInitTime = Date.now() - statsInitStart;
	console.log(`⏱️ Stats initialization: ${statsInitTime}ms\n`);

	// 전체 등급 계산
	console.log('🔄 Calculating grades for entire tree...');
	console.time('⏱️ Full tree grade calculation');
	await treeService.recalculateEntireTree();
	console.timeEnd('⏱️ Full tree grade calculation');

	// 결과 분석
	console.log('\n📊 === GRADE DISTRIBUTION ===\n');

	const gradeGroups = {};
	for (const user of users) {
		const stats = await TreeStats.findOne({ userId: user._id });
		const grade = stats?.grade || 'F1';
		if (!gradeGroups[grade]) gradeGroups[grade] = [];
		gradeGroups[grade].push({
			name: user.name,
			loginId: user.loginId,
			level: user.level,
			totalDescendants: stats?.totalDescendants || 0
		});
	}

	// 등급별 통계
	const gradeOrder = ['F8', 'F7', 'F6', 'F5', 'F4', 'F3', 'F2', 'F1'];
	let totalByGrade = {};

	for (const grade of gradeOrder) {
		if (gradeGroups[grade] && gradeGroups[grade].length > 0) {
			totalByGrade[grade] = gradeGroups[grade].length;
			console.log(`${grade}: ${gradeGroups[grade].length} users (${((gradeGroups[grade].length/userCount)*100).toFixed(1)}%)`);

			// 각 등급에서 상위 3명만 표시
			if (gradeGroups[grade].length <= 5) {
				gradeGroups[grade].forEach(u => {
					console.log(`  - ${u.name} (Level ${u.level}, ${u.totalDescendants} descendants)`);
				});
			} else {
				console.log(`  - Showing top 3 of ${gradeGroups[grade].length}:`);
				gradeGroups[grade]
					.sort((a, b) => b.totalDescendants - a.totalDescendants)
					.slice(0, 3)
					.forEach(u => {
						console.log(`    ${u.name} (Level ${u.level}, ${u.totalDescendants} descendants)`);
					});
			}
		}
	}

	// 성능 테스트
	console.log('\n🚀 === PERFORMANCE BENCHMARKS ===\n');

	// 1. 단일 사용자 추가
	console.time('⏱️ Single user addition');
	const newUser = await createUser('NewUser', 'newuser1', passwordHash);
	await treeService.onUserAdded(newUser._id);
	console.timeEnd('⏱️ Single user addition');

	// 2. 10명 동시 추가
	console.time('⏱️ Batch addition (10 users)');
	for (let i = 0; i < 10; i++) {
		const batchUser = await createUser(`Batch${i}`, `batch${i}`, passwordHash);
		await treeService.onUserAdded(batchUser._id);
	}
	console.timeEnd('⏱️ Batch addition (10 users)');

	// 3. 트리 순회 (깊이 5)
	console.time('⏱️ Tree traversal (depth 5)');
	await treeService.getTreeStructure(root._id, 5);
	console.timeEnd('⏱️ Tree traversal (depth 5)');

	// 4. 트리 순회 (깊이 10)
	console.time('⏱️ Tree traversal (depth 10)');
	await treeService.getTreeStructure(root._id, 10);
	console.timeEnd('⏱️ Tree traversal (depth 10)');

	// 5. 전체 등급 통계
	console.time('⏱️ Grade statistics calculation');
	await treeService.getGradeStatistics();
	console.timeEnd('⏱️ Grade statistics calculation');

	// 6. Dirty 노드 재계산 (100개)
	await TreeStats.updateMany(
		{},
		{ $set: { isDirty: true } },
		{ limit: 100 }
	);
	console.time('⏱️ Batch recalculation (100 dirty nodes)');
	const result = await treeService.runBatchRecalculation(100);
	console.timeEnd('⏱️ Batch recalculation (100 dirty nodes)');

	// 7. 특정 사용자 조회
	console.time('⏱️ Single user stats lookup');
	await treeService.getUserStats(root._id);
	console.timeEnd('⏱️ Single user stats lookup');

	// 최종 통계
	console.log('\n📈 === FINAL STATISTICS ===\n');

	const totalUsers = await User.countDocuments();
	const totalStats = await TreeStats.countDocuments();
	const avgDescendants = await TreeStats.aggregate([
		{ $group: { _id: null, avg: { $avg: '$totalDescendants' } } }
	]);
	const maxDepth = await User.aggregate([
		{ $group: { _id: null, maxLevel: { $max: '$level' } } }
	]);

	console.log(`Total Users: ${totalUsers}`);
	console.log(`Total TreeStats: ${totalStats}`);
	console.log(`Average Descendants per User: ${avgDescendants[0]?.avg?.toFixed(2) || 0}`);
	console.log(`Maximum Tree Depth: ${maxDepth[0]?.maxLevel || 0}`);
	console.log('\nGrade Distribution Summary:');

	// 그래프 표시
	const maxCount = Math.max(...Object.values(totalByGrade));
	for (const grade of gradeOrder) {
		if (totalByGrade[grade]) {
			const count = totalByGrade[grade];
			const barLength = Math.floor((count / maxCount) * 50);
			const bar = '█'.repeat(barLength);
			console.log(`  ${grade}: ${count.toString().padStart(4)} ${'│'.padEnd(1)}${bar}`);
		}
	}

	// 메모리 사용량
	const memUsage = process.memoryUsage();
	console.log('\n💾 Memory Usage:');
	console.log(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
	console.log(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
	console.log(`  Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);

	// F8 달성 확인
	console.log('\n🏆 === TOP GRADE ACHIEVERS ===\n');

	const topGrades = ['F8', 'F7', 'F6'];
	for (const grade of topGrades) {
		if (gradeGroups[grade] && gradeGroups[grade].length > 0) {
			console.log(`${grade} Grade Holders:`);
			gradeGroups[grade].forEach(u => {
				console.log(`  🌟 ${u.name} - Level ${u.level}, Managing ${u.totalDescendants} people`);
			});
		}
	}

	// 검증: F8 등급 요건 확인
	if (gradeGroups['F8'] && gradeGroups['F8'].length > 0) {
		console.log('\n✅ SUCCESS: F8 grade achieved!');
		const f8User = gradeGroups['F8'][0];
		const f8Stats = await TreeStats.findOne({ userId: users.find(u => u.loginId === f8User.loginId)._id });
		console.log('\nF8 Requirements Verification:');
		console.log(`  F7 count in organization: ${f8Stats.gradeComposition.F7}`);
		console.log(`  Left F7 count: ${f8Stats.leftGradeComposition.F7}`);
		console.log(`  Right F7 count: ${f8Stats.rightGradeComposition.F7}`);
	} else {
		console.log('\n⚠️ No F8 grade achieved. Checking highest grade requirements...');
		const highestGrade = gradeOrder.find(g => gradeGroups[g]?.length > 0);
		if (highestGrade && gradeGroups[highestGrade].length > 0) {
			const topUser = gradeGroups[highestGrade][0];
			const userId = users.find(u => u.loginId === topUser.loginId)._id;
			const requirements = await treeService.simulateGradePromotion(userId);
			console.log(`\nHighest grade ${highestGrade} user needs for promotion:`);
			requirements.requirements?.forEach(req => {
				console.log(`  ${req.satisfied ? '✅' : '❌'} ${req.description}`);
			});
		}
	}

	await mongoose.disconnect();
	console.log('\n✅ Large scale test completed!\n');
}

async function createUser(name, loginId, passwordHash, parentId = null, position = null) {
	const user = new User({
		name,
		loginId,
		passwordHash,
		phone: `010-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
		parentId,
		position,
		bank: '하나은행',
		accountNumber: `${Math.floor(100000000 + Math.random() * 900000000)}`,
		branch: '서울지사',
		level: 1
	});

	// 레벨 계산
	if (parentId) {
		const parent = await User.findById(parentId);
		user.level = parent.level + 1;

		// 부모의 자식 ID 업데이트
		if (position === 'L') {
			parent.leftChildId = user._id;
		} else {
			parent.rightChildId = user._id;
		}
		await parent.save();
	}

	await user.save();
	return user;
}

main().catch(error => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});