<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	// Props
	export let isOpen = false;
	export let plannerInfo = null;
	export let onClose = () => {};
	export let onSaved = () => {};

	// 상태
	let isSubmitting = false;
	let errorMessage = '';
	let successMessage = '';

	// 폼 데이터
	let name = '';
	let phone = '';
	let bank = '';
	let accountNumber = '';

	// plannerInfo 변경 시 폼 초기화
	$: if (plannerInfo && isOpen) {
		name = plannerInfo.name || '';
		phone = plannerInfo.phone || '';
		bank = plannerInfo.bank || '';
		accountNumber = plannerInfo.accountNumber || '';
		errorMessage = '';
		successMessage = '';
	}

	async function handleSave() {
		if (!plannerInfo?.plannerAccountId) {
			errorMessage = '설계사 정보가 없습니다.';
			return;
		}

		errorMessage = '';
		successMessage = '';
		isSubmitting = true;

		try {
			const response = await fetch('/api/admin/planners/update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					plannerAccountId: plannerInfo.plannerAccountId,
					name,
					phone,
					bank,
					accountNumber
				})
			});

			const data = await response.json();

			if (response.ok) {
				successMessage = '설계사 정보가 수정되었습니다.';
				onSaved(data.planner);
				setTimeout(() => {
					onClose();
				}, 1000);
			} else {
				errorMessage = data.error || '수정에 실패했습니다.';
			}
		} catch (error) {
			console.error('설계사 정보 수정 오류:', error);
			errorMessage = '서버 오류가 발생했습니다.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<WindowsModal
	{isOpen}
	title="설계사 정보 수정"
	icon="/icons/edit-blue.svg"
	size="sm"
	{onClose}
>
	<div class="space-y-3">
		{#if errorMessage}
			<div class="rounded bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
				{errorMessage}
			</div>
		{/if}

		{#if successMessage}
			<div class="rounded bg-green-50 px-3 py-2 text-sm text-green-700 border border-green-200">
				{successMessage}
			</div>
		{/if}

		<div>
			<label class="block text-xs font-medium text-gray-700 mb-1">설계사 이름</label>
			<input
				type="text"
				bind:value={name}
				class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				placeholder="설계사 이름"
			/>
		</div>

		<div>
			<label class="block text-xs font-medium text-gray-700 mb-1">연락처</label>
			<input
				type="tel"
				bind:value={phone}
				class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				placeholder="010-0000-0000"
			/>
		</div>

		<div>
			<label class="block text-xs font-medium text-gray-700 mb-1">은행</label>
			<input
				type="text"
				bind:value={bank}
				class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				placeholder="은행명"
			/>
		</div>

		<div>
			<label class="block text-xs font-medium text-gray-700 mb-1">계좌번호</label>
			<input
				type="text"
				bind:value={accountNumber}
				class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				placeholder="계좌번호"
			/>
		</div>
	</div>

	<svelte:fragment slot="footer">
		<button
			onclick={onClose}
			class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
		>
			취소
		</button>
		<button
			onclick={handleSave}
			disabled={isSubmitting}
			class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{isSubmitting ? '저장 중...' : '저장'}
		</button>
	</svelte:fragment>
</WindowsModal>
