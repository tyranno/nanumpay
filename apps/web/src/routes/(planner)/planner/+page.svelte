<script>
	import { onMount } from 'svelte';
	import PlannerSettingsModal from '$lib/components/planner/PlannerSettingsModal.svelte';
	import PlannerInfoCard from '$lib/components/planner/PlannerInfoCard.svelte';
	import PaymentSummaryCard from '$lib/components/planner/PaymentSummaryCard.svelte';
	import CommissionSummaryCard from '$lib/components/planner/CommissionSummaryCard.svelte';
	import PaymentListCard from '$lib/components/planner/PaymentListCard.svelte';

	// 설정 모달 상태
	let isSettingsModalOpen = false;
	let plannerInfo = null;

	// 설계사 정보 로드
	async function loadPlannerInfo() {
		try {
			const response = await fetch('/api/planner/info');
			if (response.ok) {
				const data = await response.json();
				// API가 직접 객체를 반환 (planner 래퍼 없음)
				plannerInfo = data;
			}
		} catch (error) {
			console.error('설계사 정보 로드 실패:', error);
		}
	}

	// 설정 모달 열기
	async function openSettingsModal() {
		await loadPlannerInfo();
		isSettingsModalOpen = true;
	}

	// 설정 업데이트 핸들러
	function handleSettingsUpdated(updatedInfo) {
		console.log('설정 업데이트:', updatedInfo);
		plannerInfo = updatedInfo;
	}

	onMount(async () => {
		// 암호 변경 필요 여부 체크 (세션 스토리지)
		const requirePasswordChange = sessionStorage.getItem('requirePasswordChange');
		if (requirePasswordChange === 'true') {
			sessionStorage.removeItem('requirePasswordChange');
			await loadPlannerInfo();
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

<div class="w-full px-2 pb-2">
	<!-- 전체 Base 카드 -->
	<div class="rounded-lg bg-white shadow-lg p-4">
		<!-- 카드 1 & 2: 설계사 정보 + 지원비 총액 -->
		<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
		<PlannerInfoCard onOpenSettings={openSettingsModal} />
		<PaymentSummaryCard />
	</div>

	<!-- 카드 3: 설계사 수당 내역 -->
	<CommissionSummaryCard />

		<!-- 카드 4: 지원비 지급명부 -->
		<PaymentListCard />
	</div>
</div>

<!-- 설정 모달 -->
<PlannerSettingsModal
	isOpen={isSettingsModalOpen}
	{plannerInfo}
	onClose={() => (isSettingsModalOpen = false)}
	onUpdated={handleSettingsUpdated}
/>

