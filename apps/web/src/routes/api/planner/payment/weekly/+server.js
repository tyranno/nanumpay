import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import { getSingleWeekPayments, getSingleWeekPaymentsByGrade, getRangePayments, getRangePaymentsByGrade } from '$lib/server/services/paymentListService.js';

/**
 * 설계사 용역비 지급명부 API
 * 공용 서비스(paymentListService) 사용
 * 자동으로 본인 용역자만 필터링
 */
export async function GET({ url, locals }) {
	// 설계사 권한 확인
	if (!locals.user || locals.user.accountType !== 'planner') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await connectDB();

		const plannerAccountId = locals.user.id; // ⭐ 설계사는 항상 자신의 ID 사용

		// 파라미터 파싱
		const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
		const month = parseInt(url.searchParams.get('month'));
		const week = parseInt(url.searchParams.get('week'));

		// 기간 조회 파라미터
		const startYear = parseInt(url.searchParams.get('startYear'));
		const startMonth = parseInt(url.searchParams.get('startMonth'));
		const endYear = parseInt(url.searchParams.get('endYear'));
		const endMonth = parseInt(url.searchParams.get('endMonth'));

		// 페이지네이션
		const page = parseInt(url.searchParams.get('page')) || 1;
		const fetchAll = url.searchParams.get('fetchAll') === 'true'; // ⭐ 전체 데이터 조회 옵션
		const limit = fetchAll ? 10000 : (parseInt(url.searchParams.get('limit')) || 20); // ⭐ fetchAll이면 큰 숫자
		const search = url.searchParams.get('search') || '';
		const searchCategory = url.searchParams.get('searchCategory') || 'name';

		// === 단일 주차 조회 ===
		if (month && week) {
			console.log(`[설계사 API] 단일 주차 조회: ${year}년 ${month}월 ${week}주차`);
			// ⭐ 등급 검색일 경우 전용 함수 사용
			if (searchCategory === 'grade' && search) {
				const result = await getSingleWeekPaymentsByGrade(year, month, week, page, limit, search, plannerAccountId);
				return json(result);
			}

			const result = await getSingleWeekPayments(year, month, week, page, limit, search, searchCategory, plannerAccountId);
			return json(result);
		}

	// === 기간 조회 ===
		if (startYear && startMonth && endYear && endMonth) {
			// ⭐ 등급 검색일 경우 전용 함수 사용
			if (searchCategory === 'grade' && search) {
				const result = await getRangePaymentsByGrade(startYear, startMonth, endYear, endMonth, page, limit, search, plannerAccountId);
				return json(result);
			}
			
			const result = await getRangePayments(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory, plannerAccountId);
			return json(result);
		}

		// === 기본: 현재 월의 모든 주차 조회 ===
		const currentMonth = month || new Date().getMonth() + 1;

		// ⭐ 등급 검색일 경우 전용 함수 사용
		if (searchCategory === 'grade' && search) {
			const result = await getRangePaymentsByGrade(year, currentMonth, year, currentMonth, page, limit, search, plannerAccountId);
			return json(result);
		}

		const result = await getRangePayments(year, currentMonth, year, currentMonth, page, limit, search, searchCategory, plannerAccountId);
		return json(result);

	} catch (error) {
		console.error('[설계사 API] Weekly payment error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}
