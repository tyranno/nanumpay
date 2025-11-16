import mongoose from 'mongoose';

/**
 * 설계사 수당 지급 계획 모델
 *
 * 역할:
 * - 용역자별 설계사 수당 개별 지급 관리
 * - 용역자 등록일 + 1개월 후 금요일 지급
 * - WeeklyPaymentPlans와 유사한 구조
 */
const plannerCommissionPlanSchema = new mongoose.Schema(
	{
		// 설계사 정보
		plannerAccountId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'PlannerAccount',
			required: true,
			index: true
		},
		plannerName: {
			type: String,
			required: true
		},

		// 용역자 정보
		userId: {
			type: String,
			required: true,
			index: true
		},
		userName: {
			type: String,
			required: true
		},

		// 등록 정보
		registrationDate: {
			type: Date,
			required: true
		},
		revenueMonth: {
			type: String,
			required: true,
			validate: {
				validator: function (v) {
					return /^\d{4}-\d{2}$/.test(v);
				},
				message: 'revenueMonth는 YYYY-MM 형식이어야 합니다.'
			}
		},

		// 수당 정보
		revenue: {
			type: Number,
			default: 1000000 // 용역자 1명 = 100만원 매출
		},
		commissionAmount: {
			type: Number,
			default: 100000 // 매출의 10%
		},

		// 지급 정보
		paymentDate: {
			type: Date,
			required: true // 등록일 + 1개월 후 금요일
		},
		paymentStatus: {
			type: String,
			enum: ['pending', 'paid', 'cancelled'],
			default: 'pending',
			index: true
		},

		// 지급 처리 정보
		paidAt: {
			type: Date
		},
		paidBy: {
			type: String
		},

		// 취소 정보
		cancelledAt: {
			type: Date
		},
		cancelReason: {
			type: String
		}
	},
	{
		timestamps: true,
		collection: 'plannercommissionplans'
	}
);

// 복합 인덱스
plannerCommissionPlanSchema.index({ plannerAccountId: 1, revenueMonth: 1 });
plannerCommissionPlanSchema.index({ userId: 1, plannerAccountId: 1 });
plannerCommissionPlanSchema.index({ paymentDate: 1, paymentStatus: 1 });

/**
 * 지급 처리
 */
plannerCommissionPlanSchema.methods.markAsPaid = function (paidBy) {
	this.paymentStatus = 'paid';
	this.paidAt = new Date();
	this.paidBy = paidBy;
};

/**
 * 취소 처리
 */
plannerCommissionPlanSchema.methods.markAsCancelled = function (reason) {
	this.paymentStatus = 'cancelled';
	this.cancelledAt = new Date();
	this.cancelReason = reason;
};

/**
 * 지급일 계산 (등록일 + 1개월 후 금요일)
 * WeeklyPaymentPlans의 getPaymentStartDate와 동일한 로직
 */
plannerCommissionPlanSchema.statics.calculatePaymentDate = function (registrationDate) {
	// 1개월 후
	const oneMonthLater = new Date(registrationDate);
	oneMonthLater.setUTCMonth(oneMonthLater.getUTCMonth() + 1);

	// 다음 금요일 찾기
	const dayOfWeek = oneMonthLater.getUTCDay();
	const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
	const nextFriday = new Date(oneMonthLater);
	nextFriday.setUTCDate(nextFriday.getUTCDate() + daysUntilFriday);

	// 시간을 00:00:00으로 설정
	nextFriday.setUTCHours(0, 0, 0, 0);

	return nextFriday;
};

// ⭐ 기존 모델 삭제 후 재생성 (HMR 대응)
if (mongoose.models.PlannerCommissionPlan) {
	delete mongoose.models.PlannerCommissionPlan;
}

const PlannerCommissionPlan = mongoose.model('PlannerCommissionPlan', plannerCommissionPlanSchema);

export default PlannerCommissionPlan;
