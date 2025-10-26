<script>
	import { onMount } from 'svelte';

	let commissionSummary = [];
	let commissionGrandTotal = { totalCommission: 0, totalUsers: 0, totalRevenue: 0 };

	const currentDate = new Date();
	const currentYear = currentDate.getFullYear();
	const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
	let commissionStartMonth = `${currentYear}-${currentMonth}`;
	let commissionEndMonth = `${currentYear}-${currentMonth}`;

	function formatAmount(value) {
		if (value === null || value === undefined) return '0원';
		return value.toLocaleString('ko-KR') + '원';
	}

	async function loadCommissionData() {
		try {
			const [startYear, startMonth] = commissionStartMonth.split('-');
			const [endYear, endMonth] = commissionEndMonth.split('-');

			const params = new URLSearchParams({
				startYear,
				startMonth,
				endYear,
				endMonth
			});

			const response = await fetch(`/api/planner/commission-summary?${params}`);
			const result = await response.json();

			if (result.success) {
				commissionSummary = result.data || [];
				commissionGrandTotal = result.grandTotal || { totalCommission: 0, totalUsers: 0, totalRevenue: 0 };
			}
		} catch (error) {
			console.error('수당 내역 로드 오류:', error);
		}
	}

	function handlePeriodChange() {
		loadCommissionData();
	}

	onMount(() => {
		loadCommissionData();
	});
</script>

<!-- 카드 3: 설계사 수당 내역 -->
<div class="mb-4 overflow-hidden rounded-lg bg-white shadow">
	<!-- 제목 -->
	<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
		<div class="flex items-center gap-2">
			<img src="/icons/money-blue.svg" alt="수당" class="h-5 w-5" />
			<h3 class="text-base font-bold text-gray-900">설계사 수당 내역</h3>
		</div>
	</div>

	<!-- 검색 필터 -->
	<div class="border-b border-gray-200 bg-white px-4 py-3">
		<div class="flex items-end gap-3">
			<!-- 시작 월 -->
			<div class="w-40">
				<label class="mb-1 block text-xs font-medium text-gray-700">시작</label>
				<input
					type="month"
					bind:value={commissionStartMonth}
					onchange={handlePeriodChange}
					class="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>
			<!-- 종료 월 -->
			<div class="w-40">
				<label class="mb-1 block text-xs font-medium text-gray-700">종료</label>
				<input
					type="month"
					bind:value={commissionEndMonth}
					onchange={handlePeriodChange}
					class="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>
		</div>

		<!-- 기간 총액 정보 -->
		<div class="mt-3 rounded-md bg-blue-50 p-3">
			<div class="flex items-center justify-between">
				<span class="text-sm font-semibold text-blue-900">선택 기간 총액:</span>
				<div class="flex gap-6">
					<div class="text-right">
						<div class="text-xs text-blue-700">수당액</div>
						<div class="text-base font-bold text-blue-900">{formatAmount(commissionGrandTotal.totalCommission)}</div>
					</div>
					<div class="text-right">
						<div class="text-xs text-blue-700">등록인원</div>
						<div class="text-base font-bold text-blue-900">{commissionGrandTotal.totalUsers}명</div>
					</div>
					<div class="text-right">
						<div class="text-xs text-blue-700">매출액</div>
						<div class="text-base font-bold text-blue-900">{formatAmount(commissionGrandTotal.totalRevenue)}</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- 총 건수 -->
	<div class="flex items-center justify-between bg-white px-4 py-2">
		<div class="text-sm text-gray-600">
			총 <span class="font-semibold text-gray-900">{commissionSummary.length}</span>건
		</div>
	</div>

	<!-- 월별 내역 테이블 -->
	<div class="overflow-x-auto px-4 pb-4">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					<th class="table-header">순번</th>
					<th class="table-header">지급월</th>
					<th class="table-header">수당액</th>
					<th class="table-header">등록인원</th>
					<th class="table-header">매출액</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-200 bg-white">
				{#if commissionSummary.length === 0}
					<tr>
						<td colspan="5" class="px-6 py-8 text-center text-sm text-gray-500">
							수당 내역이 없습니다
						</td>
					</tr>
				{:else}
					{#each commissionSummary as item, index}
						<tr class="hover:bg-gray-50">
							<td class="table-cell">{index + 1}</td>
							<td class="table-cell">{item.month}</td>
							<td class="table-cell text-right font-medium">{formatAmount(item.totalCommission)}</td>
							<td class="table-cell">{item.totalUsers}명</td>
							<td class="table-cell text-right">{formatAmount(item.totalRevenue)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	:global(.table-header) {
		border: 1px solid #d1d5db;
		padding: 0.375rem 0.5rem;
		text-align: center;
		font-size: 0.875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #111827;
		min-width: 80px;
	}

	:global(.table-cell) {
		white-space: nowrap;
		border: 1px solid #d1d5db;
		padding: 0.375rem 0.5rem;
		text-align: center;
		font-size: 0.875rem;
		color: #111827;
		min-width: 80px;
	}

	/* 모바일 반응형 */
	@media (max-width: 480px) {
		:global(.table-header),
		:global(.table-cell) {
			padding: 0.5rem 0.5rem;
			font-size: 0.75rem;
		}
	}
</style>
