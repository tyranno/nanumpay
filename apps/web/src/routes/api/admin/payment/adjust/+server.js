import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import PaymentService from '$lib/server/services/paymentService.js';
import UserPaymentPlan from '$lib/server/models/UserPaymentPlan.js';

/**
 * POST /api/admin/payment/adjust
 * 관리자가 회차별 지급 금액을 수동으로 조정
 */
export async function POST({ request, locals }) {
	try {
		await connectDB();

		// 관리자 권한 확인
		const user = locals.user;
		if (!user || user.type !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
		}

		const data = await request.json();
		const {
			planId,           // UserPaymentPlan ID
			userId,           // 또는 userId와 revenueMonth로 조회
			revenueMonth,     // { year: 2025, month: 1 }
			installmentNumber, // 회차 번호 (1-10)
			fixedAmount,      // 고정 금액
			reason            // 조정 사유
		} = data;

		// 유효성 검사
		if (!installmentNumber || !fixedAmount) {
			return json({
				error: '필수 정보가 누락되었습니다.',
				required: ['installmentNumber', 'fixedAmount', 'planId 또는 (userId + revenueMonth)']
			}, { status: 400 });
		}

		// UserPaymentPlan 찾기
		let plan;
		if (planId) {
			plan = await UserPaymentPlan.findById(planId);
		} else if (userId && revenueMonth) {
			plan = await UserPaymentPlan.findOne({
				userId,
				'revenueMonth.year': revenueMonth.year,
				'revenueMonth.month': revenueMonth.month
			});
		} else {
			return json({
				error: 'planId 또는 (userId + revenueMonth)가 필요합니다.'
			}, { status: 400 });
		}

		if (!plan) {
			return json({
				error: '지급 계획을 찾을 수 없습니다.'
			}, { status: 404 });
		}

		// 금액 조정
		const adjustedInstallment = await PaymentService.adjustInstallmentAmount(
			plan._id.toString(),
			installmentNumber,
			fixedAmount,
			user.loginId,
			reason || '관리자 수동 조정'
		);

		console.log(`[Payment Adjust API] 금액 조정 완료:`, {
			planId: plan._id,
			userId: plan.userId,
			회차: installmentNumber,
			조정금액: fixedAmount,
			관리자: user.loginId
		});

		return json({
			success: true,
			message: `${installmentNumber}회차 금액이 ${fixedAmount.toLocaleString()}원으로 조정되었습니다.`,
			data: {
				planId: plan._id,
				userId: plan.userId,
				userName: plan.userName,
				installment: {
					number: adjustedInstallment.installmentNumber,
					calculatedAmount: adjustedInstallment.calculatedAmount,
					fixedAmount: adjustedInstallment.fixedAmount,
					finalAmount: adjustedInstallment.amount,
					adjustedBy: adjustedInstallment.adjustedBy,
					adjustedAt: adjustedInstallment.adjustedAt,
					reason: adjustedInstallment.adjustmentReason
				}
			}
		});
	} catch (error) {
		console.error('[Payment Adjust API] 오류:', error);
		return json({
			error: error.message || '금액 조정 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}

/**
 * GET /api/admin/payment/adjust
 * 조정된 지급 내역 조회
 */
export async function GET({ url, locals }) {
	try {
		await connectDB();

		// 관리자 권한 확인
		const user = locals.user;
		if (!user || user.type !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
		}

		const userId = url.searchParams.get('userId');
		const year = parseInt(url.searchParams.get('year'));
		const month = parseInt(url.searchParams.get('month'));

		// 조회 조건 구성
		const query = {};
		if (userId) query.userId = userId;
		if (year && month) {
			query['revenueMonth.year'] = year;
			query['revenueMonth.month'] = month;
		}

		// 조정된 회차가 있는 계획만 조회
		const plans = await UserPaymentPlan.find({
			...query,
			'installments.fixedAmount': { $exists: true, $ne: null }
		}).lean();

		// 조정된 회차 정보만 추출
		const adjustedPayments = [];
		for (const plan of plans) {
			for (const installment of plan.installments) {
				if (installment.fixedAmount) {
					adjustedPayments.push({
						planId: plan._id,
						userId: plan.userId,
						userName: plan.userName,
						revenueMonth: plan.revenueMonth,
						installmentNumber: installment.installmentNumber,
						scheduledDate: installment.scheduledDate,
						originalAmount: installment.calculatedAmount || plan.amountPerInstallment,
						adjustedAmount: installment.fixedAmount,
						difference: installment.fixedAmount - (installment.calculatedAmount || plan.amountPerInstallment),
						adjustedBy: installment.adjustedBy,
						adjustedAt: installment.adjustedAt,
						reason: installment.adjustmentReason
					});
				}
			}
		}

		// 조정 날짜 기준 정렬
		adjustedPayments.sort((a, b) => {
			const dateA = a.adjustedAt ? new Date(a.adjustedAt) : new Date(0);
			const dateB = b.adjustedAt ? new Date(b.adjustedAt) : new Date(0);
			return dateB - dateA;
		});

		return json({
			success: true,
			data: {
				total: adjustedPayments.length,
				adjustments: adjustedPayments
			}
		});
	} catch (error) {
		console.error('[Payment Adjust GET] 오류:', error);
		return json({
			error: '조정 내역 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}

/**
 * DELETE /api/admin/payment/adjust
 * 수동 조정 취소 (원래 계산값으로 복원)
 */
export async function DELETE({ request, locals }) {
	try {
		await connectDB();

		// 관리자 권한 확인
		const user = locals.user;
		if (!user || user.type !== 'admin') {
			return json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
		}

		const data = await request.json();
		const { planId, installmentNumber } = data;

		if (!planId || !installmentNumber) {
			return json({
				error: '필수 정보가 누락되었습니다.',
				required: ['planId', 'installmentNumber']
			}, { status: 400 });
		}

		// UserPaymentPlan 찾기
		const plan = await UserPaymentPlan.findById(planId);
		if (!plan) {
			return json({
				error: '지급 계획을 찾을 수 없습니다.'
			}, { status: 404 });
		}

		// 회차 찾기
		const installment = plan.installments.find(i => i.installmentNumber === installmentNumber);
		if (!installment) {
			return json({
				error: `${installmentNumber}회차를 찾을 수 없습니다.`
			}, { status: 404 });
		}

		// 고정값 제거하고 계산값으로 복원
		const originalAmount = installment.fixedAmount;
		installment.fixedAmount = undefined;
		installment.amount = installment.calculatedAmount || plan.amountPerInstallment;
		installment.adjustedBy = undefined;
		installment.adjustedAt = undefined;
		installment.adjustmentReason = undefined;

		await plan.save();

		console.log(`[Payment Adjust DELETE] 조정 취소:`, {
			planId,
			회차: installmentNumber,
			원래금액: originalAmount,
			복원금액: installment.amount,
			취소자: user.loginId
		});

		return json({
			success: true,
			message: `${installmentNumber}회차 금액 조정이 취소되었습니다.`,
			data: {
				planId: plan._id,
				installmentNumber,
				restoredAmount: installment.amount
			}
		});
	} catch (error) {
		console.error('[Payment Adjust DELETE] 오류:', error);
		return json({
			error: '조정 취소 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}