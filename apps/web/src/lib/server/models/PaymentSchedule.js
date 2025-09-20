import mongoose from 'mongoose';

const paymentScheduleSchema = new mongoose.Schema({
	revenueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Revenue', required: true },
	revenueYear: { type: Number, required: true },
	revenueMonth: { type: Number, required: true },
	installmentNumber: { type: Number, required: true }, // 1-10
	paymentYear: { type: Number, required: true },
	paymentMonth: { type: Number, required: true },
	paymentWeek: { type: Number, required: true }, // 1-5
	installmentAmount: { type: Number, required: true },
	status: {
		type: String,
		enum: ['pending', 'paid', 'cancelled'],
		default: 'pending'
	},
	paidDate: { type: Date },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
});

// 인덱스
paymentScheduleSchema.index({ revenueId: 1, installmentNumber: 1 }, { unique: true });
paymentScheduleSchema.index({ paymentYear: 1, paymentMonth: 1, paymentWeek: 1 });
paymentScheduleSchema.index({ status: 1 });

// 특정 지급 주차의 모든 분할금 조회를 위한 정적 메소드
paymentScheduleSchema.statics.getWeeklyInstallments = async function(year, month, week) {
	return await this.find({
		paymentYear: year,
		paymentMonth: month,
		paymentWeek: week,
		status: { $in: ['pending', 'paid'] }
	}).populate('revenueId');
};

// 지급 주차 계산 헬퍼 메소드
paymentScheduleSchema.statics.calculatePaymentWeek = function(revenueYear, revenueMonth, installmentNumber) {
	// N월 매출은 N+1월부터 시작
	const startMonth = revenueMonth + 1;
	const startYear = revenueMonth === 12 ? revenueYear + 1 : revenueYear;

	// 주차 계산 (1회차 = 1주차, 2회차 = 2주차, ...)
	// 한 달에 최대 4주로 가정, 5주차부터는 다음 달로
	const weekNumber = ((installmentNumber - 1) % 4) + 1;
	const monthOffset = Math.floor((installmentNumber - 1) / 4);

	let paymentMonth = startMonth + monthOffset;
	let paymentYear = startYear;

	// 12월 넘어가면 연도 증가
	if (paymentMonth > 12) {
		paymentYear += Math.floor((paymentMonth - 1) / 12);
		paymentMonth = ((paymentMonth - 1) % 12) + 1;
	}

	return {
		paymentYear,
		paymentMonth,
		paymentWeek: weekNumber
	};
};

const PaymentSchedule = mongoose.models.PaymentSchedule || mongoose.model('PaymentSchedule', paymentScheduleSchema);

export default PaymentSchedule;