<script>
	import { onMount } from 'svelte';
	import GradeBadge from '$lib/components/GradeBadge.svelte';

	let currentMonth = '';
	let totalRevenue = 0;
	let monthlyNewUsers = 0;
	let isLoading = true;
	let isCalculating = false;
	let calculationMessage = '';
	let activeTooltip = null;

	let gradeRatios = {
		F1: { ratio: 24, count: 0, amount: 0, formula: '' },
		F2: { ratio: 19, count: 0, amount: 0, formula: '' },
		F3: { ratio: 14, count: 0, amount: 0, formula: '' },
		F4: { ratio: 9, count: 0, amount: 0, formula: '' },
		F5: { ratio: 5, count: 0, amount: 0, formula: '' },
		F6: { ratio: 3, count: 0, amount: 0, formula: '' },
		F7: { ratio: 2, count: 0, amount: 0, formula: '' },
		F8: { ratio: 1, count: 0, amount: 0, formula: '' }
	};

	onMount(async () => {
		await loadGradeInfo();
	});

	async function loadGradeInfo() {
		try {
			const response = await fetch('/api/admin/grade-info');
			if (response.ok) {
				const data = await response.json();

				// 이번 달 정보 설정
				currentMonth = data.currentMonth || (new Date().getMonth() + 1);
				monthlyNewUsers = data.monthlyNewUsers || 0;
				totalRevenue = data.monthlyRevenue || 0;

				// 등급별 정보 업데이트
				if (data.gradeInfo) {
					Object.keys(gradeRatios).forEach(grade => {
						if (data.gradeInfo[grade]) {
							gradeRatios[grade].count = data.gradeInfo[grade].count || 0;
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

	// 월말 매출 계산 함수
	async function calculateMonthlyRevenue() {
		const confirmed = confirm(`${currentMonth}월 매출을 계산하고 지급 스케줄을 생성하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`);
		if (!confirmed) return;

		isCalculating = true;
		calculationMessage = '';

		try {
			const currentYear = new Date().getFullYear();
			const response = await fetch('/api/admin/revenue/calculate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					year: currentYear,
					month: currentMonth
				})
			});

			const result = await response.json();

			if (result.success) {
				calculationMessage = result.message;
				// 데이터 새로고침
				setTimeout(() => {
					loadGradeInfo();
					calculationMessage = '';
				}, 2000);
			} else {
				calculationMessage = `오류: ${result.message}`;
			}
		} catch (error) {
			console.error('Error calculating revenue:', error);
			calculationMessage = '매출 계산 중 오류가 발생했습니다.';
		} finally {
			isCalculating = false;
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
			<div class="flex justify-between items-start">
				<div class="flex-1">
					<h3 class="text-base sm:text-lg font-medium text-gray-900 h-6">
						<span class="hidden lg:inline">등급별 지급 정보</span>
						<span class="lg:hidden">등급별 지급 정보</span>
					</h3>
					<p class="mt-1 text-xs sm:text-sm text-gray-500">
						<span class="hidden lg:inline">{currentMonth}월 총매출: {totalRevenue.toLocaleString()}원 | 신규: {monthlyNewUsers}명</span>
						<span class="lg:hidden">회당: {(totalRevenue / 10).toLocaleString()}원</span>
					</p>
				</div>
				<button
					onclick={calculateMonthlyRevenue}
					disabled={isCalculating}
					class="px-3 py-1.5 bg-blue-600 text-white text-xs sm:text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
					type="button"
				>
					{#if isCalculating}
						<svg class="animate-spin h-3 w-3 sm:h-4 sm:w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						계산 중...
					{:else}
						<svg class="h-3 w-3 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
						</svg>
						매출 계산
					{/if}
				</button>
			</div>
			{#if calculationMessage}
				<div class="mt-2 p-2 {calculationMessage.startsWith('오류') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'} text-xs rounded">
					{calculationMessage}
				</div>
			{/if}
		</div>
		<div class="px-2 sm:px-4 py-3 overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-gray-200">
						<th class="px-2 sm:px-3 py-2 text-left text-xs font-medium text-gray-700">등급</th>
						<th class="px-2 sm:px-3 py-2 text-center text-xs font-medium text-gray-700">인원</th>
						<th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-700">
							<span class="hidden sm:inline">1인당/회</span>
							<span class="sm:hidden">1인당</span>
						</th>
						<th class="px-2 sm:px-3 py-2 text-right text-xs font-medium text-gray-700">
							<span class="hidden sm:inline">전체/회</span>
							<span class="sm:hidden">전체</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each Object.entries(gradeRatios) as [grade, data]}
						<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
							<td class="px-2 sm:px-3 py-2">
								<GradeBadge {grade} size="sm" />
							</td>
							<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center text-gray-900">{data.count}명</td>
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
								{data.count > 0 ? (data.amount * data.count).toLocaleString() : '0'}원
							</td>
						</tr>
					{/each}
					<tr class="border-t-2 border-gray-300 bg-gray-50">
						<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm font-semibold text-gray-900">합계</td>
						<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-center font-semibold text-gray-900">
							{Object.values(gradeRatios).reduce((sum, data) => sum + data.count, 0)}명
						</td>
						<td class="px-2 sm:px-3 py-2"></td>
						<td class="px-2 sm:px-3 py-2 text-xs sm:text-sm text-right font-bold text-blue-900">
							{Object.values(gradeRatios).reduce((sum, data) => sum + (data.count > 0 ? data.amount * data.count : 0), 0).toLocaleString()}원
						</td>
					</tr>
				</tbody>
			</table>
		</div>
	</div>
{/if}