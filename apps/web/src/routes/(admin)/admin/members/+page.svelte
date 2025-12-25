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
	import UploadHistoryModal from '$lib/components/admin/members/UploadHistoryModal.svelte';

	// Props from +page.server.js
	export let data;

	let members = [];
	let isLoading = true;
	let searchTerm = '';
	let searchCategory = 'name'; // 검색 카테고리 추가
	let currentPage = 1;

	// 검색 카테고리 변경 시 검색어 초기화
	$: if (searchCategory) {
		searchTerm = '';
	}
	let totalPages = 1;
	let totalMembers = 0;
	let itemsPerPage = 20;
	let sortBy = 'sequence';
	let sortOrder = 'asc';

	// 컬럼 표시/숨김 설정
	let visibleColumns = {
		insurance: true,  // 유지/비율 (기본 표시)
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
		plannerAccountNumber: false, // ⭐ 설계사 계좌번호 추가
		insuranceProduct: false,
		insuranceCompany: false
	};
	let tempVisibleColumns = { ...visibleColumns };
	let showColumnSettings = false;

	// 모달 상태
	let showUploadModal = false;
	let showAddModal = false;
	let showEditModal = false;
	let showHistoryModal = false;  // 히스토리 모달
	let uploadFiles = [];  // 단일 → 복수로 변경
	let uploadProgress = null;  // 진행 상황 추가
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
	let monthlyRegistrations = data.monthlyRegistrations || []; // ⭐ reactive 변수로 관리
	let latestMonth = data.latestMonth || null; // ⭐ 최신 등록월

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
				searchCategory: searchCategory,
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

	// ⭐ 월별 등록 목록 갱신
	async function loadMonthlyRegistrations() {
		try {
			const response = await fetch('/api/admin/db/monthly-registrations');
			const result = await response.json();
			if (result.success) {
				// ⭐ 새 배열로 할당하여 Svelte 반응성 트리거
				monthlyRegistrations = [...result.monthlyRegistrations];
			}
		} catch (error) {
			console.error('Failed to load monthly registrations:', error);
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
				ID: memberData.loginId || memberData.name, // loginId를 ID로 매핑
				autoPassword: autoPassword
			};
			delete requestData.loginId; // ID로 매핑했으므로 삭제

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

	// 회원 수정 (requiresReprocess: 지급계획 재처리 필요 여부)
	async function handleEditMember(memberData, requiresReprocess = false) {
		try {
			const response = await fetch('/api/admin/users', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					userId: memberData._id,
					requiresReprocess,  // ⭐ 재처리 필요 여부 전달
					...memberData
				})
			});

			if (response.ok) {
				const result = await response.json();
				let message = '회원 정보가 수정되었습니다.';
				if (requiresReprocess && result.reprocessed) {
					message += '\n\n지급계획이 재계산되었습니다.';
				}
				notificationConfig = {
					type: 'success',
					title: '수정 완료',
					message,
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
	async function handleDeleteMember(memberId) {
		try {
			const response = await fetch('/api/admin/users', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					userId: memberId,
					reprocess: true  // ⭐ 삭제 후 재처리
				})
			});

			if (response.ok) {
				const result = await response.json();
				let message = '지원자가 삭제되었습니다.';
				if (result.reprocessed) {
					message += '\n\n지급계획이 재계산되었습니다.';
				}
				notificationConfig = {
					type: 'success',
					title: '삭제 완료',
					message,
					results: null,
					details: []
				};
				notificationOpen = true;
				showEditModal = false;
				await loadMembers();
				await loadMonthlyRegistrations();  // 월별 등록 목록 갱신
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


	// 엑셀 파일 처리 (다중 파일 지원)
	function handleFileSelect(event) {
		const files = Array.from(event.target.files);
		if (files.length > 0) {
			// 파일명 순으로 정렬 (자연스러운 정렬)
			uploadFiles = files.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
		}
	}

	// 모든 시트에서 데이터 수집 (원래 파싱 로직 그대로 유지)
	async function readAllSheetsFromFile(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const data = new Uint8Array(e.target.result);
					const workbook = XLSX.read(data, { type: 'array' });
					const allData = [];

					// 모든 시트 순회
					for (const sheetName of workbook.SheetNames) {
						const sheet = workbook.Sheets[sheetName];

						// __EMPTY_X 인덱스 키를 포함한 커스텀 파싱 (중복 헤더 대응) - 원래 로직 그대로
						const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
						const headers = rawData[0] || [];

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
									// 숫자는 숫자로 유지, 문자열만 trim
									rowData[indexKey] = typeof value === 'string' ? value.trim() : value;

									// 헤더 이름 키도 추가 (중복되면 마지막 값이 남음)
									if (headers[j]) {
										rowData[String(headers[j]).trim()] = typeof value === 'string' ? value.trim() : value;
									}
								}
							}

							if (Object.keys(rowData).length > 0) {
								allData.push(rowData);
							}
						}
					}

					resolve(allData);
				} catch (error) {
					reject(error);
				}
			};

			reader.onerror = () => {
				reject(new Error(`${file.name} 파일 읽기 실패`));
			};

			reader.readAsArrayBuffer(file);
		});
	}

	// 월별 데이터 처리
	async function processMonth(monthData, monthKey) {
		try {
			const response = await fetch('/api/admin/users/bulk', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					users: monthData,
					fileName: `${monthKey} (${monthData.length}명)`
				})
			});

			const result = await response.json();
			if (response.ok) {
				return {
					success: true,
					monthKey: monthKey,
					created: result.created,
					failed: result.failed,
					alerts: result.alerts,
					errors: result.errors
				};
			} else {
				return {
					success: false,
					monthKey: monthKey,
					error: result.error || '업로드 실패'
				};
			}
		} catch (error) {
			return {
				success: false,
				monthKey: monthKey,
				error: error.message
			};
		}
	}

	// 데이터에서 월 키 추출 (YYYY-MM)
	function extractMonthKey(item) {
		let dateValue = item.__EMPTY_1 || item.__EMPTY || '';

		// Excel 시리얼 번호 감지 및 변환
		if (typeof dateValue === 'number' || (!isNaN(dateValue) && Number(dateValue) > 1900)) {
			const serial = Number(dateValue);
			const epoch = new Date(1899, 11, 30);
			const date = new Date(epoch.getTime() + serial * 86400000);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			return `${year}-${month}`;
		} else if (typeof dateValue === 'string') {
			const dateStr = dateValue.trim();

			// "MM/DD/YYYY" 형식
			const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
			if (slashMatch) {
				const [, m, , y] = slashMatch;
				return `${y}-${m.padStart(2, '0')}`;
			}
			// "YYYY-MM-DD" 형식
			if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
				return dateStr.substring(0, 7);
			}
			// "YYYY/MM/DD" 형식
			if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
				return dateStr.substring(0, 7).replace('/', '-');
			}
			// "YYYY-MM" 형식
			if (/^\d{4}-\d{2}$/.test(dateStr)) {
				return dateStr;
			}
		}
		return null;
	}

	// 다중 파일 업로드 처리 (월별 그룹화)
	async function handleExcelUpload() {
		if (uploadFiles.length === 0) {
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
		const results = [];

		try {
			// 1단계: 모든 파일의 모든 시트에서 데이터 수집
			uploadProgress = {
				current: 0,
				total: uploadFiles.length,
				fileName: '파일 읽는 중...'
			};

			const allData = [];
			const fileInfoMap = new Map();  // 파일별 정보 (데이터 건수, 월)
			for (let i = 0; i < uploadFiles.length; i++) {
				const file = uploadFiles[i];
				uploadProgress = {
					current: i + 1,
					total: uploadFiles.length,
					fileName: `${file.name} 읽는 중...`
				};

				const fileData = await readAllSheetsFromFile(file);

				// 파일별 월 추출 및 데이터 건수 저장
				const fileMonths = new Set();
				for (const item of fileData) {
					const monthKey = extractMonthKey(item);
					if (monthKey) fileMonths.add(monthKey);
				}
				fileInfoMap.set(file.name, {
					dataCount: fileData.length,  // 파일의 데이터 건수
					months: Array.from(fileMonths).sort()
				});

				allData.push(...fileData);
			}

			// ⭐ 1.5단계: 중복 검사 (이름 + ID)
			uploadProgress = {
				current: 0,
				total: 1,
				fileName: '중복 검사 중...'
			};

			const duplicateCheckRes = await fetch('/api/admin/users/check-duplicates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ users: allData })
			});
			const duplicateCheckResult = await duplicateCheckRes.json();

			if (duplicateCheckResult.hasDuplicates) {
				const { duplicates } = duplicateCheckResult;
				// 간결한 형식: "행 1: 사장님, 행 2: 김영수, ..."
				const nameList = duplicates.map(d => `행 ${d.row}: ${d.name}`).join(', ');

				notificationConfig = {
					type: 'error',
					title: '중복된 사용자 이름',
					message: `이미 등록된 중복된 사용자 이름이 있습니다.\n${nameList}`,
					results: null,
					details: []
				};
				notificationOpen = true;
				isUploading = false;
				uploadProgress = null;
				return;
			}

			// 2단계: 정렬 (1차: 날짜, 2차: 순번)
		allData.sort((a, b) => {
			// 1차: 날짜 정렬
			let dateA = a.__EMPTY_1 || a.__EMPTY || '';
			let dateB = b.__EMPTY_1 || b.__EMPTY || '';
			
			// Excel 시리얼 번호 처리
			if (typeof dateA === 'number' || (!isNaN(dateA) && Number(dateA) > 1900)) {
				dateA = Number(dateA);
			}
			if (typeof dateB === 'number' || (!isNaN(dateB) && Number(dateB) > 1900)) {
				dateB = Number(dateB);
			}
			
			// 숫자면 숫자 비교, 문자열이면 문자열 비교
			let dateCompare;
			if (typeof dateA === 'number' && typeof dateB === 'number') {
				dateCompare = dateA - dateB;
			} else {
				dateCompare = String(dateA).localeCompare(String(dateB));
			}
			if (dateCompare !== 0) return dateCompare;
			
			// 2차: 순번 정렬
			const seqA = a.__EMPTY || '';
			const seqB = b.__EMPTY || '';
			return String(seqA).localeCompare(String(seqB), undefined, { numeric: true });
		});

		// 3단계: 월별 그룹화
		const monthGroups = {};
		for (const item of allData) {
			let dateValue = item.__EMPTY_1 || item.__EMPTY || '';
			let monthKey = '';

			// Excel 시리얼 번호 감지 및 변환 (숫자이고 1900 이상이면 Excel 날짜)
			if (typeof dateValue === 'number' || (!isNaN(dateValue) && Number(dateValue) > 1900)) {
				const serial = Number(dateValue);
				// Excel 시리얼 번호를 Date로 변환 (1900-01-01 = 1)
				const epoch = new Date(1899, 11, 30);
				const date = new Date(epoch.getTime() + serial * 86400000);
				// "YYYY-MM" 형식으로 변환
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, '0');
				monthKey = `${year}-${month}`;
			} else if (typeof dateValue === 'string') {
				// 다양한 문자열 날짜 형식 처리
				const dateStr = dateValue.trim();

				// "MM/DD/YYYY" 또는 "M/D/YYYY" 형식 (예: 10/24/2025)
				const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
				if (slashMatch) {
					const [, m, , y] = slashMatch;
					monthKey = `${y}-${m.padStart(2, '0')}`;
				}
				// "YYYY-MM-DD" 형식 (예: 2025-10-24)
				else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
					monthKey = dateStr.substring(0, 7);
				}
				// "YYYY/MM/DD" 형식 (예: 2025/10/24)
				else if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
					monthKey = dateStr.substring(0, 7).replace('/', '-');
				}
				// "YYYY-MM" 형식 (이미 월 형식)
				else if (/^\d{4}-\d{2}$/.test(dateStr)) {
					monthKey = dateStr;
				}
				// 기타: 그냥 substring 시도
				else {
					monthKey = dateStr.substring(0, 7);
				}
			}

			if (!monthKey) continue; // 날짜 파싱 실패 시 스킵

			if (!monthGroups[monthKey]) {
				monthGroups[monthKey] = [];
			}
			monthGroups[monthKey].push(item);
		}

			// 4단계: 월별로 순차 처리
			const monthKeys = Object.keys(monthGroups).sort();

			for (let i = 0; i < monthKeys.length; i++) {
				const monthKey = monthKeys[i];
				const monthData = monthGroups[monthKey];

				uploadProgress = {
					current: i + 1,
					total: monthKeys.length,
					fileName: `${monthKey} 처리 중 (${monthData.length}명)...`
				};

				const result = await processMonth(monthData, monthKey);
				results.push(result);
			}

			// 5단계: 전체 결과 집계
			const totalCreated = results.reduce((sum, r) => sum + (r.created || 0), 0);
			const totalFailed = results.reduce((sum, r) => sum + (r.failed || 0), 0);
			const failedMonths = results.filter(r => !r.success);

			// 6단계: 업로드 성공 시 파일을 서버에 저장 (히스토리용)
			if (totalCreated > 0) {
				for (const file of uploadFiles) {
					try {
						const formData = new FormData();
						formData.append('file', file);

						const saveResponse = await fetch('/api/admin/uploads', {
							method: 'POST',
							body: formData
						});

						if (saveResponse.ok) {
							const saveResult = await saveResponse.json();

							// 해당 파일의 정보 가져오기
							const fileInfo = fileInfoMap.get(file.name) || { dataCount: 0, months: [] };

							// 등록 결과 업데이트 (파일의 데이터 건수 사용)
							await fetch('/api/admin/uploads', {
								method: 'PUT',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({
									uploadId: saveResult.uploadId,
									created: fileInfo.dataCount,  // 파일의 데이터 건수
									failed: 0,
									total: fileInfo.dataCount,
									monthKey: fileInfo.months.length > 0 ? fileInfo.months.join(', ') : null
								})
							});
							console.log(`📁 히스토리 저장 완료: ${file.name} (${fileInfo.dataCount}건, ${fileInfo.months.join(', ')})`);
						}
					} catch (saveError) {
						console.warn(`파일 저장 실패: ${file.name}`, saveError);
					}
				}
			}

			// 결과 표시
			notificationConfig = {
				type: failedMonths.length > 0 ? 'warning' : 'success',
				title: '엑셀 업로드 완료',
				message: `총 ${monthKeys.length}개 월 처리`,
				results: {
					months: results,
					totalCreated,
					totalFailed
				},
				details: results.map(r => ({
					type: r.success ? 'success' : 'error',
					title: r.monthKey,
					created: r.created,
					failed: r.failed,
					content: r.success ? null : `오류: ${r.error}`
				}))
			};
			notificationOpen = true;
			showUploadModal = false;
			uploadFiles = [];
			uploadProgress = null;
			await loadMembers();

			// ⭐ 서버에서 최신 월 목록 가져오기
			await loadMonthlyRegistrations();

			// 마지막으로 처리된 월을 자동 선택
			if (monthKeys.length > 0) {
				const lastMonth = monthKeys[monthKeys.length - 1];
				selectedMonth = lastMonth;
			}
		} catch (error) {
			console.error('Excel upload error:', error);
			notificationConfig = {
				type: 'error',
				title: '업로드 오류',
				message: error.message,
				results: null,
				details: []
			};
			notificationOpen = true;
		} finally {
			isUploading = false;
			uploadProgress = null;
		}
	}

	function openEditModal(member) {
		editingMember = { ...member };
		showEditModal = true;
	}

	// 컬럼 설정 관련 함수
	function handleShowAllColumns() {
		tempVisibleColumns = {
			insurance: true,
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
			plannerAccountNumber: true, // ⭐ 설계사 계좌번호 추가
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
					message: `${selectedMonth} 데이터가 삭제되었습니다.\n\n삭제된 항목:\n- 용역자: ${result.deletedUsers || 0}명\n- 지급 계획: ${result.deletedPlans || 0}건\n- 설계사 수당: ${result.deletedCommissionPlans || 0}건\n- 주간 요약: ${result.deletedSummaries || 0}건`,
					results: null,
					details: []
				};
				notificationOpen = true;
				selectedMonth = '';
				// ⭐ 페이지 새로고침 대신 데이터만 갱신
				await loadMembers();
				await loadMonthlyRegistrations();
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
	<h1 class="title">계약자 관리명부</h1>

	<!-- 검색 및 필터 -->
	<div class="filter-section">
		<div class="search-container">
			<!-- 검색 카테고리 -->
			<select bind:value={searchCategory} class="select-category">
				<option value="name">이름</option>
				<option value="planner">설계사</option>
				<option value="grade">등급</option>
			</select>

			<!-- 검색 입력 -->
			{#if searchCategory === 'grade'}
				<select bind:value={searchTerm} onchange={handleSearchClick} class="select-grade">
					<option value="">등급 선택</option>
					<option value="F1">F1</option>
					<option value="F2">F2</option>
					<option value="F3">F3</option>
					<option value="F4">F4</option>
					<option value="F5">F5</option>
					<option value="F6">F6</option>
					<option value="F7">F7</option>
					<option value="F8">F8</option>
				</select>
			{:else}
				<input
					type="text"
					bind:value={searchTerm}
					onkeypress={handleKeyPress}
					placeholder={searchCategory === 'name' ? '이름으로 검색...' : '설계사 이름으로 검색...'}
					class="input-search"
				/>
			{/if}

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

	<!-- 지원자 등록 모달 -->
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
		{latestMonth}
		onClose={() => (showEditModal = false)}
		onSubmit={handleEditMember}
		onDelete={handleDeleteMember}
		onChangedInsurance={(userData) => {
			// ⭐ 보험 정보 변경 시 해당 멤버만 업데이트 (전체 갱신 X)
			editingMember = {
				...editingMember,
				insuranceAmount: userData.insuranceAmount,
				insuranceActive: userData.insuranceActive,
				insuranceDate: userData.insuranceDate
			};
			// 리스트에서 해당 멤버만 업데이트
			members = members.map(m =>
				m._id === editingMember._id
					? { ...m, insuranceAmount: userData.insuranceAmount, insuranceActive: userData.insuranceActive, insuranceDate: userData.insuranceDate }
					: m
			);
		}}
	/>

	<!-- 엑셀 업로드 모달 -->
	<ExcelUploadModal
		isOpen={showUploadModal}
		{isUploading}
		bind:uploadFiles
		bind:uploadProgress
		onClose={() => {
			showUploadModal = false;
			uploadFiles = [];
			uploadProgress = null;
		}}
		onFileSelect={handleFileSelect}
		onUpload={handleExcelUpload}
		onOpenHistory={() => {
			showUploadModal = false;
			uploadFiles = [];
			uploadProgress = null;
			showHistoryModal = true;
		}}
	/>

	<!-- 업로드 히스토리 모달 -->
	<UploadHistoryModal
		isOpen={showHistoryModal}
		onClose={() => (showHistoryModal = false)}
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
					{#each monthlyRegistrations as month}
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
				<p class="whitespace-pre-wrap text-sm text-gray-700 max-h-24 overflow-y-auto">{notificationConfig.message}</p>
			{/if}

			{#if notificationConfig.results}
				<div class="flex gap-3 text-sm">
					{#if notificationConfig.results.created !== undefined}
						<span class="alert-success">✓ 성공: <strong>{notificationConfig.results.created}명</strong></span>
					{:else if notificationConfig.results.totalCreated !== undefined}
						<span class="alert-success">✓ 성공: <strong>{notificationConfig.results.totalCreated}명</strong></span>
					{/if}
					{#if notificationConfig.results.failed !== undefined && notificationConfig.results.failed > 0}
						<span class="alert-fail">✗ 실패: <strong>{notificationConfig.results.failed}명</strong></span>
					{:else if notificationConfig.results.totalFailed !== undefined && notificationConfig.results.totalFailed > 0}
						<span class="alert-fail">✗ 실패: <strong>{notificationConfig.results.totalFailed}명</strong></span>
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
							{#if detail.created !== undefined}
								<p class="detail-content">
									<span class="alert-success">등록: <strong>{detail.created}명</strong></span>
									{#if detail.failed > 0}
										<span class="mx-2">,</span>
										<span class="alert-fail">실패: <strong>{detail.failed}명</strong></span>
									{:else}
										<span class="mx-2">,</span>
										<span class="text-gray-500">실패: 0명</span>
									{/if}
								</p>
							{:else if detail.content}
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
		font-size: 1.25rem;
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

	.select-grade {
		@apply h-7 min-w-[200px] flex-1 cursor-pointer rounded border-2 border-gray-200 bg-white px-1.5 py-1 text-[13px] leading-[1.4] outline-none transition-all hover:border-blue-500 hover:shadow-[0_0_0_2px_rgba(0,123,255,0.1)] focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
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
		@apply mb-3 flex flex-wrap items-center justify-between gap-2;
	}

	.total-count {
		@apply whitespace-nowrap text-sm font-semibold text-gray-700;
	}

	/* 반응형 - 모바일 */
	@media (max-width: 768px) {
		.container {
			padding: 10px;
		}

		.title {
			font-size: 1.125rem;
			margin-bottom: 10px;
		}

		.filter-section {
			margin-bottom: 12px;
		}

		.table-header {
			@apply mb-2;
		}

		.total-count {
			@apply w-full text-xs mb-1;
		}

		.table-header > div:last-child {
			@apply w-full justify-start;
		}
	}

	@media (max-width: 480px) {
		.container {
			padding: 5px;
		}

		.title {
			font-size: 1rem;
			margin-bottom: 6px;
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
		@apply text-lg font-bold text-blue-600;
	}

	.alert-fail {
		@apply text-lg font-bold text-red-600;
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
		@apply min-w-[100px] rounded border border-gray-300 px-2 py-1 text-xs focus:border-red-500 focus:outline-none;
		height: 28px;
		line-height: normal;
	}

	.db-compact-btn {
		@apply whitespace-nowrap rounded bg-gray-600 px-3 py-1 text-xs text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400;
		height: 28px;
	}

	.db-compact-btn-critical {
		@apply bg-red-600 hover:bg-red-700;
	}

	.db-compact-divider {
		@apply text-gray-400;
	}
</style>
