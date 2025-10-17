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
	let monthlyData = null;
	let rangeData = null; // 기간 조회 데이터
	let isLoading = false;
	let isCurrentMonth = false;

	// 모달 상태
	let showRevenueModal = false;
	let modalMonthKey = null;

	onMount(() => {
		loadData();
	});

	$: if (browser && viewMode === 'single' && selectedYear && selectedMonth) {
		rangeData = null; // 모드 변경 시 기간 데이터 초기화
		loadData();
	}

	$: if (browser && viewMode === 'range' && startYear && startMonth && endYear && endMonth) {
		monthlyData = null; // 모드 변경 시 월간 데이터 초기화
		loadRangeData();
	}

	// 현재월 확인
	$: {
		const today = new Date();
		const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
		const selectedMonthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
		isCurrentMonth = (selectedMonthKey === currentMonthKey);
	}

	async function loadData() {
		try {
			isLoading = true;
			const monthKey = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

			const response = await fetch(`/api/admin/revenue/monthly?monthKey=${monthKey}`);
			if (response.ok) {
				monthlyData = await response.json();
			} else {
				console.error('Failed to load monthly data');
				monthlyData = null;
			}
		} catch (error) {
			console.error('Error loading data:', error);
			monthlyData = null;
		} finally {
			isLoading = false;
		}
	}

	async function loadRangeData() {
		try {
			isLoading = true;
			const startMonthKey = `${startYear}-${String(startMonth).padStart(2, '0')}`;
			const endMonthKey = `${endYear}-${String(endMonth).padStart(2, '0')}`;

			console.log(`[MonthlyRevenueCard] loadRangeData: ${startMonthKey} ~ ${endMonthKey}`);

			const response = await fetch(`/api/admin/revenue/range?start=${startMonthKey}&end=${endMonthKey}&viewMode=monthly`);
			if (response.ok) {
				const data = await response.json();
				console.log(`[MonthlyRevenueCard] API returned ${data.monthlyData?.length || 0} months:`, data.monthlyData?.map(m => m.monthKey));

				// 선택한 기간의 모든 월 생성
				const allMonths = [];
				let currentYear = startYear;
				let currentMonth = startMonth;

				while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
					const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

					// API에서 받은 데이터 중 해당 월 찾기
					const existingMonth = (data.monthlyData || []).find(m => m.monthKey === monthKey);

					if (existingMonth) {
						// 데이터가 있는 월
						console.log(`[MonthlyRevenueCard] ${monthKey}: 데이터 있음`);
						allMonths.push(existingMonth);
					} else {
						// 데이터가 없는 월 - 빈 객체 생성
						console.log(`[MonthlyRevenueCard] ${monthKey}: 데이터 없음 (빈 객체 생성)`);
						allMonths.push({
							monthKey,
							registrationCount: 0,
							effectiveRevenue: 0,
							gradeDistribution: {
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

				console.log(`[MonthlyRevenueCard] Total generated months: ${allMonths.length}`, allMonths.map(m => m.monthKey));

				rangeData = {
					summary: data.summary,
					months: allMonths
				};
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

	// 지급 기간 계산 (다음 달부터 3개월)
	function getPaymentPeriod(year, month) {
		let startMonth = month + 1;
		let startYear = year;
		if (startMonth > 12) {
			startMonth = 1;
			startYear++;
		}

		let endMonth = startMonth + 2;
		let endYear = startYear;
		if (endMonth > 12) {
			endMonth -= 12;
			endYear++;
		}

		return `${startMonth}~${endMonth}월`;
	}
</script>

<div class="bg-white shadow-sm rounded-lg overflow-hidden">
	<!-- 헤더 -->
	<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-green-50 to-green-100">
		<div class="flex flex-col gap-3">
			<h3 class="text-lg font-semibold text-gray-900">📈 매출 통계</h3>

			<!-- 조회 옵션 -->
			<div class="flex items-center gap-2 flex-wrap">
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
					<span class="text-xs">~</span>
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
		{:else if monthlyData}
			<div class="space-y-4">
				<!-- 기간 표시 -->
				<div class="border-b border-gray-300 pb-2">
					<h4 class="text-base font-semibold text-gray-900">
						{selectedYear}년 {selectedMonth}월 현황
						{#if isCurrentMonth}
							<span class="ml-2 text-xs text-blue-600 font-semibold">📍 현재 월</span>
						{/if}
					</h4>
				</div>

				<!-- 매출 정보 -->
				<div class="border border-gray-300 rounded-lg bg-green-50 px-4 py-3">
					<div class="flex items-center justify-between">
						<h5 class="text-sm font-semibold text-gray-900">💰 매출 정보</h5>
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
								<span class="font-bold text-green-900 text-base">
									{(monthlyData.effectiveRevenue || 0).toLocaleString()}원
								</span>
							</div>
							{#if isCurrentMonth}
								<button
									on:click={openRevenueModal}
									class="ml-2 px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition"
								>
									수동 설정
								</button>
							{:else}
								<span class="ml-2 text-xs text-gray-400">현재월만 설정 가능</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- 등록/승급 현황 -->
				<div class="border border-gray-300 rounded-lg bg-blue-50 px-4 py-3">
					<h5 class="text-sm font-semibold text-gray-900 mb-2">👥 등록/승급 현황</h5>
					<div class="flex items-center gap-4 text-xs">
						<div>
							<span class="text-gray-600">신규 등록:</span>
							<span class="font-semibold ml-1">{monthlyData.paymentTargets?.registrants?.length || 0}명</span>
						</div>
						<span class="text-gray-400">|</span>
						<div>
							<span class="text-gray-600">승급:</span>
							<span class="font-semibold ml-1">{monthlyData.paymentTargets?.promoted?.length || 0}명</span>
						</div>
						<span class="text-gray-400">|</span>
						<div>
							<span class="text-gray-600">추가지급 대상:</span>
							<span class="font-semibold ml-1">{monthlyData.paymentTargets?.additionalPayments?.length || 0}명</span>
						</div>
					</div>
				</div>

				<!-- 등급별 대상자 -->
				<div>
					<h5 class="text-sm font-semibold text-gray-700 mb-2">📊 등급별 지급 대상자</h5>
					<table class="min-w-full border border-gray-300">
						<thead class="bg-gray-100">
							<tr>
								<th class="border border-gray-300 px-2 py-1 text-xs">등급</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">인원</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">1회 금액</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">10회 총액</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">지급 기간</th>
							</tr>
						</thead>
						<tbody>
							{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
								{@const count = monthlyData.gradeDistribution?.[grade] || 0}
								{@const perAmount = monthlyData.gradePayments?.[grade] || 0}
								<tr class="hover:bg-gray-50">
									<td class="border border-gray-300 px-2 py-1 text-center">
										<GradeBadge {grade} size="sm" />
									</td>
									<td class="border border-gray-300 px-2 py-1 text-center font-semibold text-xs">
										{count}명
									</td>
									<td class="border border-gray-300 px-2 py-1 text-right text-xs">
										{perAmount.toLocaleString()}원
									</td>
									<td class="border border-gray-300 px-2 py-1 text-right text-blue-600 text-xs">
										{(perAmount * 10 * count).toLocaleString()}원
									</td>
									<td class="border border-gray-300 px-2 py-1 text-center text-xs">
										{getPaymentPeriod(selectedYear, selectedMonth)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<p class="text-xs text-gray-600 mt-2">💡 매출은 다음 달부터 10주간 지급됩니다</p>
				</div>
			</div>
		{:else if rangeData}
			<div class="space-y-4">
				<!-- 기간 표시 -->
				<div class="border-b border-gray-300 pb-2">
					<h4 class="text-base font-semibold text-gray-900">
						{startYear}년 {startMonth}월 ~ {endYear}년 {endMonth}월 통합 현황
					</h4>
				</div>

				<!-- 통합 매출 정보 -->
				<div class="border border-gray-300 rounded-lg bg-green-50 px-4 py-3">
					<h5 class="text-sm font-semibold text-gray-900 mb-2">💰 기간 통합 매출</h5>
					<div class="flex items-center gap-4 text-xs">
						<div>
							<span class="text-gray-600">총 기간:</span>
							<span class="font-semibold ml-1">{rangeData.summary?.totalMonths || 0}개월</span>
						</div>
						<span class="text-gray-400">|</span>
						<div>
							<span class="text-gray-600">총 등록자:</span>
							<span class="font-semibold ml-1">{rangeData.summary?.totalRegistrants || 0}명</span>
						</div>
						<span class="text-gray-400">|</span>
						<div>
							<span class="text-gray-900 font-semibold">총 매출:</span>
							<span class="font-bold text-green-900 text-base ml-1">
								{(rangeData.summary?.totalRevenue || 0).toLocaleString()}원
							</span>
						</div>
						<span class="text-gray-400">|</span>
						<div>
							<span class="text-gray-600">월 평균:</span>
							<span class="font-semibold ml-1">{(rangeData.summary?.avgRevenue || 0).toLocaleString()}원</span>
						</div>
					</div>
				</div>

				<!-- 월별 상세 -->
				<div>
					<h5 class="text-sm font-semibold text-gray-700 mb-2">📅 월별 상세 내역</h5>
					<table class="min-w-full border border-gray-300">
						<thead class="bg-gray-100">
							<tr>
								<th class="border border-gray-300 px-2 py-1 text-xs" rowspan="2">월</th>
								<th class="border border-gray-300 px-2 py-1 text-xs" rowspan="2">등록자</th>
								<th class="border border-gray-300 px-2 py-1 text-xs" rowspan="2">매출</th>
								<th class="border border-gray-300 px-2 py-1 text-xs text-center" colspan="8">등급 분포</th>
							</tr>
							<tr>
								<th class="border border-gray-300 px-2 py-1 text-xs">F1</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">F2</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">F3</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">F4</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">F5</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">F6</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">F7</th>
								<th class="border border-gray-300 px-2 py-1 text-xs">F8</th>
							</tr>
						</thead>
						<tbody>
							{#if rangeData.months && rangeData.months.length > 0}
								{#each rangeData.months as month}
									<tr class="hover:bg-gray-50">
										<td class="border border-gray-300 px-2 py-1 text-center text-xs font-semibold">
											{month.monthKey}
										</td>
										<td class="border border-gray-300 px-2 py-1 text-center text-xs">
											{month.registrationCount || 0}명
										</td>
										<td class="border border-gray-300 px-2 py-1 text-right text-xs">
											{(month.effectiveRevenue || 0).toLocaleString()}원
										</td>
										{#each ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as grade}
											{@const count = month.gradeDistribution?.[grade] || 0}
											<td class="border border-gray-300 px-2 py-1 text-center text-xs">
												{count}명
											</td>
										{/each}
									</tr>
								{/each}
							{:else}
								<tr>
									<td colspan="11" class="border border-gray-300 px-2 py-8 text-center text-gray-500 text-xs">
										{startYear}년 {startMonth}월 ~ {endYear}년 {endMonth}월 기간에 매출 자료가 없습니다.
									</td>
								</tr>
							{/if}
						</tbody>
					</table>
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
