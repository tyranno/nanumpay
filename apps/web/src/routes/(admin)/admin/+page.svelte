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

<div class="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
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
