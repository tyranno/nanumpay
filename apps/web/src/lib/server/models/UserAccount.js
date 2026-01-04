import mongoose from 'mongoose';

/**
 * UserAccount Model (v8.0)
 * - 로그인 계정 정보 저장
 * - 개인정보 저장 (첫 등록 시 고정)
 * - 한 계정에 여러 User(용역 계약) 가능
 */
const userAccountSchema = new mongoose.Schema({
	loginId: {
		type: String,
		required: true,
		unique: true,
		lowercase: true,
		index: true
	},
	passwordHash: {
		type: String,
		required: true
	},
	// 개인정보 (첫 등록 시 저장, 이후 변경 안 됨)
	name: {
		type: String,
		required: true
	},
	phone: {
		type: String,
		sparse: true
	},
	idNumber: String, // 주민번호
	bank: String, // 은행
	accountNumber: String, // 계좌번호
	email: {
		type: String,
		sparse: true
	},
	// 보험 정보 (F4+ 필수) - ⭐ v8.0 변경
	insuranceAmount: {
		type: Number,
		default: 0,
		comment: '추가 보험 금액 (F4+ 등급 최소 금액 이상 시 지급)'
	},
	// 권한 관리
	canViewSubordinates: {
		type: Boolean,
		default: false,
		comment: '산하정보 보기 권한 (관리자만 설정 가능)'
	},
	// ⭐ 로그인 제한 관리
	loginRestriction: {
		isRestricted: {
			type: Boolean,
			default: false,
			comment: '로그인 제한 여부'
		},
		restrictedAt: {
			type: Date,
			default: null,
			comment: '제한 시작 시점'
		},
		restrictedBy: {
			type: String,
			default: null,
			comment: '제한 설정한 관리자'
		},
		reason: {
			type: String,
			default: null,
			comment: '제한 사유'
		},
		history: [{
			action: {
				type: String,
				enum: ['restrict', 'unrestrict'],
				required: true
			},
			date: {
				type: Date,
				default: Date.now
			},
			by: String,
			reason: String
		}]
	},
	// 상태 관리
	status: {
		type: String,
		enum: ['active', 'inactive'],
		default: 'active'
	},
	createdAt: {
		type: Date,
		default: Date.now
	},
	updatedAt: Date
});

// 인덱스
userAccountSchema.index({ loginId: 1 });
userAccountSchema.index({ status: 1 });

// ⭐ 삭제 방지: 연결된 User가 있으면 삭제 불가
userAccountSchema.pre('findOneAndDelete', async function(next) {
	try {
		const docToDelete = await this.model.findOne(this.getQuery());
		if (!docToDelete) return next();

		// User 모델 동적 로드 (순환 참조 방지)
		const User = mongoose.model('User');
		const hasUsers = await User.exists({ userAccountId: docToDelete._id });

		if (hasUsers) {
			const error = new Error(`연결된 용역자가 있어 계정을 삭제할 수 없습니다 (${docToDelete.loginId})`);
			error.name = 'ValidationError';
			return next(error);
		}

		console.log(`🗑️ UserAccount 삭제: ${docToDelete.loginId}`);
		next();
	} catch (error) {
		console.error('❌ UserAccount 삭제 검증 실패:', error);
		next(error);
	}
});

// 모델 캐시 강제 삭제 (스키마 변경 시)
if (mongoose.models.UserAccount) {
	delete mongoose.models.UserAccount;
}

const UserAccount = mongoose.model('UserAccount', userAccountSchema);
export default UserAccount;
