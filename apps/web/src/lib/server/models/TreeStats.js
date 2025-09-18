import mongoose from 'mongoose';

const treeStatsSchema = new mongoose.Schema({
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true,
		unique: true
	},
	// 등급 정보
	grade: {
		type: String,
		enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'],
		default: 'F1'
	},
	previousGrade: {
		type: String,
		enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'],
		default: null
	},
	gradeChangedAt: Date,

	// 트리 구조 통계
	leftCount: {
		type: Number,
		default: 0
	},
	rightCount: {
		type: Number,
		default: 0
	},
	totalDescendants: {
		type: Number,
		default: 0
	},
	treeDepth: {
		type: Number,
		default: 0
	},

	// 등급별 하위 구성원 수
	gradeComposition: {
		F1: { type: Number, default: 0 },
		F2: { type: Number, default: 0 },
		F3: { type: Number, default: 0 },
		F4: { type: Number, default: 0 },
		F5: { type: Number, default: 0 },
		F6: { type: Number, default: 0 },
		F7: { type: Number, default: 0 },
		F8: { type: Number, default: 0 }
	},

	// 왼쪽/오른쪽 각각의 등급 구성
	leftGradeComposition: {
		F1: { type: Number, default: 0 },
		F2: { type: Number, default: 0 },
		F3: { type: Number, default: 0 },
		F4: { type: Number, default: 0 },
		F5: { type: Number, default: 0 },
		F6: { type: Number, default: 0 },
		F7: { type: Number, default: 0 },
		F8: { type: Number, default: 0 }
	},
	rightGradeComposition: {
		F1: { type: Number, default: 0 },
		F2: { type: Number, default: 0 },
		F3: { type: Number, default: 0 },
		F4: { type: Number, default: 0 },
		F5: { type: Number, default: 0 },
		F6: { type: Number, default: 0 },
		F7: { type: Number, default: 0 },
		F8: { type: Number, default: 0 }
	},

	// 계산 메타데이터
	lastCalculated: {
		type: Date,
		default: Date.now
	},
	calculationVersion: {
		type: Number,
		default: 1
	},
	isDirty: {
		type: Boolean,
		default: false
	},

	// 성능 최적화용 캐시
	cachedAt: Date,
	cacheExpiry: Date,

	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: Date
});

// 인덱스
treeStatsSchema.index({ userId: 1 });
treeStatsSchema.index({ grade: 1 });
treeStatsSchema.index({ isDirty: 1, lastCalculated: 1 });
treeStatsSchema.index({ totalDescendants: -1 });

// 등급 계산 메서드
treeStatsSchema.methods.calculateGrade = async function() {
	const User = mongoose.model('User');
	const TreeStats = mongoose.model('TreeStats');

	const user = await User.findById(this.userId);
	if (!user) return this.grade;

	// 자식 노드 확인
	const leftChild = await User.findOne({ parentId: this.userId, position: 'L' });
	const rightChild = await User.findOne({ parentId: this.userId, position: 'R' });

	// F1: 자식이 없거나 하나인 경우
	if (!leftChild || !rightChild) {
		this.grade = 'F1';
		return 'F1';
	}

	// 기본값 F2
	let newGrade = 'F2';

	// 하위 조직의 등급 구성 확인
	const composition = this.gradeComposition;

	// 등급 승격 조건 확인 - work_plan.txt 기준
	// F3: F2가 2개, 왼쪽 1개 오른쪽 1개
	if (composition['F2'] >= 2) {
		const leftF2 = this.leftGradeComposition['F2'] || 0;
		const rightF2 = this.rightGradeComposition['F2'] || 0;
		if (leftF2 >= 1 && rightF2 >= 1) {
			newGrade = 'F3';
		}
	}

	// F4: F3가 2개, 왼쪽 1개 오른쪽 1개
	if (composition['F3'] >= 2) {
		const leftF3 = this.leftGradeComposition['F3'] || 0;
		const rightF3 = this.rightGradeComposition['F3'] || 0;
		if (leftF3 >= 1 && rightF3 >= 1) {
			newGrade = 'F4';
		}
	}

	// F5: F4가 2개 이상 존재, 그리고 (왼쪽 하위에 2개, 오른쪽 하위에 1개) 또는 (왼쪽 1개, 오른쪽 2개)
	if (composition['F4'] >= 2) {
		const leftF4 = this.leftGradeComposition['F4'] || 0;
		const rightF4 = this.rightGradeComposition['F4'] || 0;
		// 왼쪽에 2개 이상, 오른쪽에 1개 이상 OR 왼쪽에 1개 이상, 오른쪽에 2개 이상
		if ((leftF4 >= 2 && rightF4 >= 1) || (leftF4 >= 1 && rightF4 >= 2)) {
			newGrade = 'F5';
		}
	}

	// F6: F5가 2개 이상 존재, 그리고 (왼쪽 하위에 2개, 오른쪽 하위에 1개) 또는 (왼쪽 1개, 오른쪽 2개)
	if (composition['F5'] >= 2) {
		const leftF5 = this.leftGradeComposition['F5'] || 0;
		const rightF5 = this.rightGradeComposition['F5'] || 0;
		if ((leftF5 >= 2 && rightF5 >= 1) || (leftF5 >= 1 && rightF5 >= 2)) {
			newGrade = 'F6';
		}
	}

	// F7: F6가 2개 이상 존재, 그리고 (왼쪽 하위에 2개, 오른쪽 하위에 1개) 또는 (왼쪽 1개, 오른쪽 2개)
	if (composition['F6'] >= 2) {
		const leftF6 = this.leftGradeComposition['F6'] || 0;
		const rightF6 = this.rightGradeComposition['F6'] || 0;
		if ((leftF6 >= 2 && rightF6 >= 1) || (leftF6 >= 1 && rightF6 >= 2)) {
			newGrade = 'F7';
		}
	}

	// F8: F7가 2개 이상 존재, 그리고 (왼쪽 하위에 2개, 오른쪽 하위에 1개) 또는 (왼쪽 1개, 오른쪽 2개)
	if (composition['F7'] >= 2) {
		const leftF7 = this.leftGradeComposition['F7'] || 0;
		const rightF7 = this.rightGradeComposition['F7'] || 0;
		if ((leftF7 >= 2 && rightF7 >= 1) || (leftF7 >= 1 && rightF7 >= 2)) {
			newGrade = 'F8';
		}
	}

	// 등급 변경 시 기록
	if (this.grade !== newGrade) {
		this.previousGrade = this.grade;
		this.gradeChangedAt = new Date();
	}

	this.grade = newGrade;
	return newGrade;
};

