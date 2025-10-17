<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	let paymentViewMode = 'monthly'; // 'monthly' | 'weekly'

	// 기간 선택 (기본값: 현재 달)
	let currentDate = new Date();
	let startYear = currentDate.getFullYear();
	let startMonth = currentDate.getMonth() + 1;
	let endYear = currentDate.getFullYear();
	let endMonth = currentDate.getMonth() + 1;

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

			console.log(`[PaymentStatisticsCard] loadData: ${startMonthKey} ~ ${endMonthKey}, viewMode: ${paymentViewMode}`);

			const response = await fetch(`/api/admin/revenue/range?start=${startMonthKey}&end=${endMonthKey}&viewMode=${paymentViewMode}`);
			if (response.ok) {
				const data = await response.json();
				console.log('[PaymentStatisticsCard] API Response:', data);
				console.log('[PaymentStatisticsCard] viewMode:', data?.viewMode);

				// 월간 모드인 경우 모든 월 생성
				if (data.viewMode === 'monthly' && paymentViewMode === 'monthly') {
					console.log(`[PaymentStatisticsCard] API returned ${data.monthlyData?.length || 0} months`);

					// 선택한 기간의 모든 월 생성
					const allMonths = [];
					let currentYear = startYear;
					let currentMonth = startMonth;

					while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
						const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

						// API에서 받은 데이터 중 해당 월 찾기
						const existingMonth = (data.monthlyData || []).find(m => m.monthKey === monthKey);

						if (existingMonth) {
							console.log(`[PaymentStatisticsCard] ${monthKey}: 데이터 있음`);
							allMonths.push(existingMonth);
						} else {
							console.log(`[PaymentStatisticsCard] ${monthKey}: 데이터 없음 (빈 객체 생성)`);
							allMonths.push({
								monthKey,
								registrationCount: 0,
								effectiveRevenue: 0,
								gradeDistribution: {
									F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
								},
								gradePayments: {
									F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
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

					console.log(`[PaymentStatisticsCard] Total generated months: ${allMonths.length}`, allMonths.map(m => m.monthKey));

					rangeData = {
						...data,
						monthlyData: allMonths
					};
				} else {
					// 주간 모드는 그대로
					rangeData = data;
				}

				console.log('[PaymentStatisticsCard] Final rangeData:', rangeData);
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

	// 컬럼 생성 (rangeData가 변경될 때마다 재계산)
	let periodColumns = [];
	$: {
		console.log('[Reactive] rangeData changed:', rangeData);
		periodColumns = generatePeriodColumns();
		console.log('[Reactive] periodColumns updated:', periodColumns.length);
	}

	function generatePeriodColumns() {
		const columns = [];

		console.log('[generatePeriodColumns] rangeData:', rangeData);

		// API 응답이 있으면 사용
		if (rangeData) {
			if (rangeData.viewMode === 'monthly' && rangeData.monthlyData) {
				console.log('[generatePeriodColumns] Processing monthly data, count:', rangeData.monthlyData.length);
				// 월별 데이터
				rangeData.monthlyData.forEach(monthData => {
					columns.push({
						key: monthData.monthKey,
						label: `${monthData.monthKey.split('-')[0]}년 ${parseInt(monthData.monthKey.split('-')[1])}월`,
						type: 'monthly',
						data: monthData
					});
				});
			} else if (rangeData.viewMode === 'weekly' && rangeData.weeklyData) {
				console.log('[generatePeriodColumns] Processing weekly data, count:', rangeData.weeklyData.length);
				// 주차별 데이터
				rangeData.weeklyData.forEach(weekData => {
					columns.push({
						key: `${weekData.monthKey}-W${weekData.week}`,
						label: weekData.weekLabel,
						type: 'weekly',
						monthKey: weekData.monthKey,
						week: weekData.week,
						weekCount: weekData.weekCount,
						data: weekData
					});
				});
			}
		}

		console.log('[generatePeriodColumns] Generated columns:', columns.length);
		return columns;
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

<div class="bg-white shadow-sm rounded-lg overflow-hidden">
	<!-- 헤더 -->
	<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
		<div class="flex flex-col gap-3">
			<h3 class="text-lg font-semibold text-gray-900">📊 등급별 지급 통계</h3>

			<!-- 조회 옵션 -->
			<div class="flex items-center gap-2">
				<span class="text-xs text-gray-600">조회:</span>
				<label class="flex items-center gap-1 cursor-pointer">
					<input type="radio" bind:group={paymentViewMode} value="monthly" class="form-radio text-xs" />
					<span class="text-xs">월간</span>
				</label>
				<label class="flex items-center gap-1 cursor-pointer">
					<input type="radio" bind:group={paymentViewMode} value="weekly" class="form-radio text-xs" />
					<span class="text-xs">주간</span>
				</label>

				<span class="text-gray-400 text-xs mx-2">|</span>

				<input
					type="number"
					bind:value={startYear}
					class="text-xs border border-gray-300 rounded px-2 py-0.5 w-16"
					min="2025"
					max="2030"
				/>
				<span class="text-xs">년</span>
				<select bind:value={startMonth} class="text-xs border border-gray-300 rounded px-1 py-0.5 w-16">
					{#each Array(12) as _, i}
						<option value={i + 1}>{i + 1}월</option>
					{/each}
				</select>
				<span class="text-gray-500 text-xs">~</span>
				<input
					type="number"
					bind:value={endYear}
					class="text-xs border border-gray-300 rounded px-2 py-0.5 w-16"
					min="2025"
					max="2030"
				/>
				<span class="text-xs">년</span>
				<select bind:value={endMonth} class="text-xs border border-gray-300 rounded px-1 py-0.5 w-16">
					{#each Array(12) as _, i}
						<option value={i + 1}>{i + 1}월</option>
					{/each}
				</select>
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
					<p class="text-xs text-gray-700">
						{#if paymentViewMode === 'monthly'}
							💡 월간 뷰: 각 월에 실제 지급되는 인원을 표시합니다 (병행 지급으로 중복 카운트 가능)
						{:else}
							💡 주간 뷰: 각 주차에 실제 지급되는 인원을 표시합니다 (여러 매출월 병행 지급)
						{/if}
					</p>
				</div>

				<!-- 테이블 -->
				<div class="grade-table-wrapper">
					<table class="grade-table">
						<thead>
							<tr class="header-row-1">
								<th rowspan="2" class="sticky-col">등급</th>
								{#if periodColumns.length > 0}
									{#each periodColumns as column}
										<th colspan="1" class="period-header">{column.label}</th>
									{/each}
								{:else}
									<th colspan="1" class="period-header">
										{startYear}년 {startMonth}월
										{#if startYear !== endYear || startMonth !== endMonth}
											~ {endYear}년 {endMonth}월
										{/if}
									</th>
								{/if}
							</tr>
						</thead>
						<tbody>
							{#if periodColumns.length > 0}
								{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
									<tr class="data-row">
										<td class="sticky-col">
											<GradeBadge {grade} size="sm" />
										</td>
										{#each periodColumns as column}
											{@const gradeData = getGradeDataForPeriod(grade, column)}
											<td class="data-col text-center font-semibold">
												{gradeData.amount.toLocaleString()}({gradeData.count})
											</td>
										{/each}
									</tr>
								{/each}
								<tr class="total-row">
									<td class="sticky-col">합계</td>
									{#each periodColumns as column}
										{@const totalCount = column.type === 'monthly'
											? getTotalTargetsForRange(column.data)
											: column.data.userCount || 0}
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
							{:else}
								{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
									<tr class="data-row">
										<td class="sticky-col">
											<GradeBadge {grade} size="sm" />
										</td>
										<td class="data-col text-center text-gray-400 text-xs">
											지급 데이터가 없습니다.
										</td>
									</tr>
								{/each}
								<tr class="total-row">
									<td class="sticky-col">합계</td>
									<td class="data-col text-center text-gray-400 text-xs">지급 데이터가 없습니다.</td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
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
		padding: 0.5rem 0.75rem;
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

	.period-header {
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
