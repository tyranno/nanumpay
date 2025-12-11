<script>
	import { paymentPageFilterState } from '$lib/stores/dashboardStore';
	import Pagination from '$lib/components/Pagination.svelte';
	import PaymentDetailModal from './PaymentDetailModal.svelte';
	import { GRADE_LIMITS } from '$lib/utils/constants.js';

	// 모달 상태
	let isModalOpen = false;
	let selectedUserName = '';
	let selectedWeekLabel = '';
	let selectedUserId = '';
	let selectedWeekInfo = null;  // { year, month, week }

	// 등급(회수) 클릭 핸들러 (주별/주간 조회에서만 동작, 월별은 제외)
	function handleGradeInfoClick(user, payment, week) {
		// ⭐ 기능 비활성화 (활성화하려면 아래 return 주석처리)
		return;

		// 월별 조회 시 모달 미표시
		if (periodType === 'monthly') return;

		if (user?.userId && payment?.gradeInfo && payment.gradeInfo !== '-') {
			selectedUserName = user.name;
			selectedWeekLabel = week.label;
			selectedUserId = user.userId;
			selectedWeekInfo = { year: week.year, month: week.month, week: week.week };
			isModalOpen = true;
		}
	}

	// 모달 닫기 핸들러
	function handleModalClose() {
		isModalOpen = false;
		selectedUserName = '';
		selectedWeekLabel = '';
		selectedUserId = '';
		selectedWeekInfo = null;
	}

	// Props
	export let paymentList = [];
	export let filteredPaymentList = [];
	export let weeklyColumns = [];
	export let isLoading = false;
	export let error = '';
	export let currentPage = 1;
	export let totalPages = 1;
	export let totalPaymentTargets = 0;
	export let itemsPerPage = 20;
	export let onPageChange = () => {};
	export let grandTotal = { amount: 0, tax: 0, net: 0 };
	export let weeklyTotals = {}; // 주차별 총계 (API에서 받은 전체 데이터)
	export let monthlyTotals = {}; // 월별 총계 (API에서 받은 전체 데이터)
	export let showPlannerColumn = true; // ⭐ prop으로 받음 (기본값 true)
	export let onPlannerClick = (plannerInfo) => {}; // ⭐ 설계사 클릭 핸들러

	// Store에서 컬럼 표시 설정 가져오기
	$: showGradeInfoColumn = $paymentPageFilterState.showGradeInfoColumn; // ⭐ 신규
	$: showTaxColumn = $paymentPageFilterState.showTaxColumn;
	$: showNetColumn = $paymentPageFilterState.showNetColumn;
	$: showBankColumn = $paymentPageFilterState.showBankColumn;
	$: showAccountColumn = $paymentPageFilterState.showAccountColumn;
	$: periodType = $paymentPageFilterState.periodType;
	$: filterType = $paymentPageFilterState.filterType;

	// Sticky 컬럼 위치 계산: 순번(60) + 유/비(55) + 성명(120) = 235
	$: plannerLeft = 235; // 순번(60) + 유/비(55) + 성명(120) = 235
	$: bankLeft = showPlannerColumn ? 335 : 235; // 설계자 표시 여부에 따라 위치 변경
	$: accountLeft = (showPlannerColumn ? 335 : 235) + (showBankColumn ? 100 : 0); // 설계자+은행 표시 여부에 따라 위치 변경

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString();
	}

	// ⭐ v8.0: 유지 상태 및 비율 계산
	function getInsuranceInfo(user) {
		const gradeLimit = GRADE_LIMITS[user.grade];
		const isRequired = gradeLimit?.insuranceRequired || false;
		const isActive = user.insuranceActive || false;
		const ratio = user.ratio ?? 1;
		return { isRequired, isActive, ratio };
	}

	// 개인별 기간 합산 계산
	function calculateUserTotal(user) {
		let totalAmount = 0;
		let totalTax = 0;
		let totalNet = 0;
		const gradeInfoSet = new Set();

		Object.values(user.payments || {}).forEach(payment => {
			if (payment) {
				totalAmount += payment.amount || 0;
				totalTax += payment.tax || 0;
				totalNet += payment.net || 0;
				
				// gradeInfo 수집
				if (payment.gradeInfo) {
					gradeInfoSet.add(payment.gradeInfo);
				}
			}
		});

		return { 
			totalAmount, 
			totalTax, 
			totalNet,
			gradeInfo: Array.from(gradeInfoSet).join(', ')
		};
	}

	// 주차별/월별 총금액 가져오기 (periodType과 filterType에 따라 다름)
	function getColumnTotal(column) {
		let total;

		// 기간 조회이고 월별 보기일 때만 monthlyTotals 사용
		if (filterType === 'period' && periodType === 'monthly') {
			// 월별 보기: monthlyTotals 사용 (key: "month_10")
			const monthKey = `month_${column.month}`;
			total = monthlyTotals[monthKey];
		} else {
			// 주간 보기 또는 단일 주차: weeklyTotals 사용 (key: "2025-10-4")
			const weekKey = `${column.year}-${column.month}-${column.week}`;
			total = weeklyTotals[weekKey];
		}

		if (total) {
			return {
				totalAmount: total.totalAmount || 0,
				totalTax: total.totalTax || 0,
				totalNet: total.totalNet || 0
			};
		}

		// 없으면 0 반환
		return { totalAmount: 0, totalTax: 0, totalNet: 0 };
	}

	// 현재 페이지의 데이터 가져오기
	function getCurrentPageData() {
		return filteredPaymentList;
	}

	// 페이지 변경
	function goToPage(page) {
		if (page >= 1 && page <= totalPages) {
			onPageChange(page);
		}
	}
