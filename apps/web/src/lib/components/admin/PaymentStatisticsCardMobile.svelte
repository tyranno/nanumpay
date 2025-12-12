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

	async function loadData() {
		try {
			isLoading = true;
			const startMonthKey = `${startYear}-${String(startMonth).padStart(2, '0')}`;
			const endMonthKey = `${endYear}-${String(endMonth).padStart(2, '0')}`;

			console.log(
				`[PaymentStatisticsCardMobile] loadData: ${startMonthKey} ~ ${endMonthKey}, viewMode: ${paymentViewMode}`
			);

			const response = await fetch(
				`/api/admin/revenue/range?start=${startMonthKey}&end=${endMonthKey}&viewMode=${paymentViewMode}`
			);
			if (response.ok) {
				const data = await response.json();
				console.log('[PaymentStatisticsCardMobile] API Response:', data);

				// 월간 모드인 경우 모든 월 생성
				if (data.viewMode === 'monthly' && paymentViewMode === 'monthly') {
					// 선택한 기간의 모든 월 생성
					const allMonths = [];
					let currentYear = startYear;
					let currentMonth = startMonth;

					while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
						const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

						// API에서 받은 데이터 중 해당 월 찾기
						const existingMonth = (data.monthlyData || []).find((m) => m.monthKey === monthKey);

						if (existingMonth) {
							allMonths.push(existingMonth);
						} else {
							allMonths.push({
								monthKey,
								registrationCount: 0,
								effectiveRevenue: 0,
								gradeDistribution: {
									F1: 0,
									F2: 0,
									F3: 0,
									F4: 0,
									F5: 0,
									F6: 0,
									F7: 0,
									F8: 0
								},
								gradePayments: {
									F1: 0,
									F2: 0,
									F3: 0,
									F4: 0,
									F5: 0,
									F6: 0,
									F7: 0,
									F8: 0
								}
							});
						}

						// 다음 월로 이동
						currentMonth++;
						if (currentMonth > 12) {
							currentMonth = 1;
							currentYear++;
						}
					}

					rangeData = {
						...data,
						monthlyData: allMonths
					};
				} else {
					// 주간 모드는 그대로
					rangeData = data;
				}
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

	// 기간 역전 여부 체크
	let isDateRangeInvalid = false;
	$: {
		if (startYear > endYear || (startYear === endYear && startMonth > endMonth)) {
			isDateRangeInvalid = true;
		} else {
			isDateRangeInvalid = false;
		}
	}

	// 컬럼 생성 (rangeData가 변경될 때마다 재계산)
	let periodColumns = [];
	$: {
		periodColumns = generatePeriodColumns();
		console.log('[PaymentStatisticsCardMobile] periodColumns:', periodColumns);
		console.log('[PaymentStatisticsCardMobile] rangeData:', rangeData);
		console.log('[PaymentStatisticsCardMobile] paymentViewMode:', paymentViewMode);
	}

	// 백엔드와 동일한 금요일 기준 월별 주차 계산
	// 금요일 날짜 배열 반환
	function getFridaysInMonth(year, month) {
		const firstDay = new Date(year, month - 1, 1); // month는 1~12

		// 해당 월의 첫 금요일 찾기
		let firstFriday = new Date(firstDay);
		const dayOfWeek = firstFriday.getDay();
		const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
		firstFriday.setDate(firstFriday.getDate() + daysUntilFriday);

		// 해당 월의 마지막 날
		const lastDay = new Date(year, month, 0);

		// 첫 금요일부터 7일씩 증가하며 모든 금요일 찾기
		const fridays = [];
		let currentFriday = new Date(firstFriday);

		while (currentFriday <= lastDay) {
			if (currentFriday.getMonth() === month - 1) {
				fridays.push(new Date(currentFriday));
			}
			currentFriday.setDate(currentFriday.getDate() + 7);
		}

		return fridays; // 해당 월의 금요일 Date 배열
	}

	function generatePeriodColumns() {
		const columns = [];

		if (paymentViewMode === 'monthly') {
			// 월간 뷰: 시작월~종료월 사이의 모든 월 생성
			let currentYear = startYear;
			let currentMonth = startMonth;

			// 역전된 경우에도 최소한 시작월은 생성
			do {
				const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

				// API 데이터에서 해당 월 찾기
				const monthData = rangeData?.monthlyData?.find((m) => m.monthKey === monthKey) || {
					monthKey,
					registrationCount: 0,
					effectiveRevenue: 0,
					gradeDistribution: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 },
					gradePayments: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 }
				};

				columns.push({
					key: monthKey,
					label: `${currentYear}년 ${currentMonth}월`,
					type: 'monthly',
					data: monthData
				});

				// 역전된 경우 시작월만 생성하고 중단
				if (isDateRangeInvalid) {
					break;
				}

				// 다음 월로 이동
				currentMonth++;
				if (currentMonth > 12) {
					currentMonth = 1;
					currentYear++;
				}
			} while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth));
		} else if (paymentViewMode === 'weekly') {
			// 주간 뷰: 시작월~종료월의 모든 주차 생성 (금요일 기준)
			let currentYear = startYear;
			let currentMonth = startMonth;

			// 역전된 경우에도 최소한 시작월은 생성
			do {
				const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

				// 백엔드와 동일한 방식으로 해당 월의 금요일 날짜 계산
				const fridaysInMonth = getFridaysInMonth(currentYear, currentMonth);

				fridaysInMonth.forEach((friday, index) => {
					const week = index + 1;
					const fridayLabel = `${friday.getMonth() + 1}-${friday.getDate()}`;

					// API 데이터에서 해당 주차 찾기
					const weekData = rangeData?.weeklyData?.find(
						(w) => w.monthKey === monthKey && w.week === week
					) || {
						monthKey,
						week,
						weekLabel: fridayLabel,
						weekCount: 0,
						gradeDistribution: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 },
						gradePayments: { F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0 },
						userCount: 0
					};

					columns.push({
						key: `${monthKey}-W${week}`,
						label: fridayLabel,
						type: 'weekly',
						monthKey: monthKey,
						monthLabel: `${currentYear}년 ${currentMonth}월`,
						week: week,
						weekCount: weekData.weekCount || 0,
						data: weekData
					});
				});

				// 역전된 경우 시작월만 생성하고 중단
				if (isDateRangeInvalid) {
					break;
				}

				// 다음 월로 이동
				currentMonth++;
				if (currentMonth > 12) {
					currentMonth = 1;
					currentYear++;
				}
			} while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth));
		}

		return columns;
	}

	// 주간 보기일 때 월별로 그룹화
	let monthGroups = [];
	$: {
		if (paymentViewMode === 'weekly' && periodColumns.length > 0) {
			const groups = [];
			let currentMonth = null;
			let currentGroup = null;

			periodColumns.forEach((column) => {
				if (column.monthKey !== currentMonth) {
					if (currentGroup) {
						groups.push(currentGroup);
					}
					currentMonth = column.monthKey;
					currentGroup = {
						monthKey: column.monthKey,
						monthLabel: column.monthLabel,
						weeks: []
					};
				}
				currentGroup.weeks.push(column);
			});

			if (currentGroup) {
				groups.push(currentGroup);
			}

			monthGroups = groups;
		} else {
			monthGroups = [];
		}
	}

	// 특정 등급의 특정 기간 데이터 가져오기
	function getGradeDataForPeriod(grade, column) {
		if (!column || !column.data) return { count: 0, amount: 0 };

		const count = column.data.gradeDistribution?.[grade] || 0;

		if (column.type === 'monthly') {
			// 월간: gradePayments는 1회분, 10회 곱함
			const perInstallment = column.data.gradePayments?.[grade] || 0;
			return {
				count: count,
				amount: perInstallment * 10 * count
			};
		} else {
			// 주간: API에서 이미 계산된 금액 사용
			const weeklyAmount = column.data.gradePayments?.[grade] || 0;
			return {
				count: count,
				amount: weeklyAmount * count
			};
		}
	}
