import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import { getSingleWeekPayments, getSingleWeekPaymentsByGrade, getRangePayments, getRangePaymentsByGrade } from '$lib/server/services/paymentListService.js';

/**
 * 관리자 용역비 지급명부 API
 * 공용 서비스(paymentListService) 사용
 */
export async function GET({ url, locals }) {
	try {
		await connectDB();

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
		const limit = parseInt(url.searchParams.get('limit')) || 20;
		const search = url.searchParams.get('search') || '';
		const searchCategory = url.searchParams.get('searchCategory') || 'name';

		// ⭐ 정렬 옵션: 이름순(true) 또는 등록일순(false)
		const sortByName = url.searchParams.get('sortByName') !== 'false';

		// ⭐ 설계사 필터 (설계사 계정인 경우 자동 적용)
		let plannerAccountId = url.searchParams.get('plannerAccountId');
		if (locals.user?.accountType === 'planner') {
			plannerAccountId = locals.user.id; // 설계사는 자신의 용역자만 조회
		}

		// === 단일 주차 조회 ===
		if (month && week) {
			// ⭐ 등급 검색일 경우 전용 함수 사용
			if (searchCategory === 'grade' && search) {
				const result = await getSingleWeekPaymentsByGrade(year, month, week, page, limit, search, plannerAccountId, sortByName);
				return json(result);
			}

			const result = await getSingleWeekPayments(year, month, week, page, limit, search, searchCategory, plannerAccountId, sortByName);
			return json(result);
		}

		// === 기간 조회 ===
		if (startYear && startMonth && endYear && endMonth) {
			// ⭐ 등급 검색일 경우 전용 함수 사용
			if (searchCategory === 'grade' && search) {
				const result = await getRangePaymentsByGrade(startYear, startMonth, endYear, endMonth, page, limit, search, plannerAccountId, sortByName);
				return json(result);
			}

			const result = await getRangePayments(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory, plannerAccountId, sortByName);
			return json(result);
		}

		// === 기본: 현재 월의 모든 주차 조회 ===
		const currentMonth = month || new Date().getMonth() + 1;

		// ⭐ 등급 검색일 경우 전용 함수 사용
		if (searchCategory === 'grade' && search) {
			const result = await getRangePaymentsByGrade(year, currentMonth, year, currentMonth, page, limit, search, plannerAccountId, sortByName);
			return json(result);
		}

		const result = await getRangePayments(year, currentMonth, year, currentMonth, page, limit, search, searchCategory, plannerAccountId, sortByName);
		return json(result);

	} catch (error) {
		console.error('[관리자 API] Weekly payment error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}
