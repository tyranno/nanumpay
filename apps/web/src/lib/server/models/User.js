import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
	// v8.0: UserAccount 연결 (FK)
	userAccountId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'UserAccount',
		required: true,
		index: true
	},
	// v8.0: 등록 순번 (1, 2, 3...)
	registrationNumber: {
		type: Number,
		required: true,
		default: 1
	},
	name: {
		type: String,
		required: true
	},
	// 계층 구조 필드 - ObjectId를 사용하여 참조
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
	leftChildId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		default: null
	},
	rightChildId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		default: null
	},
	// v8.0: PlannerAccount 연결 (FK, 필수)
	plannerAccountId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'PlannerAccount',
		required: true,
		index: true
	},
	// 용역 관련 정보 (개인정보는 UserAccount에 저장)
	salesperson: String, // 판매인
	salespersonPhone: String, // 판매인 연락처
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
	gradePaymentCount: {
		type: Number,
		default: 0
	},
	lastGradeChangeDate: {
		type: Date,
		default: Date.now
	},
	// ⭐ v8.0: 등급 변동 히스토리 (등록일, 승급일 기록)
	gradeHistory: [{
		date: { type: Date, required: true },           // 변동일 (등록일 또는 승급일)
		fromGrade: { type: String, default: null },     // 이전 등급 (등록 시 null)
		toGrade: { type: String, required: true },      // 변동 후 등급
		type: { 
			type: String, 
			enum: ['registration', 'promotion'],
			required: true 
		},
		revenueMonth: { type: String, required: true }  // 매출월 (YYYY-MM)
	}],
	consecutiveGradeWeeks: {
		type: Number,
		default: 0
	},
	// 보험 관련 (F3+ 필수)
	insuranceActive: {
		type: Boolean,
		default: false
	},
	insuranceAmount: {
		type: Number,
		default: 0
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
// v8.0: FK 인덱스
userSchema.index({ userAccountId: 1, registrationNumber: 1 });
userSchema.index({ plannerAccountId: 1 });

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

// ⭐ Cascade 삭제: 사용자 삭제 시 자동으로 관련 데이터 정리
userSchema.pre('findOneAndDelete', async function(next) {
	try {
		const docToDelete = await this.model.findOne(this.getQuery());
		if (!docToDelete) return next();

		console.log(`🗑️ Cascade 삭제 시작: ${docToDelete.name} (${docToDelete._id})`);

		// 1. 부모의 자식 참조 제거
		if (docToDelete.parentId) {
			await this.model.updateOne(
				{ _id: docToDelete.parentId },
				{
					$unset: docToDelete.position === 'L'
						? { leftChildId: '' }
						: { rightChildId: '' }
				}
			);
			console.log(`  ✅ 부모의 자식 참조 제거 완료`);
		}

		// 2. ObjectId 기반 부모 참조도 제거 (이중 안전장치)
		const updatedParents = await this.model.updateMany(
			{
				$or: [
					{ leftChildId: docToDelete._id },
					{ rightChildId: docToDelete._id }
				]
			},
			{
				$unset: {
					leftChildId: '',
					rightChildId: ''
				}
			}
		);
		if (updatedParents.modifiedCount > 0) {
			console.log(`  ✅ ObjectId 기반 부모 참조 ${updatedParents.modifiedCount}건 제거`);
		}

		// 3. MonthlyRegistrations에서 제거
		const MonthlyRegistrations = mongoose.model('MonthlyRegistrations');
		const updatedRegistrations = await MonthlyRegistrations.updateMany(
			{},
			{
				$pull: {
					registrations: { userId: docToDelete._id },
					'paymentTargets.registrants': { userId: docToDelete._id },
					'paymentTargets.promoted': { userId: docToDelete._id },
					'paymentTargets.additionalPayments': { userId: docToDelete._id }
				}
			}
		);
		console.log(`  ✅ 월별 등록 ${updatedRegistrations.modifiedCount}건 업데이트`);

		console.log(`✅ Cascade 삭제 완료: ${docToDelete.name}`);
		next();
	} catch (error) {
		console.error('❌ Cascade 삭제 실패:', error);
		next(error);
	}
});

// 모델 캐시 강제 삭제 (스키마 변경 시)
if (mongoose.models.User) {
	delete mongoose.models.User;
}

const User = mongoose.model('User', userSchema);
export default User;