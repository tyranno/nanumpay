<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import { paymentCardState } from '$lib/stores/dashboardStore';

	// Store에서 초기값 가져오기
	let paymentViewMode = $paymentCardState.viewMode;
	let startYear = $paymentCardState.startYear;
	let startMonth = $paymentCardState.startMonth;
	let endYear = $paymentCardState.endYear;
	let endMonth = $paymentCardState.endMonth;

	// 변경 시 Store 업데이트
	$: paymentViewMode, startYear, startMonth, endYear, endMonth, updateStore();

	function updateStore() {
		if (browser) {
			paymentCardState.set({
				viewMode: paymentViewMode,
				startYear,
				startMonth,
				endYear,
				endMonth
			});
		}
	}

	// 데이터
	let rangeData = null;
	let isLoading = false;

	onMount(() => {
		loadData();
	});

	$: if (browser && paymentViewMode && startYear && startMonth && endYear && endMonth) {
		loadData();
	}

	// 날짜 범위 검증
	let isDateRangeInvalid = false;
	$: {
		if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
			isDateRangeInvalid = true;
		} else {
			isDateRangeInvalid = false;
		}
	}

	async function loadData() {
		try {
			isLoading = true;
			const startMonthKey = `${startYear}-${String(startMonth).padStart(2, '0')}`;
			const endMonthKey = `${endYear}-${String(endMonth).padStart(2, '0')}`;

			console.log(`[PaymentStatisticsCard] loadData: ${startMonthKey} ~ ${endMonthKey}, viewMode: ${paymentViewMode}`);

			const response = await fetch(`/api/admin/revenue/range?start=${startMonthKey}&end=${endMonthKey}&viewMode=${paymentViewMode}`);
			if (response.ok) {
				rangeData = await response.json();
				console.log('[PaymentStatisticsCard] API Response:', rangeData);
			} else {
				console.error('Failed to load range data');
				rangeData = null;
			}
		} catch (error) {
			console.error('Error loading range data:', error);
			rangeData = null;
		} finally {
			isLoading = false;
		}
	}

	// 기간 데이터의 총 대상자 수
	function getTotalTargetsForRange(monthData) {
		if (!monthData || !monthData.gradeDistribution) return 0;
		return Object.values(monthData.gradeDistribution).reduce((sum, count) => sum + count, 0);
	}

	// 금요일 기준 주차 계산 (백엔드 로직과 동일)
	function getFridaysInMonth(year, month) {
		const firstDay = new Date(year, month - 1, 1);

		// 해당 월의 첫 금요일 찾기
		let firstFriday = new Date(firstDay);
		const dayOfWeek = firstFriday.getDay();
		const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
		firstFriday.setDate(firstFriday.getDate() + daysUntilFriday);

		const lastDay = new Date(year, month, 0);

		// 해당 월의 모든 금요일 카운트
		const fridays = [];
		let currentFriday = new Date(firstFriday);

		while (currentFriday <= lastDay) {
			if (currentFriday.getMonth() === month - 1) {
				fridays.push(new Date(currentFriday));
			}
			currentFriday.setDate(currentFriday.getDate() + 7);
		}

		return fridays.length;
	}

	// 컬럼 생성 (rangeData가 변경될 때마다 재계산)
	let periodColumns = [];
	let monthGroups = [];
	$: {
		console.log('[Reactive] rangeData changed:', rangeData);
		const result = generatePeriodColumns();
		periodColumns = result.columns;
		monthGroups = result.monthGroups;
		console.log('[Reactive] periodColumns updated:', periodColumns.length);
		console.log('[Reactive] monthGroups updated:', monthGroups.length);
	}

	function generatePeriodColumns() {
		const columns = [];
		const groups = [];

		console.log('[generatePeriodColumns] rangeData:', rangeData);

		if (paymentViewMode === 'monthly') {
			// 월간 모드
			let currentYear = startYear;
			let currentMonth = startMonth;

			do {
				const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

				// API에서 받은 데이터 중 해당 월 찾기
				const monthData = rangeData?.monthlyData?.find(m => m.monthKey === monthKey) || {
					monthKey,
					registrationCount: 0,
					effectiveRevenue: 0,
					gradeDistribution: {
						F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
					},
					gradePayments: {
						F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
					}
				};

				columns.push({
					key: monthKey,
					label: `${currentYear}년 ${currentMonth}월`,
					type: 'monthly',
					data: monthData
				});

				if (isDateRangeInvalid) {
					break; // 날짜 역전 시 시작 월만 표시
				}

				// 다음 월로 이동
				currentMonth++;
				if (currentMonth > 12) {
					currentMonth = 1;
					currentYear++;
				}
			} while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth));

		} else if (paymentViewMode === 'weekly') {
			// 주간 모드
			let currentYear = startYear;
			let currentMonth = startMonth;

			do {
				const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
				const weeksInMonth = getFridaysInMonth(currentYear, currentMonth);

				const monthWeeks = [];

				for (let week = 1; week <= weeksInMonth; week++) {
					// API에서 받은 데이터 중 해당 주차 찾기
					const weekData = rangeData?.weeklyData?.find(
						w => w.monthKey === monthKey && w.week === week
					) || {
						monthKey,
						week,
						weekCount: weeksInMonth,
						gradeDistribution: {
							F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
						},
						gradePayments: {
							F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
						}
					};

					columns.push({
						key: `${monthKey}-W${week}`,
						label: `${week}주`,
						type: 'weekly',
						monthKey,
						week,
						weekCount: weeksInMonth,
						data: weekData
					});

					monthWeeks.push({
						key: `${monthKey}-W${week}`,
						label: `${week}주`
					});
				}

				groups.push({
					monthKey,
					monthLabel: `${currentYear}년 ${currentMonth}월`,
					weeks: monthWeeks
				});

				if (isDateRangeInvalid) {
					break; // 날짜 역전 시 시작 월만 표시
				}

				// 다음 월로 이동
				currentMonth++;
				if (currentMonth > 12) {
					currentMonth = 1;
					currentYear++;
				}
			} while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth));
		}

		console.log('[generatePeriodColumns] Generated columns:', columns.length);
		console.log('[generatePeriodColumns] Generated month groups:', groups.length);
		return { columns, monthGroups: groups };
	}

	// 특정 등급의 특정 기간 데이터 가져오기
	function getGradeDataForPeriod(grade, column) {
		if (!column || !column.data) return { count: 0, amount: 0 };

		const count = column.data.gradeDistribution?.[grade] || 0;

		if (column.type === 'monthly') {
			// 월간: gradePayments는 주간 평균 금액
			const weeklyAvg = column.data.gradePayments?.[grade] || 0;
			return {
				count: count,
				amount: weeklyAvg
			};
		} else {
			// 주간: API에서 이미 계산된 금액 사용
			const weeklyAmount = column.data.gradePayments?.[grade] || 0;
			return {
				count: count,
				amount: weeklyAmount
			};
		}
	}
