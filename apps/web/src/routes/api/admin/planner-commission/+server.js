import { json } from '@sveltejs/kit';
import { connectDB } from '$lib/server/db.js';
import PlannerCommission from '$lib/server/models/PlannerCommission.js';
import PlannerCommissionPlan from '$lib/server/models/PlannerCommissionPlan.js';
import WeeklyPaymentPlans from '$lib/server/models/WeeklyPaymentPlans.js';
import User from '$lib/server/models/User.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import { getAllWeeksInPeriod, getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';

/**
 * 금요일 기준 주차 키 생성 (YYYY-MM-WN 형식)
 * @param {number} year 연도
 * @param {number} month 월 (1-12)
 * @param {number} week 주차 (1-5)
 * @returns {string} 예: "2025-10-W1"
 */
function getWeekKey(year, month, week) {
	return `${year}-${String(month).padStart(2, '0')}-W${week}`;
}

/**
 * 주차 키로부터 해당 주의 시작일(일요일)과 종료일(토요일) 계산
 * @param {string} weekKey 예: "2025-10-W1"
 * @returns {{startDate: Date, endDate: Date}}
 */
function getWeekRange(weekKey) {
	const [yearStr, monthStr, weekStr] = weekKey.split('-');
	const year = parseInt(yearStr);
	const month = parseInt(monthStr.replace('W', ''));
	const week = parseInt(weekStr.replace('W', ''));

	// 해당 월의 금요일 정보 가져오기
	const fridays = getFridaysInMonth(year, month);

	if (week > 0 && week <= fridays.length) {
		const fridayInfo = fridays[week - 1];
		return {
			startDate: fridayInfo.sunday,
			endDate: new Date(fridayInfo.saturday.getTime() + 24 * 60 * 60 * 1000) // 토요일 다음날 00:00
		};
	}

	// 오류 시 빈 범위 반환
	return {
		startDate: new Date(),
		endDate: new Date()
	};
}

/**
 * 관리자용 설계사 지급명부 API (v2.0 - 용역비 중심 설계)
 *
 * GET: 설계사별 용역비 + 수당 조회
 *
 * 아키텍처:
 * 1단계: WeeklyPaymentPlans 조회 → 설계사별 용역비 집계
 * 2단계: 기간별 용역금액 산정
 * 3단계: PlannerCommission 매칭 (수당 추가)
 * 4단계: 최종 응답 데이터 생성
 */
