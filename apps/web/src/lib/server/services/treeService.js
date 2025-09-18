import { User } from '../models/User.js';
import { TreeStats } from '../models/TreeStats.js';

/**
 * Tree Service - MLM 계층 구조 관리 서비스
 * 사용자 추가/수정 시 계층 통계를 비동기로 업데이트
 */
class TreeService {
	/**
	 * 새 사용자 추가 시 처리
	 */
	async onUserAdded(userId) {
		try {
			// 1. 새 사용자의 통계 생성
			const stats = await TreeStats.findOrCreateForUser(userId);
			await stats.recalculate();

			// 2. 부모 노드의 통계 업데이트 필요 표시
			const user = await User.findById(userId);
			if (user && user.parentId) {
				await TreeStats.markAncestorsDirty(userId);
			}

			// 3. 비동기로 상위 노드 재계산 스케줄링
			this.scheduleRecalculation();

			return true;
		} catch (error) {
			console.error('Error in onUserAdded:', error);
			return false;
		}
	}

	/**
	 * 사용자 위치 변경 시 처리
	 */
	async onUserMoved(userId, oldParentId, newParentId) {
		try {
			// 1. 이전 부모의 트리 더티 표시
			if (oldParentId) {
				await TreeStats.markAncestorsDirty(oldParentId);
			}

			// 2. 새 부모의 트리 더티 표시
			if (newParentId) {
				await TreeStats.markAncestorsDirty(newParentId);
			}

			// 3. 현재 사용자 통계 재계산
			const stats = await TreeStats.findOrCreateForUser(userId);
			await stats.recalculate();

			// 4. 비동기 재계산 스케줄링
			this.scheduleRecalculation();

			return true;
		} catch (error) {
			console.error('Error in onUserMoved:', error);
			return false;
		}
	}

	/**
	 * 사용자의 현재 등급 조회
	 */
	async getUserGrade(userId) {
		const stats = await TreeStats.findOne({ userId });
		return stats ? stats.grade : 'F1';
	}

	/**
	 * 사용자의 전체 통계 조회
	 */
	async getUserStats(userId) {
		let stats = await TreeStats.findOne({ userId });

		// 통계가 없거나 오래된 경우 재계산
		if (!stats || this.isStale(stats)) {
			stats = await TreeStats.findOrCreateForUser(userId);
			await stats.recalculate();
		}

		return stats;
	}

	/**
	 * 트리 구조 조회 (계층도용)
	 */
	async getTreeStructure(rootUserId, maxDepth = 5) {
		const buildNode = async (userId, currentDepth = 0) => {
			if (currentDepth >= maxDepth) return null;

			const user = await User.findById(userId).lean();
			if (!user) return null;

			const stats = await TreeStats.findOne({ userId }).lean();

			const node = {
				id: user._id.toString(),
				name: user.name,
				loginId: user.loginId,
				grade: stats?.grade || 'F1',
				phone: user.phone,
				bank: user.bank,
				accountNumber: user.accountNumber,
				level: user.level,
				leftCount: stats?.leftCount || 0,
				rightCount: stats?.rightCount || 0,
				totalDescendants: stats?.totalDescendants || 0,
				children: []
			};

			// 자식 노드 처리
			const leftChild = await User.findOne({ parentId: userId, position: 'L' });
			const rightChild = await User.findOne({ parentId: userId, position: 'R' });

			if (leftChild) {
				const leftNode = await buildNode(leftChild._id, currentDepth + 1);
				if (leftNode) node.children.push(leftNode);
			} else if (currentDepth < maxDepth - 1) {
				node.children.push({
					id: `empty-left-${userId}`,
					name: '빈 자리',
					isEmpty: true,
					position: 'L',
					parentId: userId.toString()
				});
			}

			if (rightChild) {
				const rightNode = await buildNode(rightChild._id, currentDepth + 1);
				if (rightNode) node.children.push(rightNode);
			} else if (currentDepth < maxDepth - 1) {
				node.children.push({
					id: `empty-right-${userId}`,
					name: '빈 자리',
					isEmpty: true,
					position: 'R',
					parentId: userId.toString()
				});
			}

			return node;
		};

		return await buildNode(rootUserId);
	}