</script>

<div class="bg-white shadow-sm rounded-lg overflow-hidden">
	<!-- 헤더 -->
	<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
		<div class="flex flex-col gap-3">
			<h3 class="text-lg font-semibold text-gray-900">📊 등급별 지급 통계</h3>

			<!-- 조회 옵션 -->
			<div class="flex flex-col gap-2">
				<!-- 기간 선택 -->
				<div class="flex items-center gap-2">
					<span class="text-sm text-gray-600">기간:</span>
					<input
						type="month"
						value="{startYear}-{String(startMonth).padStart(2, '0')}"
						on:change={(e) => {
							const [year, month] = e.target.value.split('-');
							startYear = parseInt(year);
							startMonth = parseInt(month);
						}}
						class="border border-gray-300 rounded px-2 py-1 text-sm"
					/>
					<span class="text-sm">~</span>
					<input
						type="month"
						value="{endYear}-{String(endMonth).padStart(2, '0')}"
						on:change={(e) => {
							const [year, month] = e.target.value.split('-');
							endYear = parseInt(year);
							endMonth = parseInt(month);
						}}
						class="border border-gray-300 rounded px-2 py-1 text-sm"
					/>
				</div>

				<!-- 보기 선택 -->
				<div class="flex items-center gap-2">
					<span class="text-sm text-gray-600">보기:</span>
					<label class="flex items-center gap-1 cursor-pointer">
						<input type="radio" bind:group={paymentViewMode} value="monthly" class="form-radio" />
						<span class="text-sm">월간</span>
					</label>
					<label class="flex items-center gap-1 cursor-pointer">
						<input type="radio" bind:group={paymentViewMode} value="weekly" class="form-radio" />
						<span class="text-sm">주간</span>
					</label>
				</div>

				<!-- 날짜 역전 경고 -->
				{#if isDateRangeInvalid}
					<div class="bg-red-50 border border-red-200 rounded px-3 py-2">
						<p class="text-sm text-red-700">⚠️ 종료 기간이 시작 기간보다 앞설 수 없습니다.</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 본문 -->
	<div class="p-4">
		{#if isLoading}
			<div class="flex justify-center items-center h-64">
				<div class="text-gray-500">로딩 중...</div>
			</div>
		{:else if rangeData}
			<div class="space-y-4">
				<!-- 안내 메시지 -->
				<div class="bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
					<p class="text-sm text-gray-700">💡 각 기간에 등급별 지급액 표시: 지급 금액(인원수)</p>
				</div>

				<!-- 월간 뷰 테이블 -->
				{#if paymentViewMode === 'monthly'}
					<div class="grade-table-wrapper">
						<table class="grade-table">
							<thead>
								<tr class="header-row-1">
									<th class="sticky-col">등급</th>
									{#each periodColumns as column}
										<th class="period-header">{column.label}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
									<tr class="data-row">
										<td class="sticky-col">
											<GradeBadge {grade} size="sm" />
										</td>
										{#each periodColumns as column}
											{@const gradeData = getGradeDataForPeriod(grade, column)}
											<td class="data-col text-center">
												{gradeData.amount.toLocaleString()}({gradeData.count})
											</td>
										{/each}
									</tr>
								{/each}
								<tr class="total-row">
									<td class="sticky-col">합계</td>
									{#each periodColumns as column}
										{@const totalCount = getTotalTargetsForRange(column.data)}
										{@const totalAmount = (() => {
											let sum = 0;
											['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].forEach(g => {
												const data = getGradeDataForPeriod(g, column);
												sum += data.amount;
											});
											return sum;
										})()}
										<td class="data-col text-center">
											{totalAmount.toLocaleString()}({totalCount})
										</td>
									{/each}
								</tr>
							</tbody>
						</table>
					</div>
				{/if}

				<!-- 주간 뷰 테이블 -->
				{#if paymentViewMode === 'weekly'}
					<div class="grade-table-wrapper">
						<table class="grade-table">
							<thead>
								<!-- 2단 헤더: 월 + 주차 -->
								<tr class="header-row-1">
									<th rowspan="2" class="sticky-col">등급</th>
									{#each monthGroups as group}
										<th colspan={group.weeks.length} class="month-header">{group.monthLabel}</th>
									{/each}
								</tr>
								<tr class="header-row-2">
									{#each periodColumns as column}
										<th class="week-header">{column.label}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
									<tr class="data-row">
										<td class="sticky-col">
											<GradeBadge {grade} size="sm" />
										</td>
										{#each periodColumns as column}
											{@const gradeData = getGradeDataForPeriod(grade, column)}
											<td class="data-col text-center">
												{gradeData.amount.toLocaleString()}({gradeData.count})
											</td>
										{/each}
									</tr>
								{/each}
								<tr class="total-row">
									<td class="sticky-col">합계</td>
									{#each periodColumns as column}
										{@const totalCount = column.data.userCount || 0}
										{@const totalAmount = (() => {
											let sum = 0;
											['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].forEach(g => {
												const data = getGradeDataForPeriod(g, column);
												sum += data.amount;
											});
											return sum;
										})()}
										<td class="data-col text-center">
											{totalAmount.toLocaleString()}({totalCount})
										</td>
									{/each}
								</tr>
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else}
			<div class="text-center text-gray-500 py-8">
				데이터를 불러오는 중...
			</div>
		{/if}
	</div>
</div>

<style>
	/* 등급별 인원 통계 테이블 스타일 */
	.grade-table-wrapper {
		overflow-x: auto;
		border: 1px solid #d1d5db;
		background: white;
		position: relative;
	}

	.grade-table {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		min-width: max-content;
		font-size: 0.875rem;
	}

	.grade-table th,
	.grade-table td {
		border-right: 1px solid #d1d5db;
		border-bottom: 1px solid #d1d5db;
		padding: 0.25rem 0.5rem;
		text-align: center;
		white-space: nowrap;
	}

	.grade-table th:first-child,
	.grade-table td:first-child {
		border-left: 1px solid #d1d5db;
	}

	.grade-table thead tr:first-child th {
		border-top: 1px solid #d1d5db;
	}

	/* 고정 컬럼 (등급) */
	.sticky-col {
		position: sticky !important;
		left: 0;
		z-index: 10;
		background: white !important;
		font-weight: 600;
		min-width: 80px;
		width: 80px;
	}

	.header-row-1 .sticky-col {
		background: #f3f4f6 !important;
		z-index: 20;
	}

	.total-row .sticky-col {
		background: #f3f4f6 !important;
		font-weight: bold;
	}

	/* 데이터 컬럼 */
	.data-col {
		min-width: 80px;
	}

	/* 헤더 */
	.header-row-1 {
		background: #f3f4f6;
		font-weight: bold;
	}

	.header-row-2 {
		background: #f3f4f6;
		font-weight: bold;
	}

	.period-header {
		background: #dbeafe;
		text-align: center;
		font-size: 0.875rem;
	}

	.month-header {
		background: #93c5fd;
		text-align: center;
		font-size: 0.875rem;
		font-weight: bold;
		color: #1e3a8a;
	}

	.week-header {
		background: #dbeafe;
		text-align: center;
		font-size: 0.75rem;
	}

	/* 데이터 행 */
	.data-row:hover td {
		background-color: #f9fafb;
	}

	.data-row:hover .sticky-col {
		background: #f9fafb !important;
	}

	/* 합계 행 */
	.total-row {
		background: #f3f4f6;
		font-weight: bold;
	}

	/* 스크롤바 스타일 */
	.grade-table-wrapper::-webkit-scrollbar {
		height: 10px;
	}

	.grade-table-wrapper::-webkit-scrollbar-track {
		background: #f1f1f1;
	}

	.grade-table-wrapper::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 4px;
	}

	.grade-table-wrapper::-webkit-scrollbar-thumb:hover {
		background: #555;
	}
</style>
