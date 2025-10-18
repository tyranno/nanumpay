import cron from 'node-cron';
import { processWeeklyPayments } from './weeklyPaymentService.js';
import { connectDB } from '../db.js';
import { excelLogger as logger } from '../logger.js';

/**
 * 금요일 자동 지급 스케줄러 v5.0
 * weeklyPaymentService로 위임
 */
class PaymentScheduler {
	/**
	 * 스케줄러 시작
	 */
	static async start() {
		logger.info('[PaymentScheduler] 금요일 자동 지급 스케줄러 시작');

		// Cron 스케줄만 등록 (즉시 실행하지 않음)

		// 매주 금요일 00:00에 실행 (설계 문서 v5.0 기준)
		cron.schedule('0 0 * * 5', async () => {
			logger.info('[PaymentScheduler] 금요일 자동 지급 시작:', new Date().toISOString());
			try {
				await this.processFridayPayments();
			} catch (error) {
				logger.error('[PaymentScheduler] 금요일 지급 처리 오류:', error);
			}
		}, {
			scheduled: true,
			timezone: "Asia/Seoul"
		});

		// 매일 자정에 놓친 지급 확인 (백업 메커니즘)
		cron.schedule('0 0 * * *', async () => {
			logger.info('[PaymentScheduler] 일일 놓친 지급 확인:', new Date().toISOString());
			try {
				await this.checkAndProcessMissedPayments();
			} catch (error) {
				logger.error('[PaymentScheduler] 놓친 지급 확인 오류:', error);
			}
		}, {
			scheduled: true,
			timezone: "Asia/Seoul"
		});
	}

	/**
	 * 금요일 지급 처리 (v5.0)
	 */
	static async processFridayPayments() {
		await connectDB();
		await processWeeklyPayments(new Date());
	}

	/**
	 * 놓친 지급 확인 및 처리 (v5.0)
	 */
	static async checkAndProcessMissedPayments() {
		await connectDB();

		logger.info('[PaymentScheduler] 놓친 지급 확인 시작');

		try {
			const WeeklyPaymentPlans = (await import('../models/WeeklyPaymentPlans.js')).default;

			// pending 상태의 과거 분할금 찾기
			const now = new Date();
			const missedInstallments = await WeeklyPaymentPlans.aggregate([
				{
					$match: {
						planStatus: 'active',
						'installments.status': 'pending',
						'installments.scheduledDate': { $lt: now }
					}
				},
				{
					$unwind: '$installments'
				},
				{
					$match: {
						'installments.status': 'pending',
						'installments.scheduledDate': { $lt: now }
					}
				},
				{
					$group: {
						_id: {
							year: { $year: '$installments.scheduledDate' },
							month: { $month: '$installments.scheduledDate' },
							week: '$installments.week'
						},
						installments: { $push: '$installments' }
					}
				},
				{
					$sort: {
						'_id.year': 1,
						'_id.month': 1,
						'_id.week': 1
					}
				}
			]);

			if (missedInstallments.length === 0) {
				logger.info('[PaymentScheduler] 놓친 지급이 없습니다.');
				return;
			}

			console.log(`[PaymentScheduler] ${missedInstallments.length}개의 놓친 지급 발견`);

			// 각 주차별로 처리
			for (const group of missedInstallments) {
				const { year, month, week } = group._id;
				const installments = group.installments;

				console.log(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 놓친 지급 처리 중...`);

				try {
					// 해당 주차의 첫 번째 분할금 날짜 사용
					const targetDate = new Date(installments[0].scheduledDate);
					await processWeeklyPayments(targetDate);

					console.log(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 지급 완료`);
				} catch (error) {
					console.error(`[PaymentScheduler] ${year}년 ${month}월 ${week}주차 처리 실패:`, error);
				}
			}

			logger.info('[PaymentScheduler] 놓친 지급 처리 완료');
		} catch (error) {
			logger.error('[PaymentScheduler] 놓친 지급 확인 중 오류:', error);
		}
	}

	/**
	 * 수동 지급 실행 (테스트용)
	 */
	static async executeManualPayment() {
		logger.info('[PaymentScheduler] 수동 지급 실행');
		await this.processFridayPayments();
	}
}

export default PaymentScheduler;
