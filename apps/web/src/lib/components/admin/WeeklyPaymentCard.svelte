<script>
	import { onMount } from 'svelte';

	let currentMonth = '';
	let currentWeek = '';
	let weeklyPaymentInfo = null;
	let monthlyRevenues = [];
	let isLoading = true;

	onMount(async () => {
		await loadWeeklyPaymentInfo();
	});

	async function loadWeeklyPaymentInfo() {
		try {
			const response = await fetch('/api/admin/weekly-payment-info');
			if (response.ok) {
				const data = await response.json();

				// 현재 월, 주차 설정
				currentMonth = data.currentMonth || (new Date().getMonth() + 1);
				const today = new Date();
				currentWeek = `${Math.ceil(today.getDate() / 7)}주차`;

				// 이번 주 지급액 정보 설정
				weeklyPaymentInfo = data.weeklyPayment || null;

				// 월별 매출 데이터 설정 (지급 구성 표시용)
				monthlyRevenues = data.monthlyRevenues || [];
			} else {
				const errorData = await response.json();
				console.error('Weekly payment info API error:', errorData);
			}
		} catch (error) {
			console.error('Error loading weekly payment info:', error);
		} finally {
			isLoading = false;
		}
	}
</script>

{#if isLoading}
	<div class="bg-white shadow-sm rounded-lg p-6">
		<div class="flex justify-center items-center h-64">
			<div class="text-gray-500">로딩 중...</div>
		</div>
	</div>
{:else}
	<div class="bg-white shadow-sm rounded-lg overflow-hidden">
		<div class="px-4 py-2 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
			<h3 class="text-base font-medium text-gray-900">이번주 지원비 금액</h3>
			<p class="text-xs text-gray-500">{new Date().getFullYear()}년 {currentMonth}월 {currentWeek}</p>
		</div>
		<div class="px-3 sm:px-4 py-2">
			<!-- 총액 정보만 간단하게 표시 -->
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
				<div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-2 text-center">
					<p class="text-xs text-gray-600">총 지급액</p>
					<p class="text-base sm:text-lg font-bold text-blue-900">
						{weeklyPaymentInfo ? weeklyPaymentInfo.totalAmount.toLocaleString() : '0'}원
					</p>
				</div>
				<div class="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-2 text-center">
					<p class="text-xs text-gray-600">세지원 (3.3%)</p>
					<p class="text-base sm:text-lg font-bold text-red-900">
						{weeklyPaymentInfo ? weeklyPaymentInfo.totalTax.toLocaleString() : '0'}원
					</p>
				</div>
				<div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-2 text-center">
					<p class="text-xs text-gray-600">실지급액 (세후)</p>
					<p class="text-base sm:text-lg font-bold text-green-900">
						{weeklyPaymentInfo ? weeklyPaymentInfo.totalNet.toLocaleString() : '0'}원
					</p>
				</div>
			</div>
		</div>
	</div>
{/if}