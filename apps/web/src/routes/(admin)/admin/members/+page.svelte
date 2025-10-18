<script>
	import { onMount } from 'svelte';
	import * as XLSX from 'xlsx';
	import WindowsModal from '$lib/components/WindowsModal.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import MemberTable from '$lib/components/admin/members/MemberTable.svelte';
	import MemberRegistrationModal from '$lib/components/admin/members/MemberRegistrationModal.svelte';
	import MemberEditModal from '$lib/components/admin/members/MemberEditModal.svelte';
	import ExcelUploadModal from '$lib/components/admin/members/ExcelUploadModal.svelte';
	import ColumnSettingsModal from '$lib/components/admin/members/ColumnSettingsModal.svelte';

	let members = [];
	let isLoading = true;
	let searchTerm = '';
	let searchCategory = 'name'; // 검색 카테고리 추가
	let currentPage = 1;
	let totalPages = 1;
	let totalMembers = 0;
	let itemsPerPage = 20;
	let sortBy = 'sequence';
	let sortOrder = 'asc';

	// 컬럼 표시/숨김 설정
	let visibleColumns = {
		date: true,
		name: true,
		phone: true,
		idNumber: false,
		branch: true,
		bank: false,
		accountNumber: false,
		salesperson: true,
		planner: true,
		plannerPhone: false,
		insuranceProduct: false,
		insuranceCompany: false
	};
	let tempVisibleColumns = { ...visibleColumns };
	let showColumnSettings = false;

	// 모달 상태
	let showUploadModal = false;
	let showAddModal = false;
	let showEditModal = false;
	let uploadFile = null;
	let editingMember = null;
	let isUploading = false;
	let memberToDelete = null; // 삭제할 회원 정보

	// 회원 등록 모달 참조
	let registrationModal;

	// 알림 상태
	let notificationOpen = false;
	let notificationConfig = {
		type: 'info',
		title: '알림',
		message: '',
		results: null,
		details: []
	};

	onMount(async () => {
		// localStorage에서 컬럼 설정 불러오기
		const savedColumns = localStorage.getItem('tableColumns');
		if (savedColumns) {
			visibleColumns = JSON.parse(savedColumns);
		}
		await loadMembers();
	});

	async function loadMembers() {
		isLoading = true;
		try {
			const params = new URLSearchParams({
				page: currentPage.toString(),
				limit: itemsPerPage.toString(),
				search: searchTerm,
				sortBy: sortBy,
				sortOrder: sortOrder
			});

			const response = await fetch(`/api/admin/users?${params}`);
			const data = await response.json();

			if (data.users) {
				members = data.users;
				totalMembers = data.pagination?.total || members.length;
				totalPages = data.pagination?.totalPages || 1;
			}
		} catch (error) {
			console.error('Failed to load members:', error);
			members = [];
		} finally {
			isLoading = false;
		}
	}

	// 검색 처리
	let searchTimer;
	function handleSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			currentPage = 1;
			loadMembers();
		}, 300);
	}

	// 검색 버튼 클릭
	function handleSearchClick() {
		currentPage = 1;
		loadMembers();
	}

	// 엔터키 처리
	function handleKeyPress(event) {
		if (event.key === 'Enter') {
			handleSearchClick();
		}
	}

	// 페이지 변경
	function changePage(page) {
		currentPage = page;
		loadMembers();
	}

	// 페이지당 항목 수 변경
	function changeItemsPerPage() {
		currentPage = 1;
		loadMembers();
	}

	// 정렬 변경
	function changeSort(field) {
		if (sortBy === field) {
			sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
		} else {
			sortBy = field;
			sortOrder = 'desc';
		}
		currentPage = 1;
		loadMembers();
	}

	// 새 회원 추가
	async function handleAddMember(memberData) {
		if (!memberData.name || !memberData.phone) {
			notificationConfig = {
				type: 'warning',
				title: '입력 오류',
				message: '이름과 연락처는 필수입니다.',
				results: null,
				details: []
			};
			notificationOpen = true;
			return;
		}

		// 전화번호 뒤 4자리를 암호로 사용
		const phoneDigits = memberData.phone.replace(/[^0-9]/g, '');
		if (phoneDigits.length < 4) {
			notificationConfig = {
				type: 'warning',
				title: '입력 오류',
				message: '올바른 전화번호를 입력해주세요.',
				results: null,
				details: []
			};
			notificationOpen = true;
			return;
		}
		const autoPassword = phoneDigits.slice(-4);

		try {
			const requestData = {
				...memberData,
				autoPassword: autoPassword
			};
			delete requestData.loginId; // loginId는 서버에서 생성

			const response = await fetch('/api/admin/users/register', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestData)
			});

			const result = await response.json();
			if (response.ok) {
				notificationConfig = {
					type: 'success',
					title: '사용자 등록 완료',
					message: `ID: ${result.user.loginId}\n초기 비밀번호: ${autoPassword}`,
					results: null,
					details: []
				};
				notificationOpen = true;
				showAddModal = false;
				registrationModal?.resetForm();
				await loadMembers();
			} else {
				notificationConfig = {
					type: 'error',
					title: '등록 실패',
					message: result.error || '알 수 없는 오류',
					results: null,
					details: []
				};
				notificationOpen = true;
			}
		} catch (error) {
			console.error('Add member error:', error);
			notificationConfig = {
				type: 'error',
				title: '오류',
				message: '사용자 등록 중 오류가 발생했습니다.',
				results: null,
				details: []
			};
			notificationOpen = true;
		}
	}

	// 회원 수정
	async function handleEditMember(memberData) {
		try {
			const response = await fetch('/api/admin/users', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					userId: memberData._id,
					...memberData
				})
			});

			if (response.ok) {
				notificationConfig = {
					type: 'success',
					title: '수정 완료',
					message: '회원 정보가 수정되었습니다.',
					results: null,
					details: []
				};
				notificationOpen = true;
				showEditModal = false;
				await loadMembers();
			} else {
				const result = await response.json();
				notificationConfig = {
					type: 'error',
					title: '수정 실패',
					message: result.error || '알 수 없는 오류',
					results: null,
					details: []
				};
				notificationOpen = true;
			}
		} catch (error) {
			console.error('Edit member error:', error);
			notificationConfig = {
				type: 'error',
				title: '오류',
				message: '수정 중 오류가 발생했습니다.',
				results: null,
				details: []
			};
			notificationOpen = true;
		}
	}

	// 회원 삭제 확인
	function deleteMember(member) {
		memberToDelete = member;
		notificationConfig = {
			type: 'warning',
			title: '삭제 확인',
			message: `정말 ${member.name}님을 삭제하시겠습니까?`,
			results: null,
			details: [],
			primaryAction: {
				label: '삭제',
				handler: confirmDelete
			},
			secondaryAction: {
				label: '취소',
				handler: () => {
					memberToDelete = null;
					notificationOpen = false;
				}
			}
		};
		notificationOpen = true;
	}

	// 회원 삭제 실행
	async function confirmDelete() {
		if (!memberToDelete) return;

		const member = memberToDelete;
		memberToDelete = null;
		notificationOpen = false;

		try {
			const response = await fetch('/api/admin/users', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ userId: member._id })
			});

			if (response.ok) {
				notificationConfig = {
					type: 'success',
					title: '삭제 완료',
					message: '회원이 삭제되었습니다.',
					results: null,
					details: []
				};
				notificationOpen = true;
				await loadMembers();
			} else {
				const result = await response.json();
				notificationConfig = {
					type: 'error',
					title: '삭제 실패',
					message: result.error || '알 수 없는 오류',
					results: null,
					details: []
				};
				notificationOpen = true;
			}
		} catch (error) {
			console.error('Delete member error:', error);
			notificationConfig = {
				type: 'error',
				title: '오류',
				message: '삭제 중 오류가 발생했습니다.',
				results: null,
				details: []
			};
			notificationOpen = true;
		}
	}

	// 엑셀 파일 처리
	function handleFileSelect(event) {
		const file = event.target.files[0];
		if (file) {
			uploadFile = file;
		}
	}

	async function handleExcelUpload() {
		if (!uploadFile) {
			notificationConfig = {
				type: 'warning',
				title: '파일 선택',
				message: '파일을 선택해주세요.',
				results: null,
				details: []
			};
			notificationOpen = true;
			return;
		}

		isUploading = true;

		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const data = new Uint8Array(e.target.result);
				const workbook = XLSX.read(data, { type: 'array' });
				const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
				const jsonData = XLSX.utils.sheet_to_json(firstSheet);

				const response = await fetch('/api/admin/users/bulk', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ users: jsonData })
				});

				const result = await response.json();
				if (response.ok) {
					notificationConfig = {
						type: result.failed > 0 ? 'warning' : 'success',
						title: '엑셀 업로드 완료',
						message: `총 ${result.created + result.failed}개 항목 중 ${result.created}명이 성공적으로 등록되었습니다.`,
						results: {
							created: result.created,
							failed: result.failed,
							alerts: result.alerts,
							errors: result.errors
						},
						details: []
					};
					notificationOpen = true;
					showUploadModal = false;
					uploadFile = null;
					await loadMembers();
				} else {
					notificationConfig = {
						type: 'error',
						title: '업로드 실패',
						message: result.error || '엑셀 파일 업로드 중 오류가 발생했습니다.',
						results: null,
						details: []
					};
					notificationOpen = true;
				}
			} catch (error) {
				console.error('Excel upload error:', error);
				notificationConfig = {
					type: 'error',
					title: '처리 오류',
					message: '엑셀 파일 처리 중 오류가 발생했습니다.',
					results: null,
					details: [
						{
							type: 'error',
							title: '오류 내용',
							content: error.message
						}
					]
				};
				notificationOpen = true;
			} finally {
				isUploading = false;
			}
		};
		reader.readAsArrayBuffer(uploadFile);
	}

	function openEditModal(member) {
		editingMember = { ...member };
		showEditModal = true;
	}

	// 컬럼 설정 관련 함수
	function handleShowAllColumns() {
		tempVisibleColumns = {
			date: true,
			name: true,
			phone: true,
			idNumber: true,
			branch: true,
			bank: true,
			accountNumber: true,
			salesperson: true,
			planner: true,
			plannerPhone: true,
			insuranceProduct: true,
			insuranceCompany: true
		};
	}

	function handleApplyColumnSettings() {
		visibleColumns = { ...tempVisibleColumns };
		localStorage.setItem('tableColumns', JSON.stringify(visibleColumns));
		showColumnSettings = false;
	}
