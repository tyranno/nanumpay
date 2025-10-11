import { MonthlyRevenue, WeeklyPayment } from '../models/Payment.js';
import User from '../models/User.js';
import PaymentSchedule from '../models/PaymentSchedule.js';
import Revenue from '../models/Revenue.js';
import UserPaymentPlan from '../models/UserPaymentPlan.js';
import SnapshotService from './snapshotService.js';

class PaymentService {
	static GRADE_RATIOS = {
		F1: 0.24,
		F2: 0.19,
		F3: 0.14,
		F4: 0.09,
		F5: 0.05,
		F6: 0.03,
		F7: 0.02,
		F8: 0.01
	};

	static TAX_RATE = 0.033;
	static PAYMENT_INSTALLMENTS = 10;
	static REVENUE_PER_MEMBER = 1000000; // 1인당 100만원

	/**
	 * 월별 매출 계산 및 저장
	 */
	static async calculateMonthlyRevenue(year, month) {
		// 기존 데이터 확인
		let monthlyRevenue = await MonthlyRevenue.findOne({ year, month });
		if (monthlyRevenue) {
			return monthlyRevenue;
		}

		// 해당 월에 추가된 신규 회원 수 계산
		const startDate = new Date(year, month - 1, 1);
		const endDate = new Date(year, month, 0, 23, 59, 59);

		const newMembers = await User.countDocuments({
			createdAt: {
				$gte: startDate,
				$lte: endDate
			}
		});

		// 총 매출 계산
		const totalRevenue = newMembers * this.REVENUE_PER_MEMBER;

		// 등급별 인원 분포 및 금액 계산
		const gradeDistribution = {};
		const grades = Object.keys(this.GRADE_RATIOS);

		for (const grade of grades) {
			const count = await User.countDocuments({ grade });
			gradeDistribution[grade] = {
				count,
				ratio: this.GRADE_RATIOS[grade],
				totalAmount: totalRevenue * this.GRADE_RATIOS[grade]
			};
		}

		// 저장
		monthlyRevenue = new MonthlyRevenue({
			year,
			month,
			newMembers,
			totalRevenue,
			gradeDistribution
		});

		await monthlyRevenue.save();
		return monthlyRevenue;
	}

	/**
	 * 매출 생성 시 10주 분할 스케줄 생성
	 */
	static async createPaymentSchedule(revenueYear, revenueMonth) {
		// Revenue 데이터 확인 또는 생성
		let revenue = await Revenue.findOne({ year: revenueYear, month: revenueMonth });

		if (!revenue) {
			// 신규 회원 수 계산
			const startDate = new Date(revenueYear, revenueMonth - 1, 1);
			const endDate = new Date(revenueYear, revenueMonth, 0, 23, 59, 59);

			const newMembers = await User.countDocuments({
				createdAt: {
					$gte: startDate,
					$lte: endDate
				}
			});

			const totalRevenue = newMembers * this.REVENUE_PER_MEMBER;

			// 등급별 인원 분포 계산
			const gradeDistribution = {};
			for (const grade of Object.keys(this.GRADE_RATIOS)) {
				const count = await User.countDocuments({ grade });
				gradeDistribution[grade] = {
					count,
					ratio: this.GRADE_RATIOS[grade],
					totalAmount: totalRevenue * this.GRADE_RATIOS[grade]
				};
			}

			revenue = new Revenue({
				year: revenueYear,
				month: revenueMonth,
				totalAmount: totalRevenue,
				newMembers,
				gradeDistribution
			});

			await revenue.save();
		}

		// 10주 분할 스케줄 생성
		const installmentAmount = revenue.totalAmount / this.PAYMENT_INSTALLMENTS;
		const schedules = [];

		for (let i = 1; i <= this.PAYMENT_INSTALLMENTS; i++) {
			const paymentWeek = PaymentSchedule.calculatePaymentWeek(revenueYear, revenueMonth, i);

			schedules.push({
				revenueId: revenue._id,
				revenueYear,
				revenueMonth,
				installmentNumber: i,
				paymentYear: paymentWeek.paymentYear,
				paymentMonth: paymentWeek.paymentMonth,
				paymentWeek: paymentWeek.paymentWeek,
				installmentAmount,
				status: 'pending'
			});
		}

		// 기존 스케줄 삭제 후 새로 생성
		await PaymentSchedule.deleteMany({ revenueId: revenue._id });
		await PaymentSchedule.insertMany(schedules);

		return schedules;
	}

