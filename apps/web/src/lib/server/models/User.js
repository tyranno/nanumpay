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
	// 계층 구조 필드 - loginId를 사용하여 참조
	parentId: {
		type: String,  // loginId로 참조
		ref: 'User',
		default: null
	},
	position: {
		type: String,
		enum: ['L', 'R'],
		default: null
	},
	leftChildId: {
		type: String,  // loginId로 참조
		ref: 'User',
		default: null
	},
	rightChildId: {
		type: String,  // loginId로 참조
		ref: 'User',
		default: null
	},
	// 개인정보 (엑셀 구조에 맞춤)
	idNumber: String, // 주민번호
	bank: String, // 은행
	accountNumber: String, // 계좌번호
	salesperson: String, // 판매인
	salespersonPhone: String, // 판매인 연락처
	planner: String, // 설계사
	plannerPhone: String, // 설계사 연락처
	insuranceProduct: String, // 보험상품명
	insuranceCompany: String, // 보험회사
	branch: String, // 소속/지사
	// 재무 정보
	balance: {
		type: Number,
		default: 0
	},
	totalEarnings: {
		type: Number,
		default: 0
	},
	monthlyPayment: {
		type: Number,
		default: 0
	},
	paymentSchedule: [{
		amount: Number,
		date: Date,
		installment: Number, // 회차 (1-10)
		status: {
			type: String,
			enum: ['pending', 'paid', 'cancelled'],
			default: 'pending'
		}
	}],
	// 사용자 타입 (용역자만)
	type: {
		type: String,
		enum: ['user'],
		default: 'user'
	},
	// 등급 정보
	grade: {
		type: String,
		enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'],
		default: 'F1'
	},
	// 상태 관리
	level: {
		type: Number,
		default: 1
	},
	status: {
		type: String,
		enum: ['active', 'inactive', 'suspended'],
		default: 'active'
	},
	// 등록 순서 (엑셀 일괄 등록 시 순서 보장)
	sequence: {
		type: Number,
		default: 0
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
userSchema.index({ parentId: 1, position: 1 });
userSchema.index({ status: 1, createdAt: -1 });
userSchema.index({ createdAt: 1 });

// 가상 필드 - 자식 존재 여부
userSchema.virtual('hasLeftChild').get(function() {
	return !!this.leftChildId;
});

userSchema.virtual('hasRightChild').get(function() {
	return !!this.rightChildId;
});

// 트리 구조 헬퍼 메서드
userSchema.methods.getChildren = async function() {
	const User = mongoose.model('User');
	const children = await User.find({ parentId: this._id });
	return {
		left: children.find(c => c.position === 'L'),
		right: children.find(c => c.position === 'R')
	};
};

userSchema.methods.getParent = async function() {
	if (!this.parentId) return null;
	const User = mongoose.model('User');
	return await User.findById(this.parentId);
};

// 빈 자리 찾기 (BFS)
userSchema.methods.findEmptyPosition = async function() {
	const User = mongoose.model('User');
	const queue = [this._id];
	const visited = new Set();

	while (queue.length > 0) {
		const userId = queue.shift();
		if (visited.has(userId.toString())) continue;
		visited.add(userId.toString());

		const user = await User.findById(userId);
		if (!user) continue;

		// 왼쪽 자리 확인
		const leftChild = await User.findOne({ parentId: userId, position: 'L' });
		if (!leftChild) {
			return { parentId: userId, position: 'L' };
		}
		queue.push(leftChild._id);

		// 오른쪽 자리 확인
		const rightChild = await User.findOne({ parentId: userId, position: 'R' });
		if (!rightChild) {
			return { parentId: userId, position: 'R' };
		}
		queue.push(rightChild._id);
	}

	return null;
};

// 모델 캐시 강제 삭제 (스키마 변경 시)
if (mongoose.models.User) {
	delete mongoose.models.User;
}

const User = mongoose.model('User', userSchema);
export default User;