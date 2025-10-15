<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	let selectionMode = 'single'; // 'single' | 'range'
	let selectedYear = new Date().getFullYear();
	let selectedMonth = new Date().getMonth() + 1;
	let startYear = new Date().getFullYear();
	let startMonth = new Date().getMonth() + 1;
	let endYear = new Date().getFullYear();
	let endMonth = new Date().getMonth() + 1;
	
	// 년도 목록 (올해부터)
	const currentYear = new Date().getFullYear();
	const years = [currentYear];
	
	let monthlyData = []; // 기간 선택 시 여러 월 데이터
	let currentMonth = '';
	let totalRevenue = 0;
	let monthlyNewUsers = 0;
	let isLoading = true;
	let activeTooltip = null;

	let gradeRatios = {
		F1: { ratio: 24, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' },
		F2: { ratio: 19, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' },
		F3: { ratio: 14, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' },
		F4: { ratio: 9, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' },
		F5: { ratio: 5, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' },
		F6: { ratio: 3, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' },
		F7: { ratio: 2, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' },
		F8: { ratio: 1, totalCount: 0, eligibleCount: 0, amount: 0, formula: '' }
	};

	onMount(async () => {
		await loadGradeInfo();
	});

	$: if (browser && selectionMode === 'single' && selectedYear && selectedMonth) {
		loadGradeInfo();
	}

	$: if (browser && selectionMode === 'range' && startYear && startMonth && endYear && endMonth) {
		loadRangeData();
	}

	async function loadGradeInfo() {
		try {
			isLoading = true;
			const response = await fetch(`/api/admin/grade-info?year=${selectedYear}&month=${selectedMonth}`);
			if (response.ok) {
				const data = await response.json();

				currentMonth = data.currentMonth || selectedMonth;
				monthlyNewUsers = data.monthlyNewUsers || 0;
				totalRevenue = data.monthlyRevenue || 0;

				// 등급별 정보 업데이트
				if (data.gradeInfo) {
					Object.keys(gradeRatios).forEach(grade => {
						if (data.gradeInfo[grade]) {
							gradeRatios[grade].totalCount = data.gradeInfo[grade].totalCount || 0;
							gradeRatios[grade].eligibleCount = data.gradeInfo[grade].eligibleCount || 0;
							gradeRatios[grade].amount = data.gradeInfo[grade].amount || 0;
							gradeRatios[grade].ratio = data.gradeInfo[grade].ratio || 0;
							gradeRatios[grade].formula = data.gradeInfo[grade].formula || '';
						}
					});
				}
			}
		} catch (error) {
			console.error('Error loading grade info:', error);
		} finally {
			isLoading = false;
		}
	}

	async function loadRangeData() {
		try {
			isLoading = true;
			const response = await fetch(
				`/api/admin/grade-info?mode=range&startYear=${startYear}&startMonth=${startMonth}&endYear=${endYear}&endMonth=${endMonth}`
			);
			if (response.ok) {
				const data = await response.json();
				monthlyData = data.months || [];
			}
		} catch (error) {
			console.error('Error loading range data:', error);
		} finally {
			isLoading = false;
		}
	}


	function toggleTooltip(grade) {
		if (activeTooltip === grade) {
			activeTooltip = null;
		} else {
			activeTooltip = grade;
		}
	}

	function closeTooltip() {
		activeTooltip = null;
	}
</script>

{#if isLoading}
	<div class="bg-white shadow-sm rounded-lg p-6">
		<div class="flex justify-center items-center h-64">
			<div class="text-gray-500">로딩 중...</div>
		</div>
	</div>
{:else}
	<div class="bg-white shadow-sm rounded-lg overflow-hidden h-full">
		<div class="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
			<div class="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
				<div class="flex-1">
					<h3 class="text-base sm:text-lg font-medium text-gray-900">등급별 지급 정보</h3>
					<p class="mt-1 text-xs sm:text-sm text-gray-500">
						{currentMonth}월 매출 (익월부터 10주간 매주 금요일 지급) | 총매출: {totalRevenue.toLocaleString()}원 | 신규: {monthlyNewUsers}명
					</p>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<!-- 선택 모드 드롭다운 -->
					<select bind:value={selectionMode} class="text-xs border-gray-300 rounded-md">
						<option value="single">월 선택</option>
						<option value="range">기간 선택</option>
					</select>

					{#if selectionMode === 'single'}
						<!-- 단일 년/월 선택 -->
						<select bind:value={selectedYear} class="text-xs border-gray-300 rounded-md">
							{#each years as year}
								<option value={year}>{year}년</option>
							{/each}
						</select>
						<select bind:value={selectedMonth} class="text-xs border-gray-300 rounded-md">
							{#each Array.from({length: 12}, (_, i) => i + 1) as month}
								<option value={month}>{month}월</option>
							{/each}
						</select>
					{:else}
						<!-- 기간 선택 -->
						<div class="flex items-center gap-1">
							<select bind:value={startYear} class="text-xs border-gray-300 rounded-md">
								{#each Array.from({length: 5}, (_, i) => new Date().getFullYear() - i) as year}
									<option value={year}>{year}</option>
								{/each}
							</select>
							<select bind:value={startMonth} class="text-xs border-gray-300 rounded-md">
								{#each Array.from({length: 12}, (_, i) => i + 1) as month}
									<option value={month}>{month}</option>
								{/each}
							</select>
							<span class="text-gray-500">~</span>
							<select bind:value={endYear} class="text-xs border-gray-300 rounded-md">
								{#each Array.from({length: 5}, (_, i) => new Date().getFullYear() - i) as year}
									<option value={year}>{year}</option>
								{/each}
							</select>
							<select bind:value={endMonth} class="text-xs border-gray-300 rounded-md">
								{#each Array.from({length: 12}, (_, i) => i + 1) as month}
									<option value={month}>{month}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>
			</div>		</div>
		<div class="px-2 sm:px-4 py-3 overflow-x-auto">
			{#if selectionMode === 'single'}
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200">
							<th class="px-2 sm:px-3 py-2 text-left text-xs font-medium text-gray-700">등급</th>
						<th class="px-2 sm:px-3 py-2 text-center text-xs font-medium text-gray-700">전체인원</th>
						<th class="px-2 sm:px-3 py-2 text-center text-xs font-medium text-gray-700">
							<span class="cursor-help border-b border-dotted border-gray-400" title="매주 금요일마다 등급 기준일이 다름 (지급일 -1개월 -1일)">현재등급기준</span>
						</th>
						<th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-700">
							<span class="hidden sm:inline">1인당/회</span>
							<span class="sm:hidden">1인당</span>
						</th>
						<th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-700">
							<span class="hidden sm:inline">지급총액/회</span>
							<span class="sm:hidden">총액</span>
						</th>
						</tr>
					</thead>
					<tbody>
						{#each Object.entries(gradeRatios) as [grade, data]}
							<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
								<td class="px-2 sm:px-3 py-2">
									<GradeBadge {grade} size="sm" />
								</td>
								<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center text-gray-900">{data.totalCount}명</td>
								<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center text-gray-900">{data.eligibleCount}명</td>
								<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right text-gray-900 group relative">
									<div class="relative inline-block">
										<button
											type="button"
											class="cursor-help border-b border-dotted border-gray-400 text-left"
											title={data.formula}
											onclick={() => toggleTooltip(grade)}
											onblur={closeTooltip}
										>
											{data.amount.toLocaleString()}
										</button>
										{#if data.formula}
											<!-- 모바일용 클릭 툴팁 -->
											{#if activeTooltip === grade}
												<div class="sm:hidden absolute bottom-full right-0 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-20">
													{data.formula}
													<div class="absolute top-full right-4 -mt-1">
														<div class="border-4 border-transparent border-t-gray-800"></div>
													</div>
												</div>
											{/if}
											<!-- 데스크탑용 호버 툴팁 -->
											<div class="hidden sm:block absolute top-full right-0 mt-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
												{data.formula}
												<div class="absolute bottom-full right-4 -mb-1">
													<div class="border-4 border-transparent border-b-gray-800"></div>
												</div>
											</div>
										{/if}
									</div>
								</td>
								<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right font-semibold text-blue-600">
									{data.eligibleCount > 0 ? (data.amount * data.eligibleCount).toLocaleString() : '0'}원
								</td>
							</tr>
						{/each}
						<tr class="border-t-2 border-gray-300 bg-gray-50">
							<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900">합계</td>
							<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center font-semibold text-gray-900">
								{Object.values(gradeRatios).reduce((sum, data) => sum + data.totalCount, 0)}명
							</td>
							<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center font-semibold text-gray-900">
								{Object.values(gradeRatios).reduce((sum, data) => sum + data.eligibleCount, 0)}명
							</td>
							<td class="px-2 sm:px-3 py-2"></td>
							<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right font-bold text-blue-900">
								{Object.values(gradeRatios).reduce((sum, data) => sum + (data.eligibleCount > 0 ? data.amount * data.eligibleCount : 0), 0).toLocaleString()}원
							</td>
						</tr>
					</tbody>
				</table>
			{:else}
				<!-- 기간 선택 모드: 월별 스크롤 -->
				<div class="space-y-4 max-h-96 overflow-y-auto">
					{#each monthlyData as monthData}
						<div class="border-b pb-4">
							<h4 class="text-sm font-semibold text-gray-900 mb-2">
								{monthData.year}년 {monthData.month}월 
								<span class="text-gray-500 font-normal">
									(총매출: {monthData.totalRevenue.toLocaleString()}원 | 신규: {monthData.newUsers}명)
								</span>
							</h4>
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b border-gray-200">
										<th class="px-2 py-1 text-left text-xs font-medium text-gray-700">등급</th>
										<th class="px-2 py-1 text-center text-xs font-medium text-gray-700">인원</th>
										<th class="px-2 py-1 text-center text-xs font-medium text-gray-700">지급인원</th>
										<th class="px-2 py-1 text-right text-xs font-medium text-gray-700">1인당/회</th>
										<th class="px-2 py-1 text-right text-xs font-medium text-gray-700">전체/회</th>
									</tr>
								</thead>
								<tbody>
									{#each Object.entries(monthData.gradeInfo) as [grade, data]}
										<tr class="border-b border-gray-100">
											<td class="px-2 py-1"><GradeBadge {grade} size="sm" /></td>
											<td class="px-2 py-1 text-xs text-center">{data.totalCount}명</td>
											<td class="px-2 py-1 text-xs text-center text-blue-600">{data.eligibleCount}명</td>
											<td class="px-2 py-1 text-xs text-right">{data.amount.toLocaleString()}</td>
											<td class="px-2 py-1 text-xs text-right font-semibold text-blue-600">
												{(data.amount * data.eligibleCount).toLocaleString()}원
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}