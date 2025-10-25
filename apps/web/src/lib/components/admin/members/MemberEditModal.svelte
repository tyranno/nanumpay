<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';
	import Autocomplete from '$lib/components/Autocomplete.svelte';

	export let isOpen = false;
	export let member = null;
	export let onClose = () => {};
	export let onSubmit = (memberData) => {};

	// 판매인 선택 핸들러
	function handleSalespersonSelect(user) {
		member.salesperson = user.name;
		member.salespersonPhone = user.phone || '';
		member.parentId = user._id;
	}

	// 설계사 선택 핸들러
	function handlePlannerSelect(planner) {
		member.planner = planner.name;
		member.plannerPhone = planner.phone || '';
	}

	// 판매인 이름 변경 시 자동으로 연락처 추출
	async function handleSalespersonNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			member.salespersonPhone = '';
			member.parentId = '';
			return;
		}

		try {
			const response = await fetch(`/api/admin/users/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.users?.find(u => u.name === name);
			if (exactMatch) {
				member.salespersonPhone = exactMatch.phone || '';
				member.parentId = exactMatch._id;
			}
		} catch (error) {
			console.error('Failed to fetch salesperson data:', error);
		}
	}

	// 설계사 이름 변경 시 자동으로 연락처 추출
	async function handlePlannerNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			member.plannerPhone = '';
			return;
		}

		try {
			const response = await fetch(`/api/planners/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.planners?.find(p => p.name === name);
			if (exactMatch) {
				member.plannerPhone = exactMatch.phone || '';
			}
		} catch (error) {
			console.error('Failed to fetch planner data:', error);
		}
	}

	// 소속/지사 선택 핸들러
	function handleBranchSelect(branch) {
		member.branch = branch.name;
	}

	// 보험 금액 표시용 (쉼표 포함)
	let insuranceAmountDisplay = '';

	// member가 변경될 때 표시 값 업데이트
	$: if (member) {
		insuranceAmountDisplay = member.insuranceAmount ? member.insuranceAmount.toLocaleString() : '';
	}

	// 입력 시 쉼표 제거하고 숫자만 저장
	function handleInsuranceAmountInput(event) {
		const value = event.target.value.replace(/,/g, '');
		const numValue = parseInt(value) || 0;
		member.insuranceAmount = numValue;
		insuranceAmountDisplay = numValue ? numValue.toLocaleString() : '';
	}
</script>

<WindowsModal
	isOpen={isOpen && member}
	title="용역자 정보 수정"
	icon="/icons/edit-blue.svg"
	size="xl"
	{onClose}
>
	{#if member}
		<div class="grid grid-cols-2 gap-4">
			<!-- 왼쪽: 사용자 기본 정보 -->
			<div class="space-y-3">
				<h4 class="text-xs font-semibold text-gray-900 border-b pb-1.5">기본 정보</h4>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">성명</label>
						<input
							type="text"
							bind:value={member.name}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">계정 ID</label>
						<input
							type="text"
							value={member.loginId || '-'}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-600"
							readonly
							title="시스템에서 자동 생성된 로그인 ID"
						/>
					</div>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">연락처</label>
					<input
						type="text"
						bind:value={member.phone}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">주민번호</label>
					<input
						type="text"
						bind:value={member.idNumber}
						class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">은행</label>
						<input
							type="text"
							bind:value={member.bank}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">계좌번호</label>
						<input
							type="text"
							bind:value={member.accountNumber}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">보험상품명</label>
						<input
							type="text"
							bind:value={member.insuranceProduct}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">보험회사</label>
						<input
							type="text"
							bind:value={member.insuranceCompany}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
				</div>
			</div>

			<!-- 오른쪽: 판매인/설계사 정보 -->
			<div class="space-y-3">
				<h4 class="text-xs font-semibold text-gray-900 border-b pb-1.5">판매/설계 정보</h4>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<Autocomplete
							label="판매인"
							bind:value={member.salesperson}
							placeholder="판매인 이름 검색..."
							apiUrl="/api/admin/users/search"
							displayKey="name"
							subtextKey="phone"
							onSelect={handleSalespersonSelect}
							onInputChange={handleSalespersonNameChange}
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">판매인 연락처</label>
						<input
							type="text"
							bind:value={member.salespersonPhone}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							readonly
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<Autocomplete
							label="설계사"
							bind:value={member.planner}
							placeholder="설계사 이름 검색..."
							apiUrl="/api/planners/search"
							displayKey="name"
							subtextKey="phone"
							onSelect={handlePlannerSelect}
							onInputChange={handlePlannerNameChange}
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">설계사 연락처</label>
						<input
							type="text"
							bind:value={member.plannerPhone}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							readonly
						/>
					</div>
				</div>

				<div>
					<Autocomplete
						label="소속/지사"
						bind:value={member.branch}
						placeholder="소속/지사 검색..."
						apiUrl="/api/branches/search"
						displayKey="name"
						onSelect={handleBranchSelect}
					/>
				</div>

				<!-- 추가 보험 정보 (F3+ 필수) -->
				{#if member.grade && ['F3', 'F4', 'F5', 'F6', 'F7', 'F8'].includes(member.grade)}
					<div class="border border-gray-200 rounded p-2">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-1.5">
								<svg class="w-3.5 h-3.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
								</svg>
								<span class="text-xs font-medium text-amber-700">추가 보험 (필수)</span>
								{#if member.grade === 'F3' || member.grade === 'F4'}
									<span class="text-xs text-amber-600">최소 5만원</span>
								{:else if member.grade === 'F5' || member.grade === 'F6'}
									<span class="text-xs text-amber-600">최소 7만원</span>
								{:else if member.grade === 'F7' || member.grade === 'F8'}
									<span class="text-xs text-amber-600">최소 10만원</span>
								{/if}
							</div>
							<div class="flex items-center gap-1">
								<input
									type="text"
									value={insuranceAmountDisplay}
									oninput={handleInsuranceAmountInput}
									placeholder="0"
									class="w-28 px-2 py-1 text-xs text-right border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
								/>
								<span class="text-xs text-gray-600">원</span>
							</div>
						</div>
					</div>
				{/if}

				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">산하정보 보기 권한</label>
					<label class="flex items-center cursor-pointer mt-1.5">
						<input
							type="checkbox"
							bind:checked={member.canViewSubordinates}
							class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
						/>
						<span class="ml-2 text-sm text-gray-700">산하정보 조회 허용</span>
					</label>
				</div>
			</div>
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
