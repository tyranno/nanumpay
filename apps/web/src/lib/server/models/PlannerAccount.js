import mongoose from 'mongoose';

/**
 * PlannerAccount Model (v8.0)
 * - 설계사 계정 정보 저장
 * - 로그인 ID: 설계사 이름
 * - 초기 비밀번호: 전화번호 뒷자리 4자리
 * - Excel 등록 시 자동 생성
 */
const plannerAccountSchema = new mongoose.Schema({
	loginId: {
		type: String,
		required: true,
		unique: true,
		index: true
	},
	passwordHash: {
		type: String,
		required: true
	},
	name: {
		type: String,
		required: true
	},
	phone: {
		type: String,
		required: true
	},
	email: {
		type: String,
		default: ''
	},
	address: {
		type: String,
		default: ''
	},
	workplace: {
		type: String,
		default: ''
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

// 인덱스 (loginId는 스키마 필드에 unique: true, index: true로 정의됨)
plannerAccountSchema.index({ status: 1 });

// 모델 캐시 강제 삭제 (스키마 변경 시)
if (mongoose.models.PlannerAccount) {
	delete mongoose.models.PlannerAccount;
}

const PlannerAccount = mongoose.model('PlannerAccount', plannerAccountSchema);
export default PlannerAccount;