</script>

<div class="overflow-hidden rounded-lg bg-white shadow-sm">
	<!-- 헤더 -->
	<div class="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100 px-3 py-2">
		<div class="flex flex-col gap-2">
			<h3 class="text-base font-semibold text-gray-900">📊 등급별 지급 통계</h3>

			<!-- 조회 옵션 (모바일 최적화) -->
			<div class="flex flex-col gap-2">
				<!-- 기간 선택 -->
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-600">기간:</span>
					<input
						type="month"
						value="{startYear}-{String(startMonth).padStart(2, '0')}"
						on:change={(e) => {
							const [year, month] = e.target.value.split('-');
							startYear = parseInt(year);
							startMonth = parseInt(month);
						}}
						class="rounded border border-gray-300 px-2 py-1 text-xs"
					/>
					<span class="text-xs">~</span>
					<input
						type="month"
						value="{endYear}-{String(endMonth).padStart(2, '0')}"
						on:change={(e) => {
							const [year, month] = e.target.value.split('-');
							endYear = parseInt(year);
							endMonth = parseInt(month);
						}}
						class="rounded border border-gray-300 px-2 py-1 text-xs"
					/>
				</div>

				<!-- 보기 선택 -->
				<div class="flex items-center gap-2">
					<span class="text-xs text-gray-600">보기:</span>
					<label class="flex cursor-pointer items-center gap-1">
						<input
							type="radio"
							bind:group={paymentViewMode}
							value="weekly"
							class="form-radio text-xs"
						/>
						<span class="text-xs">주간</span>
					</label>
					<label class="flex cursor-pointer items-center gap-1">
						<input
							type="radio"
							bind:group={paymentViewMode}
							value="monthly"
							class="form-radio text-xs"
						/>
						<span class="text-xs">월간</span>
					</label>
				</div>

				<!-- 기간 역전 경고 -->
				{#if isDateRangeInvalid}
					<div class="rounded border border-red-200 bg-red-50 px-2 py-1.5">
						<p class="text-xs text-red-700">⚠️ 종료 기간이 시작 기간보다 앞설 수 없습니다.</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- 본문 -->
	<div class="p-3">
		{#if isLoading}
			<div class="flex h-32 items-center justify-center">
				<div class="text-sm text-gray-500">로딩 중...</div>
			</div>
		{:else if rangeData}
			<div class="space-y-3">
				<!-- 안내 메시지 -->
				<div class="rounded border border-yellow-200 bg-yellow-50 px-2 py-1.5">
					<p class="text-xs text-gray-700">💡 각 기간에 등급별 지급액 표시: 지급 금액(인원수)</p>
				</div>

				<!-- 월간 보기 테이블 -->
				{#if paymentViewMode === 'monthly'}
					<div class="grade-table-wrapper">
						<table class="grade-table">
							<thead>
								<tr class="header-row">
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
											<td class="data-col">
												<span class="text-xs"
													>{(Math.floor(gradeData.amount / 100) * 100).toLocaleString()}({gradeData.count})</span
												>
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
											['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].forEach((g) => {
												const data = getGradeDataForPeriod(g, column);
												sum += data.amount;
											});
											return sum;
										})()}
										<td class="data-col">
											<span class="text-xs font-bold"
												>{(Math.floor(totalAmount / 100) * 100).toLocaleString()}({totalCount})</span
											>
										</td>
									{/each}
								</tr>
							</tbody>
						</table>
					</div>
				{/if}

				<!-- 주간 보기 테이블 -->
				{#if paymentViewMode === 'weekly'}
					<div class="grade-table-wrapper">
						<table class="grade-table">
							<thead>
								<!-- 첫 번째 행: 월 -->
								<tr class="header-row-1">
									<th rowspan="2" class="sticky-col">등급</th>
									{#each monthGroups as group}
										<th colspan={group.weeks.length} class="month-header">{group.monthLabel}</th>
									{/each}
								</tr>
								<!-- 두 번째 행: 주차 -->
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
											<td class="data-col">
												<span class="text-xs"
													>{(Math.floor(gradeData.amount / 100) * 100).toLocaleString()}({gradeData.count})</span
												>
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
											['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'].forEach((g) => {
												const data = getGradeDataForPeriod(g, column);
												sum += data.amount;
											});
											return sum;
										})()}
										<td class="data-col">
											<span class="text-xs font-bold"
												>{(Math.floor(totalAmount / 100) * 100).toLocaleString()}({totalCount})</span
											>
										</td>
									{/each}
								</tr>
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{:else}
			<div class="py-8 text-center text-sm text-gray-500">데이터를 불러오는 중...</div>
		{/if}
	</div>
