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
					details: [{
						type: 'error',
						title: '오류 내용',
						content: error.message
					}]
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

<div class="p-6 space-y-6">
	<!-- 헤더 -->
	<div class="flex justify-between items-center">
		<div>
			<h2 class="text-2xl font-bold text-gray-800">용역자 관리명부</h2>
			<p class="text-gray-600 mt-1">총 {totalMembers}명의 용역자가 등록되어 있습니다.</p>
		</div>
		<div class="flex gap-2">
			<button
				onclick={() => showUploadModal = true}
				class="px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1"
				title="엑셀 파일 업로드"
			>
				<img src="/icons/excel.svg" alt="Excel" class="w-4 h-4 filter brightness-0 invert" />
				<span class="hidden sm:inline">엑셀</span>
			</button>
			<button
				onclick={() => showAddModal = true}
				class="px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-1"
				title="새 회원 등록"
			>
				<img src="/icons/user-add.svg" alt="Add User" class="w-4 h-4 filter brightness-0 invert" />
				<span class="hidden sm:inline">등록</span>
			</button>
		</div>
	</div>

	<!-- 검색 및 필터 -->
	<div class="bg-white p-4 rounded-lg shadow">
		<div class="flex gap-4 items-center">
			<div class="flex-1">
				<input
					type="text"
					bind:value={searchTerm}
					oninput={handleSearch}
					placeholder="이름, 판매인, 설계사로 검색..."
					class="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				/>
			</div>
			<div class="flex items-center gap-2">
				<img src="/icons/clipboard.svg" alt="List" class="w-4 h-4 opacity-60" />
				<select
					bind:value={itemsPerPage}
					onchange={changeItemsPerPage}
					class="appearance-none pl-3 pr-10 py-1.5 text-sm bg-white border border-gray-300 rounded-md shadow-sm hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer bg-no-repeat"
					style="background-image: url('/icons/chevron-down.svg'); background-position: right 0.5rem center; background-size: 1.5em 1.5em;"
				>
					<option value={10}>10개씩 보기</option>
					<option value={20}>20개씩 보기</option>
					<option value={50}>50개씩 보기</option>
					<option value={100}>100개씩 보기</option>
				</select>
			</div>
			<button
				onclick={() => {
					tempVisibleColumns = { ...visibleColumns };
					showColumnSettings = !showColumnSettings;
				}}
				class="p-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
				title="컬럼 설정"
			>
				<img src="/icons/settings.svg" alt="Settings" class="w-4 h-4" />
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
		onClose={() => showAddModal = false}
		onSubmit={handleAddMember}
	/>

	<!-- 회원 수정 모달 -->
	<MemberEditModal
		isOpen={showEditModal}
		member={editingMember}
		onClose={() => showEditModal = false}
		onSubmit={handleEditMember}
	/>

	<!-- 엑셀 업로드 모달 -->
	<ExcelUploadModal
		isOpen={showUploadModal}
		{isUploading}
		bind:uploadFile
		onClose={() => { showUploadModal = false; uploadFile = null; }}
		onFileSelect={handleFileSelect}
		onUpload={handleExcelUpload}
	/>

	<!-- 컬럼 설정 모달 -->
	<ColumnSettingsModal
		isOpen={showColumnSettings}
		bind:tempVisibleColumns
		onClose={() => showColumnSettings = false}
		onShowAll={handleShowAllColumns}
		onApply={handleApplyColumnSettings}
	/>

	<!-- 알림 모달 -->
	<WindowsModal
		isOpen={notificationOpen}
		title={notificationConfig.title}
		icon={notificationConfig.type === 'success' ? '/icons/check-circle-blue.svg' :
		      notificationConfig.type === 'error' ? '/icons/close-blue.svg' :
		      notificationConfig.type === 'warning' ? '/icons/edit-blue.svg' :
		      '/icons/settings.svg'}
		size="sm"
		onClose={() => { notificationOpen = false; }}
	>
		<div class="space-y-3">
			{#if notificationConfig.message}
				<p class="text-sm text-gray-700 whitespace-pre-wrap">{notificationConfig.message}</p>
			{/if}

			{#if notificationConfig.results}
				<div class="flex gap-3 text-sm">
					{#if notificationConfig.results.created !== undefined}
						<span class="text-green-600 font-medium">✓ 성공: {notificationConfig.results.created}</span>
					{/if}
					{#if notificationConfig.results.failed !== undefined && notificationConfig.results.failed > 0}
						<span class="text-red-600 font-medium">✗ 실패: {notificationConfig.results.failed}</span>
					{/if}
				</div>

				{#if notificationConfig.results.alerts && notificationConfig.results.alerts.length > 0}
					<div class="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
						<p class="font-medium">⚠ {notificationConfig.results.alerts[0].message}</p>
						{#if notificationConfig.results.alerts.length > 1}
							<p class="text-xs mt-1">외 {notificationConfig.results.alerts.length - 1}건</p>
						{/if}
					</div>
				{/if}

				{#if notificationConfig.results.errors && notificationConfig.results.errors.length > 0}
					<div class="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
						{#if notificationConfig.results.errors.length <= 2}
							{#each notificationConfig.results.errors as error}
								<p class="mb-1">• {error}</p>
							{/each}
						{:else}
							<p>• {notificationConfig.results.errors[0]}</p>
							<p class="text-xs mt-1">• 외 {notificationConfig.results.errors.length - 1}개 오류</p>
						{/if}
					</div>
				{/if}
			{/if}

			{#if notificationConfig.details && notificationConfig.details.length > 0}
				<div class="space-y-2">
					{#each notificationConfig.details as detail}
						<div class="p-3 bg-gray-50 rounded border {detail.type === 'error' ? 'border-red-200 bg-red-50' : 'border-gray-200'}">
							{#if detail.title}
								<p class="text-sm font-semibold {detail.type === 'error' ? 'text-red-900' : 'text-gray-900'}">{detail.title}</p>
							{/if}
							{#if detail.content}
								<p class="text-xs {detail.type === 'error' ? 'text-red-700' : 'text-gray-600'} mt-1 whitespace-pre-wrap">{detail.content}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<svelte:fragment slot="footer">
			{#if notificationConfig.secondaryAction}
				<button
					onclick={notificationConfig.secondaryAction.handler}
					class="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
				>
					{notificationConfig.secondaryAction.label}
				</button>
			{/if}
			{#if notificationConfig.primaryAction}
				<button
					onclick={notificationConfig.primaryAction.handler}
					class="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700 transition-colors"
				>
					{notificationConfig.primaryAction.label}
				</button>
			{:else}
				<button
					onclick={() => { notificationOpen = false; }}
					class="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
				>
					확인
				</button>
			{/if}
		</svelte:fragment>
	</WindowsModal>
</div>