</script>

<!-- 테이블 영역 -->
{#if isLoading}
	<div class="loading-state">데이터를 불러오는 중...</div>
{:else if error}
	<div class="error-state">{error}</div>
{:else}
	<div class="relative">
		<!-- 테이블 래퍼 -->
		<div class="table-wrapper">
			<table class="payment-table">
				<thead>
					<!-- 첫 번째 헤더 행 -->
					<tr>
						<th rowspan="2" class="th-base th-sticky-0">순번</th>
						<th rowspan="2" class="th-base th-sticky-ins">유/비</th>
						<th rowspan="2" class="th-base th-sticky-1">성명</th>
						{#if showPlannerColumn}
							<th rowspan="2" class="th-base th-sticky-2">설계자</th>
						{/if}
						{#if showBankColumn}
							<th rowspan="2" class="th-base th-sticky-3" style="left: {bankLeft}px;">은행</th>
						{/if}
						{#if showAccountColumn}
							<th rowspan="2" class="th-base th-sticky-4" style="left: {accountLeft}px;">계좌번호</th>
						{/if}
						{#if filterType === 'period'}
					<th colspan={1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)} class="th-total">기간 합계</th>
				{/if}
				{#each weeklyColumns as week}
					<th colspan={(showGradeInfoColumn ? 1 : 0) + 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)} class="th-week period-border">{week.label}</th>
						{/each}
					</tr>
					<!-- 두 번째 헤더 행 -->
					<tr>
					{#if filterType === 'period'}
				<th class="th-sub th-total-sub">지급액</th>
					{#if showTaxColumn}
						<th class="th-sub th-total-sub th-tax">세지원(3.3%)</th>
					{/if}
					{#if showNetColumn}
						<th class="th-sub th-total-sub">실지급액</th>
					{/if}
				{/if}
				{#each weeklyColumns as week}
					{#if showGradeInfoColumn}
						<th class="th-sub th-grade-info">등급(회수)</th>
					{/if}
					<th class="th-sub{showGradeInfoColumn ? '' : ' period-border'}">지급액</th>
							{#if showTaxColumn}
								<th class="th-sub th-tax">세지원(3.3%)</th>
							{/if}
							{#if showNetColumn}
								<th class="th-sub">실지급액</th>
							{/if}
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if paymentList.length > 0}
						{#each getCurrentPageData() as user}
							{@const userTotal = calculateUserTotal(user)}
							{@const insuranceInfo = getInsuranceInfo(user)}
							<tr class="data-row">
								<td class="td-sticky-0">{user.no}</td>
								<td class="td-sticky-ins">
									<div class="insurance-cell">
										{#if !insuranceInfo.isRequired}
											<span class="insurance-badge insurance-badge-na" title="보험 불필요">-</span>
										{:else if insuranceInfo.isActive}
											<span class="insurance-badge insurance-badge-active" title="보험 유지됨">유</span>
										{:else}
											<span class="insurance-badge insurance-badge-inactive" title="보험 미유지">✕</span>
										{/if}
										<span class="insurance-ratio" class:insurance-ratio-warn={insuranceInfo.isRequired && !insuranceInfo.isActive}>{insuranceInfo.ratio}</span>
									</div>
								</td>
								<td class="td-sticky-1">
									<div class="flex items-center justify-center">
										<div class="relative inline-flex items-baseline">
											{user.name}
											{#if user.grade}
												<img
													src="/icons/{user.grade}.svg"
													alt={user.grade}
													class="grade-icon"
													title="{user.grade} 등급"
												/>
											{/if}
										</div>
									</div>
								</td>
								{#if showPlannerColumn}
									<td class="td-sticky-2">
										{#if user.planner}
											<button
												class="planner-link"
												onclick={() => onPlannerClick({
													plannerAccountId: user.plannerAccountId,
													name: user.planner,
													phone: user.plannerPhone,
													bank: user.plannerBank,
													accountNumber: user.plannerAccountNumber
												})}
											>
												{user.planner}
											</button>
										{:else}
											-
										{/if}
									</td>
								{/if}
								{#if showBankColumn}
									<td class="td-sticky-3" style="left: {bankLeft}px;">{user.bank}</td>
								{/if}
								{#if showAccountColumn}
									<td class="td-sticky-4" style="left: {accountLeft}px;">{user.accountNumber}</td>
								{/if}
								<!-- 기간 합계 (기간 선택일 때만) -->
				{#if filterType === 'period'}
					<td class="td-total">{formatAmount(userTotal.totalAmount)}</td>
					{#if showTaxColumn}
						<td class="td-total td-tax">{formatAmount(userTotal.totalTax)}</td>
					{/if}
					{#if showNetColumn}
						<td class="td-total">{formatAmount(userTotal.totalNet)}</td>
					{/if}
				{/if}
								{#each weeklyColumns as week}
									{@const key =
										filterType === 'period' && periodType === 'monthly'
											? `month_${week.month}`
											: `${week.year}_${week.month}_${week.week}`}
									{@const payment = user.payments[key]}
				{#if showGradeInfoColumn}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<td
						class="td-grade-info"
						title={payment?.installmentDetails
							? payment.installmentDetails.map((d) => `${d.revenueMonth} ${d.week}회차`).join(', ')
							: ''}
						onclick={() => handleGradeInfoClick(user, payment, week)}
					>
						{payment?.gradeInfo || '-'}
					</td>
				{/if}
				<td class="td-amount{showGradeInfoColumn ? '' : ' period-border'}">
					{formatAmount(payment?.amount)}
				</td>
				{#if showTaxColumn}
					<td class="td-tax">{formatAmount(payment?.tax)}</td>
				{/if}
				{#if showNetColumn}
					<td class="td-net">{formatAmount(payment?.net)}</td>
				{/if}
								{/each}
							</tr>
						{/each}

						<!-- 총금액 행 -->
					{@const labelColspan = 3 + (showPlannerColumn ? 1 : 0) + (showBankColumn ? 1 : 0) + (showAccountColumn ? 1 : 0)}
					<tr class="grand-total-row">
						<td colspan={labelColspan} class="grand-total-label">총금액</td>
							<!-- 기간 합계 컬럼 -->
			{#if filterType === 'period'}
				<td class="grand-total-value">{formatAmount(grandTotal.amount)}</td>
				{#if showTaxColumn}
					<td class="grand-total-value grand-total-tax">{formatAmount(grandTotal.tax)}</td>
				{/if}
				{#if showNetColumn}
					<td class="grand-total-value">{formatAmount(grandTotal.net)}</td>
				{/if}
			{/if}
			<!-- 주차별/월별 총계 컬럼 -->
			{#each weeklyColumns as column}
				{@const columnTotal = getColumnTotal(column)}
				{#if showGradeInfoColumn}
					<td class="grand-total-value period-border">-</td>
				{/if}
				<td class="grand-total-value{showGradeInfoColumn ? '' : ' period-border'}">{formatAmount(columnTotal.totalAmount)}</td>
								{#if showTaxColumn}
									<td class="grand-total-value grand-total-tax">{formatAmount(columnTotal.totalTax)}</td>
								{/if}
								{#if showNetColumn}
									<td class="grand-total-value">{formatAmount(columnTotal.totalNet)}</td>
								{/if}
							{/each}
						</tr>
					{:else}
					{@const fixedCols = 3 + (showPlannerColumn ? 1 : 0) + (showBankColumn ? 1 : 0) + (showAccountColumn ? 1 : 0)}
					{@const colsPerWeek = (showGradeInfoColumn ? 1 : 0) + 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)}
					{@const periodCols = filterType === 'period' ? colsPerWeek : 0}
					{@const totalCols = fixedCols + periodCols + weeklyColumns.length * colsPerWeek}
					<tr>
						<td colspan={totalCols} class="empty-state">
							데이터가 없습니다
						</td>
					</tr>
					{/if}
				</tbody>
			</table>
		</div>

		<!-- 페이지네이션 -->
		{#if filteredPaymentList.length > 0}
			<Pagination
				{currentPage}
				{totalPages}
				totalItems={totalPaymentTargets || filteredPaymentList.length}
				{itemsPerPage}
				onPageChange={goToPage}
			/>
		{/if}
	</div>
{/if}

<!-- 지급 상세 모달 -->
<PaymentDetailModal
	isOpen={isModalOpen}
	userName={selectedUserName}
	weekLabel={selectedWeekLabel}
	userId={selectedUserId}
	weekInfo={selectedWeekInfo}
	onClose={handleModalClose}
/>

<style>
	@reference "$lib/../app.css";

	/* 상태 메시지 */
	.loading-state {
		@apply py-10 text-center text-base;
	}

	.error-state {
		@apply py-10 text-center text-base text-red-600;
	}

	.empty-state {
		@apply border-b border-l border-r border-gray-300 bg-white py-10 text-center italic text-gray-600;
	}

	/* 테이블 래퍼 */
	.table-wrapper {
		@apply relative overflow-x-auto border border-gray-300 bg-white;
	}

	.table-wrapper::-webkit-scrollbar {
		@apply h-2.5;
	}

	.table-wrapper::-webkit-scrollbar-track {
		@apply bg-gray-100;
	}

	.table-wrapper::-webkit-scrollbar-thumb {
		@apply rounded bg-gray-400;
	}

	.table-wrapper::-webkit-scrollbar-thumb:hover {
		@apply bg-gray-600;
	}

	/* 테이블 기본 */
	.payment-table {
		@apply w-full min-w-max border-separate border-spacing-0;
	}

	/* 헤더 - 기본 */
	.th-base {
		@apply border-b border-r border-t border-gray-300 bg-gray-200;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	.th-base:first-child {
		@apply border-l;
	}

	/* 헤더 - 기간 합계 */
	.th-total {
		@apply border-b border-r border-t border-gray-300 bg-purple-200;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	/* 헤더 - 주차 */
	.th-week {
		@apply border-b border-r border-t border-gray-300 bg-blue-100;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	/* 헤더 - 서브 */
	.th-sub {
		@apply border-b border-r border-gray-300 bg-gray-200;
		@apply min-w-[100px] whitespace-nowrap p-1.5 text-center text-[13px] font-normal;
	}

	.th-total-sub {
		@apply bg-purple-100;
	}

	.th-tax {
		@apply bg-red-50;
	}

	/* 헤더 - 고정 컬럼 */
	.th-sticky-0 {
		@apply sticky left-0 z-20 min-w-[60px];
	}

	/* 유/비 컬럼 */
	.th-sticky-ins {
		@apply sticky left-[60px] z-[19] min-w-[55px] max-w-[55px] w-[55px];
	}

	.th-sticky-1 {
		@apply sticky left-[115px] z-[18] min-w-[120px];
	}

	.th-sticky-2 {
		@apply sticky left-[235px] z-[17] min-w-[100px];
	}

	.th-sticky-3 {
		@apply sticky left-[335px] z-[16] min-w-[100px];
	}

	.th-sticky-4 {
		@apply sticky left-[435px] z-[15] min-w-[150px];
	}

	/* 데이터 행 */
	.data-row:hover td {
		@apply bg-black/[0.02];
	}

	/* 데이터 셀 - 기본 */
	.td-base {
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
	}

	.td-base:first-child {
		@apply border-l;
	}

	/* 데이터 셀 - 고정 컬럼 */
	.td-sticky-0 {
		@apply sticky left-0 bg-white;
		@apply border-b border-l border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		z-index: 10 !important;
	}

	.data-row:hover .td-sticky-0 {
		background-color: #fafafa !important;
		z-index: 10 !important;
	}

	/* 유/비 데이터 셀 */
	.td-sticky-ins {
		@apply sticky left-[60px] bg-white;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-0.5 text-center text-sm;
		@apply min-w-[55px] max-w-[55px] w-[55px];
		z-index: 9 !important;
	}

	.data-row:hover .td-sticky-ins {
		background-color: #fafafa !important;
		z-index: 9 !important;
	}

	.td-sticky-1 {
		@apply sticky left-[115px] bg-white;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		z-index: 8 !important;
	}

	.data-row:hover .td-sticky-1 {
		background-color: #fafafa !important;
		z-index: 8 !important;
	}

	.td-sticky-2 {
		@apply sticky left-[235px] bg-white;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		z-index: 7 !important;
	}

	.data-row:hover .td-sticky-2 {
		background-color: #fafafa !important;
		z-index: 7 !important;
	}

	.td-sticky-3 {
		@apply sticky left-[335px] bg-white;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		z-index: 6 !important;
	}

	.data-row:hover .td-sticky-3 {
		background-color: #fafafa !important;
		z-index: 6 !important;
	}

	.td-sticky-4 {
		@apply sticky left-[435px] bg-white;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
		z-index: 5 !important;
	}

	.data-row:hover .td-sticky-4 {
		background-color: #fafafa !important;
		z-index: 5 !important;
	}

	/* 데이터 셀 - 지급액 */
	.td-amount {
		@apply border-b border-r border-gray-300 bg-yellow-100;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-amount {
		@apply bg-yellow-200;
	}

	/* 데이터 셀 - 세지원 */
	.td-tax {
		@apply border-b border-r border-gray-300 bg-red-50;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm text-red-600;
	}

	.data-row:hover .td-tax {
		@apply bg-red-100;
	}

	/* 데이터 셀 - 실지급액 */
	.td-net {
		@apply border-b border-r border-gray-300 bg-green-50;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-net {
		@apply bg-green-100;
	}

	/* 데이터 셀 - 기간 합계 */
	.td-total {
		@apply border-b border-r border-gray-300 bg-purple-50;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-total {
		@apply bg-purple-100;
	}

	.td-total.td-tax {
		@apply bg-red-100 text-red-700;
	}

	.data-row:hover .td-total.td-tax {
		@apply bg-red-200;
	}

	/* 등급(회수) 셀 */
	.th-grade-info {
		@apply bg-indigo-100;
		@apply font-semibold text-indigo-800;
		@apply min-w-[80px] max-w-[100px];
		border-left: 2px solid #3b82f6 !important; /* ⭐ 파란색 경계선 (2px) */
	}

	.td-grade-info {
		@apply border-b border-r border-gray-300 bg-indigo-50;
		@apply whitespace-nowrap p-1.5 text-center text-xs;
		@apply text-indigo-700 font-medium;
		border-left: 2px solid #3b82f6 !important; /* ⭐ 파란색 경계선 (2px) */
	}

	.data-row:hover .td-grade-info {
		@apply bg-indigo-100;
	}

	.td-total.td-grade-info {
		@apply bg-purple-50 text-gray-500;
		@apply font-normal;
	}

	.data-row:hover .td-total.td-grade-info {
		@apply bg-purple-100;
	}

	/* 기간 경계선 */
	.period-border {
		border-left: 2px solid #3b82f6 !important; /* ⭐ 파란색 경계선 (2px) */
	}

	/* 등급 아이콘 */
	.grade-icon {
		@apply absolute -right-5 -top-1.5 h-5 w-5;
	}

	/* 기간별 총계 행 */
	.grand-total-row {
		@apply border-t-2 border-gray-400 bg-purple-100;
	}

	.grand-total-label {
		@apply sticky left-0 z-10 bg-purple-200;
		@apply border-b border-l border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm font-bold;
	}

	.grand-total-value {
		@apply border-b border-r border-gray-300 bg-purple-200;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.grand-total-tax {
		@apply bg-red-200 text-red-700;
	}

	/* 클릭 가능한 셀 */
	.clickable-cell {
		@apply cursor-pointer transition-colors;
	}

	.clickable-cell:hover {
		background-color: #fde047 !important; /* yellow-300 */
	}

	/* 유/비 셀 내부 레이아웃 */
	.insurance-cell {
		@apply flex items-center justify-center gap-0.5;
	}

	/* 유지 배지 - 기본 (고정 너비) */
	.insurance-badge {
		@apply inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold flex-shrink-0;
	}

	/* 비율 텍스트 (고정 너비) */
	.insurance-ratio {
		@apply text-[10px] text-gray-600 w-5 text-left tabular-nums;
	}

	.insurance-ratio-warn {
		@apply text-red-500;
	}

	/* 유지됨 (녹색) */
	.insurance-badge-active {
		@apply bg-green-100 text-green-700 border border-green-300;
	}

	/* 미유지 (빨강) */
	.insurance-badge-inactive {
		@apply bg-red-100 text-red-600 border border-red-300;
	}

	/* 불필요 (회색) */
	.insurance-badge-na {
		@apply bg-gray-100 text-gray-400 border border-gray-200;
	}

	/* 설계사 이름 링크 */
	.planner-link {
		@apply text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors;
		@apply bg-transparent border-none p-0 font-normal text-sm;
	}

	/* 모바일에서 sticky 제거 */
	@media (max-width: 768px) {
		.th-sticky-0,
		.th-sticky-ins,
		.th-sticky-1,
		.th-sticky-2,
		.th-sticky-3,
		.th-sticky-4,
		.td-sticky-0,
		.td-sticky-ins,
		.td-sticky-1,
		.td-sticky-2,
		.td-sticky-3,
		.td-sticky-4,
		.grand-total-label {
			position: static !important;
			left: auto !important;
		}
	}
</style>