// 하위 조직 통계 업데이트
treeStatsSchema.methods.updateComposition = async function() {
	const User = mongoose.model('User');
	const TreeStats = mongoose.model('TreeStats');

	// 초기화
	const composition = {
		F1: 0, F2: 0, F3: 0, F4: 0,
		F5: 0, F6: 0, F7: 0, F8: 0
	};
	const leftComposition = { ...composition };
	const rightComposition = { ...composition };

	// BFS로 하위 노드 탐색
	const queue = [];
	const leftChild = await User.findOne({ parentId: this.userId, position: 'L' });
	const rightChild = await User.findOne({ parentId: this.userId, position: 'R' });

	if (leftChild) queue.push({ userId: leftChild._id, side: 'L' });
	if (rightChild) queue.push({ userId: rightChild._id, side: 'R' });

	let totalDescendants = 0;
	let maxDepth = 0;

	while (queue.length > 0) {
		const { userId, side, depth = 1 } = queue.shift();
		maxDepth = Math.max(maxDepth, depth);
		totalDescendants++;

		// 해당 사용자의 통계 가져오기
		const stats = await TreeStats.findOne({ userId });
		if (stats) {
			const grade = stats.grade;
			composition[grade]++;

			if (side === 'L') {
				leftComposition[grade]++;
			} else {
				rightComposition[grade]++;
			}
		}

		// 자식 노드 추가
		const children = await User.find({ parentId: userId });
		for (const child of children) {
			queue.push({
				userId: child._id,
				side: side,
				depth: depth + 1
			});
		}
	}

	// 통계 업데이트
	this.gradeComposition = composition;
	this.leftGradeComposition = leftComposition;
	this.rightGradeComposition = rightComposition;
	this.totalDescendants = totalDescendants;
	this.treeDepth = maxDepth;
	this.leftCount = await User.countDocuments({ parentId: this.userId, position: 'L' }) > 0 ?
		Object.values(leftComposition).reduce((a, b) => a + b, 0) : 0;
	this.rightCount = await User.countDocuments({ parentId: this.userId, position: 'R' }) > 0 ?
		Object.values(rightComposition).reduce((a, b) => a + b, 0) : 0;

	this.lastCalculated = new Date();
	this.isDirty = false;
};

// 전체 재계산
treeStatsSchema.methods.recalculate = async function() {
	await this.updateComposition();
	await this.calculateGrade();
	await this.save();
};

// Static 메서드: 사용자의 통계 가져오거나 생성
treeStatsSchema.statics.findOrCreateForUser = async function(userId) {
	let stats = await this.findOne({ userId });
	if (!stats) {
		stats = new this({ userId });
		await stats.save();
	}
	return stats;
};

// Static 메서드: 더티 플래그가 설정된 노드들 재계산
treeStatsSchema.statics.recalculateDirtyNodes = async function(limit = 100) {
	const dirtyNodes = await this.find({ isDirty: true })
		.sort({ lastCalculated: 1 })
		.limit(limit);

	for (const node of dirtyNodes) {
		await node.recalculate();
	}

	return dirtyNodes.length;
};

// 상위 노드들을 더티로 표시
treeStatsSchema.statics.markAncestorsDirty = async function(userId) {
	const User = mongoose.model('User');
	const user = await User.findById(userId);

	if (!user || !user.parentId) return;

	// 현재 노드의 통계를 더티로 표시
	await this.updateOne(
		{ userId: user.parentId },
		{ $set: { isDirty: true } }
	);

	// 재귀적으로 상위 노드 처리
	await this.markAncestorsDirty(user.parentId);
};

export const TreeStats = mongoose.models.TreeStats || mongoose.model('TreeStats', treeStatsSchema);