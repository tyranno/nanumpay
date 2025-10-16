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
				// 데이터가 없을 때 기본 구조 반환
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
					revenueChangeHistory: [],
					revenueModifiedBy: null,
					revenueModifiedAt: null,
					revenueChangeReason: null
				});
			}

			// 지급 상태 확인
			const paymentStatus = await checkPaymentStatus(monthKey);

			// 응답 데이터 구성 (웹 컴포넌트가 필요로 하는 모든 필드 포함)
			const response = {
				// 기본 정보
				monthKey: monthlyReg.monthKey,

				// 매출 정보
				totalRevenue: monthlyReg.totalRevenue || 0,
				adjustedRevenue: monthlyReg.adjustedRevenue,
				effectiveRevenue: monthlyReg.getEffectiveRevenue(),
				isManualRevenue: monthlyReg.isManualRevenue || false,

				// 등록자 정보
				registrationCount: monthlyReg.registrationCount || 0,

				// 지급 대상자 (v7.0)
				paymentTargets: {
					registrants: monthlyReg.paymentTargets?.registrants || [],
					promoted: monthlyReg.paymentTargets?.promoted || [],
					additionalPayments: monthlyReg.paymentTargets?.additionalPayments || []
				},

				// 등급별 통계
				gradeDistribution: {
					F1: monthlyReg.gradeDistribution?.F1 || 0,
					F2: monthlyReg.gradeDistribution?.F2 || 0,
					F3: monthlyReg.gradeDistribution?.F3 || 0,
					F4: monthlyReg.gradeDistribution?.F4 || 0,
					F5: monthlyReg.gradeDistribution?.F5 || 0,
					F6: monthlyReg.gradeDistribution?.F6 || 0,
					F7: monthlyReg.gradeDistribution?.F7 || 0,
					F8: monthlyReg.gradeDistribution?.F8 || 0
				},

				// 등급별 1회 지급액
				gradePayments: {
					F1: monthlyReg.gradePayments?.F1 || 0,
					F2: monthlyReg.gradePayments?.F2 || 0,
					F3: monthlyReg.gradePayments?.F3 || 0,
					F4: monthlyReg.gradePayments?.F4 || 0,
					F5: monthlyReg.gradePayments?.F5 || 0,
					F6: monthlyReg.gradePayments?.F6 || 0,
					F7: monthlyReg.gradePayments?.F7 || 0,
					F8: monthlyReg.gradePayments?.F8 || 0
				},

				// 지급 상태
				paymentStatus,

				// 매출 변경 이력
				revenueChangeHistory: monthlyReg.revenueChangeHistory || [],
				revenueModifiedBy: monthlyReg.revenueModifiedBy || null,
				revenueModifiedAt: monthlyReg.revenueModifiedAt || null,
				revenueChangeReason: monthlyReg.revenueChangeReason || null
			};

			console.log(`✅ [GET /api/admin/revenue/monthly] Response:`, {
				monthKey: response.monthKey,
				totalRevenue: response.totalRevenue,
				effectiveRevenue: response.effectiveRevenue,
				registrationCount: response.registrationCount,
				paymentTargetsCount: {
					registrants: response.paymentTargets.registrants.length,
					promoted: response.paymentTargets.promoted.length,
					additionalPayments: response.paymentTargets.additionalPayments.length
				}
			});

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