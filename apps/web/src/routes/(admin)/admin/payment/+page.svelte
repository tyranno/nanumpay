<script>
	import { onMount } from 'svelte';

	let paymentList = [];
	let totalAmount = 0;
	let totalTax = 0;
	let totalActualPayment = 0;
	let currentDate = '';
	let isLoading = true;
	let showTaxInfo = true; // 원천징수 정보 표시 여부
	const TAX_RATE = 0.033; // 3.3% 원천징수세율

	onMount(async () => {
		const today = new Date();
		currentDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

		// 원 지급액 데이터
		const originalPayments = [
			{ no: 1, name: '홍길동1', bank: '하나', account: '1002-066-361313', originalAmount: 30000 },
			{ no: 2, name: '홍길동2', bank: '하나', account: '1002-066-361212', originalAmount: 70000 },
			{ no: 3, name: '홍길동3', bank: 'KB', account: '345-546-123456', originalAmount: 120000 },
			{ no: 4, name: '홍길동4', bank: '', account: '345-546-123457', originalAmount: 30000 },
			{ no: 5, name: '', bank: '', account: '345-546-123458', originalAmount: 200000 },
			{ no: 6, name: '', bank: '', account: '345-546-123459', originalAmount: 120000 }
		];

		// 3.3% 세금 공제 적용
		paymentList = originalPayments.map(item => ({
			...item,
			taxAmount: Math.round(item.originalAmount * TAX_RATE),
			actualPayment: Math.round(item.originalAmount * (1 - TAX_RATE))
		}));

		totalAmount = paymentList.reduce((sum, item) => sum + item.originalAmount, 0);
		totalTax = paymentList.reduce((sum, item) => sum + item.taxAmount, 0);
		totalActualPayment = paymentList.reduce((sum, item) => sum + item.actualPayment, 0);

		isLoading = false;
	});

	function formatNumber(num) {
		return num.toLocaleString();
	}
</script>

<svelte:head>
	<title>용역비지급명부 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="px-4 py-6 sm:px-0">
		<div class="bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<div class="flex justify-between items-center">
					<div>
						<h3 class="text-lg leading-6 font-medium text-gray-900">
							용역비지급명부 {showTaxInfo ? '(원천징수 포함)' : ''}
						</h3>
						<p class="mt-1 text-sm text-gray-600">지급일: {currentDate}</p>
					</div>
					<button
						onclick={() => showTaxInfo = !showTaxInfo}
						class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
					>
						{showTaxInfo ? '원천징수 숨기기' : '원천징수 보기'}
					</button>
				</div>
			</div>
			<div class="px-4 py-3">
				<table class="min-w-full">
					<thead>
						<tr class="border-b border-gray-200">
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">순번</th>
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">성명</th>
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">은행</th>
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">계좌번호</th>
							<th class="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase">지급액</th>
							{#if showTaxInfo}
								<th class="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase">원천징수(3.3%)</th>
								<th class="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase">실지급액</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each paymentList as item}
							<tr class="border-b border-gray-100">
								<td class="px-3 py-3 text-sm text-gray-900">{item.no}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.name}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.bank}</td>
								<td class="px-3 py-3 text-sm text-gray-900">{item.account}</td>
								<td class="px-3 py-3 text-sm text-right font-medium bg-yellow-100">
									{formatNumber(item.originalAmount)}
								</td>
								{#if showTaxInfo}
									<td class="px-3 py-3 text-sm text-right text-red-600 bg-red-50">
										-{formatNumber(item.taxAmount)}
									</td>
									<td class="px-3 py-3 text-sm text-right font-bold bg-green-50">
										{formatNumber(item.actualPayment)}
									</td>
								{/if}
							</tr>
						{/each}
						{#each Array(4) as _, i}
							<tr class="border-b border-gray-100">
								<td class="px-3 py-3 text-sm text-gray-900">{7 + i}</td>
								<td class="px-3 py-3 text-sm text-gray-900"></td>
								<td class="px-3 py-3 text-sm text-gray-900"></td>
								<td class="px-3 py-3 text-sm text-gray-900"></td>
								<td class="px-3 py-3 text-sm text-right bg-yellow-50"></td>
								{#if showTaxInfo}
									<td class="px-3 py-3 text-sm text-right bg-red-50"></td>
									<td class="px-3 py-3 text-sm text-right bg-green-50"></td>
								{/if}
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="border-t-2 border-gray-300">
							<td colspan="4" class="px-3 py-3 text-sm font-medium text-gray-900">총계</td>
							<td class="px-3 py-3 text-sm text-right font-bold bg-yellow-200">
								{formatNumber(totalAmount)}
							</td>
							{#if showTaxInfo}
								<td class="px-3 py-3 text-sm text-right font-bold text-red-600 bg-red-100">
									-{formatNumber(totalTax)}
								</td>
								<td class="px-3 py-3 text-sm text-right font-bold bg-green-200">
									{formatNumber(totalActualPayment)}
								</td>
							{/if}
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	</div>
{/if}