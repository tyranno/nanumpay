import User from '../models/User.js';
import Revenue from '../models/Revenue.js';
import PaymentSchedule from '../models/PaymentSchedule.js';
import PaymentService from './paymentService.js';
import PaymentScheduler from './paymentScheduler.js';
import { connectDB } from '../db.js';

/**
 * 과거 데이터 업로드 시 매출 및 지급 스케줄 재계산
 */
class RevenueRecalculation {
	static REVENUE_PER_MEMBER = 1000000; // 1인당 100만원

	/**
	 * 전체 매출 및 스케줄 재계산
	 * 엑셀로 과거 날짜 데이터를 업로드한 후 실행
	 */
	static async recalculateAllRevenue() {
		await connectDB();

		console.log('[RevenueRecalculation] 전체 매출 재계산 시작');

		try {
			// 1. 모든 월별 신규 회원 수 재계산
			const users = await User.find({ type: 'user' }).sort({ createdAt: 1 });

			if (users.length === 0) {
				console.log('[RevenueRecalculation] 사용자가 없습니다.');
				return { success: false, message: '등록된 사용자가 없습니다.' };
			}

			// 월별로 그룹화
			const monthlyGroups = {};
			for (const user of users) {
				const year = user.createdAt.getFullYear();
				const month = user.createdAt.getMonth() + 1;
				const key = `${year}-${month}`;

				if (!monthlyGroups[key]) {
					monthlyGroups[key] = {
						year,
						month,
						users: [],
						count: 0
					};
				}

				monthlyGroups[key].users.push(user);
				monthlyGroups[key].count++;
			}

			console.log(`[RevenueRecalculation] ${Object.keys(monthlyGroups).length}개월의 데이터 발견`);

			// 2. 각 월별로 매출 생성/업데이트
			const results = {
				totalMonths: Object.keys(monthlyGroups).length,
				updatedRevenue: 0,
				createdSchedules: 0,
				processedPayments: 0,
				errors: []
			};

			for (const [key, group] of Object.entries(monthlyGroups)) {
				const { year, month, count } = group;

				try {
					console.log(`[RevenueRecalculation] ${year}년 ${month}월 처리 중... (${count}명)`);

					// 기존 매출 데이터 확인 또는 생성
					let revenue = await Revenue.findOne({ year, month });

					if (revenue) {
						// 기존 매출 업데이트
						revenue.newMembers = count;
						revenue.totalAmount = count * this.REVENUE_PER_MEMBER;
						console.log(`[RevenueRecalculation] ${year}년 ${month}월 매출 업데이트: ${revenue.totalAmount}원`);
					} else {
						// 새 매출 생성
						revenue = new Revenue({
							year,
							month,
							newMembers: count,
							totalAmount: count * this.REVENUE_PER_MEMBER,
							gradeDistribution: {} // 나중에 계산
						});
						console.log(`[RevenueRecalculation] ${year}년 ${month}월 매출 생성: ${revenue.totalAmount}원`);
					}

					// 등급별 분포 재계산
					const gradeDistribution = {};
					const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

					for (const grade of grades) {
						const gradeUsers = await User.countDocuments({ grade, type: 'user' });
						gradeDistribution[grade] = {
							count: gradeUsers,
							ratio: PaymentService.GRADE_RATIOS[grade],
							totalAmount: revenue.totalAmount * PaymentService.GRADE_RATIOS[grade]
						};
					}

					revenue.gradeDistribution = gradeDistribution;
					await revenue.save();
					results.updatedRevenue++;

					// 3. 10주 분할 지급 스케줄 생성
					const schedules = await PaymentService.createPaymentSchedule(year, month);
					results.createdSchedules += schedules.length;

					console.log(`[RevenueRecalculation] ${year}년 ${month}월: ${schedules.length}개 스케줄 생성`);

				} catch (error) {
					console.error(`[RevenueRecalculation] ${year}년 ${month}월 처리 오류:`, error);
					results.errors.push(`${year}년 ${month}월: ${error.message}`);
				}
			}

			// 4. 놓친 지급 확인 및 처리
			console.log('[RevenueRecalculation] 놓친 지급 확인 중...');
			await PaymentScheduler.checkAndProcessMissedPayments();

			console.log('[RevenueRecalculation] 재계산 완료:', results);
			return {
				success: true,
				results
			};

		} catch (error) {
			console.error('[RevenueRecalculation] 재계산 오류:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * 특정 월의 매출 재계산
	 */
	static async recalculateMonthRevenue(year, month) {
		await connectDB();

		console.log(`[RevenueRecalculation] ${year}년 ${month}월 매출 재계산`);

		try {
			// 해당 월의 신규 회원 수 계산
			const startDate = new Date(year, month - 1, 1);
			const endDate = new Date(year, month, 0, 23, 59, 59);

			const newMembers = await User.countDocuments({
				type: 'user',
				createdAt: {
					$gte: startDate,
					$lte: endDate
				}
			});

			const totalAmount = newMembers * this.REVENUE_PER_MEMBER;

			// 매출 업데이트 또는 생성
			let revenue = await Revenue.findOne({ year, month });

			if (!revenue) {
				revenue = new Revenue({
					year,
					month,
					newMembers,
					totalAmount,
					gradeDistribution: {}
				});
			} else {
				revenue.newMembers = newMembers;
				revenue.totalAmount = totalAmount;
			}

			// 등급별 분포 계산
			const gradeDistribution = {};
			const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

			for (const grade of grades) {
				const count = await User.countDocuments({ grade, type: 'user' });
				gradeDistribution[grade] = {
					count,
					ratio: PaymentService.GRADE_RATIOS[grade],
					totalAmount: totalAmount * PaymentService.GRADE_RATIOS[grade]
				};
			}

			revenue.gradeDistribution = gradeDistribution;
			await revenue.save();

			// 10주 분할 스케줄 재생성
			const schedules = await PaymentService.createPaymentSchedule(year, month);

			console.log(`[RevenueRecalculation] ${year}년 ${month}월 재계산 완료:`, {
				newMembers,
				totalAmount,
				schedules: schedules.length
			});

			return {
				success: true,
				revenue,
				schedules: schedules.length
			};

		} catch (error) {
			console.error(`[RevenueRecalculation] ${year}년 ${month}월 재계산 오류:`, error);
			return {
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * 엑셀 업로드 후 자동 재계산
	 * bulk upload API에서 호출
	 */
	static async processAfterBulkUpload() {
		console.log('[RevenueRecalculation] 엑셀 업로드 후 자동 재계산 시작');

		// 1. 전체 매출 재계산
		const revenueResult = await this.recalculateAllRevenue();

		if (!revenueResult.success) {
			console.error('[RevenueRecalculation] 매출 재계산 실패:', revenueResult.error);
			return revenueResult;
		}

		// 2. 놓친 지급 처리는 이미 recalculateAllRevenue에서 처리됨

		console.log('[RevenueRecalculation] 엑셀 업로드 후 처리 완료');
		return revenueResult;
	}
}

export default RevenueRecalculation;