</script>

<div class="container">
	<!-- 제목 -->
	<h1 class="title">용역자 관리명부</h1>

	<!-- 검색 및 필터 -->
	<div class="filter-section">
		<div class="search-container">
			<!-- 검색 카테고리 -->
			<select bind:value={searchCategory} class="select-category">
				<option value="name">이름</option>
				<option value="planner">설계사</option>
			</select>

			<!-- 검색 입력 -->
			<input
				type="text"
				bind:value={searchTerm}
				onkeypress={handleKeyPress}
				placeholder={searchCategory === 'name' ? '이름으로 검색...' : '설계사 이름으로 검색...'}
				class="input-search"
			/>

			<!-- 검색 버튼 -->
			<button onclick={handleSearchClick} class="btn-search">
				<img src="/icons/search.svg" alt="검색" class="btn-icon" />
			</button>
		</div>
	</div>

	<!-- 테이블 상단 정보 -->
	<div class="table-header">
		<div class="total-count">총원 {totalMembers}명</div>
		<div class="flex items-center gap-2">
			<!-- 페이지당 항목 수 -->
			<label class="label-page">
				페이지당
				<select bind:value={itemsPerPage} onchange={changeItemsPerPage} class="select-page">
					<option value={10}>10</option>
					<option value={20}>20</option>
					<option value={50}>50</option>
					<option value={100}>100</option>
				</select>
			</label>

			<!-- 컬럼 설정 버튼 -->
			<button
				onclick={() => {
					tempVisibleColumns = { ...visibleColumns };
					showColumnSettings = !showColumnSettings;
				}}
				class="btn-settings"
				title="컬럼 설정"
			>
				<img src="/icons/settings.svg" alt="Settings" class="h-4 w-4" />
			</button>

			<button onclick={() => (showUploadModal = true)} class="btn-blue" title="엑셀 파일 업로드">
				<img src="/icons/excel.svg" alt="Excel" class="btn-icon" />
				<span class="hidden sm:inline">엑셀</span>
			</button>
			<button onclick={() => (showAddModal = true)} class="btn-green" title="새 회원 등록">
				<img src="/icons/user-add.svg" alt="Add User" class="btn-icon" />
				<span class="hidden sm:inline">등록</span>
			</button>
		</div>
	</div>

	<!-- 테이블 -->
	<MemberTable
		{members}
		{isLoading}
		{currentPage}
		{itemsPerPage}
		{sortBy}
		{sortOrder}
		{visibleColumns}
		onSort={changeSort}
		onEdit={openEditModal}
		onDelete={deleteMember}
	/>

	<!-- 페이지네이션 -->
	{#if totalPages > 0}
		<Pagination
			{currentPage}
			{totalPages}
			totalItems={totalMembers}
			{itemsPerPage}
			onPageChange={changePage}
		/>
	{/if}

	<!-- 용역자 등록 모달 -->
	<MemberRegistrationModal
		bind:this={registrationModal}
		isOpen={showAddModal}
		{members}
		onClose={() => (showAddModal = false)}
		onSubmit={handleAddMember}
	/>

	<!-- 회원 수정 모달 -->
	<MemberEditModal
		isOpen={showEditModal}
		member={editingMember}
		onClose={() => (showEditModal = false)}
		onSubmit={handleEditMember}
	/>

	<!-- 엑셀 업로드 모달 -->
	<ExcelUploadModal
		isOpen={showUploadModal}
		{isUploading}
		bind:uploadFile
		onClose={() => {
			showUploadModal = false;
			uploadFile = null;
		}}
		onFileSelect={handleFileSelect}
		onUpload={handleExcelUpload}
	/>

	<!-- 컬럼 설정 모달 -->
	<ColumnSettingsModal
		isOpen={showColumnSettings}
		bind:tempVisibleColumns
		onClose={() => (showColumnSettings = false)}
		onShowAll={handleShowAllColumns}
		onApply={handleApplyColumnSettings}
	/>

	<!-- 알림 모달 -->
	<WindowsModal
		isOpen={notificationOpen}
		title={notificationConfig.title}
		icon={notificationConfig.type === 'success'
			? '/icons/check-circle-blue.svg'
			: notificationConfig.type === 'error'
				? '/icons/close-blue.svg'
				: notificationConfig.type === 'warning'
					? '/icons/edit-blue.svg'
					: '/icons/settings.svg'}
		size="sm"
		onClose={() => {
			notificationOpen = false;
		}}
	>
		<div class="space-y-3">
			{#if notificationConfig.message}
				<p class="whitespace-pre-wrap text-sm text-gray-700">{notificationConfig.message}</p>
			{/if}

			{#if notificationConfig.results}
				<div class="flex gap-3 text-sm">
					{#if notificationConfig.results.created !== undefined}
						<span class="alert-success">✓ 성공: {notificationConfig.results.created}</span>
					{/if}
					{#if notificationConfig.results.failed !== undefined && notificationConfig.results.failed > 0}
						<span class="alert-fail">✗ 실패: {notificationConfig.results.failed}</span>
					{/if}
				</div>

				{#if notificationConfig.results.alerts && notificationConfig.results.alerts.length > 0}
					<div class="alert-box-warning">
						<p class="font-medium">⚠ {notificationConfig.results.alerts[0].message}</p>
						{#if notificationConfig.results.alerts.length > 1}
							<p class="mt-1 text-xs">외 {notificationConfig.results.alerts.length - 1}건</p>
						{/if}
					</div>
				{/if}

				{#if notificationConfig.results.errors && notificationConfig.results.errors.length > 0}
					<div class="alert-box-error">
						{#if notificationConfig.results.errors.length <= 2}
							{#each notificationConfig.results.errors as error}
								<p class="mb-1">• {error}</p>
							{/each}
						{:else}
							<p>• {notificationConfig.results.errors[0]}</p>
							<p class="mt-1 text-xs">• 외 {notificationConfig.results.errors.length - 1}개 오류</p>
						{/if}
					</div>
				{/if}
			{/if}

			{#if notificationConfig.details && notificationConfig.details.length > 0}
				<div class="space-y-2">
					{#each notificationConfig.details as detail}
						<div class={detail.type === 'error' ? 'detail-box-error' : 'detail-box'}>
							{#if detail.title}
								<p class={detail.type === 'error' ? 'detail-title-error' : 'detail-title'}>
									{detail.title}
								</p>
							{/if}
							{#if detail.content}
								<p class={detail.type === 'error' ? 'detail-content-error' : 'detail-content'}>
									{detail.content}
								</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<svelte:fragment slot="footer">
			{#if notificationConfig.secondaryAction}
				<button onclick={notificationConfig.secondaryAction.handler} class="btn-modal-secondary">
					{notificationConfig.secondaryAction.label}
				</button>
			{/if}
			{#if notificationConfig.primaryAction}
				<button onclick={notificationConfig.primaryAction.handler} class="btn-modal-danger">
					{notificationConfig.primaryAction.label}
				</button>
			{:else}
				<button
					onclick={() => {
						notificationOpen = false;
					}}
					class="btn-modal-primary"
				>
					확인
				</button>
			{/if}
		</svelte:fragment>
	</WindowsModal>
</div>

<style>
	@reference "$app.css";

	/* 컨테이너 */
	.container {
		padding: 20px;
		max-width: 100%;
		background: white;
	}

	/* 제목 */
	.title {
		font-size: 20px;
		font-weight: 700;
		text-align: center;
		margin-bottom: 20px;
		color: #1f2937;
	}

	.filter-section {
		margin-bottom: 20px;
	}

	/* 검색 컨테이너 */
	.search-container {
		@apply flex flex-wrap items-center gap-2.5 rounded-md bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm;
	}

	.select-category {
		@apply flex h-7 min-w-[90px] cursor-pointer items-center rounded border-2 border-gray-200 bg-white px-1.5 py-1 text-[13px] leading-[1.4] outline-none transition-all hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)];
	}

	.input-search {
		@apply h-7 min-w-[200px] flex-1 rounded border-2 border-gray-200 bg-white px-1.5 py-1 text-[13px] leading-[1.4] outline-none transition-all hover:border-gray-400 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
	}

	.btn-search {
		@apply flex h-7 flex-shrink-0 cursor-pointer items-center justify-center rounded border-none bg-gradient-to-br from-blue-500 to-blue-700 px-2 text-white shadow-[0_1px_4px_rgba(0,123,255,0.3)] transition-all hover:-translate-y-px hover:from-blue-700 hover:to-blue-900 hover:shadow-[0_2px_8px_rgba(0,123,255,0.4)] active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,123,255,0.3)];
	}

	.label-page {
		@apply flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-gray-700;
	}

	.select-page {
		@apply flex h-7 min-w-[60px] cursor-pointer items-center rounded border-2 border-gray-200 bg-white px-1.5 py-1 pr-5 text-[13px] font-medium leading-[1.4] outline-none transition-all hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)] focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
	}

	/* 테이블 헤더 */
	.table-header {
		@apply mb-3 flex flex-nowrap items-center justify-between;
	}

	.total-count {
		@apply whitespace-nowrap text-sm font-semibold text-gray-700;
	}

	/* 반응형 - 모바일 */
	@media (max-width: 480px) {
		.container {
			padding: 5px;
		}

		.title {
			font-size: 20px;
			margin-bottom: 6px;
		}

		.filter-section {
			margin-bottom: 10px;
		}

		.table-header {
			@apply mb-2 gap-2;
		}

		.total-count {
			@apply flex-shrink-0 text-xs;
		}
	}

	/* 버튼 */
	.btn-icon {
		@apply h-4 w-4 brightness-0 invert filter;
	}

	.btn-blue {
		@apply flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1.5 text-xs text-white transition-colors hover:bg-blue-700 sm:px-3 sm:text-sm;
	}

	.btn-green {
		@apply flex items-center gap-1 rounded-md bg-green-600 px-2 py-1.5 text-xs text-white transition-colors hover:bg-green-700 sm:px-3 sm:text-sm;
	}

	.btn-settings {
		@apply rounded-md border border-gray-300 p-1.5 transition-colors hover:bg-gray-50;
	}

	.btn-modal-primary {
		@apply rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700;
	}

	.btn-modal-secondary {
		@apply rounded border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50;
	}

	.btn-modal-danger {
		@apply rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700;
	}

	/* 입력 필드 */
	.input-search {
		@apply w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500;
	}

	.select-items-per-page {
		@apply cursor-pointer appearance-none rounded-md border border-gray-300 bg-white bg-no-repeat py-1.5 pl-3 pr-10 text-sm shadow-sm transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500;
	}

	/* 모달 메시지 박스 */
	.alert-success {
		@apply font-medium text-green-600;
	}

	.alert-fail {
		@apply font-medium text-red-600;
	}

	.alert-box-warning {
		@apply rounded border border-yellow-200 bg-yellow-50 p-2 text-sm text-yellow-700;
	}

	.alert-box-error {
		@apply rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700;
	}

	.detail-box {
		@apply rounded border border-gray-200 bg-gray-50 p-3;
	}

	.detail-box-error {
		@apply rounded border border-red-200 bg-red-50 p-3;
	}

	.detail-title {
		@apply text-sm font-semibold text-gray-900;
	}

	.detail-title-error {
		@apply text-sm font-semibold text-red-900;
	}

	.detail-content {
		@apply mt-1 whitespace-pre-wrap text-xs text-gray-600;
	}

	.detail-content-error {
		@apply mt-1 whitespace-pre-wrap text-xs text-red-700;
	}
</style>
