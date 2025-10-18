import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

export async function GET({ locals, url }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	const userId = locals.user.id;

	// 사용자 정보 조회
	const user = await User.findById(userId)
		.select('name loginId grade insuranceActive')
		.lean();

	if (!user) {
		return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
	}

	// 용역비 지급 계획 조회 (최신순)
	const paymentPlans = await WeeklyPaymentPlans.find({ userId: user.loginId })
		.sort({ createdAt: -1 })
		.lean();

	// 이번주/이번달 계산을 위한 날짜
	const now = new Date();
	const thisWeekStart = new Date(now);
	thisWeekStart.setDate(now.getDate() - now.getDay()); // 이번 주 일요일
	thisWeekStart.setHours(0, 0, 0, 0);

	const thisWeekEnd = new Date(thisWeekStart);
	thisWeekEnd.setDate(thisWeekStart.getDate() + 6); // 이번 주 토요일
	thisWeekEnd.setHours(23, 59, 59, 999);

	const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

	// 주별로 그룹화 및 합산
	const weeklyMap = new Map();
	let thisWeekAmount = 0;
	let thisMonthAmount = 0;
	let upcomingAmount = 0; // 이번주 포함 지급 예정액

	for (const plan of paymentPlans) {
		for (const installment of plan.installments) {
			const weekDate = installment.scheduledDate || installment.weekDate;
			const installmentDate = new Date(weekDate);

			// 날짜만 사용 (시간 제거) - YYYY-MM-DD 형식
			const date = new Date(weekDate);
			const weekKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

			// 주별 그룹 초기화
			if (!weeklyMap.has(weekKey)) {
				weeklyMap.set(weekKey, {
					weekDate: weekDate,
					weekNumber: installment.weekNumber,
					grades: [],
					amount: 0,
					tax: 0,
					netAmount: 0
				});
			}

			const weekData = weeklyMap.get(weekKey);

			// 등급 중복 없이 추가
			if (!weekData.grades.includes(plan.baseGrade)) {
				weekData.grades.push(plan.baseGrade);
			}

			// 금액 합산
			weekData.amount += installment.installmentAmount || 0;
			weekData.tax += installment.withholdingTax || 0;
			weekData.netAmount += installment.netAmount || 0;

			// 이번주 금액 계산
			if (installmentDate >= thisWeekStart && installmentDate <= thisWeekEnd) {
				thisWeekAmount += installment.netAmount || 0;
			}

			// 이번달 금액 계산
			if (installmentDate >= thisMonthStart && installmentDate <= thisMonthEnd) {
				thisMonthAmount += installment.netAmount || 0;
			}

			// 이번주 포함 지급 예정액 (pending만)
			if (installment.status === 'pending' && installmentDate >= thisWeekStart) {
				upcomingAmount += installment.netAmount || 0;
			}
		}
	}

	// Map을 배열로 변환하고 날짜순 정렬 (최신순)
	const paymentHistory = Array.from(weeklyMap.values()).sort((a, b) => {
		const dateA = new Date(a.weekDate);
		const dateB = new Date(b.weekDate);
		return dateB - dateA;
	});

	return json({
		success: true,
		user: {
			name: user.name,
			loginId: user.loginId,
			grade: user.grade,
			insuranceActive: user.insuranceActive
		},
		summary: {
			thisWeekAmount,
			thisMonthAmount,
			upcomingAmount
		},
		payments: paymentHistory
	});
}