</div>

<style>
	/* 모바일 최적화된 테이블 스타일 */
	.grade-table-wrapper {
		overflow-x: auto;
		border: 1px solid #d1d5db;
		background: white;
		position: relative;
		-webkit-overflow-scrolling: touch;
	}

	.grade-table {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		min-width: max-content;
		font-size: 0.75rem;
	}

	.grade-table th,
	.grade-table td {
		border-right: 1px solid #d1d5db;
		border-bottom: 1px solid #d1d5db;
		padding: 0.375rem 0.5rem;
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
		min-width: 60px;
		width: 60px;
	}

	.header-row .sticky-col {
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
	.header-row {
		background: #f3f4f6;
		font-weight: bold;
	}

	.header-row-1 .sticky-col {
		background: #f3f4f6 !important;
		z-index: 20;
	}

	.period-header {
		background: #dbeafe;
		text-align: center;
		font-size: 0.7rem;
		min-width: 80px;
	}

	/* 2단 헤더 (주간 보기) */
	.header-row-1 {
		background: #f3f4f6;
		font-weight: bold;
	}

	.header-row-2 {
		background: #f3f4f6;
		font-weight: bold;
	}

	.month-header {
		background: #dbeafe;
		text-align: center;
		font-size: 0.7rem;
		border-bottom: 1px solid #d1d5db;
	}

	.week-header {
		background: #e0f2fe;
		text-align: center;
		font-size: 0.65rem;
		min-width: 60px;
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

	/* 모바일 스크롤바 */
	.grade-table-wrapper::-webkit-scrollbar {
		height: 6px;
	}

	.grade-table-wrapper::-webkit-scrollbar-track {
		background: #f1f1f1;
	}

	.grade-table-wrapper::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 3px;
	}

	.grade-table-wrapper::-webkit-scrollbar-thumb:hover {
		background: #555;
	}
</style>