	/**
	 * 특정 주차의 지급액 계산 (여러 매출원의 분할금 합계)
	 */
	static async calculateWeeklyPayments(year, month, week, options = {}) {
		const { validateEligibility = false, gradeReferenceDate = null } = options;

		console.log(`[calculateWeeklyPayments] 시작: ${year}년 ${month}월 ${week}주차`);

		// 기존 지급 데이터 확인
		let weeklyPayment = await WeeklyPayment.findOne({ year, month, week });
		if (weeklyPayment && weeklyPayment.status === 'completed') {
			console.log(`[calculateWeeklyPayments] 이미 완료된 지급 데이터 반환`);
			return weeklyPayment;
		}

		// 해당 주차에 지급될 모든 분할금 조회
		const installments = await PaymentSchedule.getWeeklyInstallments(year, month, week);
		console.log(`[calculateWeeklyPayments] 분할금 조회 결과: ${installments.length}개`);

		if (installments.length === 0) {
			console.log(`[calculateWeeklyPayments] 해당 주차에 지급될 분할금이 없음`);
			return null;
		}

		// 전체 용역자 조회 (Admin 제외)
		const users = await User.find({ type: 'user' }).lean();
		console.log(`[calculateWeeklyPayments] 사용자 조회 결과: ${users.length}명`);

		const payments = [];
		let totalPayment = 0;
		let totalTax = 0;
		let totalNet = 0;

		// 각 분할금에 대해 등급별 배분 계산
		for (const installment of installments) {
			const revenue = installment.revenueId;
			console.log(`[calculateWeeklyPayments] 분할금 처리 중:`, {
				revenueYear: installment.revenueYear,
				revenueMonth: installment.revenueMonth,
				installmentNumber: installment.installmentNumber,
				installmentAmount: installment.installmentAmount,
				hasRevenue: !!revenue,
				hasGradeDistribution: !!(revenue && revenue.gradeDistribution)
			});

			if (!revenue || !revenue.gradeDistribution) {
				console.log(`[calculateWeeklyPayments] Revenue 또는 gradeDistribution이 없음, 건너뜀`);
				continue;
			}

			// 해당 매출의 분할금 중 이번 회차 금액
			const installmentAmount = installment.installmentAmount;

			// 등급별 누적 배분 계산
			const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
			const accumulatedAmounts = {};

			for (let i = 0; i < grades.length; i++) {
				const currentGrade = grades[i];
				const distribution = revenue.gradeDistribution[currentGrade];

				if (!distribution || distribution.count === 0) {
					accumulatedAmounts[currentGrade] = 0;
					continue;
				}

				// 분모 계산
				let divisor = distribution.count;
				if (i < grades.length - 1) {
					const nextGrade = grades[i + 1];
					const nextDist = revenue.gradeDistribution[nextGrade];
					if (nextDist && nextDist.count > 0) {
						divisor += nextDist.count;
					}
				}

				// 이번 회차의 등급별 금액
				const gradeInstallment = (distribution.totalAmount / this.PAYMENT_INSTALLMENTS) / divisor;

				// 누적 금액 계산
				let actualAmount = gradeInstallment;
				if (i > 0) {
					const prevGrade = grades[i - 1];
					actualAmount += accumulatedAmounts[prevGrade];
				}

				accumulatedAmounts[currentGrade] = actualAmount;
			}

			// 사용자별로 금액 누적
			for (const user of users) {
				const userGrade = user.grade;
				if (!accumulatedAmounts[userGrade]) continue;

				const amount = accumulatedAmounts[userGrade];

				// 기존 payment 찾기
				let payment = payments.find(p => p.userId.toString() === user._id.toString());

				if (!payment) {
					payment = {
						userId: user._id,
						userName: user.name,
						bank: user.bank || '',
						accountNumber: user.accountNumber || '',
						grade: userGrade,
						actualAmount: 0,
						taxAmount: 0,
						netAmount: 0,
						installmentDetails: []
					};
					payments.push(payment);
				}

				// 금액 누적
				payment.actualAmount += Math.round(amount);
				payment.installmentDetails.push({
					revenueMonth: `${installment.revenueYear}-${String(installment.revenueMonth).padStart(2, '0')}`,
					installmentNumber: installment.installmentNumber,
					amount: Math.round(amount)
				});
			}
		}

		// 세금 계산
		for (const payment of payments) {
			payment.taxAmount = Math.round(payment.actualAmount * this.TAX_RATE);
			payment.netAmount = payment.actualAmount - payment.taxAmount;

			totalPayment += payment.actualAmount;
			totalTax += payment.taxAmount;
			totalNet += payment.netAmount;
		}

		console.log(`[calculateWeeklyPayments] 최종 결과:`, {
			총지급액: totalPayment,
			총세금: totalTax,
			실지급액: totalNet,
			대상자수: payments.length
		});

		// 지급 정보 저장 또는 업데이트
		if (weeklyPayment) {
			weeklyPayment.payments = payments;
			weeklyPayment.totalPayment = totalPayment;
			weeklyPayment.totalTax = totalTax;
			weeklyPayment.totalNet = totalNet;
			weeklyPayment.paymentDate = new Date();
			console.log(`[calculateWeeklyPayments] 기존 WeeklyPayment 업데이트`);
		} else {
			weeklyPayment = new WeeklyPayment({
				year,
				month,
				week,
				paymentDate: new Date(),
				payments,
				totalPayment,
				totalTax,
				totalNet,
				status: 'pending'
			});
			console.log(`[calculateWeeklyPayments] 새로운 WeeklyPayment 생성`);
		}

		await weeklyPayment.save();
		console.log(`[calculateWeeklyPayments] 저장 완료`);
		return weeklyPayment;
	}

