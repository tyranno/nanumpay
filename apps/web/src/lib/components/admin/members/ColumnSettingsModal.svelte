<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let tempVisibleColumns = {};
	export let onClose = () => {};
	export let onShowAll = () => {};
	export let onApply = () => {};

	// ⭐ 토글 상태 계산 (name 제외한 모든 컬럼이 true인지 확인)
	$: allShown = Object.entries(tempVisibleColumns)
		.filter(([key]) => key !== 'name') // name은 필수
		.every(([, value]) => value === true);

	// ⭐ 토글 함수
	function handleToggleAll() {
		const newValue = !allShown;
		Object.keys(tempVisibleColumns).forEach(key => {
			if (key !== 'name') { // name은 항상 true 유지
				tempVisibleColumns[key] = newValue;
			}
		});
		tempVisibleColumns = { ...tempVisibleColumns }; // 반응성 트리거
	}
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
		<!-- 기본 정보 섹션 -->
		<div class="col-span-2">
			<h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">기본 정보</h4>
		</div>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.insurance}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">유지/비율</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.date}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">등록일</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.promotionDate}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">승급일</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.insuranceDeadline}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">가입기한</span>
		</label>
		<label class="flex items-center p-1.5 bg-blue-50 rounded cursor-not-allowed border border-blue-200">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.name}
				disabled
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300"
			/>
			<span class="text-sm font-medium text-gray-700">성명 <span class="text-xs text-blue-600">(필수)</span></span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.phone}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">연락처</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.idNumber}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">주민번호</span>
		</label>

		<!-- 조직 정보 섹션 -->
		<div class="col-span-2 mt-1.5">
			<h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">조직 정보</h4>
		</div>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.salesperson}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">판매인</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.planner}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">설계사</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.plannerPhone}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">설계사 연락처</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.plannerAccountNumber}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">설계사 계좌번호</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.branch}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">지사</span>
		</label>

		<!-- 금융/보험 정보 섹션 -->
		<div class="col-span-2 mt-1.5">
			<h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">금융/보험 정보</h4>
		</div>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.bank}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">은행</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.accountNumber}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">계좌번호</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.insuranceProduct}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">보험상품</span>
		</label>
		<label class="flex items-center p-1.5 bg-gray-50 hover:bg-blue-50 rounded cursor-pointer transition-colors">
			<input
				type="checkbox"
				bind:checked={tempVisibleColumns.insuranceCompany}
				class="mr-3 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
			/>
			<span class="text-sm font-medium text-gray-700">보험회사</span>
		</label>
	</div>

	<svelte:fragment slot="footer">
		<button
			onclick={handleToggleAll}
			class="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors mr-auto"
		>
			{allShown ? '모두 숨김' : '모두 표시'}
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
