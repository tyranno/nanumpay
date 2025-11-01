<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import RevenueAdjustModal from './RevenueAdjustModal.svelte';

	let viewMode = 'single'; // 'single' | 'range'

	// 단일 월 선택
	let currentDate = new Date();
	let selectedYear = currentDate.getFullYear();
	let selectedMonth = currentDate.getMonth() + 1;

	// 기간 선택
	let startYear = currentDate.getFullYear();
	let startMonth = currentDate.getMonth() + 1;
	let endYear = currentDate.getFullYear();
	let endMonth = currentDate.getMonth() + 1;

	// 데이터
	let monthlyData = null; // 단일 월 데이터
	let rangeData = null; // 기간 데이터
	let isLoading = false;

	// 모달 상태
	let showRevenueModal = false;
	let modalMonthKey = null;

	onMount(() => {
		loadData();
	});

	$: if (browser && viewMode === 'single' && selectedYear && selectedMonth) {
		loadData();
	}

	$: if (browser && viewMode === 'range' && startYear && startMonth && endYear && endMonth) {
		loadRangeData();
	}

	// paymentViewMode 변경 시 데이터 다시 로드
	$: if (browser && viewMode === 'range' && paymentViewMode) {
		loadRangeData();
	}

	// ⭐ 단일 월에서도 paymentViewMode 변경 시 데이터 다시 로드
	$: if (browser && viewMode === 'single' && paymentViewMode) {
		loadData();
	}

	async function loadData() {
		try {
			isLoading = true;
			const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

			// ⭐ 주간 뷰 선택 시 range API 호출
			if (paymentViewMode === 'weekly') {
				const response = await fetch(`/api/admin/revenue/range?start=${monthKey}&end=${monthKey}&viewMode=weekly`);
				if (response.ok) {
					rangeData = await response.json();
					monthlyData = null; // 월간 데이터는 초기화
				} else {
					console.error('Failed to load weekly data');
					rangeData = null;
				}
			} else {
				// 월간 뷰는 기존대로
				const response = await fetch(`/api/admin/revenue/monthly?monthKey=${monthKey}`);
				if (response.ok) {
					monthlyData = await response.json();
					rangeData = null; // 기간 데이터는 초기화
				} else {
					console.error('Failed to load monthly data');
					monthlyData = null;
				}
			}
		} catch (error) {
			console.error('Error loading data:', error);
			monthlyData = null;
			rangeData = null;
		} finally {
			isLoading = false;
		}
	}

	async function loadRangeData() {
		try {
			isLoading = true;
			const startMonthKey = `${startYear}-${String(startMonth).padStart(2, '0')}`;
			const endMonthKey = `${endYear}-${String(endMonth).padStart(2, '0')}`;
			const response = await fetch(`/api/admin/revenue/range?start=${startMonthKey}&end=${endMonthKey}&viewMode=${paymentViewMode}`);
			if (response.ok) {
				rangeData = await response.json();
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

	function openRevenueModal() {
		const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
		modalMonthKey = monthKey;
		showRevenueModal = true;
	}

	function closeRevenueModal() {
		showRevenueModal = false;
		modalMonthKey = null;
	}

	async function handleRevenueAdjusted() {
		closeRevenueModal();
		await loadData();
	}

	// 지급 대상자 총계 계산
	function getTotalTargets(data) {
		if (!data || !data.paymentTargets) return 0;
		return (
			(data.paymentTargets.registrants?.length || 0) +
			(data.paymentTargets.promoted?.length || 0) +
			(data.paymentTargets.additionalPayments?.length || 0)
		);
	}

	// 등급별 총 지급 예정액 계산 (10회분)
	function getTotalPaymentForGrade(grade, count, monthlyData) {
		if (!monthlyData || !monthlyData.gradePayments) return 0;
		const perInstallment = monthlyData.gradePayments[grade] || 0;
		return perInstallment * 10 * count;
	}

	// 등급별 인원 통계 (등록자/승급자/추가지급)
	function getGradeBreakdown(grade, monthlyData) {
		if (!monthlyData || !monthlyData.paymentTargets) {
			return { registrants: 0, promoted: 0, additional: 0, total: 0 };
		}

		const registrants = (monthlyData.paymentTargets.registrants || [])
			.filter(r => r.grade === grade).length;
		const promoted = (monthlyData.paymentTargets.promoted || [])
			.filter(p => p.grade === grade).length;
		const additional = (monthlyData.paymentTargets.additionalPayments || [])
			.filter(a => a.grade === grade).length;

		return {
			registrants,
			promoted,
			additional,
			total: registrants + promoted + additional
		};
	}

	// 지급 통계 뷰 모드 (weekly/monthly)
	let paymentViewMode = 'monthly'; // 'weekly' | 'monthly'
	let periodColumns = [];

	// 반응형 컬럼 생성 (명시적 의존성)
	$: {
		// ⭐ 단일 월 + 주간 뷰도 컬럼 생성
		if (viewMode === 'single' && paymentViewMode === 'weekly') {
			periodColumns = generatePeriodColumns('range', paymentViewMode, selectedYear, selectedMonth, selectedYear, selectedMonth, rangeData);
		} else {
			periodColumns = generatePeriodColumns(viewMode, paymentViewMode, startYear, startMonth, endYear, endMonth, rangeData);
		}
		console.log('[GradePaymentCard] periodColumns 생성:', periodColumns.length, '개', periodColumns);
	}

	// 기간 선택 시 주차/월별 컬럼 생성
	function generatePeriodColumns(_viewMode, _paymentViewMode, _startYear, _startMonth, _endYear, _endMonth, _rangeData) {
		if (_viewMode !== 'range' && !(_paymentViewMode === 'weekly')) return [];

		const columns = [];

		// API 응답이 있으면 사용
		if (_rangeData) {
			if (_rangeData.viewMode === 'monthly' && _rangeData.monthlyData) {
				// 월별 데이터 (API에서 받은 데이터 사용)
				_rangeData.monthlyData.forEach(monthData => {
					columns.push({
						key: monthData.monthKey,
						label: `${monthData.monthKey.split('-')[0]}년 ${parseInt(monthData.monthKey.split('-')[1])}월`,
						type: 'monthly',
						data: monthData
					});
				});
			} else if (_rangeData.viewMode === 'weekly' && _rangeData.weeklyData) {
				// 주차별 데이터 (API에서 받은 데이터 사용)
				_rangeData.weeklyData.forEach(weekData => {
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

			// API에서 데이터를 받았으면 그대로 반환
			if (columns.length > 0) return columns;
		}

		// 데이터가 없으면 빈 컬럼 구조 생성
		let currentYear = _startYear;
		let currentMonth = _startMonth;

		while (currentYear < _endYear || (currentYear === _endYear && currentMonth <= _endMonth)) {
			const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

			columns.push({
				key: monthKey,
				label: `${currentYear}년 ${currentMonth}월`,
				type: 'monthly',
				data: {
					monthKey: monthKey,
					gradeDistribution: {},
					gradePayments: {},
					effectiveRevenue: 0
				}
			});

			currentMonth++;
			if (currentMonth > 12) {
				currentMonth = 1;
				currentYear++;
			}
		}

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

	// 기간 데이터의 총 대상자 수
	function getTotalTargetsForRange(monthData) {
		if (!monthData || !monthData.gradeDistribution) return 0;
		return Object.values(monthData.gradeDistribution).reduce((sum, count) => sum + count, 0);
	}
</script>

<div class="bg-white shadow-sm rounded-lg overflow-hidden">
	<!-- 헤더 -->
	<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
		<div class="flex flex-col gap-3">
			<h3 class="text-lg font-semibold text-gray-900">📊 월별 매출 및 등급 통계</h3>

			<!-- 조회 옵션 -->
			<div class="flex items-center gap-2">
				<label class="flex items-center gap-1 cursor-pointer">
					<input type="radio" bind:group={viewMode} value="single" class="form-radio text-xs" />
					<span class="text-xs">월간</span>
				</label>
				{#if viewMode === 'single'}
					<input
						type="number"
						bind:value={selectedYear}
						class="text-xs border border-gray-300 rounded px-2 py-0.5 w-16"
						min="2025"
						max="2030"
					/>
					<span class="text-xs">년</span>
					<select bind:value={selectedMonth} class="text-xs border border-gray-300 rounded px-1 py-0.5 w-16">
						{#each Array(12) as _, i}
							<option value={i + 1}>{i + 1}월</option>
						{/each}
					</select>
				{/if}

				<span class="text-gray-400 text-xs">|</span>

				<label class="flex items-center gap-1 cursor-pointer">
					<input type="radio" bind:group={viewMode} value="range" class="form-radio text-xs" />
					<span class="text-xs">기간</span>
				</label>
				{#if viewMode === 'range'}
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
		{:else if monthlyData || rangeData}
			<div class="space-y-4">
				<!-- 기간 표시 -->
				<div class="border-b border-gray-300 pb-2">
					<h4 class="text-base font-semibold text-gray-900">
						{#if viewMode === 'single'}
							{selectedYear}년 {selectedMonth}월 현황
						{:else}
							조회 기간: {startYear}년 {startMonth}월 ~ {endYear}년 {endMonth}월
						{/if}
					</h4>
				</div>

				<!-- 매출 정보 (한 줄) -->
				<div class="border border-gray-300 rounded-lg bg-blue-50 px-4 py-3">
					<div class="flex items-center justify-between">
						<h5 class="text-sm font-semibold text-gray-900">📈 매출 정보</h5>
						{#if viewMode === 'single' && paymentViewMode === 'monthly' && monthlyData}
							<div class="flex items-center gap-4">
								<div class="flex items-center gap-2">
									<span class="text-xs text-gray-600">자동 매출:</span>
									<span class="font-semibold text-sm">{(monthlyData.totalRevenue || 0).toLocaleString()}원</span>
									<span class="text-gray-500 text-xs">(등록자 {monthlyData.registrationCount || 0}명)</span>
								</div>
								<span class="text-gray-400">|</span>
								<div class="flex items-center gap-2">
									<span class="text-xs text-gray-600">수동 매출:</span>
									{#if monthlyData.isManualRevenue}
										<span class="font-semibold text-orange-600 text-sm">
											{(monthlyData.adjustedRevenue || 0).toLocaleString()}원
										</span>
										<span class="text-xs text-gray-500">
											({new Date(monthlyData.revenueModifiedAt).toLocaleDateString()})
										</span>
									{:else}
										<span class="text-gray-400 text-xs">설정 안 됨</span>
									{/if}
								</div>
								<span class="text-gray-400">|</span>
								<div class="flex items-center gap-2">
									<span class="text-xs text-gray-900 font-semibold">적용 매출:</span>
									<span class="font-bold text-blue-900 text-base">
										{(monthlyData.effectiveRevenue || 0).toLocaleString()}원
									</span>
								</div>
								<button
									onclick={openRevenueModal}
									class="ml-2 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition"
								>
									수동 설정
								</button>
							</div>
						{:else if viewMode === 'single' && paymentViewMode === 'weekly' && rangeData}
							<!-- 단일 월 + 주간 뷰: 주차 정보만 표시 -->
							<div class="flex items-center gap-2">
								<span class="text-xs text-gray-900 font-semibold">주간 지급 통계</span>
								<span class="text-gray-500 text-xs">(총 {periodColumns.length}주차)</span>
							</div>
						{:else if rangeData}
							<!-- 기간 선택 시: 총합 표시 -->
							<div class="flex items-center gap-2">
								<span class="text-xs text-gray-900 font-semibold">기간 매출 총합:</span>
								<span class="font-bold text-blue-900 text-base">
									{(rangeData?.totalRevenue || 0).toLocaleString()}원
								</span>
								<span class="text-gray-500 text-xs">(총 등록자 {rangeData?.totalRegistrants || 0}명)</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- 등급별 인원 및 지급액 통계 -->
				<div>
					<div class="flex items-center justify-between mb-2">
						<h5 class="text-sm font-semibold text-gray-700">
							📊 등급별 인원 통계
						</h5>
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
						</div>
					</div>
					<div class="grade-table-wrapper">
						<table class="grade-table">
							<thead>
								{#if viewMode === 'single' && paymentViewMode === 'monthly'}
									<!-- 단일 월 + 월간 뷰 -->
									<tr class="header-row">
										<th class="sticky-col">등급</th>
										<th class="data-col">인원</th>
										<th class="data-col">월 총액</th>
									</tr>
								{:else}
									<!-- 주간 뷰 또는 기간 선택 시 -->
									<tr class="header-row-1">
										<th rowspan="2" class="sticky-col">등급</th>
										<th rowspan="2" class="sticky-col-total">총액</th>
										{#each periodColumns as column}
											<th colspan="2" class="period-header">{column.label}</th>
										{/each}
									</tr>
									<tr class="header-row-2">
										{#each periodColumns as column}
											<th class="sub-header">인원</th>
											<th class="sub-header">총액</th>
										{/each}
									</tr>
								{/if}
							</thead>
							<tbody>
								{#if viewMode === 'single' && paymentViewMode === 'monthly' && monthlyData}
									<!-- 단일 월 + 월간 뷰 -->
									{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
										{@const breakdown = getGradeBreakdown(grade, monthlyData)}
										{@const perInstallment = monthlyData.gradePayments?.[grade] || 0}
										{@const amount = perInstallment * 10 * breakdown.total}
										<tr class="data-row">
											<td class="sticky-col">
												<GradeBadge {grade} size="sm" />
											</td>
											<td class="data-col text-center font-semibold">
												{breakdown.total}
											</td>
											<td class="data-col text-right text-blue-600">
												{amount.toLocaleString()}
											</td>
										</tr>
									{/each}
									<tr class="total-row">
										<td class="sticky-col">합계</td>
										<td class="data-col text-center">
											{getTotalTargets(monthlyData)}
										</td>
										<td class="data-col text-right text-blue-900">
											{monthlyData.effectiveRevenue.toLocaleString()}
										</td>
									</tr>
								{:else}
									<!-- 주간 뷰 또는 기간 선택 시 -->
									{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
										{@const gradeTotalAmount = periodColumns.reduce((sum, column) => {
											const gradeData = getGradeDataForPeriod(grade, column);
											return sum + gradeData.amount;
										}, 0)}
										<tr class="data-row">
											<td class="sticky-col">
												<GradeBadge {grade} size="sm" />
											</td>
											<td class="sticky-col-total text-right text-blue-900 font-bold">
												{gradeTotalAmount.toLocaleString()}
											</td>
											{#each periodColumns as column}
												{@const gradeData = getGradeDataForPeriod(grade, column)}
												<td class="data-col text-center font-semibold">
													{gradeData.count}
												</td>
												<td class="data-col text-right text-blue-600">
													{gradeData.amount.toLocaleString()}
												</td>
											{/each}
										</tr>
									{/each}
									<tr class="total-row">
										<td class="sticky-col">합계</td>
										{@const grandTotalAmount = periodColumns.reduce((sum, column) => {
											const totalAmount = column.type === 'monthly'
												? column.data.effectiveRevenue || 0
												: column.data.totalAmount || 0;
											return sum + totalAmount;
										}, 0)}
										<td class="sticky-col-total text-right text-blue-900 font-bold">
											{grandTotalAmount.toLocaleString()}
										</td>
										{#each periodColumns as column}
											{@const totalCount = column.type === 'monthly'
												? getTotalTargetsForRange(column.data)
												: column.data.userCount || 0}
											{@const totalAmount = column.type === 'monthly'
												? column.data.effectiveRevenue || 0
												: column.data.totalAmount || 0}
											<td class="data-col text-center">
												{totalCount}
											</td>
											<td class="data-col text-right text-blue-900">
												{totalAmount.toLocaleString()}
											</td>
										{/each}
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{:else}
			<div class="text-center text-gray-500 py-8">
				데이터가 없습니다
			</div>
		{/if}
	</div>
</div>

<!-- 매출 수동 설정 모달 -->
{#if showRevenueModal && modalMonthKey}
	<RevenueAdjustModal
		monthKey={modalMonthKey}
		currentData={monthlyData}
		on:close={closeRevenueModal}
		on:adjusted={handleRevenueAdjusted}
	/>
{/if}

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

	.header-row .sticky-col {
		background: #f3f4f6 !important;
		z-index: 20;
	}

	.total-row .sticky-col {
		background: #f3f4f6 !important;
		font-weight: bold;
	}

	/* 고정 컬럼 (총액) */
	.sticky-col-total {
		position: sticky !important;
		left: 80px;
		z-index: 10;
		background: white !important;
		font-weight: 600;
		min-width: 120px;
		width: 120px;
	}

	.header-row-1 .sticky-col-total {
		background: #f3f4f6 !important;
		z-index: 20;
	}

	.total-row .sticky-col-total {
		background: #f3f4f6 !important;
		font-weight: bold;
	}

	.data-row:hover .sticky-col-total {
		background: #f9fafb !important;
	}

	/* 데이터 컬럼 */
	.data-col {
		min-width: 100px;
	}

	/* 헤더 */
	.header-row {
		background: #f3f4f6;
		font-weight: bold;
	}

	.header-row-1 {
		background: #f3f4f6;
		font-weight: bold;
	}

	.header-row-1 .sticky-col {
		background: #f3f4f6 !important;
		z-index: 20;
	}

	.header-row-2 {
		background: #f3f4f6;
		font-weight: normal;
	}

	.period-header {
		background: #dbeafe;
		text-align: center;
	}

	.sub-header {
		min-width: 80px;
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
