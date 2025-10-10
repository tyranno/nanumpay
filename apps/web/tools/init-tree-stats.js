#!/usr/bin/env node

import mongoose from 'mongoose';
import User from '../src/lib/server/models/User.js';
import { TreeStats } from '../src/lib/server/models/TreeStats.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nanumpay';

async function initTreeStats() {
	try {
		console.log('MongoDB 연결 중...');
		await mongoose.connect(MONGODB_URI);
		console.log('MongoDB 연결 성공!');

		// 1단계: 모든 사용자의 TreeStats 생성 (등급 계산 전)
		const users = await User.find({ type: 'user' }).lean();
		console.log(`\n총 ${users.length}명의 사용자 TreeStats 초기화 시작...\n`);

		console.log('1단계: TreeStats 엔트리 생성...');
		for (const user of users) {
			let stats = await TreeStats.findOne({ userId: user._id });
			if (!stats) {
				stats = new TreeStats({ userId: user._id });
				await stats.save();
				console.log(`  [생성] ${user.name} (${user.loginId})`);
			}
		}

		// 2단계: 리프 노드부터 통계 계산 (레벨 역순)
		const sortedUsers = await User.find({ type: 'user' })
			.sort({ level: -1 });

		console.log('\n2단계: 리프부터 통계 재계산...');
		let processed = 0;
		for (const user of sortedUsers) {
			try {
				const stats = await TreeStats.findOne({ userId: user._id });
				if (!stats) continue;

				// 디버그: 자식 노드 확인
				const leftChild = await User.findOne({ parentId: user._id, position: 'L' });
				const rightChild = await User.findOne({ parentId: user._id, position: 'R' });
				console.log(`  [디버그] ${user.name}: 왼쪽=${leftChild?.name || '없음'}, 오른쪽=${rightChild?.name || '없음'}`);

				// 통계 재계산
				await stats.updateComposition();
				await stats.calculateGrade();
				await stats.save();

				console.log(`  ✓ ${user.name} (${user.loginId}) - 등급: ${stats.grade}, 좌: ${stats.leftCount}, 우: ${stats.rightCount}, 총: ${stats.totalDescendants}`);

				processed++;
			} catch (error) {
				console.error(`  [오류] ${user.name} (${user.loginId}):`, error.message);
			}
		}

		console.log(`\n✅ TreeStats 초기화 완료: ${processed}/${users.length}명 처리됨`);

		// 등급별 통계 출력
		const gradeStats = await TreeStats.aggregate([
			{
				$group: {
					_id: '$grade',
					count: { $sum: 1 }
				}
			},
			{ $sort: { _id: 1 } }
		]);

		console.log('\n📊 등급별 통계:');
		gradeStats.forEach(stat => {
			console.log(`  ${stat._id}: ${stat.count}명`);
		});

	} catch (error) {
		console.error('오류 발생:', error);
		process.exit(1);
	} finally {
		await mongoose.disconnect();
		console.log('\nMongoDB 연결 종료');
		process.exit(0);
	}
}

initTreeStats();
