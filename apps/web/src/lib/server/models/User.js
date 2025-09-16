import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
	name: {
		type: String,
		required: true
	},
	loginId: {
		type: String,
		required: true,
		unique: true,
		lowercase: true
	},
	passwordHash: {
		type: String,
		required: true
	},
	email: {
		type: String,
		sparse: true
	},
	phone: {
		type: String,
		sparse: true
	},
	parentId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		default: null
	},
	position: {
		type: String,
		enum: ['L', 'R'],
		default: null
	},
	level: {
		type: Number,
		default: 1
	},
	balance: {
		type: Number,
		default: 0
	},
	totalEarnings: {
		type: Number,
		default: 0
	},
	leftCount: {
		type: Number,
		default: 0
	},
	rightCount: {
		type: Number,
		default: 0
	},
	status: {
		type: String,
		enum: ['active', 'inactive', 'suspended'],
		default: 'active'
	},
	joinedAt: {
		type: Date,
		default: Date.now
	},
	lastActivity: Date,
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: Date
});

// 복합 인덱스 최적화
userSchema.index({ loginId: 1 });
userSchema.index({ parentId: 1, position: 1 });
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ createdAt: -1 });

// 가상 필드 - 자식 노드 수를 미리 계산
userSchema.virtual('childrenCount').get(function() {
	return this.leftCount + this.rightCount;
});

// 트리 구조 업데이트 메서드
userSchema.methods.updateTreeCounts = async function() {
	const leftChild = await this.constructor.findOne({ parentId: this._id, position: 'L' });
	const rightChild = await this.constructor.findOne({ parentId: this._id, position: 'R' });

	this.leftCount = leftChild ? await countDescendants(leftChild._id) : 0;
	this.rightCount = rightChild ? await countDescendants(rightChild._id) : 0;

	await this.save();
};

async function countDescendants(userId) {
	const User = mongoose.model('User');
	const descendants = await User.countDocuments({
		$or: [
			{ parentId: userId },
			// 재귀적 카운트는 별도 처리 필요
		]
	});
	return descendants;
}

export const User = mongoose.models.User || mongoose.model('User', userSchema);