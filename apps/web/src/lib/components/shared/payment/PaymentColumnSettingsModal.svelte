<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let tempSettings = {};
	export let onClose = () => {};
	export let onShowAll = () => {};
	export let onApply = () => {};
	export let showPlannerOption = true; // ⭐ 설계자 옵션 표시 여부 (기본값 true)
</script>

<WindowsModal
	{isOpen}
	title="컬럼 설정"
	icon="/icons/settings-white.svg"
	size="sm"
	{onClose}
>
	<!-- 본문: 컬럼 목록 -->
	<div class="grid grid-cols-2 gap-1.5 max-h-80 overflow-y-auto">
		<!-- 기본 컬럼 섹션 -->
		<div class="col-span-2">
			<h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">기본 컬럼</h4>
		</div>
		{#if showPlannerOption}
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempSettings.showPlannerColumn}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">설계자</span>
		</label>
		{/if}
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempSettings.showBankColumn}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">은행</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempSettings.showAccountColumn}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">계좌번호</span>
		</label>

		<!-- 주차별 상세 컬럼 섹션 -->
		<div class="col-span-2 mt-1.5">
			<h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">주차별 상세</h4>
		</div>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempSettings.showGradeInfoColumn}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">등급(회수)</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempSettings.showTaxColumn}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">원천징수</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempSettings.showNetColumn}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">실지급액</span>
		</label>
	</div>

	<svelte:fragment slot="footer">
		<button
			onclick={onShowAll}
			class="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors mr-auto"
		>
			모두 표시
		</button>
		<button
			onclick={onClose}
			class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
		>
			취소
		</button>
		<button
			onclick={onApply}
			class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors shadow-sm"
		>
			적용
		</button>
	</svelte:fragment>
</WindowsModal>
