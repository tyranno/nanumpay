import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

export async function GET({ locals, url }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	// ⭐ v8.0: JWT에서 primaryUserId 사용 (locals.user.id는 UserAccount._id)
	const primaryUserId = locals.user.primaryUserId || locals.user.id;

	// ⭐ v8.0: primaryUser 정보 조회 + UserAccount populate
	const primaryUser = await User.findById(primaryUserId)
		.populate('userAccountId', 'canViewSubordinates')
		.select('name grade insuranceActive userAccountId registrationNumber')
		.lean();

	if (!primaryUser) {
		return json({ message: '사용자를 찾을 수 없습니다.' }, { status: 404 });
	}

	// ⭐ v8.0: 같은 계정의 모든 User 조회
	const allUsers = await User.find({ userAccountId: primaryUser.userAccountId })
		.select('_id name grade registrationNumber createdAt')
		.sort({ registrationNumber: 1 })
		.lean();

	// ⭐ v8.0: 모든 User의 userId 목록
	const allUserIds = allUsers.map(u => u._id.toString());

	// ⭐ v8.0: 모든 User의 용역비 지급 계획 조회 (최신순)
	const paymentPlans = await WeeklyPaymentPlans.find({ userId: { $in: allUserIds } })
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

	// ⭐ v8.0: 사용자별로 개별 행 생성 (합산하지 않음)
	const paymentRows = [];
	let thisWeekAmount = 0;
	let thisWeekTax = 0;
	let thisWeekNet = 0;
	let thisMonthAmount = 0;
	let thisMonthTax = 0;
	let thisMonthNet = 0;
	let upcomingAmount = 0;
	let upcomingTax = 0;
	let upcomingNet = 0;

	// User 정보 맵 생성 (빠른 조회)
	const userMap = new Map();
	for (const user of allUsers) {
		userMap.set(user._id.toString(), user);
	}

	for (const plan of paymentPlans) {
		const user = userMap.get(plan.userId);
		if (!user) continue; // 사용자 정보 없으면 스킵

		for (const installment of plan.installments) {
			const weekDate = installment.scheduledDate || installment.weekDate;
			const installmentDate = new Date(weekDate);

			// ⭐ v8.0: 각 사용자의 각 지급 건을 개별 행으로 추가
			paymentRows.push({
				weekDate: weekDate,
				weekNumber: installment.weekNumber,
				userId: plan.userId,
				userName: user.name, // ⭐ 사용자 이름 추가
				grade: plan.baseGrade,
				registrationNumber: user.registrationNumber, // ⭐ 등록 차수 추가
				amount: installment.installmentAmount || 0,
				tax: installment.withholdingTax || 0,
				netAmount: installment.netAmount || 0,
				세금: installment.withholdingTax || 0, // 한글 필드 추가
				실수령액: installment.netAmount || 0 // 한글 필드 추가
			});

			// 이번주 금액 계산 (총액/세금/실수령액)
			if (installmentDate >= thisWeekStart && installmentDate <= thisWeekEnd) {
				thisWeekAmount += installment.installmentAmount || 0;
				thisWeekTax += installment.withholdingTax || 0;
				thisWeekNet += installment.netAmount || 0;
			}

			// 이번달 금액 계산 (총액/세금/실수령액)
			if (installmentDate >= thisMonthStart && installmentDate <= thisMonthEnd) {
				thisMonthAmount += installment.installmentAmount || 0;
				thisMonthTax += installment.withholdingTax || 0;
				thisMonthNet += installment.netAmount || 0;
			}

			// 이번주 포함 지급 예정액 (pending만) (총액/세금/실수령액)
			if (installment.status === 'pending' && installmentDate >= thisWeekStart) {
				upcomingAmount += installment.installmentAmount || 0;
				upcomingTax += installment.withholdingTax || 0;
				upcomingNet += installment.netAmount || 0;
			}
		}
	}

	// 날짜순 정렬 (최신순)
	const paymentHistory = paymentRows.sort((a, b) => {
		const dateA = new Date(a.weekDate);
		const dateB = new Date(b.weekDate);
		return dateB - dateA;
	});

	return json({
		success: true,
		user: {
			id: primaryUser._id.toString(),
			name: primaryUser.name,
			grade: primaryUser.grade,
			insuranceActive: primaryUser.insuranceActive,
			registrationNumber: primaryUser.registrationNumber,
			canViewSubordinates: primaryUser.userAccountId?.canViewSubordinates || false // ⭐ v8.0
		},
		allRegistrations: allUsers.map(reg => ({
			id: reg._id.toString(),
			name: reg.name,
			grade: reg.grade,
			registrationNumber: reg.registrationNumber,
			createdAt: reg.createdAt // ⭐ 등록일 추가
		})),
		summary: {
			thisWeek: {
				amount: thisWeekAmount,
				tax: thisWeekTax,
				net: thisWeekNet
			},
			thisMonth: {
				amount: thisMonthAmount,
				tax: thisMonthTax,
				net: thisMonthNet
			},
			upcoming: {
				amount: upcomingAmount,
				tax: upcomingTax,
				net: upcomingNet
			}
		},
		payments: paymentHistory
	});
}
