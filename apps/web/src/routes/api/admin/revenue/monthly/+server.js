/**
 * GET /api/admin/revenue/monthly?monthKey=2025-10
 * 월별 매출 통계 조회 API (v7.1)
 *
 * 쿼리 파라미터:
 * - monthKey (optional): 특정 월 조회. 없으면 전체 월 조회
 */

import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import MonthlyRegistrations from '$lib/server/models/MonthlyRegistrations.js';
import { checkPaymentStatus } from '$lib/server/services/revenueService.js';

export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (!locals.user || locals.user.type !== 'admin') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	try {
		const monthKey = url.searchParams.get('monthKey');

		// 특정 월 조회
		if (monthKey) {
			// monthKey 형식 검증 (YYYY-MM)
			if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
				return json({ error: 'monthKey must be in YYYY-MM format' }, { status: 400 });
			}

			console.log(`\n📊 [GET /api/admin/revenue/monthly] Query: ${monthKey}`);

			// MonthlyRegistrations 조회
			const monthlyReg = await MonthlyRegistrations.findOne({ monthKey });

			if (!monthlyReg) {
				return json({
					monthKey,
					totalRevenue: 0,
					adjustedRevenue: null,
					effectiveRevenue: 0,
					isManualRevenue: false,
					registrationCount: 0,
					paymentTargets: {
						registrants: [],
						promoted: [],
						additionalPayments: []
					},
					gradeDistribution: {
						F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
					},
					gradePayments: {
						F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
					},
					paymentStatus: {
						hasPaid: false,
						paidCount: 0,
						totalCount: 0
					},
					revenueChangeHistory: []
				});
			}

			// 지급 상태 확인
			const paymentStatus = await checkPaymentStatus(monthKey);

			// 응답 데이터 구성
			const response = {
				monthKey: monthlyReg.monthKey,
				totalRevenue: monthlyReg.totalRevenue,
				adjustedRevenue: monthlyReg.adjustedRevenue,
				effectiveRevenue: monthlyReg.getEffectiveRevenue(),
				isManualRevenue: monthlyReg.isManualRevenue || false,
				registrationCount: monthlyReg.registrationCount,
				paymentTargets: monthlyReg.paymentTargets || {
					registrants: [],
					promoted: [],
					additionalPayments: []
				},
				gradeDistribution: monthlyReg.gradeDistribution || {},
				gradePayments: monthlyReg.gradePayments || {},
				paymentStatus,
				revenueChangeHistory: monthlyReg.revenueChangeHistory || [],
				revenueModifiedBy: monthlyReg.revenueModifiedBy,
				revenueModifiedAt: monthlyReg.revenueModifiedAt,
				revenueChangeReason: monthlyReg.revenueChangeReason,
				monthlyTotals: monthlyReg.monthlyTotals || {},
				totalPayment: monthlyReg.totalPayment || 0
			};

			console.log(`✅ [GET /api/admin/revenue/monthly] Found data for ${monthKey}`);

			return json(response);
		}

		// 전체 월 조회 (기존 로직 유지)
		const registrations = await MonthlyRegistrations.find()
			.sort({ monthKey: -1 })
			.lean();

		return json({
			success: true,
			revenues: registrations.map(reg => {
				const [year, month] = reg.monthKey.split('-').map(Number);
				return {
					year,
					month,
					monthKey: reg.monthKey,
					newUsersCount: reg.registrations?.length || 0,
					totalRevenue: reg.totalRevenue || 0,
					adjustedRevenue: reg.adjustedRevenue,
					effectiveRevenue: reg.adjustedRevenue !== null ? reg.adjustedRevenue : reg.totalRevenue,
					isManualRevenue: reg.isManualRevenue || false,
					revenuePerInstallment: ((reg.adjustedRevenue !== null ? reg.adjustedRevenue : reg.totalRevenue) || 0) / 10,
					gradeDistribution: reg.gradeDistribution || {},
					gradePayments: reg.gradePayments || {},
					isCalculated: true,
					calculatedAt: reg.updatedAt || reg.createdAt
				};
			})
		});
	} catch (error) {
		console.error('❌ [GET /api/admin/revenue/monthly] Error:', error);
		return json({
			success: false,
			error: '월별 매출 조회 중 오류가 발생했습니다.'
		}, { status: 500 });
	}
}