export async function GET({ url, locals }) {
	// 관리자 권한 확인
	if (locals.user?.accountType !== 'admin') {
		return json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
	}

	try {
		await connectDB();

		// 파라미터 파싱
		const paymentMonth = url.searchParams.get('paymentMonth'); // YYYY-MM (단일 월)
		const startYear = url.searchParams.get('startYear'); // 기간 시작 년
		const startMonth = url.searchParams.get('startMonth'); // 기간 시작 월
		const endYear = url.searchParams.get('endYear'); // 기간 종료 년
		const endMonth = url.searchParams.get('endMonth'); // 기간 종료 월
		const searchType = url.searchParams.get('searchType'); // 'name' | 'grade'
		const searchTerm = url.searchParams.get('searchTerm'); // 검색어
		const viewMode = url.searchParams.get('viewMode') || 'monthly'; // 'monthly' | 'weekly'
		const page = parseInt(url.searchParams.get('page')) || 1;
		const limit = parseInt(url.searchParams.get('limit')) || 20;

		console.log(`\n📋 설계사 지급명부 조회 시작 (v2.0 - 용역비 중심)`);
		console.log(`   viewMode: ${viewMode}`);
		console.log(`   searchType: ${searchType}, searchTerm: ${searchTerm}`);

		// ==================== 기간 정보 생성 ==================== //
		const periodsSet = new Set();

		if (viewMode === 'weekly') {
			// 주간보기: 금요일 기준 주차별 기간 생성
			console.log(`   🔍 주간보기 기간 생성: paymentMonth=${paymentMonth}, 기간=${startYear}-${startMonth}~${endYear}-${endMonth}`);

			if (paymentMonth) {
				// 단일 월의 모든 주차
				const [year, month] = paymentMonth.split('-');
				const weeks = getAllWeeksInPeriod(parseInt(year), parseInt(month), parseInt(year), parseInt(month));

				console.log(`   📆 ${year}년 ${month}월: ${weeks.length}개 주차`);

				weeks.forEach(({ year, month, week }) => {
					const weekKey = getWeekKey(year, month, week);
					console.log(`      ➕ ${weekKey} (${year}년 ${month}월 ${week}주차)`);
					periodsSet.add(weekKey);
				});
			} else if (startYear && startMonth && endYear && endMonth) {
				// 기간 내 모든 주차
				const weeks = getAllWeeksInPeriod(
					parseInt(startYear),
					parseInt(startMonth),
					parseInt(endYear),
					parseInt(endMonth)
				);

				console.log(`   📆 기간: ${startYear}-${startMonth} ~ ${endYear}-${endMonth}, 총 ${weeks.length}개 주차`);

				weeks.forEach(({ year, month, week }) => {
					const weekKey = getWeekKey(year, month, week);
					console.log(`      ➕ ${weekKey} (${year}년 ${month}월 ${week}주차)`);
					periodsSet.add(weekKey);
				});
			}
		} else {
			// 월간보기: 월별 기간 생성 (기존 로직)
			if (paymentMonth) {
				periodsSet.add(paymentMonth);
			} else if (startYear && startMonth && endYear && endMonth) {
				const start = new Date(parseInt(startYear), parseInt(startMonth) - 1);
				const end = new Date(parseInt(endYear), parseInt(endMonth) - 1);

				for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
					const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
					periodsSet.add(monthKey);
				}
			}
		}

		const periods = Array.from(periodsSet).sort();
		console.log(`📅 기간 목록 (${viewMode}):`, periods);

		if (periods.length === 0) {
			return json({
				success: true,
				data: {
					commissions: [],
					periods: [],
					periodTotals: {},
					viewMode,
					pagination: { page, limit, totalItems: 0, totalPages: 0 },
					summary: { totalPlanners: 0, totalRevenue: 0, totalCommission: 0, totalService: 0, grandTotal: 0 }
				}
			});
		}

		// ==================== 1단계: 용역비 지급명부 기준 데이터 추출 ==================== //
		console.log(`\n🔍 1단계: WeeklyPaymentPlans에서 용역비 집계 시작`);

		// 1.1: 기간별 날짜 범위 생성
		const dateRanges = periods.map(period => {
			if (period.includes('-W')) {
				// 주간보기: YYYY-WNN 형식 (예: "2025-W42")
				const { startDate, endDate } = getWeekRange(period);
				return { period, startDate, endDate };
			} else {
				// 월간보기: YYYY-MM 형식 (예: "2025-11")
				const [year, month] = period.split('-');
				// Use Date.UTC to create dates in UTC timezone
				// For "2025-11": startDate = 2025-11-01 00:00:00 UTC, endDate = 2025-12-01 00:00:00 UTC
				return {
					period,
					startDate: new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1)),
					endDate: new Date(Date.UTC(parseInt(year), parseInt(month), 1))
				};
			}
		});

		// 1.2: MongoDB Aggregation - 설계사별 용역비 집계
		const servicePaymentsAggregation = [];

		for (const { period, startDate, endDate } of dateRanges) {
			const result = await WeeklyPaymentPlans.aggregate([
				// 기간 내 installments unwind
				{ $unwind: '$installments' },

				// 기간 필터링
				{
					$match: {
						'installments.scheduledDate': {
							$gte: startDate,
							$lt: endDate
						},
						'installments.status': { $in: ['paid', 'pending'] }
					}
				},

				// userId를 ObjectId로 변환 (WeeklyPaymentPlans.userId는 string, User._id는 ObjectId)
				{
					$addFields: {
						userObjectId: { $toObjectId: '$userId' }
					}
				},

				// userId로 User 조인
				{
					$lookup: {
						from: 'users',
						localField: 'userObjectId',
						foreignField: '_id',
						as: 'user'
					}
				},

				// User 데이터 unwind
				{ $unwind: '$user' },

				// 설계사별 그룹핑
				{
					$group: {
						_id: '$user.plannerAccountId',
						serviceAmount: { $sum: '$installments.installmentAmount' },
						userIds: { $addToSet: '$userId' }
					}
				}
			]);

			console.log(`   📊 ${period}: ${result.length}개 설계사 발견`);

			// 결과를 배열에 추가 (period 정보 포함)
			result.forEach(item => {
				servicePaymentsAggregation.push({
					plannerId: item._id,
					period,
					serviceAmount: item.serviceAmount,
					userCount: item.userIds.length
				});
			});
		}

		console.log(`   ✅ 1단계 완료: ${servicePaymentsAggregation.length}개 항목 집계됨`);

		// ==================== 2단계: 기간별 용역금액 산정 ==================== //
		console.log(`\n🔍 2단계: plannerMap 구조 생성`);

		const plannerMap = new Map();

		// PlannerAccount 정보 조회 (한 번에)
		const plannerIds = [...new Set(servicePaymentsAggregation.map(item => item.plannerId))].filter(id => id);
		const plannerAccounts = await PlannerAccount.find({
			_id: { $in: plannerIds }
		}).lean();

		const plannerAccountMap = new Map();
		plannerAccounts.forEach(acc => {
			plannerAccountMap.set(acc._id.toString(), acc);
		});

		console.log(`   📋 설계사 계정 조회: ${plannerAccounts.length}개`);

		// plannerMap 구조 생성
		servicePaymentsAggregation.forEach(item => {
			if (!item.plannerId) return;

			const key = item.plannerId.toString();
			const plannerAccount = plannerAccountMap.get(key);

			if (!plannerAccount) {
				console.log(`   ⚠️  설계사 계정 없음: ${key}`);
				return;
			}

			if (!plannerMap.has(key)) {
				plannerMap.set(key, {
					plannerAccountId: {
						_id: item.plannerId,
						name: plannerAccount.name,
						phone: plannerAccount.phone,
						bank: plannerAccount.bank || '',
						accountNumber: plannerAccount.accountNumber || '',
						email: plannerAccount.email
					},
					plannerName: plannerAccount.name,
					plannerPhone: plannerAccount.phone,
					plannerEmail: plannerAccount.email,
					periods: {}
				});
			}

			const plannerData = plannerMap.get(key);
			const periodKey = item.period;

			// 기간별 용역금액 저장
			plannerData.periods[periodKey] = {
				paymentMonth: periodKey,
				revenueMonth: periodKey,
				serviceAmount: item.serviceAmount,
				userCount: item.userCount,
				commissionAmount: 0, // 3단계에서 채움
				totalAmount: item.serviceAmount,
				totalRevenue: 0 // 3단계에서 채움
			};
		});

		console.log(`   ✅ 2단계 완료: ${plannerMap.size}개 설계사 맵 생성`);

		// ==================== 3단계: 설계사 수당 매칭 ==================== //
		console.log(`
🔍 3단계: PlannerCommissionPlan 매칭 (개별 지급 계획)`);

		// PlannerCommissionPlan에서 기간별 수당 집계
		const commissionPlansAggregation = [];

		for (const { period, startDate, endDate } of dateRanges) {
			const result = await PlannerCommissionPlan.aggregate([
				// 기간 필터링 (지급일 기준)
				{
					$match: {
						'paymentDate': {
							$gte: startDate,
							$lt: endDate
						},
						'paymentStatus': { $in: ['paid', 'pending'] }
					}
				},

				// 설계사별 그룹핑
				{
					$group: {
						_id: '$plannerAccountId',
						totalCommission: { $sum: '$commissionAmount' },
						totalRevenue: { $sum: '$revenue' },
						userCount: { $sum: 1 }
					}
				}
			]);

			console.log(`   📊 ${period}: ${result.length}개 설계사 수당 발견`);

			// 결과를 배열에 추가 (period 정보 포함)
			result.forEach(item => {
				commissionPlansAggregation.push({
					plannerId: item._id,
					period,
					totalCommission: item.totalCommission,
					totalRevenue: item.totalRevenue,
					userCount: item.userCount
				});
			});
		}

		console.log(`   ✅ 3단계 완료: ${commissionPlansAggregation.length}개 항목 집계됨`);

		// 임시 변수 (기존 코드 호환성 유지)
		const commissions = commissionPlansAggregation;

		console.log(`   📋 수당 집계 결과: ${commissions.length}개`);

		// 수당만 있는 설계사의 PlannerAccount 정보 추가 조회
		const commissionPlannerIds = commissions.map(c => c.plannerId);
		const missingPlannerIds = commissionPlannerIds.filter(id => 
			!plannerAccountMap.has(id.toString())
		);
		
		if (missingPlannerIds.length > 0) {
			console.log(`   🔍 수당만 있는 설계사 ${missingPlannerIds.length}명의 계정 정보 조회 중...`);
			const missingAccounts = await PlannerAccount.find({
				_id: { $in: missingPlannerIds }
			}).lean();
			
			missingAccounts.forEach(acc => {
				plannerAccountMap.set(acc._id.toString(), acc);
			});
			
			console.log(`   ✅ ${missingAccounts.length}개 설계사 계정 추가 완료`);
		}

		// plannerMap에 매칭
		let matchedCount = 0;
		let newPlannerCount = 0;

		commissions.forEach(comm => {
			const key = comm.plannerId.toString();
			let plannerData = plannerMap.get(key);

			// 수당이 표시될 기간 키 (이미 period에 포함되어 있음)
			const targetPeriodKey = comm.period;

			if (plannerData && plannerData.periods[targetPeriodKey]) {
				// 기존 기간 데이터에 수당 추가
				plannerData.periods[targetPeriodKey].commissionAmount = comm.totalCommission;
				plannerData.periods[targetPeriodKey].totalAmount =
					plannerData.periods[targetPeriodKey].serviceAmount + comm.totalCommission;
				plannerData.periods[targetPeriodKey].totalRevenue = comm.totalRevenue;
				matchedCount++;
			} else if (plannerData) {
				// 용역비는 없지만 수당만 있는 경우 (드문 케이스)
				plannerData.periods[targetPeriodKey] = {
					paymentMonth: targetPeriodKey,
					revenueMonth: targetPeriodKey,
					serviceAmount: 0,
					userCount: 0,
					commissionAmount: comm.totalCommission,
					totalAmount: comm.totalCommission,
					totalRevenue: comm.totalRevenue
				};
				newPlannerCount++;
			} else {
				// plannerData가 없는 경우: 수당만 있고 용역비 없는 설계사
				const plannerAccount = plannerAccountMap.get(key);
				if (plannerAccount) {
					plannerData = {
					plannerAccountId: {
						_id: comm.plannerId,
						name: plannerAccount.name,
						phone: plannerAccount.phone,
						bank: plannerAccount.bank || '',
						accountNumber: plannerAccount.accountNumber || '',
						email: plannerAccount.email
					},
					plannerName: plannerAccount.name,
					plannerPhone: plannerAccount.phone,
					plannerEmail: plannerAccount.email,
					periods: {}
					};
					
					// 모든 기간에 대해 0원으로 초기화
					periods.forEach(period => {
						plannerData.periods[period] = {
							paymentMonth: period,
							revenueMonth: null,
							serviceAmount: 0,
							userCount: 0,
							commissionAmount: 0,
							totalAmount: 0,
							totalRevenue: 0
						};
					});
					
					// 수당 기간에만 데이터 추가
					plannerData.periods[targetPeriodKey].revenueMonth = targetPeriodKey;
					plannerData.periods[targetPeriodKey].commissionAmount = comm.totalCommission;
					plannerData.periods[targetPeriodKey].totalAmount = comm.totalCommission;
					plannerData.periods[targetPeriodKey].totalRevenue = comm.totalRevenue;
					
					plannerMap.set(key, plannerData);
					newPlannerCount++;
					console.log(`   🆕 수당만 있는 설계사 추가: ${plannerAccount.name} - ${comm.totalCommission.toLocaleString()}원`);
				}
			}
		});

		console.log(`   ✅ 3단계 완료: ${matchedCount}개 매칭, ${newPlannerCount}개 신규 기간 추가`);

		// ==================== 등급 검색 처리 ==================== //
		if (searchType === 'grade' && searchTerm) {
			console.log(`\n🔍 등급 검색: ${searchTerm}`);

			// 해당 등급의 용역자 조회
			const usersWithGrade = await User.find({
				grade: searchTerm.toUpperCase()
			}).select('plannerAccountId').lean();

			const plannerIdsWithGrade = new Set(
				usersWithGrade
					.map(u => u.plannerAccountId?.toString())
					.filter(Boolean)
			);

			console.log(`   📋 ${searchTerm} 등급 용역자의 설계사: ${plannerIdsWithGrade.size}개`);

			// plannerMap 필터링
			const filteredMap = new Map();
			for (const [key, value] of plannerMap.entries()) {
				if (plannerIdsWithGrade.has(key)) {
					filteredMap.set(key, value);
				}
			}

			console.log(`   ✅ 필터링 후: ${plannerMap.size}개 → ${filteredMap.size}개`);
			plannerMap.clear();
			filteredMap.forEach((value, key) => plannerMap.set(key, value));
		}

		// ==================== 설계사 이름 검색 처리 ==================== //
		if (searchType === 'name' && searchTerm) {
			console.log(`\n🔍 이름 검색: ${searchTerm}`);

			const filteredMap = new Map();
			for (const [key, value] of plannerMap.entries()) {
				if (value.plannerName && value.plannerName.includes(searchTerm)) {
					filteredMap.set(key, value);
				}
			}

			console.log(`   ✅ 필터링 후: ${plannerMap.size}개 → ${filteredMap.size}개`);
			plannerMap.clear();
			filteredMap.forEach((value, key) => plannerMap.set(key, value));
		}

		// ==================== 4단계: 최종 응답 데이터 생성 ==================== //
		console.log(`\n🔍 4단계: 최종 응답 데이터 생성`);

		// Map을 배열로 변환
		const groupedData = Array.from(plannerMap.values())
			.filter(planner => Object.keys(planner.periods).length > 0);

		// 페이지네이션 적용
		const totalItems = groupedData.length;
		const totalPages = Math.ceil(totalItems / limit);
		const commissionsList = groupedData.slice((page - 1) * limit, page * limit);

		// 전체 통계 계산
		const summary = {
			totalPlanners: groupedData.length,
			totalRevenue: 0,
			totalCommission: 0,
			totalService: 0,
			grandTotal: 0
		};

		groupedData.forEach(planner => {
			periods.forEach(period => {
				const periodData = planner.periods[period];
				if (periodData) {
					summary.totalRevenue += periodData.totalRevenue || 0;
					summary.totalCommission += periodData.commissionAmount || 0;
					summary.totalService += periodData.serviceAmount || 0;
					summary.grandTotal += periodData.totalAmount || 0;
				}
			});
		});

		// 기간별 총계 계산
		const periodTotals = {};
		periods.forEach(period => {
			periodTotals[period] = {
				commissionAmount: 0,
				serviceAmount: 0,
				totalAmount: 0,
				totalRevenue: 0,
				totalUsers: 0
			};
		});

		groupedData.forEach(planner => {
			periods.forEach(period => {
				const periodData = planner.periods[period];
				if (periodData) {
					periodTotals[period].commissionAmount += periodData.commissionAmount || 0;
					periodTotals[period].serviceAmount += periodData.serviceAmount || 0;
					periodTotals[period].totalAmount += periodData.totalAmount || 0;
					periodTotals[period].totalRevenue += periodData.totalRevenue || 0;
					periodTotals[period].totalUsers += periodData.userCount || 0;
				}
			});
		});

		console.log(`\n✅ 완료!`);
		console.log(`   설계사 수: ${summary.totalPlanners}명`);
		console.log(`   설계 총액: ${summary.totalCommission.toLocaleString()}원`);
		console.log(`   용역 총액: ${summary.totalService.toLocaleString()}원`);
		console.log(`   전체 총액: ${summary.grandTotal.toLocaleString()}원`);
		console.log(`   기간별 총계:`, Object.keys(periodTotals).map(p =>
			`${p}: ${periodTotals[p].totalAmount.toLocaleString()}원`
		).join(', '));
		console.log(`   기간별 수당 총계:`, Object.keys(periodTotals).map(p =>
			`${p}: ${periodTotals[p].commissionAmount.toLocaleString()}원`
		).join(', '));

		return json({
			success: true,
			data: {
				commissions: commissionsList,
				periods,
				periodTotals,
				viewMode,
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
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
}

/**
 * PUT: 설계사 수당 정보 수정
 */
export async function PUT({ request, locals }) {
	if (locals.user?.accountType !== 'admin') {
		return json({ success: false, error: '관리자 권한이 필요합니다.' }, { status: 403 });
	}

	try {
		await connectDB();

		const { commissionId, updates } = await request.json();

		if (!commissionId) {
			return json({ success: false, error: '수당 ID가 필요합니다.' }, { status: 400 });
		}

		const commission = await PlannerCommission.findByIdAndUpdate(commissionId, updates, {
			new: true,
			runValidators: true
		});

		if (!commission) {
			return json({ success: false, error: '수당 정보를 찾을 수 없습니다.' }, { status: 404 });
		}

		return json({
			success: true,
			data: commission
		});
	} catch (error) {
		console.error('[관리자 API] Update planner commission error:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
}
