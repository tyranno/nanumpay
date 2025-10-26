import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import PlannerCommission from '$lib/server/models/PlannerCommission.js';

/**
 * 관리자용 설계사 수당 지급명부 API
 *
 * GET: 월별 설계사 수당 조회
 */
export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (!locals.user || locals.user.accountType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await connectDB();

		// 파라미터 파싱
		const paymentMonth = url.searchParams.get('paymentMonth'); // YYYY-MM (단일 월 - 지급월 기준)
		const startYear = url.searchParams.get('startYear'); // 기간 시작 년
		const startMonth = url.searchParams.get('startMonth'); // 기간 시작 월
		const endYear = url.searchParams.get('endYear'); // 기간 종료 년
		const endMonth = url.searchParams.get('endMonth'); // 기간 종료 월
		const plannerName = url.searchParams.get('plannerName'); // 설계사 이름 검색
		const page = parseInt(url.searchParams.get('page')) || 1;
		const limit = parseInt(url.searchParams.get('limit')) || 20;

		// 쿼리 조건 생성
		const query = {};

		// 단일 월 검색 (지급월 기준)
		if (paymentMonth) {
			query.paymentMonth = paymentMonth;
		}
		// 기간 검색 (지급월 기준)
		else if (startYear && startMonth && endYear && endMonth) {
			const startMonthKey = `${startYear}-${String(startMonth).padStart(2, '0')}`;
			const endMonthKey = `${endYear}-${String(endMonth).padStart(2, '0')}`;

			query.paymentMonth = {
				$gte: startMonthKey,
				$lte: endMonthKey
			};
		}

		if (plannerName) {
			query.plannerName = { $regex: plannerName, $options: 'i' };
		}

		// 전체 데이터 조회 (그룹화를 위해)
		const allCommissions = await PlannerCommission.find(query)
			.populate('plannerAccountId', 'name phone email')
			.lean();
		
		// 설계사별로 그룹화
		const plannerMap = new Map();
		const monthsSet = new Set();
		
		allCommissions.forEach(commission => {
			const plannerId = commission.plannerAccountId?._id?.toString();
			if (!plannerId) return;
			
			if (!plannerMap.has(plannerId)) {
				plannerMap.set(plannerId, {
					plannerAccountId: commission.plannerAccountId,
					plannerName: commission.plannerName,
					months: {}
				});
			}
			
			const monthKey = commission.paymentMonth;
			monthsSet.add(monthKey);
			
			plannerMap.get(plannerId).months[monthKey] = {
				paymentMonth: commission.paymentMonth,
				revenueMonth: commission.revenueMonth,
				totalCommission: commission.totalCommission,
				totalUsers: commission.totalUsers,
				totalRevenue: commission.totalRevenue
			};
		});
		
		// 월 목록 정렬
		const months = Array.from(monthsSet).sort();
		
		// Map을 배열로 변환
		const groupedData = Array.from(plannerMap.values());
		
		// 페이지네이션 적용
		const totalItems = groupedData.length;
		const totalPages = Math.ceil(totalItems / limit);
		const commissions = groupedData.slice((page - 1) * limit, page * limit);

		// 전체 통계 계산
		const summary = {
			totalPlanners: groupedData.length, // 고유 설계사 수
			totalUsers: 0,
			totalRevenue: 0,
			totalCommission: 0
		};

		// 각 설계사의 모든 월 데이터를 합산
		groupedData.forEach(planner => {
			Object.values(planner.months).forEach(monthData => {
				summary.totalUsers += monthData.totalUsers || 0;
				summary.totalRevenue += monthData.totalRevenue || 0;
				summary.totalCommission += monthData.totalCommission || 0;
			});
		});

		// 월별 총계 계산 (전체 데이터 기준)
		const monthlyTotals = {};
		months.forEach(month => {
			monthlyTotals[month] = {
				totalCommission: 0,
				totalUsers: 0,
				totalRevenue: 0
			};
		});

		groupedData.forEach(planner => {
			months.forEach(month => {
				const monthData = planner.months[month];
				if (monthData) {
					monthlyTotals[month].totalCommission += monthData.totalCommission || 0;
					monthlyTotals[month].totalUsers += monthData.totalUsers || 0;
					monthlyTotals[month].totalRevenue += monthData.totalRevenue || 0;
				}
			});
		});

		return json({
			success: true,
			data: {
				commissions,
				months, // 월 목록 추가
				monthlyTotals, // 월별 총계 추가
				pagination: {
					page,
					limit,
					totalItems,
					totalPages
				},
				summary
			}
		});

	} catch (error) {
		console.error('[관리자 API] Planner commission error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}

/**
 * PUT: 지급 상태 업데이트
 */
export async function PUT({ request, locals }) {
	// 관리자 권한 확인
	if (!locals.user || locals.user.accountType !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await connectDB();

		const { commissionId, paymentStatus } = await request.json();

		if (!commissionId || !paymentStatus) {
			return json({
				success: false,
				error: 'commissionId와 paymentStatus가 필요합니다.'
			}, { status: 400 });
		}

		const commission = await PlannerCommission.findById(commissionId);

		if (!commission) {
			return json({
				success: false,
				error: '수당 정보를 찾을 수 없습니다.'
			}, { status: 404 });
		}

		if (paymentStatus === 'paid') {
			commission.markAsPaid(locals.user.username || locals.user.id);
		} else {
			commission.paymentStatus = paymentStatus;
		}

		await commission.save();

		return json({
			success: true,
			data: commission
		});

	} catch (error) {
		console.error('[관리자 API] Update planner commission error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}