	/**
	 * 특정 기간의 지급 내역 조회
	 */
	static async getPaymentHistory(year, month, startWeek = 1, endWeek = 10) {
		const payments = await WeeklyPayment.find({
			year,
			month,
			week: { $gte: startWeek, $lte: endWeek }
		}).sort({ week: 1 });

		return payments;
	}

	/**
	 * 사용자별 지급 내역 조회
	 */
	static async getUserPayments(userId, year, month) {
		const payments = await WeeklyPayment.find({
			year,
			month,
			'payments.userId': userId
		}).sort({ week: 1 });

		const userPayments = [];
		for (const weeklyPayment of payments) {
			const userPayment = weeklyPayment.payments.find(
				p => p.userId.toString() === userId.toString()
			);
			if (userPayment) {
				userPayments.push({
					week: weeklyPayment.week,
					paymentDate: weeklyPayment.paymentDate,
					...userPayment.toObject()
				});
			}
		}

		return userPayments;
	}

	/**
	 * 지급 상태 업데이트
	 */
	static async updatePaymentStatus(year, month, week, status) {
		const weeklyPayment = await WeeklyPayment.findOneAndUpdate(
			{ year, month, week },
			{ status },
			{ new: true }
		);

		if (!weeklyPayment) {
			throw new Error(`${year}년 ${month}월 ${week}주차 지급 정보를 찾을 수 없습니다.`);
		}

		return weeklyPayment;
	}

	/**
	 * 현재 주차 계산
	 */
	static getCurrentWeek(year, month) {
		const now = new Date();
		const currentYear = now.getFullYear();
		const currentMonth = now.getMonth() + 1;

		// 이전 달이면 10주차 모두 완료
		if (year < currentYear || (year === currentYear && month < currentMonth)) {
			return 10;
		}

		// 미래 달이면 아직 시작 안함
		if (year > currentYear || (year === currentYear && month > currentMonth)) {
			return 0;
		}

		// 현재 달이면 경과 일수로 주차 계산
		const daysInMonth = new Date(year, month, 0).getDate();
		const currentDay = now.getDate();
		const daysPerWeek = daysInMonth / this.PAYMENT_INSTALLMENTS;

		return Math.min(Math.ceil(currentDay / daysPerWeek), this.PAYMENT_INSTALLMENTS);
	}

	/**
	 * v3.0: 등급 참조 날짜 계산 (지급일 -1개월 -1일)
	 */
	static calculateGradeReferenceDate(paymentDate) {
		const refDate = new Date(paymentDate);
		refDate.setMonth(refDate.getMonth() - 1);
		refDate.setDate(refDate.getDate() - 1);
		return refDate;
	}

