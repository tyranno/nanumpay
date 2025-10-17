<script>
	import MonthlyRevenueCard from '$lib/components/admin/MonthlyRevenueCard.svelte';
	import PaymentStatisticsCard from '$lib/components/admin/PaymentStatisticsCard.svelte';
</script>

<svelte:head>
	<title>관리자 홈 - 나눔페이</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-6">
	<!-- 매출 통계 -->
	<MonthlyRevenueCard />

	<!-- 지급 통계 -->
	<PaymentStatisticsCard />
</div>