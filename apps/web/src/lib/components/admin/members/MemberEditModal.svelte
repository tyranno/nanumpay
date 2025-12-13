<script>
	import WindowsModal from '$lib/components/WindowsModal.svelte';
	import Autocomplete from '$lib/components/Autocomplete.svelte';
	import InsuranceModal from './InsuranceModal.svelte';
	import { GRADE_LIMITS } from '$lib/utils/constants.js';

	export let isOpen = false;
	export let member = null;
	export let latestMonth = null;  // 최신 등록월 (YYYY-MM)
	export let onClose = () => {};
	export let onSubmit = (memberData, requiresReprocess) => {};
	export let onDelete = (memberId) => {};  // 삭제 이벤트
	export let onChangedInsurance = (userData) => {};  // 보험 변경 이벤트

	// 보험 모달 상태
	let showInsuranceModal = false;

	// 삭제 확인 상태
	let showDeleteConfirm = false;
	let isDeleting = false;
	let deleteErrorMessage = '';  // 삭제 불가 사유

	// 수정 확인 상태
	let showEditConfirm = false;
	let confirmMessage = '';
	let isSubmitting = false;
	let editErrorMessage = '';  // 수정 불가 사유

	// 변경 감지용 원본 멤버 저장
	let originalMember = null;
	let lastOpenedMemberId = null;

	// 등록일 편집용 (일자만)
	let editableCreatedAt = '';
	let editableDay = 1;
	let originalCreatedAtStr = '';  // 원본 날짜 문자열 (비교용)

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
			plannerBank: member.plannerBank,
			plannerAccountNumber: member.plannerAccountNumber,
			branch: member.branch,
			canViewSubordinates: member.canViewSubordinates,
			ratio: member.ratio ?? 1,
			createdAt: member.createdAt
		};
		// 등록일 편집 필드 초기화 (로컬 타임존 사용)
		if (member.createdAt) {
			const date = new Date(member.createdAt);
			// 로컬 날짜 문자열 생성 (YYYY-MM-DD)
			const year = date.getFullYear();
			const month = (date.getMonth() + 1).toString().padStart(2, '0');
			const day = date.getDate().toString().padStart(2, '0');
			editableCreatedAt = `${year}-${month}-${day}`;
			editableDay = date.getDate();
			originalCreatedAtStr = editableCreatedAt;  // 원본 저장
		} else {
			editableCreatedAt = '';
			editableDay = 1;
			originalCreatedAtStr = '';
		}
		// 삭제 확인 상태 초기화
		showDeleteConfirm = false;
		deleteErrorMessage = '';
	}

	// 모달 닫힐 때 초기화
	$: if (!isOpen) {
		lastOpenedMemberId = null;
		originalMember = null;
		originalCreatedAtStr = '';
		showDeleteConfirm = false;
		showEditConfirm = false;
		deleteErrorMessage = '';
		editErrorMessage = '';
	}

	// 사용자가 최신 등록월에 속하는지 확인 (로컬 타임존)
	$: memberMonth = (() => {
		if (!member?.createdAt) return null;
		const date = new Date(member.createdAt);
		const year = date.getFullYear();
		const month = (date.getMonth() + 1).toString().padStart(2, '0');
		return `${year}-${month}`;
	})();
	$: isInLatestMonth = latestMonth && memberMonth === latestMonth;

	// 하위 노드가 있는지 확인 (leftChildId 또는 rightChildId가 있으면 삭제 불가)
	$: hasChildren = member?.leftChildId || member?.rightChildId;

	// 삭제 가능 여부 (최신 월 + 하위 노드 없음)
	$: canDelete = isInLatestMonth && !hasChildren;

	// 등록일 연-월 표시 및 해당 월의 최대 일수 계산
	$: yearMonthDisplay = memberMonth || '';
	$: maxDayInMonth = (() => {
		if (!memberMonth) return 31;
		const [year, month] = memberMonth.split('-').map(Number);
		return new Date(year, month, 0).getDate();
	})();

	// ⭐ 일자 변경 시 editableCreatedAt 동기화 함수
	function syncCreatedAt() {
		if (memberMonth && editableDay) {
			const clampedDay = Math.max(1, Math.min(editableDay, maxDayInMonth));
			const dayStr = clampedDay.toString().padStart(2, '0');
			editableCreatedAt = `${memberMonth}-${dayStr}`;
		}
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
			originalMember.plannerBank !== member.plannerBank ||
			originalMember.plannerAccountNumber !== member.plannerAccountNumber ||
			originalMember.branch !== member.branch ||
			originalMember.canViewSubordinates !== member.canViewSubordinates ||
			hasReprocessableChanges()
		);
	}

	// 재처리가 필요한 변경 여부 확인 (등록일, 비율, 판매인)
	function hasReprocessableChanges() {
		if (!originalMember || !member) return false;

		// 등록일 변경 확인 (원본 문자열과 직접 비교)
		const dateChanged = editableCreatedAt !== originalCreatedAtStr;

		// 비율 변경 확인
		const ratioChanged = (originalMember.ratio ?? 1) !== (member.ratio ?? 1);

		// 판매인 변경 확인 (parentId 기준)
		const salespersonChanged = originalMember.parentId !== member.parentId;

		return dateChanged || ratioChanged || salespersonChanged;
	}

	// 수정 버튼 클릭 핸들러 - 확인창 표시
	function handleSubmit() {
		// 재처리 필요 여부에 따라 다른 메시지 표시
		if (hasReprocessableChanges()) {
			confirmMessage = '지원자 정보 수정으로 지급계획이 변경됩니다.\n수정하시겠습니까?';
		} else if (hasChanges()) {
			confirmMessage = '수정하시겠습니까?';
		} else {
			confirmMessage = '변경 사항이 없습니다.\n그래도 저장하시겠습니까?';
		}
		showEditConfirm = true;
	}

	// 수정 확정 핸들러
	async function handleEditConfirm() {
		if (isSubmitting) return;
		isSubmitting = true;
		editErrorMessage = '';

		try {
			// 판매인 변경 여부 확인
			const salespersonChanged = originalMember.parentId !== member.parentId;

			if (salespersonChanged) {
				// 1. 현재 사용자에 하위 노드가 있으면 변경 불가
				if (hasChildren) {
					editErrorMessage = '하위 조직이 있어 판매인을 변경할 수 없습니다.';
					isSubmitting = false;
					return;
				}

				// 2. 새 판매인의 자식이 2개 다 있으면 변경 불가
				if (member.parentId) {
					try {
						const response = await fetch(`/api/admin/users/${member.parentId}`);
						if (response.ok) {
							const parentData = await response.json();
							if (parentData.user && parentData.user.leftChildId && parentData.user.rightChildId) {
								editErrorMessage = `판매인 ${member.salesperson || ''}은(는) 이미 자식이 2명 있어 변경할 수 없습니다.`;
								isSubmitting = false;
								return;
							}
						}
					} catch (error) {
						console.error('Failed to check parent user:', error);
						editErrorMessage = '판매인 정보 확인 중 오류가 발생했습니다.';
						isSubmitting = false;
						return;
					}
				}
			}

			// 등록일 변경 시 member에 반영
			if (editableCreatedAt) {
				member.createdAt = new Date(editableCreatedAt + 'T00:00:00');
			}
			// 재처리 필요 여부와 함께 콜백
			await onSubmit(member, hasReprocessableChanges());
		} finally {
			isSubmitting = false;
			showEditConfirm = false;
		}
	}

	// 수정 취소 핸들러
	function handleEditCancel() {
		showEditConfirm = false;
	}

	// 삭제 버튼 클릭 핸들러
	function handleDeleteClick() {
		// 하위 노드 체크
		if (hasChildren) {
			deleteErrorMessage = '하위 조직이 있어 삭제할 수 없습니다.';
			return;
		}
		deleteErrorMessage = '';
		showDeleteConfirm = true;
	}

	// 삭제 확정 핸들러
	async function handleDeleteConfirm() {
		if (isDeleting) return;
		isDeleting = true;
		try {
			await onDelete(member._id);
			onClose();
		} finally {
			isDeleting = false;
		}
	}

	// 삭제 취소 핸들러
	function handleDeleteCancel() {
		showDeleteConfirm = false;
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
		member.plannerBank = planner.bank || '';
		member.plannerAccountNumber = planner.accountNumber || '';
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

	// 전화번호 포맷팅 (010-1234-5678)
	function formatPhone(value) {
		const numbers = value.replace(/[^0-9]/g, '');
		if (numbers.length <= 3) return numbers;
		if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
		return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
	}

	// 주민번호 포맷팅 (000000-0000000)
	function formatIdNumber(value) {
		const numbers = value.replace(/[^0-9]/g, '');
		if (numbers.length <= 6) return numbers;
		return `${numbers.slice(0, 6)}-${numbers.slice(6, 13)}`;
	}

	// 전화번호 입력 핸들러
	function handlePhoneInput(e) {
		member.phone = formatPhone(e.target.value);
	}

	// 주민번호 입력 핸들러
	function handleIdNumberInput(e) {
		member.idNumber = formatIdNumber(e.target.value);
	}

	// 등록일 포맷팅 (createdAt 사용 - joinedAt은 현재 시간으로 설정됨)
	$: registrationDateDisplay = member?.createdAt
		? new Date(member.createdAt).toISOString().split('T')[0]
		: '';

	// 보험 금액 표시용 (쉼표 포함)
	$: insuranceAmountDisplay = member?.insuranceAmount ? member.insuranceAmount.toLocaleString() : '0';

	// 보험 가입일 표시용
	$: insuranceDateDisplay = member?.insuranceDate
		? new Date(member.insuranceDate).toLocaleDateString('ko-KR')
		: '미설정';

	// 등급별 필요 보험금액 표시용
	$: requiredInsuranceAmount = member?.grade
		? (GRADE_LIMITS[member.grade]?.insuranceAmount || 0)
		: 0;
	$: requiredInsuranceDisplay = requiredInsuranceAmount > 0
		? `${requiredInsuranceAmount.toLocaleString()}원`
		: '불필요';

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

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">연락처</label>
						<input
							type="text"
							value={member.phone}
							oninput={handlePhoneInput}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							placeholder="010-1234-5678"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">주민번호</label>
						<input
							type="text"
							value={member.idNumber}
							oninput={handleIdNumberInput}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							placeholder="000000-0000000"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">
							등록일
							{#if isInLatestMonth}
								<span class="text-blue-500 text-xs">(일자만 수정 가능)</span>
							{/if}
						</label>
						{#if isInLatestMonth}
							<!-- 연-월 고정, 일자만 수정 가능한 커스텀 UI -->
							<div class="flex items-center gap-1">
								<span class="px-2 py-1.5 text-sm bg-gray-100 border border-gray-300 rounded-l-md text-gray-600">{yearMonthDisplay}-</span>
								<input
									type="number"
									bind:value={editableDay}
									oninput={syncCreatedAt}
									min="1"
									max={maxDayInMonth}
									class="w-16 px-2 py-1.5 text-sm border border-blue-400 rounded-r-md focus:ring-2 focus:ring-blue-500 bg-blue-50 text-center"
									title="1 ~ {maxDayInMonth}일"
								/>
							</div>
						{:else}
							<input
								type="text"
								value={registrationDateDisplay}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-600"
								readonly
								title="최신 등록월의 지원자만 수정 가능"
							/>
						{/if}
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">
							비율
							{#if isInLatestMonth}
								<span class="text-blue-500 text-xs">(수정 가능)</span>
							{/if}
						</label>
						{#if isInLatestMonth}
							<select
								bind:value={member.ratio}
								class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded-md focus:ring-2 focus:ring-blue-500 bg-blue-50"
							>
								<option value={1}>1 (100%)</option>
								<option value={0.75}>0.75 (75%)</option>
								<option value={0.5}>0.5 (50%)</option>
								<option value={0.25}>0.25 (25%)</option>
							</select>
						{:else}
							<input
								type="text"
								value={member.ratio ?? 1}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-600"
								readonly
								title="최신 등록월의 지원자만 수정 가능"
							/>
						{/if}
					</div>
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

				<!-- 산하정보 보기 권한 (계정 설정) -->
				<div class="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-md">
					<label class="block text-xs font-medium text-blue-800 mb-1">산하정보 보기 권한</label>
					<label class="flex items-center cursor-pointer">
						<input
							type="checkbox"
							bind:checked={member.canViewSubordinates}
							class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
						/>
						<span class="ml-2 text-sm text-gray-700">산하정보 조회 허용</span>
					</label>
					<p class="text-xs text-blue-600 mt-1.5">
						※ 계정 ID ({member.loginId || '-'})의 보기 기능이 활성화됩니다
					</p>
				</div>
			</div>

			<!-- 오른쪽: 판매인/설계사 정보 -->
			<div class="space-y-3">
				<h4 class="text-xs font-semibold text-gray-900 border-b pb-1.5">판매/설계 정보</h4>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">
							판매인
							{#if isInLatestMonth}
								<span class="text-blue-500 text-xs">(수정 가능)</span>
							{/if}
						</label>
						{#if isInLatestMonth}
							<Autocomplete
								bind:value={member.salesperson}
								placeholder="판매인 이름 검색..."
								apiUrl="/api/admin/users/search"
								displayKey="name"
								subtextKey="phone"
								onSelect={handleSalespersonSelect}
								onInputChange={handleSalespersonNameChange}
							/>
						{:else}
							<input
								type="text"
								value={member.salesperson || ''}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-600"
								readonly
								title="최신 등록월의 지원자만 수정 가능"
							/>
						{/if}
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">
							판매인 연락처
							{#if isInLatestMonth}
								<span class="text-blue-500 text-xs">(수정 가능)</span>
							{/if}
						</label>
						{#if isInLatestMonth}
							<input
								type="text"
								bind:value={member.salespersonPhone}
								class="w-full px-2 py-1.5 text-sm border border-blue-400 rounded-md focus:ring-2 focus:ring-blue-500 bg-blue-50"
								placeholder="010-0000-0000"
							/>
						{:else}
							<input
								type="text"
								value={member.salespersonPhone || ''}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-gray-50 text-gray-600"
								readonly
								title="최신 등록월의 지원자만 수정 가능"
							/>
						{/if}
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
							placeholder="010-0000-0000"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">설계사 은행</label>
						<input
							type="text"
							bind:value={member.plannerBank}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-gray-700 mb-0.5">설계사 계좌번호</label>
						<input
							type="text"
							bind:value={member.plannerAccountNumber}
							class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
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
				<div class="mt-2 p-2.5 bg-green-50 border border-green-200 rounded-md">
					<label class="block text-xs font-medium text-green-800 mb-1.5">
						보험 정보
						{#if member?.grade}
							<span class="ml-1 text-green-700">
								(등급:<span class="text-sm font-bold text-green-900">{member.grade}</span>{#if isInsuranceRequired} - {requiredInsuranceDisplay} 이상 가입필요{/if})
							</span>
						{/if}
					</label>
					<div class="bg-white rounded p-2 border border-green-100">
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
						class="mt-2 w-full px-3 py-1.5 text-sm text-white bg-green-600 border border-green-600 rounded-md hover:bg-green-700 transition-colors"
					>
						보험 가입/수정
					</button>
				</div>
			</div>
		</div>
	{/if}

	<svelte:fragment slot="footer">
		<div class="flex justify-between items-center w-full">
			<!-- 왼쪽: 삭제 버튼 -->
			<div>
				{#if showDeleteConfirm}
					<div class="flex items-center gap-2">
						<span class="text-sm text-red-600 font-medium">정말 삭제하시겠습니까?</span>
						<button
							onclick={handleDeleteConfirm}
							disabled={isDeleting}
							class="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors disabled:opacity-50"
						>
							{isDeleting ? '삭제 중...' : '확인'}
						</button>
						<button
							onclick={handleDeleteCancel}
							disabled={isDeleting}
							class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
						>
							취소
						</button>
					</div>
				{:else if deleteErrorMessage}
					<!-- 삭제 불가 메시지 -->
					<div class="flex items-center gap-2">
						<span class="text-sm text-red-600">⚠️ {deleteErrorMessage}</span>
						<button
							onclick={() => deleteErrorMessage = ''}
							class="text-xs text-gray-500 hover:text-gray-700"
						>
							✕
						</button>
					</div>
				{:else if canDelete}
					<button
						onclick={handleDeleteClick}
						class="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-300 rounded hover:bg-red-50 transition-colors"
					>
						삭제
					</button>
				{:else if isInLatestMonth && hasChildren}
					<button
						onclick={handleDeleteClick}
						class="px-3 py-1.5 text-sm font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded cursor-not-allowed"
						title="하위 조직이 있어 삭제할 수 없습니다"
					>
						삭제
					</button>
				{:else}
					<span class="text-xs text-gray-400">최신 월의 지원자만 삭제 가능</span>
				{/if}
			</div>
			<!-- 오른쪽: 취소/수정 버튼 -->
			<div class="flex gap-2">
				<button
					onclick={onClose}
					class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
				>
					닫기
				</button>
				{#if !showDeleteConfirm}
					<button
						onclick={handleSubmit}
						class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
					>
						수정
					</button>
				{/if}
			</div>
		</div>
	</svelte:fragment>
</WindowsModal>

<!-- 보험 가입 모달 -->
<InsuranceModal
	isOpen={showInsuranceModal}
	{member}
	onSave={handleInsuranceSaved}
	onClose={() => showInsuranceModal = false}
/>

<!-- 수정 확인 모달 -->
<WindowsModal
	isOpen={showEditConfirm}
	title="확인"
	size="sm"
	onClose={handleEditCancel}
>
	<div class="space-y-3">
		<p class="whitespace-pre-wrap text-sm text-gray-700">{confirmMessage}</p>
		{#if editErrorMessage}
			<div class="p-2.5 bg-red-50 border border-red-200 rounded-md">
				<p class="text-sm text-red-600">⚠️ {editErrorMessage}</p>
			</div>
		{/if}
	</div>
	<svelte:fragment slot="footer">
		<button
			onclick={handleEditCancel}
			disabled={isSubmitting}
			class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
		>
			취소
		</button>
		<button
			onclick={handleEditConfirm}
			disabled={isSubmitting}
			class="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
		>
			{isSubmitting ? '수정 중...' : '수정'}
		</button>
	</svelte:fragment>
</WindowsModal>
