<script>
	import { onMount } from 'svelte';

	export let onOpenSettings = () => {};

	let plannerInfo = null;
	let contractStats = null;

	async function loadData() {
		try {
			const [infoRes, statsRes] = await Promise.all([
				fetch('/api/planner/info'),
				fetch('/api/planner/contract-stats')
			]);

			if (infoRes.ok) plannerInfo = await infoRes.json();
			if (statsRes.ok) contractStats = await statsRes.json();
		} catch (error) {
			console.error('설계사 정보 로드 오류:', error);
		}
	}

	onMount(() => {
		loadData();
	});
</script>

<!-- 카드 1: 설계사 정보 -->
<div class="rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 p-3 shadow-md">
	<div class="mb-2 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<img src="/icons/user.svg" alt="설계사" class="h-5 w-5 text-indigo-700" />
			<h3 class="text-base font-bold text-indigo-900">설계사 정보</h3>
		</div>
	</div>

	<div class="rounded border border-indigo-200 bg-indigo-50 p-2">
		<div class="mb-2 flex items-center justify-between border-b border-indigo-200 pb-2">
			<span class="text-xs font-semibold text-indigo-700">이름</span>
			<button
				onclick={onOpenSettings}
				class="text-sm font-medium text-indigo-600 underline decoration-dotted underline-offset-2 transition-colors hover:text-indigo-800"
			>
				{plannerInfo?.name || '-'}
			</button>
		</div>
		<div class="mb-2 flex items-center justify-between border-b border-indigo-200 pb-2">
			<span class="text-xs font-semibold text-indigo-700">전화번호</span>
			<span class="text-sm font-medium text-indigo-900">{plannerInfo?.phone || '-'}</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-xs font-semibold text-indigo-700">총 계약 건수</span>
			<span class="text-lg font-bold text-indigo-900">{contractStats?.totalContracts || 0}건</span>
		</div>
	</div>
</div>
