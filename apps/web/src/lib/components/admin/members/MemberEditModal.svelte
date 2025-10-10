<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';

	export let isOpen = false;
	export let member = null;
	export let onClose = () => {};
	export let onSubmit = (memberData) => {};
</script>

<WindowsModal
	isOpen={isOpen && member}
	title="회원 정보 수정"
	icon="/icons/edit-blue.svg"
	size="lg"
	{onClose}
>
	{#if member}
		<div class="grid grid-cols-2 gap-6">
			<!-- 왼쪽: 사용자 기본 정보 -->
			<div class="space-y-4">
				<h4 class="text-sm font-semibold text-gray-900 border-b pb-2">기본 정보</h4>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">성명</label>
					<input
						type="text"
						bind:value={member.name}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">연락처</label>
					<input
						type="text"
						bind:value={member.phone}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">주민번호</label>
					<input
						type="text"
						bind:value={member.idNumber}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">은행</label>
					<input
						type="text"
						bind:value={member.bank}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">계좌번호</label>
					<input
						type="text"
						bind:value={member.accountNumber}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">보험상품명</label>
					<input
						type="text"
						bind:value={member.insuranceProduct}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">보험회사</label>
					<input
						type="text"
						bind:value={member.insuranceCompany}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</div>

			<!-- 오른쪽: 판매인/설계사 정보 -->
			<div class="space-y-4">
				<h4 class="text-sm font-semibold text-gray-900 border-b pb-2">판매/설계 정보</h4>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">판매인</label>
						<input
							type="text"
							bind:value={member.salesperson}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">판매인 연락처</label>
						<input
							type="text"
							bind:value={member.salespersonPhone}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">설계사</label>
						<input
							type="text"
							bind:value={member.planner}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-sm font-medium text-gray-700 mb-1">설계사 연락처</label>
						<input
							type="text"
							bind:value={member.plannerPhone}
							class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 mb-1">소속/지사</label>
					<input
						type="text"
						bind:value={member.branch}
						class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>
			</div>
		</div>

		<div class="mt-4">
			<label class="block text-sm font-medium text-gray-700 mb-1">상태</label>
			<select
				bind:value={member.status}
				class="w-full px-3 py-2 border border-gray-300 rounded-md appearance-none bg-no-repeat"
				style="background-image: url('/icons/chevron-down.svg'); background-position: right 0.5rem center; background-size: 1.5em 1.5em;"
			>
				<option value="active">활성</option>
				<option value="inactive">비활성</option>
				<option value="suspended">정지</option>
			</select>
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<button
			onclick={onClose}
			class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
		>
			취소
		</button>
		<button
			onclick={() => onSubmit(member)}
			class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
		>
			수정
		</button>
	</svelte:fragment>
</WindowsModal>
