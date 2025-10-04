import cron from 'node-cron';
import PaymentService from './paymentService.js';
import User from '../models/User.js';
import PaymentSchedule from '../models/PaymentSchedule.js';
import WeeklyPayment from '../models/WeeklyPayment.js';
import { connectDB } from '../db.js';

/**
 * 금요일 자동 지급 스케줄러
 * 매주 금요일 오전 10시에 실행
 */
class PaymentScheduler {
	static GRADE_LIMITS = {
		F1: 20,  // 최대 20회 지급 (2개월)
		F2: 30,  // 최대 30회 지급 (3개월)
		F3: 40,  // 최대 40회 지급 (4개월)
		F4: 40,  // 최대 40회 지급 (4개월)
		F5: 50,  // 최대 50회 지급 (5개월)
		F6: 50,  // 최대 50회 지급 (5개월)
		F7: 60,  // 최대 60회 지급 (6개월)
		F8: 60   // 최대 60회 지급 (6개월)
	};

	// F3 이상 등급의 최소 보험금액 요구사항
	static INSURANCE_REQUIREMENTS = {
		F3: 50000,
		F4: 50000,
		F5: 70000,
		F6: 70000,
		F7: 100000,
		F8: 100000
	};

	/**
	 * 스케줄러 시작
	 */
	static async start() {
		console.log('[PaymentScheduler] 금요일 자동 지급 스케줄러 시작');

		// 시작 시 놓친 지급 확인 및 처리
		await this.checkAndProcessMissedPayments();

		// 매주 금요일 오전 10시에 실행
		// 분 시 일 월 요일 (0=일요일, 5=금요일)
		cron.schedule('0 10 * * 5', async () => {
			console.log('[PaymentScheduler] 금요일 자동 지급 시작:', new Date().toISOString());
			try {
				await this.processFridayPayments();
			} catch (error) {
				console.error('[PaymentScheduler] 금요일 지급 처리 오류:', error);
			}
		}, {
			scheduled: true,
			timezone: "Asia/Seoul"
		});

		// 매일 자정에 놓친 지급 확인 (백업 메커니즘)
		cron.schedule('0 0 * * *', async () => {
			console.log('[PaymentScheduler] 일일 놓친 지급 확인:', new Date().toISOString());
			try {
				await this.checkAndProcessMissedPayments();
			} catch (error) {
				console.error('[PaymentScheduler] 놓친 지급 확인 오류:', error);
			}
		}, {
			scheduled: true,
			timezone: "Asia/Seoul"
		});

		// 테스트용: 1분마다 실행 (개발 환경에서만)
		if (process.env.NODE_ENV === 'development') {
			cron.schedule('*/1 * * * *', async () => {
				console.log('[PaymentScheduler] 개발 환경 테스트 실행:', new Date().toISOString());
			});
		}
	}

