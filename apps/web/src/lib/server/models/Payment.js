import mongoose from 'mongoose';

const paymentRecordSchema = new mongoose.Schema({
	userId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: true
	},
	userName: String,
	bank: String,
	accountNumber: String,
	grade: {
		type: String,
		enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']
	},
	baseAmount: Number, // 등급별 기본 지급액
	actualAmount: Number, // 실제 지급액
	taxAmount: Number, // 세지원액
	netAmount: Number // 실지급액
});

const monthlyRevenueSchema = new mongoose.Schema({
	year: {
		type: Number,
		required: true
	},
	month: {
		type: Number,
		required: true,
		min: 1,
		max: 12
	},
	newMembers: {
		type: Number,
		default: 0
	},
	totalRevenue: {
		type: Number,
		required: true
	},
	gradeDistribution: {
		F1: { count: Number, ratio: Number, totalAmount: Number },
		F2: { count: Number, ratio: Number, totalAmount: Number },
		F3: { count: Number, ratio: Number, totalAmount: Number },
		F4: { count: Number, ratio: Number, totalAmount: Number },
		F5: { count: Number, ratio: Number, totalAmount: Number },
		F6: { count: Number, ratio: Number, totalAmount: Number },
		F7: { count: Number, ratio: Number, totalAmount: Number },
		F8: { count: Number, ratio: Number, totalAmount: Number }
	},
	createdAt: {
		type: Date,
		default: Date.now
	}
});

const weeklyPaymentSchema = new mongoose.Schema({
	year: Number,
	month: Number,
	week: Number, // 1-10 (10회 분할)
	paymentDate: Date,
	monthlyRevenueId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'MonthlyRevenue'
	},
	payments: [paymentRecordSchema],
	totalPayment: Number,
	totalTax: Number,
	totalNet: Number,
	status: {
		type: String,
		enum: ['pending', 'processing', 'completed'],
		default: 'pending'
	},
	createdAt: {
		type: Date,
		default: Date.now
	}
});

// Indexes
monthlyRevenueSchema.index({ year: 1, month: 1 }, { unique: true });
weeklyPaymentSchema.index({ year: 1, month: 1, week: 1 }, { unique: true });

// Static methods for MonthlyRevenue
monthlyRevenueSchema.statics.calculateRevenue = async function(year, month) {
	const User = mongoose.model('User');

	// 해당 월에 추가된 사용자 수 계산
	const startDate = new Date(year, month - 1, 1);
	const endDate = new Date(year, month, 0);

	const newMembers = await User.countDocuments({
		createdAt: {
			$gte: startDate,
			$lte: endDate
		}
	});

	// 총 매출 계산 (1인당 10만원 * 10배 = 100만원)
	const totalRevenue = newMembers * 1000000;

	// 등급별 인원 분포 계산
	const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
	const ratios = {
		F1: 0.24,
		F2: 0.19,
		F3: 0.14,
		F4: 0.09,
		F5: 0.05,
		F6: 0.03,
		F7: 0.02,
		F8: 0.01
	};

	const gradeDistribution = {};

	for (const grade of grades) {
		const count = await User.countDocuments({ grade });
		gradeDistribution[grade] = {
			count,
			ratio: ratios[grade],
			totalAmount: totalRevenue * ratios[grade]
		};
	}

	return {
		year,
		month,
		newMembers,
		totalRevenue,
		gradeDistribution
	};
};

// Static methods for WeeklyPayment
weeklyPaymentSchema.statics.calculateWeeklyPayment = async function(year, month, week) {
	const User = mongoose.model('User');
	const MonthlyRevenue = mongoose.model('MonthlyRevenue');

	// 해당 월의 매출 정보 가져오기
	const monthlyRevenue = await MonthlyRevenue.findOne({ year, month });
	if (!monthlyRevenue) {
		throw new Error(`No revenue data for ${year}-${month}`);
	}

	const TAX_RATE = 0.033;
	const payments = [];
	let totalPayment = 0;
	let totalTax = 0;
	let totalNet = 0;

	// 등급별 배분 정책 (누적식)
	const gradeLevels = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
	const accumulatedAmounts = {};

	for (let i = 0; i < gradeLevels.length; i++) {
		const currentGrade = gradeLevels[i];
		const distribution = monthlyRevenue.gradeDistribution[currentGrade];

		if (!distribution || distribution.count === 0) {
			accumulatedAmounts[currentGrade] = 0;
			continue;
		}

		// 기본 금액 계산
		let divisor = distribution.count;
		if (i < gradeLevels.length - 1) {
			const nextGrade = gradeLevels[i + 1];
			const nextDist = monthlyRevenue.gradeDistribution[nextGrade];
			if (nextDist) {
				divisor += nextDist.count;
			}
		}

		const baseAmount = distribution.totalAmount / divisor / 10; // 10회 분할

		// 누적 금액 계산
		let actualAmount = baseAmount;
		if (i > 0) {
			const prevGrade = gradeLevels[i - 1];
			actualAmount += accumulatedAmounts[prevGrade];
		}

		accumulatedAmounts[currentGrade] = actualAmount;

		// 해당 등급 사용자들의 지급 정보 생성
		const users = await User.find({ grade: currentGrade });

		for (const user of users) {
			const taxAmount = Math.round(actualAmount * TAX_RATE);
			const netAmount = Math.round(actualAmount * (1 - TAX_RATE));

			payments.push({
				userId: user._id,
				userName: user.name,
				bank: user.bank || '',
				accountNumber: user.accountNumber || '',
				grade: currentGrade,
				baseAmount: Math.round(baseAmount),
				actualAmount: Math.round(actualAmount),
				taxAmount,
				netAmount
			});

			totalPayment += actualAmount;
			totalTax += taxAmount;
			totalNet += netAmount;
		}
	}

	return {
		year,
		month,
		week,
		paymentDate: new Date(),
		monthlyRevenueId: monthlyRevenue._id,
		payments,
		totalPayment: Math.round(totalPayment),
		totalTax: Math.round(totalTax),
		totalNet: Math.round(totalNet)
	};
};

const MonthlyRevenue = mongoose.models.MonthlyRevenue || mongoose.model('MonthlyRevenue', monthlyRevenueSchema);
const WeeklyPayment = mongoose.models.WeeklyPayment || mongoose.model('WeeklyPayment', weeklyPaymentSchema);

export { MonthlyRevenue, WeeklyPayment };