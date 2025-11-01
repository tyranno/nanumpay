<script>
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import MonthlyRevenueCard from '$lib/components/admin/MonthlyRevenueCard.svelte';
	import MonthlyRevenueCardMobile from '$lib/components/admin/MonthlyRevenueCardMobile.svelte';
	import PaymentStatisticsCard from '$lib/components/admin/PaymentStatisticsCard.svelte';
	import PaymentStatisticsCardMobile from '$lib/components/admin/PaymentStatisticsCardMobile.svelte';

	let isMobile = false;

	function checkScreenSize() {
		if (browser) {
			isMobile = window.innerWidth < 768;
		}
	}

	onMount(() => {
		checkScreenSize();
		window.addEventListener('resize', checkScreenSize);
		return () => {
			window.removeEventListener('resize', checkScreenSize);
		};
	});
</script>

<svelte:head>
	<title>관리자 홈 - 나눔페이</title>
</svelte:head>

<div class="w-full px-2 pb-2">
	<!-- 전체 Base 카드 -->
	<div class="rounded-lg bg-white shadow-lg p-4">
		<div class="space-y-6">
			{#if isMobile}
				<!-- 모바일: 768px 미만 -->
				<MonthlyRevenueCardMobile />
				<PaymentStatisticsCardMobile />
			{:else}
				<!-- 데스크톱: 768px 이상 -->
				<MonthlyRevenueCard />
				<PaymentStatisticsCard />
			{/if}
		</div>
	</div>
</div>
