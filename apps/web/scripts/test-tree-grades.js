// scripts/test-tree-grades.js
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../src/lib/server/models/User.js';
import { TreeStats } from '../src/lib/server/models/TreeStats.js';
import { treeService } from '../src/lib/server/services/treeService.js';

/**
 * 다양한 트리 구조 테스트
 * F1~F8 모든 등급이 나오도록 설계된 테스트 데이터
 */
async function main() {
	console.log('🚀 Starting comprehensive tree structure test...\n');

	await mongoose.connect(process.env.MONGODB_URI);

	// 기존 데이터 삭제
	await User.deleteMany({});
	await TreeStats.deleteMany({});

	const passwordHash = await bcrypt.hash('1234', 10);

	console.log('📊 Creating asymmetric tree structure for grade testing...\n');

	// 테스트 시나리오 1: 비대칭 트리로 다양한 등급 생성
	// 루트 (최종적으로 F8이 되어야 함)
	const root = await createUser('김대표', 'kim1', passwordHash);

	// 레벨 1 - 루트의 자식들
	const l1_left = await createUser('이부장', 'lee1', passwordHash, root._id, 'L');
	const l1_right = await createUser('박부장', 'park1', passwordHash, root._id, 'R');

	// 레벨 2 - 왼쪽 서브트리 (더 깊게)
	const l2_ll = await createUser('최과장', 'choi1', passwordHash, l1_left._id, 'L');
	const l2_lr = await createUser('정과장', 'jung1', passwordHash, l1_left._id, 'R');
	const l2_rl = await createUser('강과장', 'kang1', passwordHash, l1_right._id, 'L');
	const l2_rr = await createUser('조과장', 'cho1', passwordHash, l1_right._id, 'R');

	// 레벨 3 - 더 깊은 구조
	const l3_lll = await createUser('손대리', 'son1', passwordHash, l2_ll._id, 'L');
	const l3_llr = await createUser('윤대리', 'yoon1', passwordHash, l2_ll._id, 'R');
	const l3_lrl = await createUser('임대리', 'lim1', passwordHash, l2_lr._id, 'L');
	const l3_lrr = await createUser('한대리', 'han1', passwordHash, l2_lr._id, 'R');
	const l3_rll = await createUser('오대리', 'oh1', passwordHash, l2_rl._id, 'L');
	const l3_rlr = await createUser('서대리', 'seo1', passwordHash, l2_rl._id, 'R');
	const l3_rrl = await createUser('신대리', 'shin1', passwordHash, l2_rr._id, 'L');
	const l3_rrr = await createUser('유대리', 'yoo1', passwordHash, l2_rr._id, 'R');

	// 레벨 4 - 일부만 추가 (비대칭성 증가)
	const l4_1 = await createUser('권주임', 'kwon1', passwordHash, l3_lll._id, 'L');
	const l4_2 = await createUser('황주임', 'hwang1', passwordHash, l3_lll._id, 'R');
	const l4_3 = await createUser('안주임', 'ahn1', passwordHash, l3_llr._id, 'L');
	const l4_4 = await createUser('송주임', 'song1', passwordHash, l3_llr._id, 'R');
	const l4_5 = await createUser('전주임', 'jeon1', passwordHash, l3_lrl._id, 'L');
	const l4_6 = await createUser('홍주임', 'hong1', passwordHash, l3_lrl._id, 'R');
	const l4_7 = await createUser('문주임', 'moon1', passwordHash, l3_lrr._id, 'L');
	const l4_8 = await createUser('양주임', 'yang1', passwordHash, l3_lrr._id, 'R');

	// 오른쪽도 일부 추가
	const l4_9 = await createUser('김사원', 'kim2', passwordHash, l3_rll._id, 'L');
	const l4_10 = await createUser('이사원', 'lee2', passwordHash, l3_rll._id, 'R');
	const l4_11 = await createUser('박사원', 'park2', passwordHash, l3_rlr._id, 'L');
	const l4_12 = await createUser('최사원', 'choi2', passwordHash, l3_rlr._id, 'R');

	// 레벨 5 - 매우 일부만 (F1 등급용)
	const l5_1 = await createUser('정인턴', 'jung2', passwordHash, l4_1._id, 'L');
	const l5_2 = await createUser('강인턴', 'kang2', passwordHash, l4_2._id, 'R');
	const l5_3 = await createUser('조인턴', 'cho2', passwordHash, l4_9._id, 'L');

	console.log('✅ Tree structure created\n');
	console.log('🔄 Calculating grades for all users...\n');

	// 모든 사용자 목록
	const allUsers = await User.find({}).sort({ level: 1 });

	// TreeStats 생성 및 초기화
	for (const user of allUsers) {
		const stats = await TreeStats.findOrCreateForUser(user._id);
		await stats.updateComposition();
	}

	// 전체 트리 재계산 (Bottom-up)
	console.time('⏱️ Grade calculation time');
	await treeService.recalculateEntireTree();
	console.timeEnd('⏱️ Grade calculation time');

	// 결과 출력
	console.log('\n📈 === GRADE CALCULATION RESULTS ===\n');

	// 등급별 사용자 출력
	const gradeGroups = {};
	for (const user of allUsers) {
		const stats = await TreeStats.findOne({ userId: user._id });
		const grade = stats?.grade || 'F1';
		if (!gradeGroups[grade]) gradeGroups[grade] = [];
		gradeGroups[grade].push({
			name: user.name,
			loginId: user.loginId,
			level: user.level,
			leftCount: stats?.leftCount || 0,
			rightCount: stats?.rightCount || 0,
			totalDescendants: stats?.totalDescendants || 0
		});
	}

	// 등급순으로 출력
	const gradeOrder = ['F8', 'F7', 'F6', 'F5', 'F4', 'F3', 'F2', 'F1'];
	for (const grade of gradeOrder) {
		if (gradeGroups[grade] && gradeGroups[grade].length > 0) {
			console.log(`\n📍 ${grade} 등급 (${gradeGroups[grade].length}명)`);
			console.log('─'.repeat(50));
			gradeGroups[grade].forEach(user => {
				console.log(`  ${user.name.padEnd(8)} (${user.loginId.padEnd(6)}) - Level ${user.level}, ` +
						   `하위: 좌${user.leftCount}/우${user.rightCount}, 총${user.totalDescendants}명`);
			});
		}
	}

	// 성능 테스트
	console.log('\n\n🚀 === PERFORMANCE TEST ===\n');

	// 1. 단일 사용자 추가 시간
	console.time('⏱️ Single user addition');
	const newUser = await createUser('테스트', 'test1', passwordHash, l5_3._id, 'R');
	await treeService.onUserAdded(newUser._id);
	console.timeEnd('⏱️ Single user addition');

	// 2. 트리 순회 시간
	console.time('⏱️ Full tree traversal');
	const tree = await treeService.getTreeStructure(root._id, 10);
	console.timeEnd('⏱️ Full tree traversal');

	// 3. 등급 재계산 시간 (dirty nodes only)
	await TreeStats.updateMany({}, { $set: { isDirty: true } });
	console.time('⏱️ Batch recalculation (all dirty)');
	const result = await treeService.runBatchRecalculation(100);
	console.timeEnd('⏱️ Batch recalculation (all dirty)');
	console.log(`  Processed: ${result.processed} nodes`);

	// 통계 출력
	console.log('\n📊 === FINAL STATISTICS ===\n');
	const totalUsers = await User.countDocuments();
	const gradeStats = await treeService.getGradeStatistics();

	console.log(`Total Users: ${totalUsers}`);
	console.log('\nGrade Distribution:');
	Object.entries(gradeStats).forEach(([grade, count]) => {
		if (count > 0) {
			const percentage = ((count / totalUsers) * 100).toFixed(1);
			const bar = '█'.repeat(Math.floor(count / 2));
			console.log(`  ${grade}: ${count.toString().padStart(2)} users (${percentage.padStart(5)}%) ${bar}`);
		}
	});

	// 특정 사용자의 승급 요건 확인
	console.log('\n🎯 === PROMOTION REQUIREMENTS CHECK ===\n');

	const checkUsers = ['이부장', '박부장', '최과장'];
	for (const name of checkUsers) {
		const user = await User.findOne({ name });
		if (user) {
			const requirements = await treeService.simulateGradePromotion(user._id);
			console.log(`\n${name} (현재: ${requirements.currentGrade})`);
			if (requirements.nextGrade) {
				console.log(`  다음 등급: ${requirements.nextGrade}`);
				requirements.requirements.forEach(req => {
					const status = req.satisfied ? '✅' : '❌';
					console.log(`    ${status} ${req.description}`);
				});
			} else {
				console.log(`  최고 등급 달성!`);
			}
		}
	}

	// 비대칭 트리 검증
	console.log('\n🌳 === TREE ASYMMETRY VERIFICATION ===\n');

	const rootStats = await TreeStats.findOne({ userId: root._id });
	console.log(`Root (${root.name}):`);
	console.log(`  Left subtree: ${rootStats.leftCount} nodes`);
	console.log(`  Right subtree: ${rootStats.rightCount} nodes`);
	console.log(`  Asymmetry ratio: ${(rootStats.leftCount / rootStats.rightCount).toFixed(2)}:1`);

	// 노드별 자식 수 분포
	const childrenDist = { 0: 0, 1: 0, 2: 0 };
	for (const user of allUsers) {
		const children = await User.countDocuments({ parentId: user._id });
		childrenDist[children]++;
	}
	console.log('\nChildren distribution:');
	console.log(`  0 children (leaf): ${childrenDist[0]} nodes`);
	console.log(`  1 child: ${childrenDist[1]} nodes`);
	console.log(`  2 children (full): ${childrenDist[2]} nodes`);

	await mongoose.disconnect();
	console.log('\n✅ Test completed successfully!\n');
}

async function createUser(name, loginId, passwordHash, parentId = null, position = null) {
	const user = await User.create({
		name,
		loginId,
		passwordHash,
		phone: `010-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
		parentId,
		position,
		bank: '하나은행',
		accountNumber: `${Math.floor(100000000 + Math.random() * 900000000)}`,
		branch: '서울지사',
		level: parentId ? (await User.findById(parentId)).level + 1 : 1
	});

	// 부모 노드의 자식 ID 업데이트
	if (parentId) {
		const parent = await User.findById(parentId);
		if (position === 'L') {
			parent.leftChildId = user._id;
		} else {
			parent.rightChildId = user._id;
		}
		await parent.save();
	}

	return user;
}

main().catch(error => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});