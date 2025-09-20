import mongoose from 'mongoose';

const weeklyPaymentSchema = new mongoose.Schema({
	userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	year: { type: Number, required: true },
	month: { type: Number, required: true },
	week: { type: Number, required: true }, // 1-5

	// 분할금 상세 (여러 매출원으로부터의 분할금들)
	installments: [{
		scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentSchedule' },
		revenueYear: { type: Number },
		revenueMonth: { type: Number },
		installmentNumber: { type: Number }, // 몇 회차인지
		amount: { type: Number }
	}],

	// 금액 집계
	totalAmount: { type: Number, default: 0 }, // 총 지급액
	taxAmount: { type: Number, default: 0 }, // 원천징수액 (3.3%)
	netAmount: { type: Number, default: 0 }, // 실지급액

	// 지급 정보
	paymentDate: { type: Date },
	paymentStatus: {
		type: String,
		enum: ['pending', 'paid', 'cancelled'],
		default: 'pending'
	},

	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
});

// 인덱스
weeklyPaymentSchema.index({ userId: 1, year: 1, month: 1, week: 1 }, { unique: true });
weeklyPaymentSchema.index({ year: 1, month: 1, week: 1 });
weeklyPaymentSchema.index({ paymentStatus: 1 });

// 세금 계산 및 실지급액 계산
weeklyPaymentSchema.pre('save', function(next) {
	// 총액 계산
	this.totalAmount = this.installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
	// 원천징수 3.3%
	this.taxAmount = Math.floor(this.totalAmount * 0.033);
	// 실지급액
	this.netAmount = this.totalAmount - this.taxAmount;
	this.updatedAt = Date.now();
	next();
});

// 특정 주차의 모든 사용자 지급액 조회
weeklyPaymentSchema.statics.getWeeklyPayments = async function(year, month, week) {
	return await this.find({
		year,
		month,
		week,
		paymentStatus: { $in: ['pending', 'paid'] }
	}).populate('userId', 'name bank accountNumber grade');
};

// 월간 집계
weeklyPaymentSchema.statics.getMonthlyPayments = async function(year, month) {
	const payments = await this.find({
		year,
		month,
		paymentStatus: { $in: ['pending', 'paid'] }
	}).populate('userId', 'name bank accountNumber grade');

	// 사용자별로 그룹화
	const userPayments = new Map();

	payments.forEach(payment => {
		const userId = payment.userId._id.toString();
		if (!userPayments.has(userId)) {
			userPayments.set(userId, {
				userId: payment.userId._id,
				userName: payment.userId.name,
				bank: payment.userId.bank,
				accountNumber: payment.userId.accountNumber,
				grade: payment.userId.grade,
				totalAmount: 0,
				taxAmount: 0,
				netAmount: 0,
				weeks: []
			});
		}

		const userPayment = userPayments.get(userId);
		userPayment.totalAmount += payment.totalAmount;
		userPayment.taxAmount += payment.taxAmount;
		userPayment.netAmount += payment.netAmount;
		userPayment.weeks.push({
			week: payment.week,
			amount: payment.totalAmount
		});
	});

	return Array.from(userPayments.values());
};

const WeeklyPayment = mongoose.models.WeeklyPayment || mongoose.model('WeeklyPayment', weeklyPaymentSchema);

export default WeeklyPayment;