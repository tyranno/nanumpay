<script>
	import { onMount } from 'svelte';
	import { paymentPageFilterState } from '$lib/stores/dashboardStore';
	import { plannerPaymentService } from '$lib/services/plannerPaymentService';
	import PaymentHeader from '$lib/components/planner/PaymentHeader.svelte';
	import PaymentTable from '$lib/components/planner/PaymentTable.svelte';

	// 설계사 정보 상태
	let plannerInfo = null;
	let contractStats = null;
	let paymentSummary = null;
	let isEditingPhone = false;
	let newPhone = '';

	// 지급명부 상태 변수
	let paymentList = [];
	let filteredPaymentList = [];
	let weeklyColumns = [];
	let isLoading = false;
	let error = '';
	let currentPage = 1;
	let totalPages = 1;
	let totalPaymentTargets = 0;
	let apiGrandTotal = null;
	let weeklyTotals = {};
	let monthlyTotals = {};

	// Store 구독
	$: filterState = $paymentPageFilterState;

	// 데이터 로드
	async function loadPaymentData(page = 1) {
		isLoading = true;
		error = '';
		currentPage = page;

		try {
			const result = await plannerPaymentService.loadPaymentData({
				filterType: filterState.filterType,
				selectedDate: filterState.selectedDate,
				selectedYear: filterState.selectedYear,
				selectedMonth: filterState.selectedMonth,
				startYear: filterState.startYear,
				startMonth: filterState.startMonth,
				endYear: filterState.endYear,
				endMonth: filterState.endMonth,
				page,
				limit: filterState.itemsPerPage,
				searchQuery: filterState.searchQuery,
				searchCategory: filterState.searchCategory,
				periodType: filterState.periodType
			});

			paymentList = result.paymentList;
			filteredPaymentList = result.paymentList;
			weeklyColumns = result.weeklyColumns;
			totalPages = result.totalPages;
			totalPaymentTargets = result.totalPaymentTargets;
			apiGrandTotal = result.apiGrandTotal;
			weeklyTotals = result.weeklyTotals || {};
			monthlyTotals = result.monthlyTotals || {};
		} catch (err) {
			console.error('Error loading payment data:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	// 페이지 변경
	function goToPage(page) {
		if (page >= 1 && page <= totalPages) {
			loadPaymentData(page);
		}
	}

	// 검색 핸들러
	function handleSearch() {
		loadPaymentData(1);
	}

	// 페이지당 항목 수 변경
	function handleItemsPerPageChange() {
		loadPaymentData(1);
	}

	// 필터 타입 변경
	function handleFilterTypeChange() {
		loadPaymentData();
	}

	// 기간 변경
	function handlePeriodChange() {
		if (filterState.filterType === 'period') {
			loadPaymentData(1);
		}
	}

	// grandTotal을 reactive 변수로 계산
	$: grandTotal = apiGrandTotal ? {
		amount: apiGrandTotal.totalAmount || 0,
		tax: apiGrandTotal.totalTax || 0,
		net: apiGrandTotal.totalNet || 0
	} : { amount: 0, tax: 0, net: 0 };

	// 금액 포맷
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString() + '원';
	}

	// 엑셀 다운로드
	async function handleExcelExport() {
		try {
			const { PaymentExcelExporter } = await import('$lib/utils/paymentExcelExporter.js');

			const exporter = new PaymentExcelExporter({
				filterType: filterState.filterType,
				selectedDate: filterState.selectedDate,
				startYear: filterState.startYear,
				startMonth: filterState.startMonth,
				endYear: filterState.endYear,
				endMonth: filterState.endMonth,
				periodType: filterState.periodType,
				showTaxColumn: filterState.showTaxColumn,
				showNetColumn: filterState.showNetColumn,
				searchQuery: filterState.searchQuery,
				searchCategory: filterState.searchCategory,
				plannerName: plannerInfo?.name || '',
				isPlanner: true
			});

			await exporter.export(filteredPaymentList, weeklyColumns, apiGrandTotal);
		} catch (err) {
			console.error('엑셀 내보내기 오류:', err);
			alert('엑셀 파일 생성 중 오류가 발생했습니다.');
		}
	}

	// 전화번호 업데이트
	async function updatePhone() {
		try {
			const response = await fetch('/api/planner/update-phone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phone: newPhone })
			});

			if (response.ok) {
				plannerInfo.phone = newPhone;
				isEditingPhone = false;
				alert('전화번호가 수정되었습니다.');
			} else {
				alert('전화번호 수정에 실패했습니다.');
			}
		} catch (error) {
			console.error('전화번호 수정 오류:', error);
			alert('전화번호 수정 중 오류가 발생했습니다.');
		}
	}

	function cancelEditPhone() {
		newPhone = plannerInfo?.phone || '';
		isEditingPhone = false;
	}

	onMount(async () => {
		// 설계사 기본 정보 로드
		const [infoRes, statsRes, summaryRes] = await Promise.all([
			fetch('/api/planner/info'),
			fetch('/api/planner/contract-stats'),
			fetch('/api/planner/payment-summary')
		]);

		if (infoRes.ok) plannerInfo = await infoRes.json();
		if (statsRes.ok) contractStats = await statsRes.json();
		if (summaryRes.ok) paymentSummary = await summaryRes.json();

		if (plannerInfo) {
			newPhone = plannerInfo.phone || '';
		}

		// 지급명부 데이터 로드
		loadPaymentData();
	});
</script>

<svelte:head>
	<title>설계사 대시보드</title>
</svelte:head>

<div class="container">
	<!-- 카드 1 & 2: 설계사 정보 + 용역비 총액 -->
	<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
		<!-- 카드 1: 설계사 정보 -->
		<div class="rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 p-3 shadow-md">
			<div class="mb-2 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<img src="/icons/user.svg" alt="설계사" class="h-5 w-5 text-indigo-700" />
					<h3 class="text-base font-bold text-indigo-900">설계사 정보</h3>
				</div>
			</div>

			<div class="rounded border border-indigo-200 bg-indigo-50 p-2">
				<div class="mb-2 flex items-center justify-between border-b border-indigo-200 pb-2">
					<span class="text-xs font-semibold text-indigo-700">이름</span>
					<span class="text-sm font-medium text-indigo-900">{plannerInfo?.name || '-'}</span>
				</div>
				<div class="mb-2 flex items-center justify-between border-b border-indigo-200 pb-2">
					<span class="text-xs font-semibold text-indigo-700">전화번호</span>
					{#if isEditingPhone}
						<div class="flex gap-1">
							<input
								type="tel"
								bind:value={newPhone}
								class="w-32 rounded border border-indigo-300 px-2 py-1 text-xs"
								placeholder="010-0000-0000"
							/>
							<button
								onclick={updatePhone}
								class="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
							>
								저장
							</button>
							<button
								onclick={cancelEditPhone}
								class="rounded bg-gray-400 px-2 py-1 text-xs text-white hover:bg-gray-500"
							>
								취소
							</button>
						</div>
					{:else}
						<div class="flex items-center gap-1">
							<span class="text-sm font-medium text-indigo-900">{plannerInfo?.phone || '-'}</span>
							<button
								onclick={() => (isEditingPhone = true)}
								class="rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
							>
								수정
							</button>
						</div>
					{/if}
				</div>
				<div class="flex items-center justify-between">
					<span class="text-xs font-semibold text-indigo-700">총 계약 건수</span>
					<span class="text-lg font-bold text-indigo-900">{contractStats?.totalContracts || 0}건</span>
				</div>
			</div>
		</div>

		<!-- 카드 2: 용역비 총액 -->
		<div class="rounded-lg bg-gradient-to-br from-green-50 to-emerald-100 p-3 shadow-md">
			<div class="mb-2 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<img src="/icons/money.svg" alt="용역비" class="h-5 w-5 text-emerald-700" />
					<h3 class="text-base font-bold text-emerald-900">용역비 총액</h3>
				</div>
			</div>

			<div class="rounded border border-emerald-200 bg-emerald-50 p-2">
				<div class="mb-2 flex items-center justify-between border-b border-emerald-200 pb-2">
					<span class="text-xs font-semibold text-emerald-700">지급액</span>
					<span class="text-sm font-medium text-emerald-900">{formatAmount(paymentSummary?.totalAmount)}</span>
				</div>
				<div class="mb-2 flex items-center justify-between border-b border-emerald-200 pb-2">
					<span class="text-xs font-semibold text-emerald-700">원천징수</span>
					<span class="text-sm font-medium text-emerald-900">{formatAmount(paymentSummary?.totalTax)}</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-xs font-semibold text-emerald-700">실수령액</span>
					<span class="text-lg font-bold text-emerald-900">{formatAmount(paymentSummary?.totalNet)}</span>
				</div>
			</div>
		</div>
	</div>

	<!-- 카드 3: 용역비 지급명부 -->
	<div class="rounded-lg bg-white p-4 shadow-md">
		<h2 class="mb-3 text-lg font-bold text-gray-900">용역비 지급명부</h2>

		<PaymentHeader
			{isLoading}
			isProcessingPast={false}
			{grandTotal}
			{totalPaymentTargets}
			hasData={filteredPaymentList.length > 0}
			onFilterChange={handleFilterTypeChange}
			onPeriodChange={handlePeriodChange}
			onDateChange={() => loadPaymentData()}
			onSearch={handleSearch}
			onItemsPerPageChange={handleItemsPerPageChange}
			onExport={handleExcelExport}
			hidePastProcessButton={true}
			hideExportButton={false}
			onProcessPast={() => {}}
		/>

		<PaymentTable
			{paymentList}
			{filteredPaymentList}
			{weeklyColumns}
			{isLoading}
			{error}
			{currentPage}
			{totalPages}
			{totalPaymentTargets}
			itemsPerPage={filterState.itemsPerPage}
			onPageChange={goToPage}
			{grandTotal}
			{weeklyTotals}
			{monthlyTotals}
		/>
	</div>
</div>

<style>
	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
