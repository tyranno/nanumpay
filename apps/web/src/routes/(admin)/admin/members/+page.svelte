<script>
	import { onMount } from 'svelte';
	import * as XLSX from 'xlsx';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import NotificationModal from '$lib/components/NotificationModal.svelte';

	let members = [];
	let isLoading = true;
	let searchTerm = '';
	let currentPage = 1;
	let totalPages = 1;
	let totalMembers = 0;
	let itemsPerPage = 20;
	let sortBy = 'sequence';
	let sortOrder = 'asc';

	// 콜럼 표시/숨김 설정
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
		plannerPhone: false,  // 설계사 연락처 기본 숨김
		insuranceProduct: false,
		insuranceCompany: false  // 보험회사도 추가
	};
	let showColumnSettings = false;

	// 모달 상태
	let showUploadModal = false;
	let showAddModal = false;
	let showEditModal = false;
	let uploadFile = null;
	let editingMember = null;
	let isUploading = false; // 업로드 진행 상태

	// 알림 상태
	let notificationOpen = false;
	let notificationConfig = {
		type: 'info',
		title: '알림',
		message: '',
		results: null,
		details: []
	};

	// 새 회원 폼
	let newMember = {
		name: '',
		loginId: '',
		phone: '',
		idNumber: '',
		bank: '',
		accountNumber: '',
		branch: '',
		parentId: '',
		position: 'L',
		salesperson: '',
		salespersonPhone: '',
		planner: '',
		plannerPhone: '',
		insuranceProduct: '',
		insuranceCompany: '',
		registrationDate: new Date().toISOString().split('T')[0]  // 기본값: 오늘 날짜
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
	async function handleAddMember() {
		if (!newMember.name || !newMember.phone) {
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
		const phoneDigits = newMember.phone.replace(/[^0-9]/g, '');
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

		// 판매인을 부모로 설정
		if (newMember.salesperson) {
			// 판매인 이름으로 부모 찾기
			const parentUser = members.find(m => m.name === newMember.salesperson);
			if (parentUser) {
				newMember.parentId = parentUser._id;
			}
		}

		try {
			// loginId는 서버에서 자동 생성
			const requestData = {
				...newMember,
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
				resetNewMember();
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
	async function handleEditMember() {
		try {
			const response = await fetch('/api/admin/users', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					userId: editingMember._id,
					...editingMember
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

	// 회원 삭제
	async function deleteMember(member) {
		if (!confirm(`정말 ${member.name}님을 삭제하시겠습니까?`)) {
			return;
		}

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

		isUploading = true; // 업로드 시작

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
					// 성공 알림 표시
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
					// 오류 알림 표시
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
				isUploading = false; // 업로드 종료
			}
		};
		reader.readAsArrayBuffer(uploadFile);
	}

	function resetNewMember() {
		newMember = {
			name: '',
			loginId: '',
			phone: '',
			idNumber: '',
			bank: '',
			accountNumber: '',
			branch: '',
			parentId: '',
			position: 'L',
			salesperson: '',
			salespersonPhone: '',
			planner: '',
			plannerPhone: '',
			insuranceProduct: '',
			insuranceCompany: '',
			registrationDate: new Date().toISOString().split('T')[0]  // 리셋 시 오늘 날짜로 초기화
		};
	}

	function openEditModal(member) {
		editingMember = { ...member };
		showEditModal = true;
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
					placeholder="이름, ID, 전화번호, 지사명으로 검색..."
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
				onclick={() => showColumnSettings = !showColumnSettings}
				class="p-1.5 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
				title="컬럼 설정"
			>
				<img src="/icons/settings.svg" alt="Settings" class="w-4 h-4" />
			</button>
		</div>
	</div>

	<!-- 테이블 -->
	<div class="bg-white rounded-lg shadow overflow-hidden">
		<!-- 모바일에서 가로 스크롤 가능 -->
		<div class="overflow-x-auto">
			<table class="divide-y divide-gray-200" style="min-width: 1000px;">
				<thead class="bg-gray-50">
					<tr>
						<th class="sticky left-0 z-10 bg-gray-50 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap border-r border-gray-200" style="min-width: 60px;">
							순번
						</th>
						{#if visibleColumns.date}
							<th onclick={() => changeSort('createdAt')} class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="min-width: 100px;">
								날짜 {#if sortBy === 'createdAt'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
							</th>
						{/if}
						{#if visibleColumns.name}
							<th onclick={() => changeSort('name')} class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="min-width: 80px;">
								성명 {#if sortBy === 'name'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
							</th>
						{/if}
						{#if visibleColumns.phone}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 120px;">
								연락처
							</th>
						{/if}
						{#if visibleColumns.idNumber}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 140px;">
								주민번호
							</th>
						{/if}
						{#if visibleColumns.branch}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 80px;">
								지사
							</th>
						{/if}
						{#if visibleColumns.bank}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 80px;">
								은행
							</th>
						{/if}
						{#if visibleColumns.accountNumber}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 140px;">
								계좌번호
							</th>
						{/if}
						{#if visibleColumns.salesperson}
							<th onclick={() => changeSort('salesperson')} class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="min-width: 80px;">
								판매인 {#if sortBy === 'salesperson'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
							</th>
						{/if}
						{#if visibleColumns.planner}
							<th onclick={() => changeSort('planner')} class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 whitespace-nowrap" style="min-width: 80px;">
								설계사 {#if sortBy === 'planner'}{sortOrder === 'asc' ? '↑' : '↓'}{/if}
							</th>
						{/if}
						{#if visibleColumns.plannerPhone}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 110px;">
								설계사 연락처
							</th>
						{/if}
						{#if visibleColumns.insuranceProduct}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 120px;">
								보험상품
							</th>
						{/if}
						{#if visibleColumns.insuranceCompany}
							<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 80px;">
								보험회사
							</th>
						{/if}
						<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style="min-width: 100px;">
							작업
						</th>
					</tr>
				</thead>
				<tbody class="bg-white divide-y divide-gray-200">
					{#if isLoading}
						<tr>
							<td colspan="12" class="text-center py-8 text-gray-500">
								로딩 중...
							</td>
						</tr>
					{:else if members.length === 0}
						<tr>
							<td colspan="12" class="text-left px-3 py-8 text-gray-500">
								등록된 용역자가 없습니다.
							</td>
						</tr>
					{:else}
						{#each members as member, index}
							<tr class="hover:bg-gray-50">
								<td class="sticky left-0 z-10 bg-white px-3 py-2 text-sm text-gray-700 whitespace-nowrap border-r border-gray-100">
									{(currentPage - 1) * itemsPerPage + index + 1}
								</td>
								{#if visibleColumns.date}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.createdAt ? new Date(member.createdAt).toLocaleDateString('ko-KR') : '-'}
									</td>
								{/if}
								{#if visibleColumns.name}
									<td class="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
										{member.name}
									</td>
								{/if}
								{#if visibleColumns.phone}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.phone || '-'}
									</td>
								{/if}
								{#if visibleColumns.idNumber}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.idNumber || '-'}
									</td>
								{/if}
								{#if visibleColumns.branch}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.branch || '-'}
									</td>
								{/if}
								{#if visibleColumns.bank}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.bank || '-'}
									</td>
								{/if}
								{#if visibleColumns.accountNumber}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.accountNumber || '-'}
									</td>
								{/if}
								{#if visibleColumns.salesperson}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.salesperson || '-'}
									</td>
								{/if}
								{#if visibleColumns.planner}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.planner || '-'}
									</td>
								{/if}
								{#if visibleColumns.plannerPhone}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.plannerPhone || '-'}
									</td>
								{/if}
								{#if visibleColumns.insuranceProduct}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.insuranceProduct || '-'}
									</td>
								{/if}
								{#if visibleColumns.insuranceCompany}
									<td class="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">
										{member.insuranceCompany || '-'}
									</td>
								{/if}
								<td class="px-3 py-2 whitespace-nowrap">
									<div class="flex gap-1">
										<button
											onclick={() => openEditModal(member)}
											class="p-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
											title="수정"
										>
											<img src="/icons/edit.svg" alt="Edit" class="w-3.5 h-3.5" />
										</button>
										<button
											onclick={() => deleteMember(member)}
											class="p-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors"
											title="삭제"
										>
											<img src="/icons/trash.svg" alt="Delete" class="w-3.5 h-3.5" />
										</button>
									</div>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- 페이지네이션 -->
		{#if totalPages > 0}
			<div class="px-6 py-4 bg-white border-t border-gray-200">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-4">
						<p class="text-sm text-gray-700">
							전체 <span class="font-semibold text-gray-900">{totalMembers}</span>개 항목 중
							<span class="font-semibold text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span>
							-
							<span class="font-semibold text-gray-900">{Math.min(currentPage * itemsPerPage, totalMembers)}</span>
							표시
						</p>
					</div>

					<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
						<!-- 이전 페이지 -->
						<button
							onclick={() => changePage(Math.max(1, currentPage - 1))}
							disabled={currentPage === 1}
							class="relative inline-flex items-center rounded-l-md px-1.5 py-1 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<span class="sr-only">이전</span>
							<img src="/icons/chevron-left.svg" alt="Previous" class="h-4 w-4" />
						</button>

						<!-- 페이지 번호들 -->
						<div class="flex items-center gap-1">
							{#if currentPage > 3}
								<button
									onclick={() => changePage(1)}
									class="relative inline-flex items-center px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
								>
									1
								</button>
								{#if currentPage > 4}
									<span class="relative inline-flex items-center px-2 py-1 text-sm text-gray-700 bg-white border border-gray-300">
										...
									</span>
								{/if}
							{/if}

							{#each Array(Math.min(5, totalPages)) as _, i}
								{@const pageNum = Math.max(1, Math.min(currentPage - 2 + i, totalPages - 4)) + Math.min(i, Math.max(0, 2 - (currentPage - 1)))}
								{#if pageNum > 0 && pageNum <= totalPages && (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)}
									<button
										onclick={() => changePage(pageNum)}
										class="relative inline-flex items-center px-3 py-1 text-sm font-medium border transition-all duration-200 {
											pageNum === currentPage
												? 'z-20 bg-blue-600 border-blue-600 text-white shadow-lg transform scale-105'
												: 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500'
										}"
									>
										{pageNum}
									</button>
								{/if}
							{/each}

							{#if currentPage < totalPages - 2}
								{#if currentPage < totalPages - 3}
									<span class="relative inline-flex items-center px-2 py-1 text-sm text-gray-700 bg-white border border-gray-300">
										...
									</span>
								{/if}
								<button
									onclick={() => changePage(totalPages)}
									class="relative inline-flex items-center px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
								>
									{totalPages}
								</button>
							{/if}
						</div>

						<!-- 다음 페이지 -->
						<button
							onclick={() => changePage(Math.min(totalPages, currentPage + 1))}
							disabled={currentPage === totalPages}
							class="relative inline-flex items-center px-1.5 py-1 text-gray-400 bg-white border border-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							aria-label="다음 페이지"
						>
							<img src="/icons/chevron-right.svg" alt="Next" class="w-4 h-4" />
						</button>

						<!-- 마지막 페이지 -->
						<button
							onclick={() => changePage(totalPages)}
							disabled={currentPage === totalPages}
							class="relative inline-flex items-center px-1.5 py-1 text-gray-400 bg-white rounded-r-lg border border-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							aria-label="마지막 페이지"
						>
							<img src="/icons/chevron-double-right.svg" alt="Last" class="w-4 h-4" />
						</button>
					</nav>
				</div>
			</div>
		{/if}
	</div>

	<!-- 용역자 등록 모달 -->
	{#if showAddModal}
		<div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-white rounded-lg p-4 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
				<h3 class="text-lg font-bold text-gray-900 mb-4 text-center">용역자 등록</h3>

				<div class="grid grid-cols-2 gap-4">
					<!-- 왼쪽: 사용자 기본 정보 -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-gray-900 border-b pb-1">기본 정보</h4>
						<div>
							<label class="block text-xs font-medium text-gray-700">성명 *</label>
							<input
								type="text"
								bind:value={newMember.name}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
							/>
							<p class="text-xs text-gray-500 mt-0.5">※ ID 자동 생성</p>
						</div>
						<div>
							<label class="block text-xs font-medium text-gray-700">연락처 *</label>
							<input
								type="text"
								bind:value={newMember.phone}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								placeholder="010-1234-5678"
							/>
							<p class="text-xs text-gray-500 mt-0.5">※ 뒤 4자리가 초기 암호</p>
						</div>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label class="block text-xs font-medium text-gray-700">주민번호</label>
								<input
									type="text"
									bind:value={newMember.idNumber}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
									placeholder="000000-0000000"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-gray-700">등록날짜</label>
								<input
									type="date"
									bind:value={newMember.registrationDate}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								/>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label class="block text-xs font-medium text-gray-700">은행</label>
								<input
									type="text"
									bind:value={newMember.bank}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-gray-700">계좌번호</label>
								<input
									type="text"
									bind:value={newMember.accountNumber}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								/>
							</div>
						</div>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label class="block text-xs font-medium text-gray-700">보험상품</label>
								<input
									type="text"
									bind:value={newMember.insuranceProduct}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-gray-700">보험회사</label>
								<input
									type="text"
									bind:value={newMember.insuranceCompany}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								/>
							</div>
						</div>
					</div>

					<!-- 오른쪽: 판매인/설계사 정보 -->
					<div class="space-y-3">
						<h4 class="text-sm font-semibold text-gray-900 border-b pb-1">판매/설계 정보</h4>
						<div>
							<label class="block text-xs font-medium text-gray-700">소속/지사</label>
							<input
								type="text"
								bind:value={newMember.branch}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-gray-700">판매인</label>
							<input
								type="text"
								bind:value={newMember.salesperson}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
							/>
							<p class="text-xs text-gray-500 mt-0.5">※ 계층도 부모</p>
						</div>
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label class="block text-xs font-medium text-gray-700">판매인 연락처</label>
								<input
									type="text"
									bind:value={newMember.salespersonPhone}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								/>
							</div>
							<div>
								<label class="block text-xs font-medium text-gray-700">설계사</label>
								<input
									type="text"
									bind:value={newMember.planner}
									class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
								/>
							</div>
						</div>
						<div>
							<label class="block text-xs font-medium text-gray-700">설계사 연락처</label>
							<input
								type="text"
								bind:value={newMember.plannerPhone}
								class="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
							/>
						</div>
					</div>
				</div>

				<div class="flex justify-end gap-2 mt-4 pt-3 border-t">
					<button
						onclick={() => showAddModal = false}
						class="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
					>
						취소
					</button>
					<button
						onclick={handleAddMember}
						class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
					>
						등록
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- 엑셀 업로드 모달 -->
	{#if showUploadModal}
		<div class="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
			<div class="bg-white rounded-xl shadow-2xl p-4 sm:p-6 w-full max-w-lg transform transition-all relative">
				<div class="flex items-center gap-3 mb-4 sm:mb-6">
					<div class="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
						<img src="/icons/excel.svg" alt="Excel" class="w-5 h-5 sm:w-6 sm:h-6 filter brightness-0 invert" />
					</div>
					<div>
						<h3 class="text-lg sm:text-xl font-bold text-gray-900">엑셀 파일 업로드</h3>
						<p class="text-xs sm:text-sm text-gray-500">대량 사용자 등록</p>
					</div>
				</div>

				<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
					<div class="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
						<div class="w-4 h-4 sm:w-5 sm:h-5 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
							<span class="text-blue-600 text-xs font-bold">i</span>
						</div>
						<div class="flex-1">
							<p class="text-xs sm:text-sm font-semibold text-gray-700 mb-1">파일 형식 안내</p>
							<p class="text-xs text-gray-600 leading-relaxed">
								필수: 성명, 연락처, 지사, 은행, 계좌번호
							</p>
						</div>
					</div>

					<div class="relative">
						<input
							type="file"
							accept=".xlsx"
							onchange={handleFileSelect}
							id="excel-upload"
							class="hidden"
						/>
						<label
							for="excel-upload"
							class="block w-full px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
						>
							<div class="flex items-center justify-center gap-2">
								<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
								</svg>
								<span class="text-sm font-medium text-gray-600">
									{uploadFile ? '다른 파일 선택' : '파일 선택하기'}
								</span>
							</div>
						</label>
					</div>
				</div>

				{#if uploadFile}
					<div class="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
						<div class="flex items-center gap-2 sm:gap-3">
							<div class="w-6 h-6 sm:w-8 sm:h-8 bg-blue-100 rounded-lg flex items-center justify-center">
								<svg class="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
								</svg>
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-xs sm:text-sm font-semibold text-blue-900">선택된 파일</p>
								<p class="text-xs text-blue-700 truncate">{uploadFile.name}</p>
							</div>
							<button
								onclick={() => uploadFile = null}
								class="w-5 h-5 sm:w-6 sm:h-6 bg-blue-100 rounded-full flex items-center justify-center hover:bg-blue-200 transition-colors flex-shrink-0"
							>
								<svg class="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						</div>
					</div>
				{/if}

				<div class="bg-amber-50 border border-amber-200 rounded-lg p-2 sm:p-3 mb-4 sm:mb-6">
					<div class="flex items-start gap-2">
						<svg class="w-3 h-3 sm:w-4 sm:h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
						<div class="text-xs text-amber-700 leading-relaxed">
							<p><span class="font-semibold">주의:</span> 날짜 컬럼이 매출 발생일로 기록됩니다.</p>
							<p class="mt-1">ID: 이름 자동생성, PW: 전화번호 뒤 4자리</p>
						</div>
					</div>
				</div>

				<div class="flex justify-end gap-2 sm:gap-3">
					<button
						onclick={() => { showUploadModal = false; uploadFile = null; }}
						disabled={isUploading}
						class="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
					>
						취소
					</button>
					<button
						onclick={handleExcelUpload}
						disabled={!uploadFile || isUploading}
						class="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl sm:transform sm:hover:scale-105"
					>
						<span class="flex items-center gap-2">
							{#if isUploading}
								<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								처리 중...
							{:else}
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
								</svg>
								업로드
							{/if}
						</span>
					</button>
				</div>

				{#if isUploading}
					<!-- 전체 화면 오버레이 -->
					<div class="absolute inset-0 bg-white bg-opacity-90 rounded-xl flex flex-col items-center justify-center z-10">
						<div class="text-center">
							<div class="inline-flex items-center justify-center w-16 h-16 mb-4">
								<svg class="animate-spin h-16 w-16 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
							</div>
							<p class="text-lg font-semibold text-gray-700">업로드 처리 중...</p>
							<p class="text-sm text-gray-500 mt-2">잠시만 기다려주세요.</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- 회원 수정 모달 -->
	{#if showEditModal && editingMember}
		<div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto">
				<h3 class="text-lg font-medium text-gray-900 mb-6">회원 정보 수정</h3>

				<div class="grid grid-cols-2 gap-6">
					<!-- 왼쪽: 사용자 기본 정보 -->
					<div class="space-y-4">
						<h4 class="text-sm font-semibold text-gray-900 border-b pb-2">기본 정보</h4>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">성명</label>
							<input
								type="text"
								bind:value={editingMember.name}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">연락처</label>
							<input
								type="text"
								bind:value={editingMember.phone}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">주민번호</label>
							<input
								type="text"
								bind:value={editingMember.idNumber}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">은행</label>
							<input
								type="text"
								bind:value={editingMember.bank}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">계좌번호</label>
							<input
								type="text"
								bind:value={editingMember.accountNumber}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">보험상품명</label>
							<input
								type="text"
								bind:value={editingMember.insuranceProduct}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">보험회사</label>
							<input
								type="text"
								bind:value={editingMember.insuranceCompany}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>
					</div>

					<!-- 오른쪽: 판매인/설계사 정보 -->
					<div class="space-y-4">
						<h4 class="text-sm font-semibold text-gray-900 border-b pb-2">판매/설계 정보</h4>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">소속/지사</label>
							<input
								type="text"
								bind:value={editingMember.branch}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">판매인</label>
							<input
								type="text"
								bind:value={editingMember.salesperson}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">판매인 연락처</label>
							<input
								type="text"
								bind:value={editingMember.salespersonPhone}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">설계사</label>
							<input
								type="text"
								bind:value={editingMember.planner}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">설계사 연락처</label>
							<input
								type="text"
								bind:value={editingMember.plannerPhone}
								class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
							/>
						</div>
					</div>
				</div>

				<div class="mt-4">
					<label class="block text-sm font-medium text-gray-700 mb-1">상태</label>
					<select
						bind:value={editingMember.status}
						class="w-full px-3 py-2 border border-gray-300 rounded-md appearance-none bg-no-repeat"
						style="background-image: url('/icons/chevron-down.svg'); background-position: right 0.5rem center; background-size: 1.5em 1.5em;"
					>
						<option value="active">활성</option>
						<option value="inactive">비활성</option>
						<option value="suspended">정지</option>
					</select>
				</div>

				<div class="flex justify-end gap-3 mt-6">
					<button
						onclick={() => showEditModal = false}
						class="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
					>
						취소
					</button>
					<button
						onclick={handleEditMember}
						class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
					>
						수정
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- 컬럼 설정 모달 -->
	{#if showColumnSettings}
		<div class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
			<div class="bg-white rounded-lg p-6 w-full max-w-md">
				<h3 class="text-lg font-medium text-gray-900 mb-4">테이블 컬럼 설정</h3>
				<p class="text-sm text-gray-600 mb-4">표시할 컬럼을 선택하세요.</p>

				<div class="space-y-2 max-h-60 overflow-y-auto">
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.date}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">날짜</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.name}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">성명 (필수)</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.phone}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">연락처</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.idNumber}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">주민번호</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.branch}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">지사</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.bank}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">은행</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.accountNumber}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">계좌번호</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.salesperson}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">판매인</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.planner}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">설계사</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.plannerPhone}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">설계사 연락처</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.insuranceProduct}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">보험상품</span>
					</label>
					<label class="flex items-center p-2 hover:bg-gray-50 rounded">
						<input
							type="checkbox"
							bind:checked={visibleColumns.insuranceCompany}
							class="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300"
						/>
						<span class="text-sm text-gray-700">보험회사</span>
					</label>
				</div>

				<div class="flex justify-between items-center mt-6 pt-4 border-t">
					<button
						onclick={() => {
							visibleColumns = {
								date: true,
								name: true,
								phone: true,
								idNumber: true,
								branch: true,
								bank: true,
								accountNumber: true,
								salesperson: true,
								planner: true,
								insuranceProduct: true
							};
						}}
						class="text-sm text-gray-600 hover:text-gray-900"
					>
						모두 표시
					</button>
					<div class="flex gap-2">
						<button
							onclick={() => showColumnSettings = false}
							class="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
						>
							취소
						</button>
						<button
							onclick={() => {
								// 설정 저장 (선택사항: localStorage에 저장)
								localStorage.setItem('tableColumns', JSON.stringify(visibleColumns));
								showColumnSettings = false;
							}}
							class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
						>
							적용
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- 알림 모달 -->
	<NotificationModal
		bind:isOpen={notificationOpen}
		type={notificationConfig.type}
		title={notificationConfig.title}
		message={notificationConfig.message}
		results={notificationConfig.results}
		details={notificationConfig.details}
		onClose={() => { notificationOpen = false; }}
	/>
</div>