<script>
	import { onMount } from 'svelte';

	let paymentList = [];
	let totalAmount = 0;
	let totalTax = 0;
	let totalActualPayment = 0;
	let currentDate = '';
	let isLoading = true;
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
	<title>원천징수 지급명부 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="px-4 py-6 sm:px-0">
		<div class="bg-white shadow overflow-hidden sm:rounded-lg">
			<div class="px-4 py-5 sm:px-6 border-b border-gray-200 bg-gray-50">
				<h3 class="text-lg leading-6 font-medium text-gray-900">원천징수 지급명부</h3>
				<p class="mt-1 text-sm text-gray-600">
					지급일: {currentDate} | 원천징수세율: 3.3%
				</p>
			</div>
			<div class="px-4 py-3">
				<div class="overflow-x-auto">
					<table class="min-w-full">
						<thead>
							<tr class="border-b border-gray-200 bg-gray-50">
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">순번</th>
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">성명</th>
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">은행</th>
								<th class="px-3 py-3 text-left text-xs font-medium text-gray-700 uppercase">계좌번호</th>
								<th class="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase">지급액</th>
								<th class="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase">원천징수(3.3%)</th>
								<th class="px-3 py-3 text-right text-xs font-medium text-gray-700 uppercase">실지급액</th>
							</tr>
						</thead>
						<tbody>
							{#each paymentList as item}
								<tr class="border-b border-gray-100">
									<td class="px-3 py-3 text-sm text-gray-900">{item.no}</td>
									<td class="px-3 py-3 text-sm text-gray-900">{item.name}</td>
									<td class="px-3 py-3 text-sm text-gray-900">{item.bank}</td>
									<td class="px-3 py-3 text-sm text-gray-900">{item.account}</td>
									<td class="px-3 py-3 text-sm text-right text-gray-900">
										{formatNumber(item.originalAmount)}
									</td>
									<td class="px-3 py-3 text-sm text-right text-red-600">
										-{formatNumber(item.taxAmount)}
									</td>
									<td class="px-3 py-3 text-sm text-right font-medium bg-green-50">
										{formatNumber(item.actualPayment)}
									</td>
								</tr>
							{/each}
							{#each Array(4) as _, i}
								<tr class="border-b border-gray-100">
									<td class="px-3 py-3 text-sm text-gray-900">{7 + i}</td>
									<td class="px-3 py-3 text-sm text-gray-900"></td>
									<td class="px-3 py-3 text-sm text-gray-900"></td>
									<td class="px-3 py-3 text-sm text-gray-900"></td>
									<td class="px-3 py-3 text-sm text-right"></td>
									<td class="px-3 py-3 text-sm text-right"></td>
									<td class="px-3 py-3 text-sm text-right bg-green-50"></td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t-2 border-gray-300 bg-gray-100">
								<td colspan="4" class="px-3 py-3 text-sm font-bold text-gray-900">총계</td>
								<td class="px-3 py-3 text-sm text-right font-bold">
									{formatNumber(totalAmount)}
								</td>
								<td class="px-3 py-3 text-sm text-right font-bold text-red-600">
									-{formatNumber(totalTax)}
								</td>
								<td class="px-3 py-3 text-sm text-right font-bold bg-green-100">
									{formatNumber(totalActualPayment)}
								</td>
							</tr>
						</tfoot>
					</table>
				</div>

				<div class="mt-6 bg-blue-50 rounded-lg p-4">
					<h4 class="text-sm font-medium text-blue-900 mb-2">원천징수 요약</h4>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
						<div>
							<span class="text-gray-600">총 지급액:</span>
							<span class="ml-2 font-medium">₩{formatNumber(totalAmount)}</span>
						</div>
						<div>
							<span class="text-gray-600">원천징수세액(3.3%):</span>
							<span class="ml-2 font-medium text-red-600">₩{formatNumber(totalTax)}</span>
						</div>
						<div>
							<span class="text-gray-600">실지급액:</span>
							<span class="ml-2 font-medium text-green-600">₩{formatNumber(totalActualPayment)}</span>
						</div>
					</div>
				</div>

				<div class="mt-4 text-xs text-gray-500">
					<p>* 원천징수세율 3.3% (소득세 3% + 지방소득세 0.3%)</p>
					<p>* 실지급액 = 지급액 - 원천징수세액</p>
					<p>* 원천징수세액은 익월 10일까지 세무서에 신고 및 납부</p>
				</div>
			</div>
		</div>
	</div>
{/if}