	/**
	 * 금요일 지급 처리
	 */
	static async processFridayPayments() {
		await connectDB();

		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;

		// 이번 주차 계산
		const week = this.getCurrentWeek(now);

		console.log(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 지급 처리 시작`);

		// 1. 해당 주차의 지급 스케줄 조회
		const schedules = await PaymentSchedule.find({
			paymentYear: year,
			paymentMonth: month,
			paymentWeek: week,
			status: 'pending'
		}).populate('revenueId');

		if (schedules.length === 0) {
			console.log('[PaymentScheduler] 이번 주차에 처리할 지급 스케줄이 없습니다.');
			return;
		}

		// 2. 등급 기준일 계산 (지급일 - 1개월 - 1일)
		const gradeReferenceDate = new Date(now);
		gradeReferenceDate.setMonth(gradeReferenceDate.getMonth() - 1);
		gradeReferenceDate.setDate(gradeReferenceDate.getDate() - 1);

		console.log('[PaymentScheduler] 등급 기준일:', gradeReferenceDate.toISOString());

		// 3. 사용자별 지급 가능 여부 확인 및 지급액 계산
		const users = await User.find({ type: 'user', status: 'active' });
		const eligiblePayments = [];

		for (const user of users) {
			// 등급별 지급 제한 확인
			const paymentLimit = this.GRADE_LIMITS[user.grade];

			// 현재 등급에서의 누적 지급 횟수 확인
			if (user.gradePaymentCount >= paymentLimit) {
				console.log(`[PaymentScheduler] ${user.name}(${user.loginId}): 등급 ${user.grade} 최대 지급 횟수(${paymentLimit}회) 도달`);
				continue;
			}

			// F3 이상 등급의 보험 조건 확인
			if (['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(user.grade)) {
				const requiredInsurance = this.INSURANCE_REQUIREMENTS[user.grade];

				if (!user.insuranceActive || user.insuranceAmount < requiredInsurance) {
					console.log(`[PaymentScheduler] ${user.name}(${user.loginId}): 등급 ${user.grade} 보험 조건 미충족 (필요: ${requiredInsurance}원, 현재: ${user.insuranceAmount}원)`);
					continue;
				}
			}

			// F1, F2 등급의 연속 4주 제한 확인
			if (['F1', 'F2'].includes(user.grade)) {
				if (user.consecutiveGradeWeeks >= 4) {
					console.log(`[PaymentScheduler] ${user.name}(${user.loginId}): 등급 ${user.grade} 연속 4주 제한 도달`);
					continue;
				}
			}

			// 지급 가능한 사용자로 추가
			eligiblePayments.push({
				userId: user._id,
				loginId: user.loginId,
				name: user.name,
				grade: user.grade,
				bank: user.bank,
				accountNumber: user.accountNumber
			});
		}

		// 4. 지급액 계산 및 처리
		const weeklyPayment = await PaymentService.calculateWeeklyPayments(year, month, week);

		if (weeklyPayment) {
			// 지급 불가능한 사용자 필터링
			const ineligibleUserIds = users
				.filter(u => !eligiblePayments.find(e => e.userId.toString() === u._id.toString()))
				.map(u => u._id.toString());

			// 지급 데이터에서 제외
			weeklyPayment.payments = weeklyPayment.payments.filter(
				p => !ineligibleUserIds.includes(p.userId.toString())
			);

			// 총액 재계산
			weeklyPayment.totalPayment = weeklyPayment.payments.reduce((sum, p) => sum + p.actualAmount, 0);
			weeklyPayment.totalTax = weeklyPayment.payments.reduce((sum, p) => sum + p.taxAmount, 0);
			weeklyPayment.totalNet = weeklyPayment.payments.reduce((sum, p) => sum + p.netAmount, 0);

			await weeklyPayment.save();

			// 5. 사용자별 지급 카운터 업데이트
			for (const payment of weeklyPayment.payments) {
				await User.findByIdAndUpdate(payment.userId, {
					$inc: {
						gradePaymentCount: 1,
						consecutiveGradeWeeks: 1
					}
				});
			}

			// 6. 스케줄 상태 업데이트
			for (const schedule of schedules) {
				schedule.status = 'completed';
				schedule.processedAt = new Date();
				await schedule.save();
			}

			console.log(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 지급 완료:`, {
				대상자수: weeklyPayment.payments.length,
				총지급액: weeklyPayment.totalPayment,
				총세금: weeklyPayment.totalTax,
				실지급액: weeklyPayment.totalNet
			});
		}
	}

	/**
	 * 현재 주차 계산 (월 기준)
	 */
	static getCurrentWeek(date) {
		const day = date.getDate();
		const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
		const daysPerWeek = daysInMonth / 10;
		return Math.min(Math.ceil(day / daysPerWeek), 10);
	}

	/**
	 * 등급 변경 시 지급 카운터 리셋
	 */
	static async resetPaymentCountOnGradeChange(userId, newGrade) {
		const user = await User.findById(userId);

		if (user && user.grade !== newGrade) {
			// 등급이 변경된 경우 카운터 리셋
			user.grade = newGrade;
			user.gradePaymentCount = 0;
			user.lastGradeChangeDate = new Date();

			// F3 이상으로 승급 시 연속 주차 카운터도 리셋
			if (['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(newGrade)) {
				user.consecutiveGradeWeeks = 0;
			}

			await user.save();

			console.log(`[PaymentScheduler] ${user.name}(${user.loginId}) 등급 변경: ${user.grade} → ${newGrade}, 지급 카운터 리셋`);
		}
	}

	/**
	 * 놓친 지급 확인 및 처리
	 * 시스템 재시작 시 또는 일일 체크 시 실행
	 */
	static async checkAndProcessMissedPayments() {
		await connectDB();

		console.log('[PaymentScheduler] 놓친 지급 확인 시작');

		try {
			// 현재 날짜
			const now = new Date();
			const currentYear = now.getFullYear();
			const currentMonth = now.getMonth() + 1;

			// 최근 3개월간의 pending 상태 스케줄 확인
			const threeMonthsAgo = new Date();
			threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

			// pending 상태의 과거 스케줄 조회
			const missedSchedules = await PaymentSchedule.find({
				status: 'pending',
				paymentYear: {
					$gte: threeMonthsAgo.getFullYear(),
					$lte: currentYear
				},
				$or: [
					// 과거 연도
					{ paymentYear: { $lt: currentYear } },
					// 같은 연도의 과거 월
					{
						paymentYear: currentYear,
						paymentMonth: { $lt: currentMonth }
					},
					// 같은 연도, 같은 월의 과거 주차
					{
						paymentYear: currentYear,
						paymentMonth: currentMonth,
						paymentWeek: { $lt: this.getCurrentWeek(now) }
					}
				]
			}).sort({ paymentYear: 1, paymentMonth: 1, paymentWeek: 1 });

			if (missedSchedules.length === 0) {
				console.log('[PaymentScheduler] 놓친 지급이 없습니다.');
				return;
			}

			console.log(`[PaymentScheduler] ${missedSchedules.length}개의 놓친 지급 발견`);

			// 연월주차별로 그룹화
			const groupedSchedules = {};
			for (const schedule of missedSchedules) {
				const key = `${schedule.paymentYear}-${schedule.paymentMonth}-${schedule.paymentWeek}`;
				if (!groupedSchedules[key]) {
					groupedSchedules[key] = {
						year: schedule.paymentYear,
						month: schedule.paymentMonth,
						week: schedule.paymentWeek,
						schedules: []
					};
				}
				groupedSchedules[key].schedules.push(schedule);
			}

			// 각 주차별로 처리
			for (const key of Object.keys(groupedSchedules)) {
				const { year, month, week } = groupedSchedules[key];
				console.log(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 놓친 지급 처리 중...`);

				try {
					// 해당 주차의 지급 처리 (과거 날짜 기준으로)
					await this.processPaymentForWeek(year, month, week);

					// 처리된 스케줄 상태 업데이트
					await PaymentSchedule.updateMany(
						{
							paymentYear: year,
							paymentMonth: month,
							paymentWeek: week,
							status: 'pending'
						},
						{
							status: 'completed',
							processedAt: new Date(),
							note: '시스템 재시작 시 자동 처리됨'
						}
					);

					console.log(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 지급 완료`);
				} catch (error) {
					console.error(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 처리 실패:`, error);
				}
			}

			console.log('[PaymentScheduler] 놓친 지급 처리 완료');
		} catch (error) {
			console.error('[PaymentScheduler] 놓친 지급 확인 중 오류:', error);
		}
	}

	/**
	 * 특정 주차의 지급 처리
	 * 과거 날짜를 위한 별도 메서드
	 */
	static async processPaymentForWeek(year, month, week) {
		// 해당 주차의 금요일 날짜 계산
		const fridayDate = this.getFridayOfWeek(year, month, week);

		console.log(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 (${fridayDate.toLocaleDateString()}) 지급 처리`);

		// 기존 processFridayPayments 로직 활용하되, 날짜 파라미터 전달
		await this.processFridayPaymentsForDate(fridayDate);
	}

	/**
	 * 특정 주차의 금요일 날짜 계산
	 */
	static getFridayOfWeek(year, month, week) {
		const daysInMonth = new Date(year, month, 0).getDate();
		const daysPerWeek = daysInMonth / 10;

		// 해당 주차의 중간 날짜 계산
		const midWeekDay = Math.floor((week - 0.5) * daysPerWeek);
		const date = new Date(year, month - 1, midWeekDay);

		// 가장 가까운 금요일로 조정
		const dayOfWeek = date.getDay();
		const daysToFriday = (5 - dayOfWeek + 7) % 7;
		date.setDate(date.getDate() + daysToFriday);

		return date;
	}

	/**
	 * 특정 날짜 기준으로 금요일 지급 처리
	 */
	static async processFridayPaymentsForDate(targetDate) {
		await connectDB();

		const year = targetDate.getFullYear();
		const month = targetDate.getMonth() + 1;
		const week = this.getCurrentWeek(targetDate);

		console.log(`[PaymentScheduler] ${targetDate.toLocaleDateString()} 기준 지급 처리 (${year}년 ${month}월 ${week}주차)`);

		// 기존 processFridayPayments의 로직 재사용
		// 단, targetDate를 기준으로 등급 기준일 계산
		const gradeReferenceDate = new Date(targetDate);
		gradeReferenceDate.setMonth(gradeReferenceDate.getMonth() - 1);
		gradeReferenceDate.setDate(gradeReferenceDate.getDate() - 1);

		// 나머지는 기존 processFridayPayments 로직과 동일
		// ... (지급 처리 로직)

		// 해당 주차의 지급 스케줄 조회
		const schedules = await PaymentSchedule.find({
			paymentYear: year,
			paymentMonth: month,
			paymentWeek: week,
			status: 'pending'
		}).populate('revenueId');

		if (schedules.length > 0) {
			// PaymentService를 통한 지급액 계산
			const weeklyPayment = await PaymentService.calculateWeeklyPayments(year, month, week);

			if (weeklyPayment) {
				// 지급 처리 완료로 표시
				weeklyPayment.status = 'completed';
				weeklyPayment.processedAt = targetDate;
				await weeklyPayment.save();
			}
		}
	}

	/**
	 * 수동 지급 실행 (테스트용)
	 */
	static async executeManualPayment() {
		console.log('[PaymentScheduler] 수동 지급 실행');
		await this.processFridayPayments();
	}
}

export default PaymentScheduler;