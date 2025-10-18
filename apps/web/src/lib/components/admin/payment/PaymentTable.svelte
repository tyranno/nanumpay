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
	<div class="loading">데이터를 불러오는 중...</div>
{:else if error}
	<div class="error">{error}</div>
{:else}
	<div class="table-container">
		<div class="table-wrapper">
			<table class="payment-table">
				<thead>
					<tr class="header-row-1">
						<th rowspan="2" class="sticky-col sticky-col-0">순번</th>
						<th rowspan="2" class="sticky-col sticky-col-1">성명</th>
						<th rowspan="2">설계자</th>
						<th rowspan="2">은행</th>
						<th rowspan="2">계좌번호</th>
						{#each weeklyColumns as week}
							{@const colCount = 1 + (showTaxColumn ? 1 : 0) + (showNetColumn ? 1 : 0)}
							<th colspan={colCount} class="week-header">{week.label}</th>
						{/each}
					</tr>
					<tr class="header-row-2">
						{#each weeklyColumns as week}
							<th class="sub-header">지급액</th>
							{#if showTaxColumn}
								<th class="sub-header tax-header">원천징수(3.3%)</th>
							{/if}
							{#if showNetColumn}
								<th class="sub-header">실지급액</th>
							{/if}
						{/each}
					</tr>
				</thead>
				<tbody>
					{#if paymentList.length > 0}
						{#each getCurrentPageData() as user}
							<tr>
								<td class="sticky-col sticky-col-0">{user.no}</td>
								<td class="sticky-col sticky-col-1">
									<div style="display: flex; align-items: center; justify-content: center;">
										<div style="position: relative; display: inline-flex; align-items: baseline;">
											{user.name}
											{#if user.grade}
												<img src="/icons/{user.grade}.svg" alt="{user.grade}" style="width: 20px; height: 20px; position: absolute; top: -6px; right: -20px;" title="{user.grade} 등급" />
											{/if}
										</div>
									</div>
								</td>
								<td>{user.planner || ''}</td>
								<td>{user.bank}</td>
								<td>{user.accountNumber}</td>
								{#each weeklyColumns as week}
									{@const key = periodType === 'monthly' ? `month_${week.month}` : `${week.year}_${week.month}_${week.week}`}
									{@const payment = user.payments[key]}
									<td
										class="amount-cell"
										title={payment?.installmentDetails
											? payment.installmentDetails
													.map((d) => `${d.revenueMonth} ${d.installmentNumber}회차`)
													.join(', ')
											: ''}
									>
										{formatAmount(payment?.amount)}
									</td>
									{#if showTaxColumn}
										<td class="tax-cell">{formatAmount(payment?.tax)}</td>
									{/if}
									{#if showNetColumn}
										<td class="net-cell">{formatAmount(payment?.net)}</td>
									{/if}
								{/each}
							</tr>
						{/each}
					{:else}
						<tr>
							<td colspan={5 + weeklyColumns.length * 3} class="empty-message">
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
	/* 테이블 컨테이너 */
	.table-container {
		position: relative;
	}

	/* 테이블 영역 */
	.table-wrapper {
		overflow-x: auto;
		border: 1px solid #ddd;
		background: white;
		position: relative;
	}

	.payment-table {
		border-collapse: separate;
		border-spacing: 0;
		width: 100%;
		min-width: max-content;
	}

	.payment-table th,
	.payment-table td {
		border-right: 1px solid #ddd;
		border-bottom: 1px solid #ddd;
		padding: 6px;
		text-align: center;
		white-space: nowrap;
		font-size: 14px;
	}

	.payment-table th:first-child,
	.payment-table td:first-child {
		border-left: 1px solid #ddd;
	}

	.payment-table thead tr:first-child th {
		border-top: 1px solid #ddd;
	}

	/* 고정 컬럼 기본 스타일 */
	.sticky-col {
		position: sticky !important;
		z-index: 10;
		background: white !important;
	}

	.sticky-col-0 {
		left: 0;
		min-width: 60px;
		z-index: 12;
	}

	.sticky-col-1 {
		left: 60px;
		min-width: 80px;
		z-index: 11;
	}

	/* 헤더 스타일 */
	.header-row-1 th {
		background: #e8e8e8;
		font-weight: bold;
	}

	.week-header {
		background: #d0e0f0;
	}

	.header-row-2 th {
		background: #e8e8e8;
		font-weight: normal;
	}

	.sub-header {
		min-width: 100px;
		font-size: 13px;
	}

	.tax-header {
		background: #ffe0e0;
	}

	/* 데이터 셀 스타일 */
	.amount-cell {
		background: #ffffcc;
		font-weight: bold;
		text-align: right;
		padding-right: 12px;
	}

	.tax-cell {
		background: #ffeeee;
		color: #d9534f;
		text-align: right;
		padding-right: 12px;
	}

	.net-cell {
		background: #eeffee;
		font-weight: bold;
		text-align: right;
		padding-right: 12px;
	}

	/* 고정 컬럼 헤더 */
	thead .sticky-col {
		background: #e8e8e8 !important;
		z-index: 20;
	}

	/* 고정 컬럼은 항상 흰색 배경 유지 */
	tbody .sticky-col {
		background: white !important;
	}

	.empty-message {
		text-align: center;
		padding: 40px;
		color: #666;
		font-style: italic;
		background: white;
	}

	.loading,
	.error {
		text-align: center;
		padding: 40px;
		font-size: 16px;
	}

	.error {
		color: #d9534f;
	}

	/* 스크롤바 스타일 */
	.table-wrapper::-webkit-scrollbar {
		height: 10px;
	}

	.table-wrapper::-webkit-scrollbar-track {
		background: #f1f1f1;
	}

	.table-wrapper::-webkit-scrollbar-thumb {
		background: #888;
		border-radius: 4px;
	}

	.table-wrapper::-webkit-scrollbar-thumb:hover {
		background: #555;
	}

	/* 호버 효과 */
	tbody tr:hover td {
		background-color: rgba(0, 0, 0, 0.02);
	}

	tbody tr:hover .amount-cell {
		background: #ffff99;
	}

	tbody tr:hover .tax-cell {
		background: #ffdddd;
	}

	tbody tr:hover .net-cell {
		background: #ddffdd;
	}

	/* 반응형 - 모바일 */
	@media (max-width: 768px) {
		.table-wrapper {
			font-size: 12px;
		}

		.sticky-col-0 {
			min-width: 50px;
		}

		.sticky-col-1 {
			left: 50px;
			min-width: 60px;
		}

		.week-header {
			font-size: 11px;
		}

		.sub-header {
			font-size: 10px;
		}
	}

	/* 아주 작은 화면 (모바일) */
	@media (max-width: 480px) {
		.table-wrapper {
			font-size: 9px;
		}

		.payment-table th,
		.payment-table td {
			padding: 2px;
			font-size: 9px;
		}

		.sticky-col-0 {
			min-width: 30px;
		}

		.sticky-col-1 {
			left: 30px;
			min-width: 45px;
		}

		.week-header {
			font-size: 8px;
			padding: 2px;
		}

		.sub-header {
			font-size: 7px;
			min-width: 45px;
		}

		.amount-cell,
		.tax-cell,
		.net-cell {
			font-size: 8px;
			padding-right: 2px;
		}

		.loading,
		.error {
			padding: 20px;
			font-size: 11px;
		}

		.empty-message {
			padding: 20px;
			font-size: 10px;
		}
	}
</style>