// scripts/test-f8-tree.js
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/lib/server/models/User.js';
import { TreeStats } from '../src/lib/server/models/TreeStats.js';
import { treeService } from '../src/lib/server/services/treeService.js';

/**
 * F8 등급 달성을 위한 초대규모 트리 테스트
 * 목표: 2000+ 사용자로 F8 달성
 */
async function main() {
	console.log('🚀 Starting F8 ACHIEVEMENT test...\n');
	console.log('🎯 Goal: Build a tree large enough to achieve F8 grade\n');

	await mongoose.connect(process.env.MONGODB_URI);

	// 기존 데이터 삭제
	await User.deleteMany({});
	await TreeStats.deleteMany({});

	const passwordHash = await bcrypt.hash('1234', 10);
	const startTime = Date.now();

	console.log('🌳 Building MASSIVE tree structure...\n');

	const allUsers = [];
	let userCount = 0;

	// 전략: 깊이 11까지의 완전 이진 트리 생성 (2^11 - 1 = 2047 users)
	// 그 후 추가로 확장하여 10000명까지

	// 루트
	const root = await createUser('CEO', 'ceo', passwordHash);
	allUsers.push(root);
	userCount++;

	// 레벨별로 생성 (완전 이진 트리)
	const targetDepth = 11;
	let currentLevel = [root];

	for (let level = 2; level <= targetDepth; level++) {
		const nextLevel = [];

		for (const parent of currentLevel) {
			// 왼쪽 자식
			const left = await createUser(
				`L${level}_${userCount}`,
				`l${level}_${userCount}`,
				passwordHash,
				parent._id,
				'L'
			);
			allUsers.push(left);
			nextLevel.push(left);
			userCount++;

			// 오른쪽 자식
			const right = await createUser(
				`R${level}_${userCount}`,
				`r${level}_${userCount}`,
				passwordHash,
				parent._id,
				'R'
			);
			allUsers.push(right);
			nextLevel.push(right);
			userCount++;
		}

		currentLevel = nextLevel;
		console.log(`Level ${level}: Created ${nextLevel.length} users (Total: ${userCount})`);
	}

	// 추가 확장 (10000명까지)
	console.log('\n📈 Expanding tree to 10000+ users...');

	const leafNodes = currentLevel;
	let expandIndex = 0;

	while (userCount < 10000 && expandIndex < leafNodes.length) {
		const parent = leafNodes[expandIndex];

		// 왼쪽 자식
		if (userCount < 10000) {
			const left = await createUser(
				`EL_${userCount}`,
				`el_${userCount}`,
				passwordHash,
				parent._id,
				'L'
			);
			allUsers.push(left);
			userCount++;
		}

		// 오른쪽 자식
		if (userCount < 10000) {
			const right = await createUser(
				`ER_${userCount}`,
				`er_${userCount}`,
				passwordHash,
				parent._id,
				'R'
			);
			allUsers.push(right);
			userCount++;
		}

		expandIndex++;

		if (userCount % 1000 === 0) {
			console.log(`Expanded to ${userCount} users...`);
		}
	}

	const createTime = Date.now() - startTime;
	console.log(`\n✅ Created ${userCount} users in ${(createTime/1000).toFixed(2)} seconds`);
	console.log(`   Average: ${(createTime/userCount).toFixed(2)}ms per user\n`);

	// TreeStats 초기화 및 등급 계산
	console.log('🔄 Calculating grades for massive tree...\n');

	const calcStart = Date.now();

	// 배치로 TreeStats 생성
	console.log('Creating TreeStats documents...');
	const batchSize = 100;
	for (let i = 0; i < allUsers.length; i += batchSize) {
		const batch = allUsers.slice(i, i + batchSize);
		await Promise.all(batch.map(user =>
			TreeStats.findOrCreateForUser(user._id)
		));

		if ((i + batchSize) % 500 === 0) {
			console.log(`  Initialized ${Math.min(i + batchSize, allUsers.length)} / ${allUsers.length} stats`);
		}
	}

	// 전체 트리 재계산
	console.log('\nRecalculating entire tree...');
	await treeService.recalculateEntireTree();

	const calcTime = Date.now() - calcStart;
	console.log(`⏱️ Grade calculation completed in ${(calcTime/1000).toFixed(2)} seconds\n`);

	// 결과 분석
	console.log('📊 === FINAL GRADE DISTRIBUTION ===\n');

	const gradeStats = await treeService.getGradeStatistics();
	const gradeOrder = ['F8', 'F7', 'F6', 'F5', 'F4', 'F3', 'F2', 'F1'];

	let hasF8 = false;
	const maxCount = Math.max(...Object.values(gradeStats));

	for (const grade of gradeOrder) {
		if (gradeStats[grade] && gradeStats[grade] > 0) {
			if (grade === 'F8') hasF8 = true;

			const count = gradeStats[grade];
			const percentage = ((count / userCount) * 100).toFixed(2);
			const barLength = Math.floor((count / maxCount) * 40);
			const bar = '█'.repeat(barLength);

			console.log(`${grade}: ${count.toString().padStart(4)} (${percentage.padStart(6)}%) │${bar}`);
		}
	}

	// F8 달성자 확인
	if (hasF8) {
		console.log('\n🏆 === F8 ACHIEVED! ===\n');

		const f8Users = await User.aggregate([
			{
				$lookup: {
					from: 'treestats',
					localField: '_id',
					foreignField: 'userId',
					as: 'stats'
				}
			},
			{ $unwind: '$stats' },
			{ $match: { 'stats.grade': 'F8' } },
			{ $limit: 5 }
		]);

		console.log('F8 Grade Holders:');
		for (const user of f8Users) {
			console.log(`  🌟 ${user.name} - Level ${user.level}`);
			console.log(`     Total Descendants: ${user.stats.totalDescendants}`);
			console.log(`     F7 in organization: ${user.stats.gradeComposition.F7}`);
		}
	} else {
		console.log('\n⚠️ F8 not achieved. Checking highest grades...\n');

		const highestGrade = gradeOrder.find(g => gradeStats[g] > 0);
		console.log(`Highest grade achieved: ${highestGrade}`);
	}

	// 성능 통계
	console.log('\n⚡ === PERFORMANCE STATISTICS ===\n');

	// 메모리 사용량
	const memUsage = process.memoryUsage();
	console.log('Memory Usage:');
	console.log(`  RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`);
	console.log(`  Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`);

	// 데이터베이스 통계
	const dbStats = await mongoose.connection.db.stats();
	console.log('\nDatabase Statistics:');
	console.log(`  Data Size: ${(dbStats.dataSize / 1024 / 1024).toFixed(2)} MB`);
	console.log(`  Index Size: ${(dbStats.indexSize / 1024 / 1024).toFixed(2)} MB`);
	console.log(`  Total Collections: ${dbStats.collections}`);

	// 트리 구조 통계
	const treeStats = await TreeStats.aggregate([
		{
			$group: {
				_id: null,
				avgDescendants: { $avg: '$totalDescendants' },
				maxDescendants: { $max: '$totalDescendants' },
				avgLeftCount: { $avg: '$leftCount' },
				avgRightCount: { $avg: '$rightCount' },
				totalF7: { $sum: '$gradeComposition.F7' }
			}
		}
	]);

	if (treeStats.length > 0) {
		console.log('\nTree Structure Analysis:');
		console.log(`  Average Descendants: ${treeStats[0].avgDescendants.toFixed(2)}`);
		console.log(`  Maximum Descendants: ${treeStats[0].maxDescendants}`);
		console.log(`  Average Left Children: ${treeStats[0].avgLeftCount.toFixed(2)}`);
		console.log(`  Average Right Children: ${treeStats[0].avgRightCount.toFixed(2)}`);
	}

	// 추가 성능 테스트
	console.log('\n🚀 === STRESS TEST ===\n');

	// 1. 대량 조회
	console.time('Query 1000 users');
	await User.find().limit(1000).lean();
	console.timeEnd('Query 1000 users');

	// 2. 깊은 트리 순회
	console.time('Deep tree traversal (depth 15)');
	await treeService.getTreeStructure(root._id, 15);
	console.timeEnd('Deep tree traversal (depth 15)');

	// 3. 100명 동시 등급 재계산
	console.time('Recalculate 100 users');
	const randomUsers = await User.aggregate([{ $sample: { size: 100 } }]);
	for (const user of randomUsers) {
		const stats = await TreeStats.findOne({ userId: user._id });
		if (stats) {
			await stats.calculateGrade();
		}
	}
	console.timeEnd('Recalculate 100 users');

	// 4. 복잡한 집계 쿼리
	console.time('Complex aggregation');
	await TreeStats.aggregate([
		{
			$group: {
				_id: '$grade',
				count: { $sum: 1 },
				avgDesc: { $avg: '$totalDescendants' },
				maxDesc: { $max: '$totalDescendants' }
			}
		},
		{ $sort: { _id: 1 } }
	]);
	console.timeEnd('Complex aggregation');

	console.log('\n✅ All tests completed successfully!');
	console.log(`📊 Total Users: ${userCount}`);
	console.log(`⏰ Total Time: ${((Date.now() - startTime) / 1000).toFixed(2)} seconds`);

	await mongoose.disconnect();
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

	if (parentId) {
		const parent = await User.findById(parentId);
		user.level = parent.level + 1;

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