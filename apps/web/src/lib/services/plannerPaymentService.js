import { getWeekOfMonthByFriday, getFridaysInMonth } from '$lib/utils/fridayWeekCalculator.js';

/**
 * 설계사용 Payment 관련 데이터 처리 서비스
 * paymentService와 동일하지만 API URL만 /api/planner/payment/weekly 사용
 */
export const plannerPaymentService = {
	/**
	 * 단일 날짜 또는 기간별 지급 데이터 조회
	 */
	async loadPaymentData(params) {
		const {
			filterType,
			selectedDate,
			selectedYear,
			selectedMonth,
			startYear,
			startMonth,
			endYear,
			endMonth,
			// ⭐ 주별 기간 선택용
			startWeekDate,
			endWeekDate,
			page = 1,
			limit = 20,
			searchQuery = '',
			searchCategory = 'name',
			periodType = 'weekly',
			fetchAll = false  // ⭐ 전체 데이터 조회 (그룹핑용)
		} = params;

		try {
			if (filterType === 'date') {
				// ⭐ 주간 선택: selectedDate를 사용하여 단일 주차 조회
				return await this.loadSingleDatePayments({
					selectedDate,
					page,
					limit,
					searchQuery,
					searchCategory
				});
			} else {
				// ⭐ 기간 선택: 날짜 기반으로 주차 범위 조회
				return await this.loadPeriodPaymentsByDateRange({
					startWeekDate,
					endWeekDate,
					page,
					limit,
					searchQuery,
					searchCategory,
					fetchAll
				});
			}
		} catch (err) {
			console.error('Error loading payment data:', err);
			throw err;
		}
	},

	/**
	 * 단일 날짜 지급 데이터 조회
	 */
	async loadSingleDatePayments(params) {
		const { selectedDate, page, limit, searchQuery, searchCategory } = params;

		// ⭐ 금요일 기준 주차 계산 (월경계 처리)
		const weekInfo = getWeekOfMonthByFriday(new Date(selectedDate));
		
		if (!weekInfo) {
			throw new Error('주차 계산 실패');
		}

		const queryParams = new URLSearchParams({
			year: weekInfo.year,
			month: weekInfo.month,
			week: weekInfo.week,
			page,
			limit,
			search: searchQuery,
			searchCategory
		});

		const response = await fetch(`/api/planner/payment/weekly?${queryParams}`);
		const result = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.message || '데이터 로드 실패');
		}

		const data = result.data;
		const weekKey = `${data.year}_${data.monthNumber}_${data.weekNumber}`;

		return {
			paymentList: (data.payments || []).map((user, index) => ({
				...user,
				no: (page - 1) * limit + index + 1,
				name: user.userName || user.name || 'Unknown',
				planner: user.planner || '',
				payments: {
					[weekKey]: {
						amount: user.actualAmount || 0,
						tax: user.taxAmount || 0,
						net: user.netAmount || 0,
						gradeInfo: user.gradeInfo || '-',  // ⭐ 등급(회수)
						installmentDetails: user.installments || []
					}
				}
			})),
			weeklyColumns: [{
				year: data.year,
				month: data.monthNumber,
				week: data.weekNumber,
				label: data.week,
				data
			}],
			totalPages: data.pagination?.totalPages || 1,
			totalPaymentTargets: data.pagination?.totalItems || 0,
			apiGrandTotal: data.grandTotal || null,
			weeklyTotals: data.weeklyTotals || {},
			monthlyTotals: data.monthlyTotals || {}
		};
	},

	/**
	 * 기간 지급 데이터 조회
	 */
	async loadPeriodPayments(params) {
		const {
			startYear,
			startMonth,
			endYear,
			endMonth,
			page,
			limit,
			searchQuery,
			searchCategory,
			periodType,
			filterType, // ⭐ 주간 보기 vs 기간 보기
			fetchAll = false  // ⭐ 전체 데이터 조회 (그룹핑용)
		} = params;

		// 기간 유효성 검사
		const monthDiff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
		if (monthDiff > 12) {
			throw new Error('최대 12개월까지만 조회 가능합니다.');
		}
		if (monthDiff <= 0) {
			throw new Error('종료 월이 시작 월보다 이전입니다.');
		}

		const queryParams = new URLSearchParams({
			startYear,
			startMonth,
			endYear,
			endMonth,
			page,
			limit,
			search: searchQuery,
			searchCategory,
			periodType,  // ⭐ periodType 전달
			fetchAll: fetchAll ? 'true' : 'false'  // ⭐ 전체 데이터 조회
		});

		const response = await fetch(`/api/planner/payment/weekly?${queryParams}`);
		const result = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.message || '데이터 로드 실패');
		}

		const data = result.data;

		let weeklyColumns;

		if (periodType === 'monthly') {
			// ⭐ 월간 보기: 월별 컬럼 생성
			const monthMap = new Map();
			(data.weeks || []).forEach(weekData => {
				const monthKey = weekData.monthNumber;
				if (!monthMap.has(monthKey)) {
					monthMap.set(monthKey, {
						year: weekData.year,
						month: weekData.monthNumber,
						label: `${weekData.year}년 ${weekData.monthNumber}월`,
						data: weekData
					});
				}
			});
			weeklyColumns = Array.from(monthMap.values());
		} else {
			// 주간 보기: 주차별 컬럼 생성
			if (filterType === 'date') {
				// ⭐ 주간 보기: 첫 번째 주만 표시
				const firstWeek = data.weeks?.[0];
				weeklyColumns = firstWeek ? [{
					year: firstWeek.year,
					month: firstWeek.monthNumber,
					week: firstWeek.weekNumber,
					label: firstWeek.week,
					data: firstWeek
				}] : [];
			} else {
				// ⭐ 기간 보기 (주별): 모든 주 표시
				weeklyColumns = (data.weeks || []).map(week => ({
					year: week.year,
					month: week.monthNumber,
					week: week.weekNumber,
					label: week.week,
					data: week
				}));
			}
		}

		// 사용자별 데이터 매핑
		const paymentList = (data.payments || []).map((user, index) => {
			const payments = {};

			// 주차별/월별 지급 정보 매핑
			if (periodType === 'monthly') {
				// ⭐ 월간 보기: 월별로 합산
				(data.weeks || []).forEach(weekData => {
					const monthKey = `month_${weekData.monthNumber}`;
					const userPayment = weekData.payments?.find(p => p.userId === user.userId);

					if (userPayment) {
						if (!payments[monthKey]) {
						payments[monthKey] = {
							amount: 0,
							tax: 0,
							net: 0,
							gradeInfo: '',  // ⭐ 등급(회수) 누적
							installmentDetails: []  // ⭐ 지급 상세 누적
						};
					}
					payments[monthKey].amount += userPayment.actualAmount || 0;
					payments[monthKey].tax += userPayment.taxAmount || 0;
					payments[monthKey].net += userPayment.netAmount || 0;
					// ⭐ gradeInfo 누적 (중복 제거)
					if (userPayment.gradeInfo && userPayment.gradeInfo !== '-') {
						const existing = payments[monthKey].gradeInfo;
						payments[monthKey].gradeInfo = existing
							? `${existing}, ${userPayment.gradeInfo}`
							: userPayment.gradeInfo;
					}
					// ⭐ installmentDetails 누적
					if (userPayment.installments) {
						payments[monthKey].installmentDetails.push(...userPayment.installments);
					}
					}
				});
			} else {
				// 주간 보기: 주차별로 저장
				weeklyColumns.forEach(column => {
					const weekKey = `${column.year}_${column.month}_${column.week}`;
					const weekData = data.weeks.find(w =>
						w.year === column.year &&
						w.monthNumber === column.month &&
						w.weekNumber === column.week
					);

					const userPayment = weekData?.payments.find(p => p.userId === user.userId);

					payments[weekKey] = {
						amount: userPayment?.actualAmount || 0,
						tax: userPayment?.taxAmount || 0,
						net: userPayment?.netAmount || 0,
						gradeInfo: userPayment?.gradeInfo || '-',  // ⭐ 등급(회수)
						installmentDetails: userPayment?.installments || []
					};
				});
			}

			return {
				no: (page - 1) * limit + index + 1,
				userId: user.userId,
				name: user.userName || user.name || 'Unknown',
				userAccountId: user.userAccountId || '',  // ⭐ 계좌 ID (그룹핑용)
				accountName: user.accountName || user.userName || user.name || 'Unknown',  // ⭐ 계좌주명
				planner: user.planner || '',
				bank: user.bank || '',
				accountNumber: user.accountNumber || '',
				grade: user.grade || 'F1',
				gradeHistory: user.gradeHistory || [],  // ⭐ 등록/승급일 계산용
				insuranceActive: user.insuranceActive || false,  // ⭐ 보험 유지 여부
				payments,
				totalAmount: user.totalAmount || 0,
				totalTax: user.totalTax || 0,
				totalNet: user.totalNet || 0,
				// ⭐ 누적총액 (전체 과거 지급 총액)
				cumulativeTotal: user.cumulativeTotal || { totalAmount: 0, totalTax: 0, totalNet: 0 }
			};
		});

		return {
			paymentList,
			weeklyColumns,
			totalPages: data.pagination?.totalPages || 1,
			totalPaymentTargets: data.pagination?.totalItems || 0,
			apiGrandTotal: data.grandTotal || null,
			weeklyTotals: data.weeklyTotals || {},
			monthlyTotals: data.monthlyTotals || {},
			allWeeklyData: weeklyColumns
		};
	},

	/**
	 * ⭐ 날짜 범위 기반 기간 지급 데이터 조회 (주별만 지원)
	 */
	async loadPeriodPaymentsByDateRange(params) {
		const {
			startWeekDate,
			endWeekDate,
			page,
			limit,
			searchQuery,
			searchCategory,
			fetchAll = false
		} = params;

		// 날짜에서 year/month 추출 (로컬 시간 기준으로 파싱)
		const [startY, startM, startD] = startWeekDate.split('-').map(Number);
		const [endY, endM, endD] = endWeekDate.split('-').map(Number);
		const startDate = new Date(startY, startM - 1, startD);
		const endDate = new Date(endY, endM - 1, endD);

		// ⭐ 종료일을 해당 주 금요일까지 확장 (검색용)
		const endDateForSearch = this.getNextFriday(endDate);

		const startYear = startDate.getFullYear();
		const startMonth = startDate.getMonth() + 1;
		// ⭐ API 조회는 금요일이 포함된 월까지 확장
		const endYear = endDateForSearch.getFullYear();
		const endMonth = endDateForSearch.getMonth() + 1;

		// ⭐ 날짜 비교용 숫자값 (타임존 문제 방지)
		const startNum = startY * 10000 + startM * 100 + startD;
		const endSearchNum = endDateForSearch.getFullYear() * 10000 + (endDateForSearch.getMonth() + 1) * 100 + endDateForSearch.getDate();

		const queryParams = new URLSearchParams({
			startYear,
			startMonth,
			endYear,
			endMonth,
			page,
			limit,
			search: searchQuery,
			searchCategory,
			periodType: 'weekly',  // ⭐ 항상 주별
			fetchAll: fetchAll ? 'true' : 'false'
		});

		const response = await fetch(`/api/planner/payment/weekly?${queryParams}`);
		const result = await response.json();

		if (!result.success || !result.data) {
			throw new Error(result.message || '데이터 로드 실패');
		}

		const data = result.data;

		// ⭐ 날짜 범위에 해당하는 주차만 필터링 (종료일은 해당 주 금요일까지 확장)
		const filteredWeeks = (data.weeks || []).filter(week => {
			const weekFriday = this.getWeekFriday(week.year, week.monthNumber, week.weekNumber);
			// 시작일 <= 금요일 <= 확장된 종료일(금요일) (숫자로 비교하여 타임존 문제 방지)
			const fridayNum = weekFriday.getFullYear() * 10000 + (weekFriday.getMonth() + 1) * 100 + weekFriday.getDate();
			return fridayNum >= startNum && fridayNum <= endSearchNum;
		});

		// 주간 보기: 주차별 컬럼 생성
		const weeklyColumns = filteredWeeks.map(week => ({
			year: week.year,
			month: week.monthNumber,
			week: week.weekNumber,
			label: week.week,
			data: week
		}));

		// 사용자별 데이터 매핑
		const paymentList = (data.payments || []).map((user, index) => {
			const payments = {};

			// 주차별로 저장
			weeklyColumns.forEach(column => {
				const weekKey = `${column.year}_${column.month}_${column.week}`;
				const weekData = filteredWeeks.find(w =>
					w.year === column.year &&
					w.monthNumber === column.month &&
					w.weekNumber === column.week
				);

				const userPayment = weekData?.payments?.find(p => p.userId === user.userId);

				payments[weekKey] = {
					amount: userPayment?.actualAmount || 0,
					tax: userPayment?.taxAmount || 0,
					net: userPayment?.netAmount || 0,
					gradeInfo: userPayment?.gradeInfo || '-',
					installmentDetails: userPayment?.installments || []
				};
			});

			return {
				no: (page - 1) * limit + index + 1,
				userId: user.userId,
				name: user.userName || user.name || 'Unknown',
				userAccountId: user.userAccountId || '',
				accountName: user.accountName || user.userName || user.name || 'Unknown',
				planner: user.planner || '',
				bank: user.bank || '',
				accountNumber: user.accountNumber || '',
				grade: user.grade || 'F1',
				gradeHistory: user.gradeHistory || [],
				insuranceActive: user.insuranceActive || false,
				payments,
				totalAmount: user.totalAmount || 0,
				totalTax: user.totalTax || 0,
				totalNet: user.totalNet || 0,
				// ⭐ 누적총액 (전체 과거 지급 총액)
				cumulativeTotal: user.cumulativeTotal || { totalAmount: 0, totalTax: 0, totalNet: 0 }
			};
		});

		return {
			paymentList,
			weeklyColumns,
			totalPages: data.pagination?.totalPages || 1,
			totalPaymentTargets: data.pagination?.totalItems || 0,
			apiGrandTotal: data.grandTotal || null,
			weeklyTotals: data.weeklyTotals || {},
			monthlyTotals: data.monthlyTotals || {},
			allWeeklyData: weeklyColumns
		};
	},

	/**
	 * ⭐ 특정 연/월/주의 금요일 날짜 계산
	 */
	getWeekFriday(year, month, weekNumber) {
		const fridays = getFridaysInMonth(year, month);
		const targetWeek = fridays.find(w => w.weekNumber === weekNumber);
		return targetWeek ? targetWeek.friday : new Date(year, month - 1, 1);
	},

	/**
	 * ⭐ 해당 날짜를 포함하는 주의 금요일 계산 (해당 주 또는 다음 금요일)
	 */
	getNextFriday(date) {
		const result = new Date(date);
		const dayOfWeek = result.getDay();
		// 금요일(5)이 아니면 다음 금요일로 이동
		if (dayOfWeek !== 5) {
			const daysToFriday = dayOfWeek <= 5 ? (5 - dayOfWeek) : (5 - dayOfWeek + 7);
			result.setDate(result.getDate() + daysToFriday);
		}
		return result;
	}
};
