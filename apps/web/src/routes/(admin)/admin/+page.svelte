<script>
	import GradePaymentCard from '$lib/components/admin/GradePaymentCard.svelte';
</script>

<svelte:head>
	<title>관리자 홈 - 나눔페이</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
	<!-- 월별 매출 및 등급 통계 -->
	<GradePaymentCard />
</div>