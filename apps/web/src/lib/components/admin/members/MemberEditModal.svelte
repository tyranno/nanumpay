<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';
	import Autocomplete from '$lib/components/Autocomplete.svelte';
	import InsuranceModal from './InsuranceModal.svelte';
	import { GRADE_LIMITS } from '$lib/utils/constants.js';

	export let isOpen = false;
	export let member = null;
	export let onClose = () => {};
	export let onSubmit = (memberData) => {};
	export let onChangedInsurance = (userData) => {};  // 보험 변경 이벤트

	// 보험 모달 상태
	let showInsuranceModal = false;

	// 변경 감지용 원본 멤버 저장
	let originalMember = null;
	let lastOpenedMemberId = null;

	// 모달 열릴 때 원본 저장 (member 변경 시 덮어쓰기 방지)
	$: if (isOpen && member && member._id !== lastOpenedMemberId) {
		lastOpenedMemberId = member._id;
		// 보험 필드 제외한 원본 저장 (deep copy)
		originalMember = {
			name: member.name,
			phone: member.phone,
			idNumber: member.idNumber,
			bank: member.bank,
			accountNumber: member.accountNumber,
			insuranceProduct: member.insuranceProduct,
			insuranceCompany: member.insuranceCompany,
			salesperson: member.salesperson,
			salespersonPhone: member.salespersonPhone,
			parentId: member.parentId,
			planner: member.planner,
			plannerPhone: member.plannerPhone,
			plannerBank: member.plannerBank,  // ⭐ 설계사 은행
			plannerAccountNumber: member.plannerAccountNumber,  // ⭐ 설계사 계좌번호
			branch: member.branch,
			canViewSubordinates: member.canViewSubordinates
		};
	}

	// 모달 닫힐 때 초기화
	$: if (!isOpen) {
		lastOpenedMemberId = null;
		originalMember = null;
	}

	// 변경 여부 확인 (보험 필드 제외)
	function hasChanges() {
		if (!originalMember || !member) return false;

		return (
			originalMember.name !== member.name ||
			originalMember.phone !== member.phone ||
			originalMember.idNumber !== member.idNumber ||
			originalMember.bank !== member.bank ||
			originalMember.accountNumber !== member.accountNumber ||
			originalMember.insuranceProduct !== member.insuranceProduct ||
			originalMember.insuranceCompany !== member.insuranceCompany ||
			originalMember.salesperson !== member.salesperson ||
			originalMember.salespersonPhone !== member.salespersonPhone ||
			originalMember.parentId !== member.parentId ||
			originalMember.planner !== member.planner ||
			originalMember.plannerPhone !== member.plannerPhone ||
			originalMember.plannerBank !== member.plannerBank ||  // ⭐ 설계사 은행
			originalMember.plannerAccountNumber !== member.plannerAccountNumber ||  // ⭐ 설계사 계좌번호
			originalMember.branch !== member.branch ||
			originalMember.canViewSubordinates !== member.canViewSubordinates
		);
	}

	// 수정 버튼 클릭 핸들러
	function handleSubmit() {
		if (hasChanges()) {
			onSubmit(member);
		} else {
			// 변경 없으면 그냥 닫기
			onClose();
		}
	}

	// 등급별 보험 필수 여부
	$: isInsuranceRequired = member?.grade ? (GRADE_LIMITS[member.grade]?.insuranceRequired || false) : false;

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
		member.plannerBank = planner.bank || '';  // ⭐ 설계사 은행
		member.plannerAccountNumber = planner.accountNumber || '';  // ⭐ 설계사 계좌번호
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

	// 설계사 이름 변경 시 자동으로 연락처/계좌 추출
	async function handlePlannerNameChange(event) {
		const name = event.target.value.trim();
		if (!name) {
			member.plannerPhone = '';
			member.plannerBank = '';
			member.plannerAccountNumber = '';
			return;
		}

		try {
			const response = await fetch(`/api/planners/search?q=${encodeURIComponent(name)}`);
			const data = await response.json();

			// 정확히 일치하는 이름 찾기
			const exactMatch = data.planners?.find(p => p.name === name);
			if (exactMatch) {
				member.plannerPhone = exactMatch.phone || '';
				member.plannerBank = exactMatch.bank || '';  // ⭐ 설계사 은행
				member.plannerAccountNumber = exactMatch.accountNumber || '';  // ⭐ 설계사 계좌번호
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
	$: insuranceAmountDisplay = member?.insuranceAmount ? member.insuranceAmount.toLocaleString() : '0';

	// 보험 가입일 표시용
	$: insuranceDateDisplay = member?.insuranceDate
		? new Date(member.insuranceDate).toLocaleDateString('ko-KR')
		: '미설정';

	// 보험 모달에서 저장 완료 시 → 보험은 별도 API로 이미 저장됨
	function handleInsuranceSaved(result) {
		if (result.user) {
			// 부모 컴포넌트에 콜백 호출 (목록 갱신용)
			onChangedInsurance(result.user);
		}
		showInsuranceModal = false;
		// MemberEditModal은 열어둔 채로 (다른 정보 수정할 수 있도록)
	}
</script>

<WindowsModal
	isOpen={isOpen && member}
	title="지원자 정보 수정"
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

				<!-- ⭐ 설계사 계좌 정보 -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">설계사 은행</label>
						<input
							type="text"
							bind:value={member.plannerBank}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							placeholder="설계사 은행"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">설계사 계좌번호</label>
						<input
							type="text"
							bind:value={member.plannerAccountNumber}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							placeholder="설계사 계좌번호"
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

				<!-- 보험 정보 -->
				<div>
					<label class="block text-xs font-medium text-gray-700 mb-0.5">보험 정보</label>
					<div class="bg-gray-50 rounded-md p-2 border border-gray-200">
						<div class="flex justify-between items-center text-sm">
							<span class="text-gray-600">금액</span>
							<span class="font-medium">{insuranceAmountDisplay}원</span>
						</div>
						<div class="flex justify-between items-center text-sm mt-1">
							<span class="text-gray-600">가입일</span>
							<span class="font-medium">{insuranceDateDisplay}</span>
						</div>
						<div class="flex justify-between items-center text-sm mt-1">
							<span class="text-gray-600">상태</span>
							{#if member?.insuranceActive}
								<span class="text-green-600 font-medium">✓ 활성</span>
							{:else if isInsuranceRequired}
								<span class="text-red-600 font-medium">✗ 미가입</span>
							{:else}
								<span class="text-gray-500">불필요</span>
							{/if}
						</div>
					</div>
					<button
						type="button"
						onclick={() => showInsuranceModal = true}
						class="mt-2 w-full px-3 py-1.5 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50 transition-colors"
					>
						보험 가입
					</button>
					<p class="text-xs text-gray-500 mt-1">
						💡 F4/F5: 7만원, F6/F7: 9만원, F8: 11만원 (F1-F3 불필요)
					</p>
				</div>

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
			onclick={handleSubmit}
			class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
		>
			수정
		</button>
	</svelte:fragment>
</WindowsModal>

<!-- 보험 가입 모달 -->
<InsuranceModal
	isOpen={showInsuranceModal}
	{member}
	onSave={handleInsuranceSaved}
	onClose={() => showInsuranceModal = false}
/>