	/**
	 * v3.0: 동적 지급액 계산 (스냅샷 기반)
	 */
	static async calculateDynamicPaymentAmount(userId, installmentNumber, paymentDate, totalRevenue) {
		try {
			// 1. 등급 참조 날짜 계산
			const gradeReferenceDate = this.calculateGradeReferenceDate(paymentDate);

			// 2. 스냅샷에서 해당 날짜의 사용자 등급 조회
			const gradeAtPayment = await SnapshotService.getUserGradeAtDate(userId, gradeReferenceDate);

			if (!gradeAtPayment) {
				console.log(`[calculateDynamicPayment] 스냅샷에서 등급을 찾을 수 없음. 현재 등급 사용: userId=${userId}`);
				const user = await User.findById(userId);
				return {
					gradeReferenceDate,
					gradeAtPayment: user.grade,
					calculatedAmount: this.calculateGradeAmount(user.grade, totalRevenue / 10)
				};
			}

			// 3. 해당 등급의 지급액 계산 (누적 방식)
			const revenuePerInstallment = totalRevenue / 10;
			const calculatedAmount = this.calculateGradeAmount(gradeAtPayment, revenuePerInstallment);

			return {
				gradeReferenceDate,
				gradeAtPayment,
				calculatedAmount
			};
		} catch (error) {
			console.error('[calculateDynamicPayment] 오류:', error);
			throw error;
		}
	}

	/**
	 * 등급별 누적 지급액 계산
	 */
	static calculateGradeAmount(grade, revenuePerInstallment) {
		const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];
		const gradeIndex = grades.indexOf(grade);

		if (gradeIndex === -1) {
			console.error(`[calculateGradeAmount] 잘못된 등급: ${grade}`);
			return 0;
		}

		// 누적 계산
		let totalAmount = 0;
		for (let i = 0; i <= gradeIndex; i++) {
			const currentGrade = grades[i];
			const ratio = this.GRADE_RATIOS[currentGrade];
			totalAmount += revenuePerInstallment * ratio;
		}

		return Math.floor(totalAmount);
	}

	/**
	 * v3.0: UserPaymentPlan 회차별 금액 업데이트
	 */
	static async updateInstallmentAmounts(paymentPlanId, installmentNumber) {
		const plan = await UserPaymentPlan.findById(paymentPlanId);
		if (!plan) {
			throw new Error('지급 계획을 찾을 수 없습니다.');
		}

		const installment = plan.installments.find(i => i.installmentNumber === installmentNumber);
		if (!installment) {
			throw new Error(`${installmentNumber}회차를 찾을 수 없습니다.`);
		}

		// 지급 날짜 계산
		const paymentDate = new Date(installment.scheduledDate.year, installment.scheduledDate.month - 1, installment.scheduledDate.week * 3);

		// 동적 금액 계산
		const dynamicData = await this.calculateDynamicPaymentAmount(
			plan.userId,
			installmentNumber,
			paymentDate,
			plan.totalRevenue
		);

		// 회차 정보 업데이트
		installment.gradeReferenceDate = dynamicData.gradeReferenceDate;
		installment.gradeAtPayment = dynamicData.gradeAtPayment;
		installment.calculatedAmount = dynamicData.calculatedAmount;

		// 실제 지급액 결정 (고정값 우선)
		installment.amount = installment.fixedAmount || installment.calculatedAmount;

		await plan.save();
		return installment;
	}

	/**
	 * 관리자가 회차별 금액 수동 조정
	 */
	static async adjustInstallmentAmount(paymentPlanId, installmentNumber, fixedAmount, adminId, reason) {
		const plan = await UserPaymentPlan.findById(paymentPlanId);
		if (!plan) {
			throw new Error('지급 계획을 찾을 수 없습니다.');
		}

		const installment = plan.installments.find(i => i.installmentNumber === installmentNumber);
		if (!installment) {
			throw new Error(`${installmentNumber}회차를 찾을 수 없습니다.`);
		}

		// 고정 금액 설정
		installment.fixedAmount = fixedAmount;
		installment.amount = fixedAmount; // 실제 지급액도 업데이트
		installment.adjustedBy = adminId;
		installment.adjustedAt = new Date();
		installment.adjustmentReason = reason;

		await plan.save();

		console.log(`[adjustInstallmentAmount] 금액 조정 완료:`, {
			planId: paymentPlanId,
			회차: installmentNumber,
			기존금액: installment.calculatedAmount,
			조정금액: fixedAmount,
			조정자: adminId,
			사유: reason
		});

		return installment;
	}
}

export default PaymentService;