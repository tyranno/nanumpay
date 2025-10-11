import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

/**
 * v5.0: 회차별 지급 금액 조정
 * (이전 v2 UserPaymentPlan 대체)
 *
 * POST /api/admin/payment/adjust
 * 관리자가 특정 분할금의 지급 금액을 수동으로 조정
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
		const { planId, installmentNumber, newAmount, reason } = data;

		if (!planId || installmentNumber === undefined || !newAmount) {
			return json({
				success: false,
				error: '계획 ID, 분할금 번호, 새 금액이 필요합니다.'
			}, { status: 400 });
		}

		// v5.0: WeeklyPaymentPlan에서 해당 분할금 찾기
		const plan = await WeeklyPaymentPlans.findById(planId);

		if (!plan) {
			return json({
				success: false,
				error: '지급 계획을 찾을 수 없습니다.'
			}, { status: 404 });
		}

		// 해당 분할금 찾기
		const installment = plan.installments.find(
			inst => inst.installmentNumber === installmentNumber
		);

		if (!installment) {
			return json({
				success: false,
				error: '분할금을 찾을 수 없습니다.'
			}, { status: 404 });
		}

		// 이미 지급 완료된 경우 수정 불가
		if (installment.status === 'completed') {
			return json({
				success: false,
				error: '이미 지급 완료된 분할금은 수정할 수 없습니다.'
			}, { status: 400 });
		}

		// 금액 조정
		const oldAmount = installment.amount;
		installment.amount = newAmount;

		// 조정 이력 기록
		if (!plan.adjustmentHistory) {
			plan.adjustmentHistory = [];
		}

		plan.adjustmentHistory.push({
			installmentNumber,
			oldAmount,
			newAmount,
			adjustedBy: user.name || user.loginId,
			adjustedAt: new Date(),
			reason: reason || '관리자 수동 조정'
		});

		// 총액 재계산
		plan.totalAmount = plan.installments.reduce((sum, inst) => sum + inst.amount, 0);

		await plan.save();

		console.log(`[API] 지급 금액 조정 완료:`, {
			planId,
			installmentNumber,
			oldAmount,
			newAmount,
			adjustedBy: user.name
		});

		return json({
			success: true,
			message: '지급 금액이 조정되었습니다.',
			oldAmount,
			newAmount,
			totalAmount: plan.totalAmount
		});
	} catch (error) {
		console.error('[API] 지급 금액 조정 오류:', error);
		return json({
			success: false,
			error: '지급 금액 조정 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}
