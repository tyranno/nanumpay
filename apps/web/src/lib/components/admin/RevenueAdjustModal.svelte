<script>
	import { createEventDispatcher } from 'svelte';

	export let monthKey = '';
	export let currentData = null;

	const dispatch = createEventDispatcher();

	let adjustedRevenue = currentData?.adjustedRevenue || currentData?.totalRevenue || 0;
	let reason = '';
	let force = false;
	let isSubmitting = false;
	let errorMessage = '';
	let showConfirmation = false;

	// 지급 진행 중 여부
	$: hasPaid = currentData?.paymentStatus?.hasPaid || false;
	$: paidCount = currentData?.paymentStatus?.paidCount || 0;

	// 변경 금액 계산
	$: currentRevenue = currentData?.effectiveRevenue || 0;
	$: changeAmount = adjustedRevenue - currentRevenue;
	$: changePercentage = currentRevenue > 0 ? ((changeAmount / currentRevenue) * 100).toFixed(1) : 0;

	function handleClose() {
		dispatch('close');
	}

	function handleConfirm() {
		if (hasPaid && !force) {
			showConfirmation = true;
		} else {
			submitAdjustment();
		}
	}

	async function submitAdjustment() {
		if (!adjustedRevenue || adjustedRevenue < 0) {
			errorMessage = '매출액은 0 이상이어야 합니다';
			return;
		}

		if (hasPaid && !reason.trim()) {
			errorMessage = '지급이 진행 중인 월은 변경 사유가 필수입니다';
			return;
		}

		try {
			isSubmitting = true;
			errorMessage = '';

			const response = await fetch('/api/admin/revenue/adjust', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					monthKey,
					adjustedRevenue,
					reason: reason.trim() || '사유 미기재',
					force
				})
			});

			const result = await response.json();

			if (response.ok && result.success) {
				dispatch('adjusted', result);
			} else {
				errorMessage = result.error || '매출 변경에 실패했습니다';
			}
		} catch (error) {
			console.error('Error adjusting revenue:', error);
			errorMessage = '네트워크 오류가 발생했습니다';
		} finally {
			isSubmitting = false;
		}
	}

	function handleForceConfirm() {
		force = true;
		showConfirmation = false;
		submitAdjustment();
	}
</script>

