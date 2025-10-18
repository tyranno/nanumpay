<script>
	import MonthlyRevenueCard from '$lib/components/admin/MonthlyRevenueCard.svelte';
	import MonthlyRevenueCardMobile from '$lib/components/admin/MonthlyRevenueCardMobile.svelte';
	import PaymentStatisticsCard from '$lib/components/admin/PaymentStatisticsCard.svelte';
	import PaymentStatisticsCardMobile from '$lib/components/admin/PaymentStatisticsCardMobile.svelte';
</script>

<svelte:head>
	<title>관리자 홈 - 나눔페이</title>
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
	<!-- 매출 통계 (화면 크기에 따라 분기 - Tailwind 방식) -->
	<!-- 모바일: 768px 미만 -->
	<div class="block md:hidden">
		<MonthlyRevenueCardMobile />
	</div>

	<!-- 데스크톱: 768px 이상 -->
	<div class="hidden md:block">
		<MonthlyRevenueCard />
	</div>

	<!-- 지급 통계 (화면 크기에 따라 분기) -->
	<!-- 모바일: 768px 미만 -->
	<div class="block md:hidden">
		<PaymentStatisticsCardMobile />
	</div>

	<!-- 데스크톱: 768px 이상 -->
	<div class="hidden md:block">
		<PaymentStatisticsCard />
	</div>
</div>
