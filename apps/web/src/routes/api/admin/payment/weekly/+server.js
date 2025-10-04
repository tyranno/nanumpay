import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import UserPaymentPlan from '$lib/server/models/UserPaymentPlan.js';
import User from '$lib/server/models/User.js';
import { getAllWeeksInPeriod, getWeeksInMonth } from '$lib/utils/fridayWeekCalculator.js';

/**
 * 용역비 지급명부 API
 * UserPaymentPlan 기반으로 실제 지급 계획 데이터 조회
 */
export async function GET({ url }) {
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

		// === 단일 주차 조회 ===
		if (month && week) {
			return await getSingleWeekPayments(year, month, week, page, limit, search, searchCategory);
		}

		// === 기간 조회 ===
		if (startYear && startMonth && endYear && endMonth) {
			return await getRangePayments(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory);
		}

		// === 기본: 현재 월의 모든 주차 조회 ===
		return await getDefaultPayments(year, month || new Date().getMonth() + 1, page, limit, search, searchCategory);

	} catch (error) {
		console.error('[API] Weekly payment error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
}

/**
 * 단일 주차 지급 데이터 조회
 */
async function getSingleWeekPayments(year, month, week, page, limit, search, searchCategory = 'name') {
	console.log(`[API] 단일 주차 조회: ${year}년 ${month}월 ${week}주차`);

	// 1. 검색 조건에 맞는 사용자 먼저 조회 (페이지네이션)
	const userQuery = buildUserSearchQuery(search, searchCategory);
	const totalUsers = await User.countDocuments(userQuery);
	const totalPages = Math.ceil(totalUsers / limit);
	const skip = (page - 1) * limit;

	const users = await User.find(userQuery)
		.skip(skip)
		.limit(limit)
		.lean();

	// UserPaymentPlan의 userId는 ObjectId 문자열을 저장하고 있음
	const userIds = users.map(u => u._id.toString());
	const userMap = new Map(users.map(u => [u._id.toString(), u]));

	// 2. 해당 사용자들의 지급 계획에서 해당 주차 데이터 추출
	const paymentPlans = await UserPaymentPlan.find({
		userId: { $in: userIds },
		'installments.scheduledDate.year': year,
		'installments.scheduledDate.month': month,
		'installments.scheduledDate.week': week
	}).lean();

	// 3. 사용자별 지급 데이터 구성
	const userPayments = users.map(user => {
		// 해당 사용자의 모든 지급 계획 (ObjectId 문자열로 매칭)
		const userIdStr = user._id.toString();
		const userPlans = paymentPlans.filter(p => p.userId === userIdStr);

		// 해당 주차의 모든 installments 찾기
		let totalAmount = 0;
		let installmentDetails = [];

		userPlans.forEach(plan => {
			const matchingInstallments = plan.installments.filter(inst =>
				inst.scheduledDate.year === year &&
				inst.scheduledDate.month === month &&
				inst.scheduledDate.week === week
			);

			matchingInstallments.forEach(inst => {
				totalAmount += inst.amount || 0;
				installmentDetails.push({
					revenueMonth: `${plan.revenueMonth.year}-${String(plan.revenueMonth.month).padStart(2, '0')}`,
					installmentNumber: inst.installmentNumber,
					amount: inst.amount,
					status: inst.status
				});
			});
		});

		// 세금 계산 (3.3%)
		const taxAmount = Math.round(totalAmount * 0.033);
		const netAmount = totalAmount - taxAmount;

		return {
			userId: user.loginId,
			userName: user.name || 'Unknown',
			planner: user.planner || '',
			bank: user.bank || '',
			accountNumber: user.accountNumber || '',
			grade: user.grade || 'F1',
			actualAmount: totalAmount,
			taxAmount: taxAmount,
			netAmount: netAmount,
			installments: installmentDetails
		};
	});

	// 4. 현재 페이지 합계 계산
	const totalAmount = userPayments.reduce((sum, p) => sum + p.actualAmount, 0);
	const totalTax = userPayments.reduce((sum, p) => sum + p.taxAmount, 0);
	const totalNet = userPayments.reduce((sum, p) => sum + p.netAmount, 0);

	// 5. 전체 검색 결과의 총액 계산 (모든 사용자)
	const allUsers = await User.find(userQuery).lean();
	const allUserIds = allUsers.map(u => u._id.toString());
	const allPaymentPlans = await UserPaymentPlan.find({
		userId: { $in: allUserIds },
		'installments.scheduledDate.year': year,
		'installments.scheduledDate.month': month,
		'installments.scheduledDate.week': week
	}).lean();

	let grandTotalAmount = 0;
	let grandTotalTax = 0;
	let grandTotalNet = 0;

	allPaymentPlans.forEach(plan => {
		const matchingInstallments = plan.installments.filter(inst =>
			inst.scheduledDate.year === year &&
			inst.scheduledDate.month === month &&
			inst.scheduledDate.week === week
		);

		matchingInstallments.forEach(inst => {
			const amount = inst.amount || 0;
			const tax = Math.round(amount * 0.033);
			grandTotalAmount += amount;
			grandTotalTax += tax;
			grandTotalNet += (amount - tax);
		});
	});

	return json({
		success: true,
		data: {
			week: `${year}년 ${month}월 ${week}주차`,
			year: year,
			monthNumber: month,
			weekNumber: week,
			payments: userPayments,
			totalAmount,
			totalTax,
			totalNet,
			grandTotal: {
				totalAmount: grandTotalAmount,
				totalTax: grandTotalTax,
				totalNet: grandTotalNet
			},
			pagination: {
				currentPage: page,
				totalPages,
				totalItems: totalUsers,
				itemsPerPage: limit
			}
		}
	});
}

/**
 * 기간별 지급 데이터 조회
 */
async function getRangePayments(startYear, startMonth, endYear, endMonth, page, limit, search, searchCategory = 'name') {
	console.log(`[API] 기간 조회: ${startYear}-${startMonth} ~ ${endYear}-${endMonth}`);

	// 1. 검색 조건에 맞는 사용자 먼저 조회
	const userQuery = buildUserSearchQuery(search, searchCategory);
	const totalUsers = await User.countDocuments(userQuery);
	const totalPages = Math.ceil(totalUsers / limit);
	const skip = (page - 1) * limit;

	const users = await User.find(userQuery)
		.skip(skip)
		.limit(limit)
		.lean();

	// UserPaymentPlan의 userId는 ObjectId 문자열을 저장하고 있음
	const userIds = users.map(u => u._id.toString());
	const userMap = new Map(users.map(u => [u._id.toString(), u]));

	// 2. 기간 내 모든 주차 계산 (금요일 기준)
	const allWeeks = getAllWeeksInPeriod(startYear, startMonth, endYear, endMonth);
	const weeks = [];

	for (const weekInfo of allWeeks) {
		const currentYear = weekInfo.year;
		const currentMonth = weekInfo.month;
		const weekNum = weekInfo.week;
			// 해당 주차의 지급 계획 조회
			const paymentPlans = await UserPaymentPlan.find({
				userId: { $in: userIds },
				'installments.scheduledDate.year': currentYear,
				'installments.scheduledDate.month': currentMonth,
				'installments.scheduledDate.week': weekNum
			}).lean();

			// 사용자별 데이터 구성
			const userPayments = users.map(user => {
				const userIdStr = user._id.toString();
				const userPlans = paymentPlans.filter(p => p.userId === userIdStr);

				let totalAmount = 0;
				let installmentDetails = [];

				userPlans.forEach(plan => {
					const matchingInstallments = plan.installments.filter(inst =>
						inst.scheduledDate.year === currentYear &&
						inst.scheduledDate.month === currentMonth &&
						inst.scheduledDate.week === weekNum
					);

					matchingInstallments.forEach(inst => {
						totalAmount += inst.amount || 0;
						installmentDetails.push({
							revenueMonth: `${plan.revenueMonth.year}-${String(plan.revenueMonth.month).padStart(2, '0')}`,
							installmentNumber: inst.installmentNumber,
							amount: inst.amount
						});
					});
				});

				const taxAmount = Math.round(totalAmount * 0.033);
				const netAmount = totalAmount - taxAmount;

				return {
					userId: user.loginId,
					userName: user.name || 'Unknown',
					planner: user.planner || '',
					bank: user.bank || '',
					accountNumber: user.accountNumber || '',
					grade: user.grade || 'F1',
					actualAmount: totalAmount,
					taxAmount: taxAmount,
					netAmount: netAmount,
					installments: installmentDetails
				};
			});

			weeks.push({
				week: `${currentYear}년 ${currentMonth}월 ${weekNum}주차`,
				year: currentYear,
				monthNumber: currentMonth,
				weekNumber: weekNum,
				payments: userPayments,
				totalAmount: userPayments.reduce((sum, p) => sum + p.actualAmount, 0),
				totalTax: userPayments.reduce((sum, p) => sum + p.taxAmount, 0),
				totalNet: userPayments.reduce((sum, p) => sum + p.netAmount, 0)
			});
	}

	// 3. 전체 검색 결과의 총액 계산 (모든 사용자, 모든 주차)
	const allUsers = await User.find(userQuery).lean();
	const allUserIds = allUsers.map(u => u._id.toString());

	let grandTotalAmount = 0;
	let grandTotalTax = 0;
	let grandTotalNet = 0;

	for (const weekInfo of allWeeks) {
		const paymentPlans = await UserPaymentPlan.find({
			userId: { $in: allUserIds },
			'installments.scheduledDate.year': weekInfo.year,
			'installments.scheduledDate.month': weekInfo.month,
			'installments.scheduledDate.week': weekInfo.week
		}).lean();

		paymentPlans.forEach(plan => {
			const matchingInstallments = plan.installments.filter(inst =>
				inst.scheduledDate.year === weekInfo.year &&
				inst.scheduledDate.month === weekInfo.month &&
				inst.scheduledDate.week === weekInfo.week
			);

			matchingInstallments.forEach(inst => {
				const amount = inst.amount || 0;
				const tax = Math.round(amount * 0.033);
				grandTotalAmount += amount;
				grandTotalTax += tax;
				grandTotalNet += (amount - tax);
			});
		});
	}

	return json({
		success: true,
		data: {
			weeks,
			grandTotal: {
				totalAmount: grandTotalAmount,
				totalTax: grandTotalTax,
				totalNet: grandTotalNet
			},
			pagination: {
				currentPage: page,
				totalPages,
				totalItems: totalUsers,
				itemsPerPage: limit
			}
		}
	});
}

/**
 * 기본 조회 (현재 월의 모든 주차)
 */
async function getDefaultPayments(year, month, page, limit, search, searchCategory = 'name') {
	console.log(`[API] 기본 조회: ${year}년 ${month}월`);

	// 단순히 해당 월의 1~4주차를 조회
	return await getRangePayments(year, month, year, month, page, limit, search, searchCategory);
}

/**
 * 사용자 검색 쿼리 빌더
 */
function buildUserSearchQuery(search, searchCategory = 'name') {
	if (!search) {
		return { type: 'user' };
	}

	// 검색 카테고리에 따라 검색 필드 결정
	if (searchCategory === 'planner') {
		return {
			type: 'user',
			planner: { $regex: search, $options: 'i' }
		};
	}

	// 기본: 이름으로 검색
	return {
		type: 'user',
		name: { $regex: search, $options: 'i' }
	};
}