<!-- 모달 배경 -->
<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
	<!-- 모달 -->
	<div class="bg-white rounded-lg shadow-xl max-w-md w-full">
		<!-- 헤더 -->
		<div class="px-6 py-4 border-b border-gray-200">
			<h3 class="text-lg font-semibold text-gray-900">📝 매출 수동 설정</h3>
		</div>

		<!-- 본문 -->
		<div class="px-6 py-4 space-y-4">
			<!-- 대상 월 -->
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">대상 월</label>
				<div class="text-base font-semibold text-gray-900">
					{monthKey.replace('-', '년 ')}월
				</div>
			</div>

			<!-- 현재 매출 -->
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">현재 매출</label>
				<div class="text-sm text-gray-600">
					{#if currentData?.isManualRevenue}
						<div class="flex items-center gap-2">
							<span>수동 설정:</span>
							<span class="font-semibold text-orange-600">
								{currentData.adjustedRevenue.toLocaleString()}원
							</span>
						</div>
						<div class="text-xs text-gray-500 mt-1">
							(자동 계산: {currentData.totalRevenue.toLocaleString()}원, 등록자 {currentData.registrationCount}명)
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<span>자동 계산:</span>
							<span class="font-semibold">
								{currentData.totalRevenue.toLocaleString()}원
							</span>
							<span class="text-xs text-gray-500">(등록자 {currentData.registrationCount}명)</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- 새 매출액 -->
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">새 매출액 *</label>
				<div class="flex items-center gap-2">
					<input
						type="number"
						bind:value={adjustedRevenue}
						step="100000"
						min="0"
						class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						placeholder="예: 5000000"
					/>
					<span class="text-sm text-gray-500">원</span>
				</div>
				{#if changeAmount !== 0}
					<div class="mt-1 text-sm">
						<span class={changeAmount > 0 ? 'text-green-600' : 'text-red-600'}>
							{changeAmount > 0 ? '+' : ''}{changeAmount.toLocaleString()}원
							({changeAmount > 0 ? '+' : ''}{changePercentage}%)
						</span>
					</div>
				{/if}
			</div>

			<!-- 변경 사유 -->
			<div>
				<label class="block text-sm font-medium text-gray-700 mb-1">
					변경 사유 {hasPaid ? '(필수)' : '(선택)'}
				</label>
				<textarea
					bind:value={reason}
					rows="3"
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					placeholder="예: 특별 인센티브 포함"
				/>
			</div>

			<!-- 경고 메시지 -->
			{#if hasPaid}
				<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
					<div class="flex items-start gap-2">
						<span class="text-yellow-600 text-lg">⚠️</span>
						<div class="flex-1 text-sm">
							<p class="font-semibold text-yellow-800 mb-1">이미 지급이 진행된 월입니다</p>
							<ul class="list-disc list-inside text-yellow-700 space-y-1">
								<li>완료된 지급: {paidCount}건</li>
								<li>모든 지급 계획이 삭제되고 재생성됩니다</li>
								<li>이미 지급된 금액과 향후 금액이 달라질 수 있습니다</li>
							</ul>
						</div>
					</div>
				</div>
			{:else}
				<div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
					<div class="flex items-start gap-2">
						<span class="text-blue-600 text-lg">ℹ️</span>
						<div class="flex-1 text-sm">
							<p class="font-semibold text-blue-800 mb-1">주의사항</p>
							<ul class="list-disc list-inside text-blue-700 space-y-1">
								<li>모든 지급 계획이 재생성됩니다</li>
								<li>변경 이력이 기록되며 감사됩니다</li>
								<li>긴급 상황에만 사용하세요</li>
							</ul>
						</div>
					</div>
				</div>
			{/if}

			<!-- 에러 메시지 -->
			{#if errorMessage}
				<div class="bg-red-50 border border-red-200 rounded-lg p-3">
					<p class="text-sm text-red-700">{errorMessage}</p>
				</div>
			{/if}
		</div>

		<!-- 푸터 -->
		<div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
			<button
				onclick={handleClose}
				disabled={isSubmitting}
				class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition disabled:opacity-50"
			>
				취소
			</button>
			<button
				onclick={handleConfirm}
				disabled={isSubmitting}
				class={`px-4 py-2 text-sm font-medium text-white rounded transition disabled:opacity-50 ${
					hasPaid ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
				}`}
			>
				{#if isSubmitting}
					처리 중...
				{:else if hasPaid}
					변경 적용 (위험)
				{:else}
					변경 적용
				{/if}
			</button>
		</div>
	</div>
</div>

<!-- 확인 모달 (지급 진행 중일 때) -->
{#if showConfirmation}
	<div class="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-60">
		<div class="bg-white rounded-lg shadow-xl max-w-sm w-full m-4">
			<div class="px-6 py-4 border-b border-gray-200">
				<h3 class="text-lg font-semibold text-red-600">⚠️ 최종 확인</h3>
			</div>
			<div class="px-6 py-4">
				<p class="text-sm text-gray-700 mb-4">
					이미 {paidCount}건의 지급이 완료되었습니다.<br/>
					정말로 매출을 변경하시겠습니까?
				</p>
				<p class="text-xs text-red-600 font-semibold">
					이 작업은 되돌릴 수 없으며, 지급된 금액과 향후 금액의 불일치가 발생할 수 있습니다.
				</p>
			</div>
			<div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
				<button
					onclick={() => { showConfirmation = false; }}
					class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition"
				>
					취소
				</button>
				<button
					onclick={handleForceConfirm}
					class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition"
				>
					변경 진행
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* 모달 애니메이션 */
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	div.fixed {
		animation: fadeIn 0.2s ease-out;
	}
</style>
