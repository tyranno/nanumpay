import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import UserAccount from '$lib/server/models/UserAccount.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';

export async function GET({ locals, url }) {
	if (!locals.user || locals.user.type !== 'user') {
		return json({ message: '권한이 없습니다.' }, { status: 401 });
	}

	await db();

	// ⭐ 필터 파라미터 추출
	const startMonth = url.searchParams.get('startMonth');
	const endMonth = url.searchParams.get('endMonth');
	const gradeFilter = url.searchParams.get('grade');

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
	// ⭐ 중요: terminated, canceled 상태 제외!
	const paymentPlans = await WeeklyPaymentPlans.find({
		userId: { $in: allUserIds },
		planStatus: { $nin: ['terminated', 'canceled'] } // ⭐ 승급으로 종료되거나 취소된 계획 제외
	})
		.sort({ createdAt: -1 })
		.lean();

	// 이번주 금요일 계산 (지급일)
	const now = new Date();
	const thisWeekStart = new Date(now);
	thisWeekStart.setDate(now.getDate() - now.getDay()); // 이번 주 일요일
	thisWeekStart.setHours(0, 0, 0, 0);

	const thisWeekEnd = new Date(thisWeekStart);
	thisWeekEnd.setDate(thisWeekStart.getDate() + 6); // 이번 주 토요일
	thisWeekEnd.setHours(23, 59, 59, 999);

	// 이번 주 금요일 날짜 (용역자가 받을 날짜)
	const thisWeekFriday = new Date(thisWeekStart);
	thisWeekFriday.setDate(thisWeekStart.getDate() + 5); // 금요일

	// ⭐ v8.0: 사용자별로 개별 행 생성 (합산하지 않음)
	let paymentRows = [];
	let thisWeekAmount = 0;
	let thisWeekTax = 0;
	let thisWeekNet = 0;
	let totalPaidAmount = 0;  // ⭐ 지금까지 받은 총액
	let totalPaidTax = 0;
	let totalPaidNet = 0;
	let upcomingAmount = 0;   // ⭐ 앞으로 받을 총액
	let upcomingTax = 0;
	let upcomingNet = 0;

	// User 정보 맵 생성 (빠른 조회)
	const userMap = new Map();
	for (const user of allUsers) {
		userMap.set(user._id.toString(), user);
	}

	// ⭐ 주차별로 그룹화하여 등급별 빈도수와 금액 합산
	const weekUserMap = new Map(); // key: "주차번호_사용자명"

	// 주차번호에서 금요일 날짜 계산 (ISO 8601 week date)
	function getFridayFromWeekNumber(weekNumberStr) {
		// weekNumberStr 형식: "2025-W48"
		const [year, week] = weekNumberStr.split('-W').map(Number);

		// ISO 8601: 1월 4일이 포함된 주가 1주차
		const jan4 = new Date(year, 0, 4);
		const jan4Day = jan4.getDay() || 7; // 일요일=7
		const firstMonday = new Date(jan4);
		firstMonday.setDate(jan4.getDate() - jan4Day + 1);

		// 해당 주의 월요일
		const targetMonday = new Date(firstMonday);
		targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);

		// 금요일 = 월요일 + 4일
		const friday = new Date(targetMonday);
		friday.setDate(targetMonday.getDate() + 4);

		return friday;
	}

	for (const plan of paymentPlans) {
		const user = userMap.get(plan.userId);
		if (!user) continue; // 사용자 정보 없으면 스킵

		for (const installment of plan.installments) {
			// ⭐ v8.0: canceled 상태는 제외 (승급으로 중단된 추가지급분)
			if (installment.status === 'canceled') continue;

			const weekNumber = installment.weekNumber; // "2025-W48"

			// 그룹 키: 주차번호_사용자명
			const groupKey = `${weekNumber}_${user.name}`;

			if (!weekUserMap.has(groupKey)) {
				// 해당 주의 금요일 날짜 계산
				const fridayDate = getFridayFromWeekNumber(weekNumber);

				weekUserMap.set(groupKey, {
					weekDate: fridayDate,
					weekNumber: weekNumber,
					userId: plan.userId,
					userName: user.name,
					registrationNumber: user.registrationNumber,
					gradeCount: {}, // 등급별 빈도수
					amount: 0,
					tax: 0,
					netAmount: 0
				});
			}

			const group = weekUserMap.get(groupKey);

			// 등급별 빈도수 증가
			group.gradeCount[plan.baseGrade] = (group.gradeCount[plan.baseGrade] || 0) + 1;
			
			// ⭐ 등급 정보 추가 (필터링용 - 최고 등급 사용)
			if (!group.grade || plan.baseGrade > group.grade) {
				group.grade = plan.baseGrade;
			}

			// 금액 합산
			group.amount += installment.installmentAmount || 0;
			group.tax += installment.withholdingTax || 0;
			group.netAmount += installment.netAmount || 0;

			// 날짜 기준 계산
			const installmentDate = installment.scheduledDate || installment.weekDate;

			// ⭐ 1. 이번주 금요일 받을 금액 (이번주만, 상태 무관)
			if (installmentDate >= thisWeekStart && installmentDate <= thisWeekEnd) {
				thisWeekAmount += installment.installmentAmount || 0;
				thisWeekTax += installment.withholdingTax || 0;
				thisWeekNet += installment.netAmount || 0;
			}

			// ⭐ 2. 누적 수령액 (과거 전체, 상태 무관)
			if (installmentDate < thisWeekStart) {
				totalPaidAmount += installment.installmentAmount || 0;
				totalPaidTax += installment.withholdingTax || 0;
				totalPaidNet += installment.netAmount || 0;
			}

			// ⭐ 3. 남은 예정액 (미래만, 상태 무관)
			if (installmentDate > thisWeekEnd) {
				upcomingAmount += installment.installmentAmount || 0;
				upcomingTax += installment.withholdingTax || 0;
				upcomingNet += installment.netAmount || 0;
			}
		}
	}

	// Map을 배열로 변환
	paymentRows = Array.from(weekUserMap.values());

	// ⭐ 필터 적용
	if (startMonth || endMonth || gradeFilter) {
		paymentRows = paymentRows.filter((payment) => {
			const paymentDate = new Date(payment.weekDate);
			const paymentMonth = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;

			// 시작 월 필터
			if (startMonth && paymentMonth < startMonth) {
				return false;
			}

			// 종료 월 필터
			if (endMonth && paymentMonth > endMonth) {
				return false;
			}

			// 등급 필터 (gradeCount에 해당 등급이 있는지 확인)
			if (gradeFilter && !payment.gradeCount[gradeFilter]) {
				return false;
			}

			return true;
		});
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
				date: thisWeekFriday.toISOString().split('T')[0], // ⭐ 이번 주 금요일 날짜
				amount: thisWeekAmount,
				tax: thisWeekTax,
				net: thisWeekNet
			},
			totalPaid: {  // ⭐ 변경: thisMonth → totalPaid (지금까지 받은 총액)
				amount: totalPaidAmount,
				tax: totalPaidTax,
				net: totalPaidNet
			},
			upcoming: {   // ⭐ 앞으로 받을 총액
				amount: upcomingAmount,
				tax: upcomingTax,
				net: upcomingNet
			}
		},
		payments: paymentHistory
	});
}
