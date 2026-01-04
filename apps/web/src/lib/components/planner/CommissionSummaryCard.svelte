<script>
	import { onMount } from 'svelte';

	let commissionSummary = [];
	let commissionGrandTotal = { totalCommission: 0, totalUsers: 0, totalRevenue: 0 };

	// ⭐ 날짜 포맷 (YYYY-MM-DD)
	function formatDateYMD(date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// ⭐ 해당 날짜를 포함하는 주의 금요일 계산 (검색용)
	function getNextFriday(date) {
		const result = new Date(date);
		const dayOfWeek = result.getDay();
		if (dayOfWeek !== 5) {
			const daysToFriday = dayOfWeek <= 5 ? (5 - dayOfWeek) : (5 - dayOfWeek + 7);
			result.setDate(result.getDate() + daysToFriday);
		}
		return result;
	}

	// ⭐ 기본 기간: 오늘 ~ 3주 후
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const threeWeeksLater = new Date(today);
	threeWeeksLater.setDate(today.getDate() + 21);

	let commissionStartDate = formatDateYMD(today);
	let commissionEndDate = formatDateYMD(threeWeeksLater);
	// ⭐ 최대 선택 가능일: 3주 후의 금요일까지
	const maxDate = formatDateYMD(getNextFriday(threeWeeksLater));

	function formatAmount(value) {
		if (value === null || value === undefined) return '0원';
		return value.toLocaleString('ko-KR') + '원';
	}

	async function loadCommissionData() {
		try {
			// ⭐ 날짜에서 year/month 추출
			const startDate = new Date(commissionStartDate);
			const endDate = new Date(commissionEndDate);

			// ⭐ 종료일을 해당 주 금요일까지 확장 (검색용)
			const endDateForSearch = getNextFriday(endDate);

			const params = new URLSearchParams({
				startYear: startDate.getFullYear(),
				startMonth: startDate.getMonth() + 1,
				// ⭐ API 조회는 금요일이 포함된 월까지 확장
				endYear: endDateForSearch.getFullYear(),
				endMonth: endDateForSearch.getMonth() + 1,
				groupBy: 'week'  // ⭐ 항상 주별
			});

			const response = await fetch(`/api/planner/commission-summary?${params}`);
			const result = await response.json();

			if (result.success) {
				// ⭐ 선택한 날짜 범위 내의 주차만 필터링 (종료일은 금요일까지 확장)
				const startDateObj = new Date(commissionStartDate);
				endDateForSearch.setHours(23, 59, 59, 999);

				const filteredData = (result.data || []).filter(item => {
					// item.period가 "2026-01-03 (1월 1주)" 같은 형식
					const dateMatch = item.period?.match(/^(\d{4}-\d{2}-\d{2})/);
					if (!dateMatch) return true;
					const itemDate = new Date(dateMatch[1]);
					// 시작일 <= 금요일 <= 확장된 종료일(금요일)
					return itemDate >= startDateObj && itemDate <= endDateForSearch;
				});

				commissionSummary = filteredData;

				// ⭐ 필터링된 데이터로 총액 재계산
				commissionGrandTotal = filteredData.reduce((acc, item) => ({
					totalCommission: acc.totalCommission + (item.totalCommission || 0),
					totalUsers: acc.totalUsers + (item.totalUsers || 0),
					totalRevenue: acc.totalRevenue + (item.totalRevenue || 0)
				}), { totalCommission: 0, totalUsers: 0, totalRevenue: 0 });
			}
		} catch (error) {
			console.error('수당 내역 로드 오류:', error);
		}
	}

	function handlePeriodChange() {
		// ⭐ 시작일이 종료일보다 늦으면 조정
		if (commissionStartDate > commissionEndDate) {
			commissionStartDate = commissionEndDate;
		}
		loadCommissionData();
	}

	onMount(() => {
		loadCommissionData();
	});
</script>

<!-- 카드 3: 설계사 수당 내역 -->
<div class="mb-4 overflow-hidden rounded-lg border-2 border-blue-200 bg-white shadow-lg">
	<!-- 제목 -->
	<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
		<div class="flex items-center gap-2">
			<img src="/icons/money-blue.svg" alt="수당" class="h-5 w-5" />
			<h3 class="text-base font-bold text-gray-900">설계사 수당 내역</h3>
		</div>
	</div>

	<!-- 검색 필터 -->
	<div class="border-b border-gray-200 bg-white px-4 py-3">
		<div class="flex items-center gap-2">
			<span class="text-xs font-medium text-gray-700">시작</span>
			<input
				type="date"
				bind:value={commissionStartDate}
				max={maxDate}
				onchange={handlePeriodChange}
				class="min-w-[140px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
			/>
			<span class="text-gray-500">~</span>
			<span class="text-xs font-medium text-gray-700">종료</span>
			<input
				type="date"
				bind:value={commissionEndDate}
				max={maxDate}
				onchange={handlePeriodChange}
				class="min-w-[140px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
			/>
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

	<!-- 내역 테이블 -->
	<div class="overflow-x-auto px-4 pb-4">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					<th class="table-header">순번</th>
					<th class="table-header">지급일</th>
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
							<td class="table-cell">{item.period}</td>
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
