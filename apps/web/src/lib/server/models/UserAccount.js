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
	// 권한 관리
	canViewSubordinates: {
		type: Boolean,
		default: false,
		comment: '산하정보 보기 권한 (관리자만 설정 가능)'
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

// 모델 캐시 강제 삭제 (스키마 변경 시)
if (mongoose.models.UserAccount) {
	delete mongoose.models.UserAccount;
}

const UserAccount = mongoose.model('UserAccount', userAccountSchema);
export default UserAccount;
