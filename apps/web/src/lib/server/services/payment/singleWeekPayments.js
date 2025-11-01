import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import User from '$lib/server/models/User.js';
import { getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';
import { buildSearchFilter, generateGradeInfo, calculatePeriodGrade } from './utils.js';

/**
 * 단일 주차 지급 데이터 조회
 */
export async function getSingleWeekPayments(year, month, week, page, limit, search, searchCategory, plannerAccountId = null) {
	// 1. 해당 주차의 날짜 계산
	const fridays = getFridaysInMonth(year, month);
	const targetWeek = fridays.find(w => w.weekNumber === week);

	if (!targetWeek) {
		throw new Error('유효하지 않은 주차입니다.');
	}

	const weekDate = targetWeek.friday;
	const weekNumber = WeeklyPaymentPlans.getISOWeek(weekDate);

	// 2. 검색 조건 구성
	const searchFilter = buildSearchFilter(search, searchCategory);

	// 4. Aggregation Pipeline for 페이지네이션
	const pipeline = [
		// 해당 주차의 할부가 있는 계획만 필터
		{
			$match: {
				'installments': {
					$elemMatch: {
						weekNumber: weekNumber,
						status: { $in: ['paid', 'pending'] }
					}
				}
			}
		},
		// 해당 주차의 할부만 필터링
		{
			$unwind: '$installments'
		},
		{
			$match: {
				'installments.weekNumber': weekNumber,
				'installments.status': { $in: ['paid', 'pending'] }
			}
		},
		// 검색 조건 적용 (이름만 unwind 후 필터링)
		...(searchFilter.userName ? [{ $match: { userName: searchFilter.userName } }] : []),
		// 사용자별 그룹화
		{
			$group: {
				_id: '$userId',
				userName: { $first: '$userName' },
				grades: { $push: '$baseGrade' },  // ⭐ 모든 등급 수집
				payments: {
					$push: {
						planType: '$planType',
						baseGrade: '$baseGrade',  // ⭐ 지급 계획의 등급
						추가지급단계: '$추가지급단계',  // ⭐ 추가지급 단계
						revenueMonth: '$installments.revenueMonth',
						week: '$installments.week',  // ⭐ 회차 (1~60)
						amount: '$installments.installmentAmount',
						tax: '$installments.withholdingTax',
						net: '$installments.netAmount',
						status: '$installments.status'
					}
				},
				totalAmount: { $sum: '$installments.installmentAmount' },
				totalTax: { $sum: '$installments.withholdingTax' },
				totalNet: { $sum: '$installments.netAmount' }
			}
				},
		{
			$addFields: {
				// ⭐ 등급을 숫자로 변환하여 최대값 계산
				maxGradeNum: {
					$max: {
						$map: {
							input: '$grades',
							as: 'g',
							in: { $toInt: { $substr: ['$$g', 1, -1] } }  // "F1" → 1
						}
					}
				}
			}
		},
		{
			$addFields: {
				// ⭐ 최대 등급을 다시 문자열로 변환
				maxGrade: { $concat: ['F', { $toString: '$maxGradeNum' }] },
				userIdAsObjectId: { $toObjectId: '$_id' }
			}
		},
		{
			$lookup: {
				from: 'users',
				localField: 'userIdAsObjectId',
				foreignField: '_id',
				as: 'userInfo'
			}
		},
		{
			$addFields: {
				registrationNumber: { $arrayElemAt: ['$userInfo.registrationNumber', 0] },
				registrationDate: { $arrayElemAt: ['$userInfo.registrationDate', 0] },
				createdAt: { $arrayElemAt: ['$userInfo.createdAt', 0] },
				userObjectId: { $arrayElemAt: ['$userInfo._id', 0] },
				plannerAccountId: { $arrayElemAt: ['$userInfo.plannerAccountId', 0] },
				bank: { $arrayElemAt: ['$userInfo.bank', 0] },
				accountNumber: { $arrayElemAt: ['$userInfo.accountNumber', 0] }
			}
		},
		{
			$lookup: {
				from: 'planneraccounts',
				localField: 'plannerAccountId',
				foreignField: '_id',
				as: 'plannerInfo'
			}
		},
		{
			$addFields: {
				plannerName: { $arrayElemAt: ['$plannerInfo.name', 0] }
			}
		},
		// ⭐ 설계사 필터 적용 (본인 용역자만 조회)
		...(plannerAccountId ? [{
			$match: {
				plannerAccountId: plannerAccountId
			}
		}] : []),
		// 등급 검색 필터 적용 (⭐ $group 이후에 maxGrade로 필터링)
		...(searchFilter.baseGrade ? [{
			$match: {
				maxGrade: searchFilter.baseGrade
			}
		}] : []),
		// 설계사 검색 필터 적용
		...(searchFilter.needPlannerSearch ? [{
			$match: {
				plannerName: { $regex: searchFilter.plannerSearch, $options: 'i' }
			}
		}] : []),
		{
			$sort: { userObjectId: 1 }
		},
		// ⭐ $facet으로 grandTotal과 페이지네이션 데이터 동시 계산
		{
			$facet: {
				// 전체 금액 합계 (필터링된 모든 사용자)
				grandTotal: [
					{
						$group: {
							_id: null,
							totalAmount: { $sum: '$totalAmount' },
							totalTax: { $sum: '$totalTax' },
							totalNet: { $sum: '$totalNet' },
							totalUsers: { $sum: 1 }
						}
					}
				],
				// 페이지네이션된 데이터
				paginatedData: [
					{ $skip: (page - 1) * limit },
					{ $limit: limit }
				]
			}
		}
	];

	const result = await WeeklyPaymentPlans.aggregate(pipeline);

	// ⭐ grandTotal 추출
	const grandTotal = result[0]?.grandTotal[0] || {
		totalAmount: 0,
		totalTax: 0,
		totalNet: 0,
		totalUsers: 0
	};

	const totalCount = grandTotal.totalUsers;
	const totalPages = Math.ceil(totalCount / limit);
	const userPayments = result[0]?.paginatedData || [];

	// 5. 사용자 상세 정보 추가
	const userIds = userPayments.map(p => p._id);
	const users = await User.find({ _id: { $in: userIds } })
		.populate('plannerAccountId')
		.populate('userAccountId')
		.lean();
	const userMap = new Map(users.map(u => [u._id.toString(), u]));

	const enrichedPayments = userPayments.map((payment, idx) => {
		const user = userMap.get(payment._id) || {};
		const userAccount = user.userAccountId || {};
		const plannerAccount = user.plannerAccountId || {};

		// gradeInfo 생성
		const gradeInfo = generateGradeInfo(payment.payments);

		// 선택된 기간의 최고 등급 계산
		const periodGrade = calculatePeriodGrade(payment.payments, user.grade || 'F1');

		return {
			no: (page - 1) * limit + idx + 1,
			userId: payment._id,
			userName: payment.userName,
			planner: plannerAccount.name || '',
			bank: userAccount.bank || '',
			accountNumber: userAccount.accountNumber || '',
			grade: periodGrade,
			actualAmount: payment.totalAmount || 0,
			taxAmount: payment.totalTax || 0,
			netAmount: payment.totalNet || 0,
			installments: payment.payments,
			gradeInfo
		};
	});

	// 6. 현재 페이지 합계
	const pageTotal = {
		amount: enrichedPayments.reduce((sum, p) => sum + p.actualAmount, 0),
		tax: enrichedPayments.reduce((sum, p) => sum + p.taxAmount, 0),
		net: enrichedPayments.reduce((sum, p) => sum + p.netAmount, 0)
	};

	// 7. 주차별 총계 생성 (단일 주차)
	const weekKey = `${year}-${month}-${week}`;
	const weeklyTotals = {
		[weekKey]: {
			totalAmount: grandTotal.totalAmount,
			totalTax: grandTotal.totalTax,
			totalNet: grandTotal.totalNet
		}
	};

	return {
		success: true,
		data: {
			grandTotal,
			weeklyTotals,
			pagination: {
				page,
				totalPages,
				totalItems: totalCount,
				itemsPerPage: limit
			},
			payments: enrichedPayments,
			pageTotal,
			year,
			monthNumber: month,
			weekNumber: week,
			week: `${month}월 ${week}주`
		}
	};
}

/**
 * 단일 주차 등급별 조회 (전용 함수)
 * - 등급 검색에 최적화
 * - getSingleWeekPayments의 복잡도를 줄이기 위해 분리
 */
export async function getSingleWeekPaymentsByGrade(year, month, week, page, limit, gradeFilter, plannerAccountId = null) {
	// 1. 해당 주차의 날짜 계산
	const fridays = getFridaysInMonth(year, month);
	const targetWeek = fridays.find(w => w.weekNumber === week);

	if (!targetWeek) {
		throw new Error('유효하지 않은 주차입니다.');
	}

	const weekDate = targetWeek.friday;
	const weekNumber = WeeklyPaymentPlans.getISOWeek(weekDate);

	// 2. 등급 필터링된 사용자 조회
	const pipeline = [
		{
			$match: {
				'installments': {
					$elemMatch: {
						weekNumber: weekNumber,
						status: { $in: ['paid', 'pending'] }
					}
				}
			}
		},
		{
			$unwind: '$installments'
		},
		{
			$match: {
				'installments.weekNumber': weekNumber,
				'installments.status': { $in: ['paid', 'pending'] }
			}
		},
		{
			$group: {
				_id: '$userId',
				userName: { $first: '$userName' },
				grades: { $push: '$baseGrade' },
				payments: {
					$push: {
						planType: '$planType',
						baseGrade: '$baseGrade',
						추가지급단계: '$추가지급단계',
						revenueMonth: '$installments.revenueMonth',
						week: '$installments.week',
						amount: '$installments.installmentAmount',
						tax: '$installments.withholdingTax',
						net: '$installments.netAmount',
						status: '$installments.status'
					}
				},
				totalAmount: { $sum: '$installments.installmentAmount' },
				totalTax: { $sum: '$installments.withholdingTax' },
				totalNet: { $sum: '$installments.netAmount' }
			}
		},
		{
			$addFields: {
				maxGradeNum: {
					$max: {
						$map: {
							input: '$grades',
							as: 'g',
							in: { $toInt: { $substr: ['$$g', 1, -1] } }
						}
					}
				}
			}
		},
		{
			$addFields: {
				maxGrade: { $concat: ['F', { $toString: '$maxGradeNum' }] },
				userIdAsObjectId: { $toObjectId: '$_id' }
			}
		},
		{
			$match: {
				maxGrade: gradeFilter
			}
		},
		{
			$lookup: {
				from: 'users',
				localField: 'userIdAsObjectId',
				foreignField: '_id',
				as: 'userDetails'
			}
		},
		{
			$unwind: {
				path: '$userDetails',
				preserveNullAndEmptyArrays: true
			}
		},
		{
			$addFields: {
				plannerAccountId: '$userDetails.plannerAccountId'
			}
		},
		// ⭐ 설계사 필터 적용
		...(plannerAccountId ? [{
			$match: {
				plannerAccountId: plannerAccountId
			}
		}] : []),
		{
			$sort: { userObjectId: 1 }
		},
		// ⭐ $facet으로 grandTotal과 페이지네이션 데이터 동시 계산
		{
			$facet: {
				grandTotal: [
					{
						$group: {
							_id: null,
							totalAmount: { $sum: '$totalAmount' },
							totalTax: { $sum: '$totalTax' },
							totalNet: { $sum: '$totalNet' },
							totalUsers: { $sum: 1 }
						}
					}
				],
				paginatedData: [
					{ $skip: (page - 1) * limit },
					{ $limit: limit }
				]
			}
		}
	];

	const result = await WeeklyPaymentPlans.aggregate(pipeline);

	const grandTotal = result[0]?.grandTotal[0] || {
		totalAmount: 0,
		totalTax: 0,
		totalNet: 0,
		totalUsers: 0
	};

	const totalCount = grandTotal.totalUsers;
	const totalPages = Math.ceil(totalCount / limit);
	const userPayments = result[0]?.paginatedData || [];

	// 3. 사용자 상세 정보 추가
	const userIds = userPayments.map(p => p._id);
	const users = await User.find({ _id: { $in: userIds } })
		.populate('plannerAccountId')
		.populate('userAccountId')
		.lean();
	const userMap = new Map(users.map(u => [u._id.toString(), u]));

	const enrichedPayments = userPayments.map((payment, idx) => {
		const user = userMap.get(payment._id) || {};
		const userAccount = user.userAccountId || {};
		const plannerAccount = user.plannerAccountId || {};

		// gradeInfo 생성
		const gradeInfo = generateGradeInfo(payment.payments);

		// 선택된 기간의 최고 등급 계산
		const periodGrade = calculatePeriodGrade(payment.payments, user.grade || 'F1');

		return {
			userId: payment._id,
			userName: payment.userName || user.name || 'Unknown',
			planner: plannerAccount.name || '',
			bank: userAccount.bank || '',
			accountNumber: userAccount.accountNumber || '',
			grade: periodGrade,
			actualAmount: payment.totalAmount || 0,
			taxAmount: payment.totalTax || 0,
			netAmount: payment.totalNet || 0,
			installments: payment.payments || [],
			gradeInfo
		};
	});

	const pageTotal = {
		amount: enrichedPayments.reduce((sum, p) => sum + p.actualAmount, 0),
		tax: enrichedPayments.reduce((sum, p) => sum + p.taxAmount, 0),
		net: enrichedPayments.reduce((sum, p) => sum + p.netAmount, 0)
	};

	const weekKey = `${year}-${month}-${week}`;
	const weeklyTotals = {
		[weekKey]: {
			totalAmount: grandTotal.totalAmount,
			totalTax: grandTotal.totalTax,
			totalNet: grandTotal.totalNet
		}
	};

	return {
		success: true,
		data: {
			grandTotal,
			weeklyTotals,
			pagination: {
				page,
				totalPages,
				totalItems: totalCount,
				itemsPerPage: limit
			},
			payments: enrichedPayments,
			pageTotal,
			year,
			monthNumber: month,
			weekNumber: week,
			week: `${month}월 ${week}주`
		}
	};
}
