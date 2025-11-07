<script>
	import { onMount } from 'svelte';

	let paymentSummary = null;

	function formatAmount(value) {
		if (value === null || value === undefined) return '0원';
		return value.toLocaleString('ko-KR') + '원';
	}

	async function loadData() {
		try {
			const response = await fetch('/api/planner/payment-summary');
			if (response.ok) {
				paymentSummary = await response.json();
			}
		} catch (error) {
			console.error('지원비 총액 로드 오류:', error);
		}
	}

	onMount(() => {
		loadData();
	});
</script>

<!-- 카드 2: 지원비 총액 -->
<div class="rounded-lg bg-gradient-to-br from-green-50 to-emerald-100 p-3 shadow-md">
	<div class="mb-2 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<img src="/icons/total-budget.svg" alt="지원비 총액" class="h-6 w-6" />
			<h3 class="text-base font-bold text-emerald-900">지원비 총액</h3>
		</div>
	</div>

	<div class="rounded border border-emerald-200 bg-emerald-50 p-2">
		<table class="w-full">
			<thead>
				<tr class="border-b border-emerald-300">
					<th class="py-1 text-left text-xs font-semibold text-emerald-700">구분</th>
					<th class="py-1 text-right text-xs font-semibold text-emerald-700">총액</th>
					<th class="py-1 text-right text-xs font-semibold text-emerald-700">실수령</th>
				</tr>
			</thead>
			<tbody>
				<tr class="border-b border-emerald-200">
					<td class="py-1.5 text-sm font-semibold text-emerald-700">
						이번주 지급액
						{#if paymentSummary?.thisWeek?.date}
							<span class="ml-1 text-xs text-gray-500">({paymentSummary.thisWeek.date})</span>
						{/if}
					</td>
					<td class="py-1.5 text-right text-base font-bold text-emerald-900">{formatAmount(paymentSummary?.thisWeek?.amount)}</td>
					<td class="py-1.5 text-right text-base font-bold text-blue-600">{formatAmount(paymentSummary?.thisWeek?.net)}</td>
				</tr>
				<tr class="border-b border-emerald-200">
					<td class="py-1.5 text-xs font-semibold text-emerald-700">누적 지급액</td>
					<td class="py-1.5 text-right text-xs text-emerald-700">{formatAmount(paymentSummary?.totalPaid?.amount)}</td>
					<td class="py-1.5 text-right text-xs font-semibold text-green-600">{formatAmount(paymentSummary?.totalPaid?.net)}</td>
				</tr>
				<tr>
					<td class="py-1.5 text-xs font-semibold text-emerald-700">남은 예정액</td>
					<td class="py-1.5 text-right text-xs text-emerald-700">{formatAmount(paymentSummary?.upcoming?.amount)}</td>
					<td class="py-1.5 text-right text-xs font-semibold text-purple-600">{formatAmount(paymentSummary?.upcoming?.net)}</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>
