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

	// Props from +page.server.js
	export let data;

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

	// DB 관리 상태 (개발 환경 전용)
	let selectedMonth = '';
	let isProcessingDB = false;

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

				// __EMPTY_X 인덱스 키를 포함한 커스텀 파싱 (중복 헤더 대응)
				const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
				const headers = rawData[0] || [];
				const jsonData = [];

				for (let i = 1; i < rawData.length; i++) {
					const row = rawData[i];
					if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) {
						continue; // 빈 행 스킵
					}

					const rowData = {};
					for (let j = 0; j < row.length; j++) {
						const value = row[j];
						if (value !== null && value !== undefined && value !== '') {
							// 인덱스 기반 키 추가 (__EMPTY_X)
							const indexKey = j === 0 ? '__EMPTY' : `__EMPTY_${j}`;
							rowData[indexKey] = String(value).trim();

							// 헤더 이름 키도 추가 (중복되면 마지막 값이 남음)
							if (headers[j]) {
								rowData[String(headers[j]).trim()] = String(value).trim();
							}
						}
					}

					if (Object.keys(rowData).length > 0) {
						jsonData.push(rowData);
					}
				}

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

	// DB 관리 함수들 (개발 환경 전용)
	async function handleDeleteMonthlyData() {
		if (!selectedMonth) {
			notificationConfig = {
				type: 'warning',
				title: '경고',
				message: '삭제할 월을 선택해주세요.',
				results: null,
				details: []
			};
			notificationOpen = true;
			return;
		}

		// 확인 다이얼로그
		notificationConfig = {
			type: 'warning',
			title: '월별 데이터 삭제',
			message: `${selectedMonth} 데이터를 삭제하시겠습니까?\n\n⚠️ 주의: 이 작업은 되돌릴 수 없습니다!\n- 해당 월의 모든 등록 데이터가 삭제됩니다\n- 해당 월의 지급 계획이 삭제됩니다`,
			primaryAction: {
				label: '삭제',
				handler: async () => {
					notificationOpen = false;
					await deleteMonthlyData();
				}
			},
			secondaryAction: {
				label: '취소',
				handler: () => {
					notificationOpen = false;
				}
			},
			results: null,
			details: []
		};
		notificationOpen = true;
	}

	async function deleteMonthlyData() {
		isProcessingDB = true;
		try {
			const response = await fetch('/api/admin/db/delete-monthly', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ monthKey: selectedMonth })
			});

			const result = await response.json();
			if (response.ok) {
				notificationConfig = {
					type: 'success',
					title: '삭제 완료',
					message: `${selectedMonth} 데이터가 삭제되었습니다.\n\n삭제된 항목:\n- 월별 등록: ${result.deletedRegistrations || 0}건\n- 지급 계획: ${result.deletedPlans || 0}건\n- 스냅샷: ${result.deletedSnapshots || 0}건`,
					results: null,
					details: []
				};
				notificationOpen = true;
				selectedMonth = '';
				// 페이지 새로고침
				window.location.reload();
			} else {
				notificationConfig = {
					type: 'error',
					title: '삭제 실패',
					message: result.error || '데이터 삭제 중 오류가 발생했습니다.',
					results: null,
					details: []
				};
				notificationOpen = true;
			}
		} catch (error) {
			console.error('Delete monthly data error:', error);
			notificationConfig = {
				type: 'error',
				title: '오류',
				message: '데이터 삭제 중 오류가 발생했습니다.',
				results: null,
				details: []
			};
			notificationOpen = true;
		} finally {
			isProcessingDB = false;
		}
	}

	async function handleInitializeDB() {
		// 확인 다이얼로그
		notificationConfig = {
			type: 'warning',
			title: '⚠️ 데이터베이스 초기화',
			message: '모든 데이터가 삭제됩니다!\n\n정말로 데이터베이스를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다!',
			primaryAction: {
				label: '초기화',
				handler: async () => {
					notificationOpen = false;
					await initializeDB();
				}
			},
			secondaryAction: {
				label: '취소',
				handler: () => {
					notificationOpen = false;
				}
			},
			results: null,
			details: []
		};
		notificationOpen = true;
	}

	async function initializeDB() {
		isProcessingDB = true;
		try {
			const response = await fetch('/api/admin/db/initialize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const result = await response.json();
			if (response.ok) {
				notificationConfig = {
					type: 'success',
					title: '초기화 완료',
					message: '데이터베이스가 초기화되었습니다.\n\n잠시 후 페이지를 새로고침합니다...',
					results: null,
					details: []
				};
				notificationOpen = true;
				// 2초 후 새로고침
				setTimeout(() => {
					window.location.href = '/login';
				}, 2000);
			} else {
				notificationConfig = {
					type: 'error',
					title: '초기화 실패',
					message: result.error || '데이터베이스 초기화 중 오류가 발생했습니다.',
					results: null,
					details: []
				};
				notificationOpen = true;
			}
		} catch (error) {
			console.error('Initialize DB error:', error);
			notificationConfig = {
				type: 'error',
				title: '오류',
				message: '데이터베이스 초기화 중 오류가 발생했습니다.',
				results: null,
				details: []
			};
			notificationOpen = true;
		} finally {
			isProcessingDB = false;
		}
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

	<!-- DB 관리 카드 (개발 환경 전용) - 페이지 최하단 -->
	{#if data.isDevelopment}
		<div class="db-management-compact">
			<span class="db-compact-title">🛠️ 개발중에만 사용</span>
			<div class="db-compact-controls">
				<select bind:value={selectedMonth} class="db-compact-select">
					<option value="">월 선택</option>
					{#each data.monthlyRegistrations as month}
						<option value={month.monthKey}>{month.monthKey}</option>
					{/each}
				</select>
				<button
					onclick={handleDeleteMonthlyData}
					disabled={!selectedMonth || isProcessingDB}
					class="db-compact-btn"
					title="선택한 월 데이터 삭제"
				>
					월 삭제
				</button>
				<span class="db-compact-divider">|</span>
				<button
					onclick={handleInitializeDB}
					disabled={isProcessingDB}
					class="db-compact-btn db-compact-btn-critical"
					title="전체 DB 초기화"
				>
					DB 초기화
				</button>
			</div>
		</div>
	{/if}

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
	@reference "$lib/../app.css";

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

	/* DB 관리 컴팩트 스타일 */
	.db-management-compact {
		@apply mt-4 flex items-center gap-3 rounded border border-red-200 bg-red-50/50 px-3 py-1.5;
	}

	.db-compact-title {
		@apply whitespace-nowrap text-xs font-bold text-red-600;
	}

	.db-compact-controls {
		@apply flex items-center gap-2;
	}

	.db-compact-select {
		@apply h-7 min-w-[100px] rounded border border-gray-300 px-2 py-0.5 text-xs focus:border-red-500 focus:outline-none;
		line-height: 1.5;
	}

	.db-compact-btn {
		@apply h-7 whitespace-nowrap rounded bg-gray-600 px-3 py-0.5 text-xs text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400;
	}

	.db-compact-btn-critical {
		@apply bg-red-600 hover:bg-red-700;
	}

	.db-compact-divider {
		@apply text-gray-400;
	}
</style>