	/**
	 * 전체 등급 통계
	 */
	async getGradeStatistics() {
		const stats = await TreeStats.aggregate([
			{
				$group: {
					_id: '$grade',
					count: { $sum: 1 },
					totalDescendants: { $sum: '$totalDescendants' }
				}
			},
			{ $sort: { _id: 1 } }
		]);

		const result = {
			F1: 0, F2: 0, F3: 0, F4: 0,
			F5: 0, F6: 0, F7: 0, F8: 0
		};

		stats.forEach(stat => {
			result[stat._id] = stat.count;
		});

		return result;
	}

	/**
	 * 배치 재계산 실행
	 */
	async runBatchRecalculation(limit = 50) {
		const startTime = Date.now();
		let processed = 0;

		// 더티 노드 처리
		processed = await TreeStats.recalculateDirtyNodes(limit);

		const duration = Date.now() - startTime;
		console.log(`Batch recalculation: ${processed} nodes in ${duration}ms`);

		return { processed, duration };
	}

	/**
	 * 전체 트리 재계산 (관리자 기능)
	 */
	async recalculateEntireTree() {
		console.log('Starting full tree recalculation...');

		// 1. 모든 사용자를 레벨 순으로 정렬 (리프부터)
		const users = await User.find({})
			.sort({ level: -1 })
			.lean();

		let processed = 0;
		for (const user of users) {
			const stats = await TreeStats.findOrCreateForUser(user._id);
			await stats.recalculate();
			processed++;

			if (processed % 100 === 0) {
				console.log(`Processed ${processed}/${users.length} users`);
			}
		}

		console.log(`Full recalculation complete: ${processed} users`);
		return processed;
	}

	/**
	 * 통계가 오래되었는지 확인
	 */
	isStale(stats) {
		if (!stats.lastCalculated) return true;

		// 1시간 이상 지난 경우 재계산 필요
		const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
		return stats.lastCalculated < hourAgo || stats.isDirty;
	}

	/**
	 * 재계산 스케줄링 (실제로는 큐 시스템 사용 권장)
	 */
	scheduleRecalculation() {
		// 5초 후 배치 재계산 실행
		setTimeout(() => {
			this.runBatchRecalculation().catch(console.error);
		}, 5000);
	}

	/**
	 * 사용자 등급 승급 시뮬레이션
	 */
	async simulateGradePromotion(userId) {
		const stats = await TreeStats.findOne({ userId });
		if (!stats) return null;

		const currentGrade = stats.grade;
		const composition = stats.gradeComposition;

		// 다음 등급 요건 계산
		const nextGradeMap = {
			F1: 'F2',
			F2: 'F3',
			F3: 'F4',
			F4: 'F5',
			F5: 'F6',
			F6: 'F7',
			F7: 'F8',
			F8: 'F8'
		};

		const nextGrade = nextGradeMap[currentGrade];
		if (nextGrade === currentGrade) {
			return { currentGrade, nextGrade: null, requirements: null };
		}

		// 필요 조건 계산
		const requirements = this.getGradeRequirements(currentGrade, nextGrade, stats);

		return {
			currentGrade,
			nextGrade,
			requirements,
			currentComposition: composition
		};
	}

	/**
	 * 등급 승급 요건 계산
	 */
	getGradeRequirements(currentGrade, nextGrade, stats) {
		const requirements = [];

		if (currentGrade === 'F1') {
			requirements.push({
				description: '왼쪽과 오른쪽 모두 자식 필요',
				satisfied: stats.leftCount > 0 && stats.rightCount > 0
			});
		} else {
			const requiredGrade = currentGrade;
			const requiredCount = 2;
			const currentCount = stats.gradeComposition[requiredGrade] || 0;

			requirements.push({
				description: `${requiredGrade} 등급 ${requiredCount}명 필요 (현재: ${currentCount}명)`,
				satisfied: currentCount >= requiredCount
			});

			if (nextGrade <= 'F4') {
				requirements.push({
					description: `왼쪽 1명, 오른쪽 1명 분산 필요`,
					satisfied: (stats.leftGradeComposition[requiredGrade] >= 1 &&
							   stats.rightGradeComposition[requiredGrade] >= 1)
				});
			} else {
				requirements.push({
					description: `왼쪽 2명 오른쪽 1명 또는 왼쪽 1명 오른쪽 2명 필요`,
					satisfied: (stats.leftGradeComposition[requiredGrade] >= 2 &&
							   stats.rightGradeComposition[requiredGrade] >= 1) ||
							  (stats.leftGradeComposition[requiredGrade] >= 1 &&
							   stats.rightGradeComposition[requiredGrade] >= 2)
				});
			}
		}

		return requirements;
	}
}

export const treeService = new TreeService();