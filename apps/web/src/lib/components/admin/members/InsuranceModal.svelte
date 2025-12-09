<script>
	import { GRADE_LIMITS } from '$lib/utils/constants.js';
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let member = null;
	export let onSave = () => {};
	export let onClose = () => {};

	let insuranceAmount = 0;
	let insuranceDate = '';
	let insuranceAmountDisplay = '';
	let isLoading = false;
	let errorMessage = '';
	let lastOpenedMemberId = null;  // 마지막으로 열린 member ID 추적
	let showCancelConfirm = false;  // 해지 확인 모달

	// 등급별 필요 금액
	$: requiredAmount = member?.grade ? (GRADE_LIMITS[member.grade]?.insuranceAmount || 0) : 0;
	$: isInsuranceRequired = member?.grade ? (GRADE_LIMITS[member.grade]?.insuranceRequired || false) : false;

	// 모달 열릴 때만 초기화 (member 변경시 덮어쓰기 방지)
	$: if (isOpen && member && member._id !== lastOpenedMemberId) {
		lastOpenedMemberId = member._id;
		insuranceAmount = member.insuranceAmount || 0;
		insuranceAmountDisplay = insuranceAmount ? insuranceAmount.toLocaleString() : '';
		// 기존 가입일이 있으면 표시, 없으면 오늘 날짜
		if (member.insuranceDate) {
			const d = new Date(member.insuranceDate);
			insuranceDate = d.toISOString().split('T')[0];
		} else {
			insuranceDate = new Date().toISOString().split('T')[0];
		}
		errorMessage = '';
	}

	// 모달 닫힐 때 초기화
	$: if (!isOpen) {
		lastOpenedMemberId = null;
	}

	function handleAmountInput(event) {
		const value = event.target.value.replace(/[^0-9]/g, '');
		const numValue = parseInt(value) || 0;
		insuranceAmount = numValue;
		insuranceAmountDisplay = numValue ? numValue.toLocaleString() : '';
	}

	async function handleSave() {
		if (!member) return;

		// 유효성 검사: 가입일자만 필수
		if (!insuranceDate) {
			errorMessage = '보험 가입일자를 선택해주세요.';
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/admin/users/insurance', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: member._id,
					insuranceAmount,
					insuranceDate
				})
			});

			const result = await response.json();

			if (response.ok) {
				onSave(result);
				onClose();
			} else {
				errorMessage = result.error || '보험 가입 처리 실패';
			}
		} catch (error) {
			console.error('보험 가입 처리 오류:', error);
			errorMessage = '보험 가입 처리 중 오류가 발생했습니다.';
		} finally {
			isLoading = false;
		}
	}

	function handleClose() {
		errorMessage = '';
		onClose();
	}

	// 해지 확인 모달 열기
	function handleCancelClick() {
		if (!member) return;
		showCancelConfirm = true;
	}

	// 보험 해지 처리 (확인 후 실행)
	async function confirmCancel() {
		showCancelConfirm = false;
		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/admin/users/insurance', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: member._id,
					insuranceAmount: 0,
					insuranceDate: null,
					cancel: true  // 해지 플래그
				})
			});

			const result = await response.json();

			if (response.ok) {
				onSave(result);
				onClose();
			} else {
				errorMessage = result.error || '보험 해지 처리 실패';
			}
		} catch (error) {
			console.error('보험 해지 처리 오류:', error);
			errorMessage = '보험 해지 처리 중 오류가 발생했습니다.';
		} finally {
			isLoading = false;
		}
	}
</script>

{#if isOpen && member}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onclick={handleClose}>
		<div
			class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- 헤더 -->
			<div class="flex items-center justify-between px-4 py-3 border-b bg-blue-600 text-white rounded-t-lg">
				<h3 class="font-semibold">보험 가입</h3>
				<button onclick={handleClose} class="text-white hover:text-gray-200">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- 본문 -->
			<div class="p-4 space-y-4">
				<!-- 사용자 정보 -->
				<div class="bg-gray-50 p-3 rounded-lg">
					<div class="flex justify-between items-center">
						<span class="text-sm text-gray-600">지원자</span>
						<span class="font-medium">{member.name}</span>
					</div>
					<div class="flex justify-between items-center mt-1">
						<span class="text-sm text-gray-600">등급</span>
						<span class="font-medium text-blue-600">{member.grade}</span>
					</div>
					{#if isInsuranceRequired}
						<div class="flex justify-between items-center mt-1">
							<span class="text-sm text-gray-600">필요 금액</span>
							<span class="font-medium text-orange-600">{requiredAmount.toLocaleString()}원 이상</span>
						</div>
					{:else}
						<div class="mt-1 text-sm text-green-600">
							이 등급은 보험이 필요하지 않습니다.
						</div>
					{/if}
				</div>

				<!-- 보험 금액 입력 -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">보험 금액</label>
					<div class="flex items-center gap-2">
						<input
							type="text"
							value={insuranceAmountDisplay}
							oninput={handleAmountInput}
							placeholder="0"
							class="flex-1 px-3 py-2 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
						<span class="text-gray-600">원</span>
					</div>
					{#if isInsuranceRequired}
						<p class="text-xs text-gray-500 mt-1">
							{member.grade} 등급: {requiredAmount.toLocaleString()}원 이상 필요
						</p>
					{/if}
				</div>

				<!-- 보험 가입일자 -->
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">보험 가입일자</label>
					<input
						type="date"
						bind:value={insuranceDate}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
					<p class="text-xs text-gray-500 mt-1">
						이 날짜 이후의 지급계획부터 보험 조건이 적용됩니다.
					</p>
				</div>

				<!-- 에러 메시지 -->
				{#if errorMessage}
					<div class="bg-red-50 text-red-600 px-3 py-2 rounded-md text-sm">
						{errorMessage}
					</div>
				{/if}
			</div>

			<!-- 푸터 -->
			<div class="flex justify-between px-4 py-3 border-t bg-gray-50 rounded-b-lg">
				<!-- 왼쪽: 해지 버튼 (기존 보험이 있을 때만) -->
				<div>
					{#if member.insuranceActive}
						<button
							onclick={handleCancelClick}
							disabled={isLoading}
							class="px-4 py-2 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50"
						>
							보험 해지
						</button>
					{/if}
				</div>
				<!-- 오른쪽: 취소/저장 버튼 -->
				<div class="flex gap-2">
					<button
						onclick={handleClose}
						class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-100"
					>
						취소
					</button>
					<button
						onclick={handleSave}
						disabled={isLoading}
						class="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if isLoading}
							처리 중...
						{:else}
							보험 가입
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- 해지 확인 모달 -->
<WindowsModal
	isOpen={showCancelConfirm}
	title="보험 해지 확인"
	size="sm"
	onClose={() => showCancelConfirm = false}
>
	<div class="p-4 space-y-4">
		<div class="flex items-start gap-3">
			<div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
				<svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
			</div>
			<div>
				<p class="text-sm text-gray-700">
					<strong>{member?.name}</strong>님의 보험을 해지하시겠습니까?
				</p>
				<p class="text-sm text-red-600 mt-2">
					⚠️ 해지 시 오늘 이후의 지급계획이 중단됩니다.
				</p>
			</div>
		</div>
	</div>
	<svelte:fragment slot="footer">
		<button
			onclick={() => showCancelConfirm = false}
			class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-100"
		>
			취소
		</button>
		<button
			onclick={confirmCancel}
			class="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
		>
			해지
		</button>
	</svelte:fragment>
</WindowsModal>
