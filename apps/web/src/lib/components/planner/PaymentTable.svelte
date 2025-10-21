<script>
	import { paymentPageFilterState } from '$lib/stores/dashboardStore';
	import Pagination from '$lib/components/Pagination.svelte';

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

	// Store에서 컬럼 표시 설정 가져오기
	$: showTaxColumn = $paymentPageFilterState.showTaxColumn;
	$: showNetColumn = $paymentPageFilterState.showNetColumn;
	$: periodType = $paymentPageFilterState.periodType;

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString();
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
						<th rowspan="2" class="th-base th-sticky-1">성명</th>
						<th rowspan="2" class="th-base">은행</th>
						<th rowspan="2" class="th-base">계좌번호</th>
						{#each weeklyColumns as week}
							{@const colCount = 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)}
							<th colspan={colCount} class="th-week">{week.label}</th>
						{/each}
					</tr>
					<!-- 두 번째 헤더 행 -->
					<tr>
						{#each weeklyColumns as week}
							<th class="th-sub">지급액</th>
							{#if showTaxColumn}
								<th class="th-sub th-tax">원천징수(3.3%)</th>
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
							<tr class="data-row">
								<td class="td-sticky-0">{user.no}</td>
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
								<td class="td-base">{user.bank}</td>
								<td class="td-base">{user.accountNumber}</td>
								{#each weeklyColumns as week}
									{@const key =
										periodType === 'monthly'
											? `month_${week.month}`
											: `${week.year}_${week.month}_${week.week}`}
									{@const payment = user.payments[key]}
									<td
										class="td-amount"
										title={payment?.installmentDetails
											? payment.installmentDetails
													.map((d) => `${d.revenueMonth} ${d.installmentNumber}회차`)
													.join(', ')
											: ''}
									>
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
					{:else}
						<tr>
							<td colspan={5 + weeklyColumns.length * 3} class="empty-state">
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

	.th-tax {
		@apply bg-red-50;
	}

	/* 헤더 - 고정 컬럼 */
	.th-sticky-0 {
		@apply sticky left-0 z-20 min-w-[60px];
	}

	.th-sticky-1 {
		@apply sticky left-[60px] z-[19] min-w-[120px];
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
		@apply sticky left-0 z-10 bg-white;
		@apply border-b border-l border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
	}

	.data-row:hover .td-sticky-0 {
		@apply bg-black/[0.02];
	}

	.td-sticky-1 {
		@apply sticky left-[60px] z-[9] bg-white;
		@apply border-b border-r border-gray-300;
		@apply whitespace-nowrap p-1.5 text-center text-sm;
	}

	.data-row:hover .td-sticky-1 {
		@apply bg-black/[0.02];
	}

	/* 데이터 셀 - 지급액 */
	.td-amount {
		@apply border-b border-r border-gray-300 bg-yellow-100;
		@apply whitespace-nowrap p-1.5 pr-3 text-right text-sm font-bold;
	}

	.data-row:hover .td-amount {
		@apply bg-yellow-200;
	}

	/* 데이터 셀 - 원천징수 */
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

	/* 등급 아이콘 */
	.grade-icon {
		@apply absolute -right-5 -top-1.5 h-5 w-5;
	}
</style>
