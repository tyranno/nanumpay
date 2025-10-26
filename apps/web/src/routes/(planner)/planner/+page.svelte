<script>
	import { onMount } from 'svelte';
	import PlannerSettingsModal from '$lib/components/planner/PlannerSettingsModal.svelte';
	import PlannerInfoCard from '$lib/components/planner/PlannerInfoCard.svelte';
	import PaymentSummaryCard from '$lib/components/planner/PaymentSummaryCard.svelte';
	import CommissionSummaryCard from '$lib/components/planner/CommissionSummaryCard.svelte';
	import PaymentListCard from '$lib/components/planner/PaymentListCard.svelte';

	// 설정 모달 상태
	let isSettingsModalOpen = false;

	// 설정 모달 열기
	function openSettingsModal() {
		isSettingsModalOpen = true;
	}

	// 설정 업데이트 핸들러
	function handleSettingsUpdated(updatedInfo) {
		console.log('설정 업데이트:', updatedInfo);
	}

	onMount(async () => {
		// 암호 변경 필요 여부 체크 (세션 스토리지)
		const requirePasswordChange = sessionStorage.getItem('requirePasswordChange');
		if (requirePasswordChange === 'true') {
			sessionStorage.removeItem('requirePasswordChange');
			isSettingsModalOpen = true;
			// PlannerSettingsModal에 암호 탭으로 전환하라는 신호 보내기
			setTimeout(() => {
				const event = new CustomEvent('force-password-tab');
				window.dispatchEvent(event);
			}, 100);
		}
	});
</script>

<svelte:head>
	<title>설계사 대시보드</title>
</svelte:head>

<div class="container">
	<!-- 카드 1 & 2: 설계사 정보 + 용역비 총액 -->
	<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
		<PlannerInfoCard onOpenSettings={openSettingsModal} />
		<PaymentSummaryCard />
	</div>

	<!-- 카드 3: 설계사 수당 내역 -->
	<CommissionSummaryCard />

	<!-- 카드 4: 용역비 지급명부 -->
	<PaymentListCard />
</div>

<!-- 설정 모달 -->
<PlannerSettingsModal
	isOpen={isSettingsModalOpen}
	onClose={() => (isSettingsModalOpen = false)}
	onUpdated={handleSettingsUpdated}
/>

<style>
	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
