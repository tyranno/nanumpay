<script>
	import { onMount } from 'svelte';
	import GradeBadge from '$lib/components/GradeBadge.svelte';
	import UserProfileModal from '$lib/components/user/UserProfileModal.svelte';
	import WindowsModal from '$lib/components/WindowsModal.svelte';
	import { GRADE_LIMITS } from '$lib/utils/constants.js';

	// 기간 제한 알림 모달 상태
	let showPeriodLimitAlert = $state(false);

	// ⭐ 보험 미유지 알림 상태
	let showInsuranceAlert = $state(false);
	let accountsNeedingInsurance = $state([]);

	// ⭐ 보험 조건 정보 모달 상태
	let showInsuranceInfoModal = $state(false);
	let selectedInsuranceInfo = $state(null);

	// ⭐ 보험 아이콘 클릭 핸들러
	function handleInsuranceIconClick(event, reg) {
		event.preventDefault();
		event.stopPropagation();
		const gradeLimit = GRADE_LIMITS[reg.grade];
		selectedInsuranceInfo = {
			name: reg.name,
			grade: reg.grade,
			insuranceActive: reg.insuranceActive,
			insuranceRequired: gradeLimit?.insuranceRequired || false,
			insuranceAmount: gradeLimit?.insuranceAmount || 0
		};
		showInsuranceInfoModal = true;
	}

	// ⭐ 보험 유지 만료 날짜 계산 (승급 후 2달 첫 금요일)
	function getInsuranceDeadline(account) {
		if (!account.gradeHistory || account.gradeHistory.length === 0) {
			return null;
		}

		// 현재 등급으로 승급한 날짜 찾기 (가장 최근)
		const currentGrade = account.grade;
		const promotionRecord = [...account.gradeHistory]
			.reverse()
			.find(h => h.toGrade === currentGrade && h.type === 'promotion');

		if (!promotionRecord) {
			// 승급 기록이 없으면 등록일 기준
			const registrationRecord = account.gradeHistory.find(h => h.type === 'registration');
			if (!registrationRecord) return null;
			return calculateDeadlineFromDate(new Date(registrationRecord.date));
		}

		return calculateDeadlineFromDate(new Date(promotionRecord.date));
	}

	// 주어진 날짜로부터 2달 후 첫 금요일 계산
	function calculateDeadlineFromDate(baseDate) {
		// 2달 후
		const twoMonthsLater = new Date(baseDate);
		twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

		// 첫 금요일 찾기
		const dayOfWeek = twoMonthsLater.getDay();
		const daysUntilFriday = (5 - dayOfWeek + 7) % 7;

		const firstFriday = new Date(twoMonthsLater);
		if (daysUntilFriday === 0 && twoMonthsLater.getDay() !== 5) {
			// 금요일이 아닌데 daysUntilFriday가 0이면 다음 금요일로
			firstFriday.setDate(firstFriday.getDate() + 7);
		} else {
			firstFriday.setDate(firstFriday.getDate() + daysUntilFriday);
		}

		return firstFriday;
	}

	// 날짜 포맷 (YYYY-MM-DD)
	function formatDeadlineDate(date) {
		if (!date) return '-';
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// ⭐ 최종 승급일 조회 (승급일 없으면 등록일 반환)
	function getLastPromotionDate(user) {
		// user.gradeHistory가 있으면 사용, 없으면 allRegistrations에서 찾기
		const gradeHistory = user.gradeHistory || getRegistrationInfo(user)?.gradeHistory;
		if (!gradeHistory || gradeHistory.length === 0) {
			return null;
		}
		// promotion 타입인 기록 중 가장 마지막 것
		const promotions = gradeHistory.filter(h => h.type === 'promotion');
		if (promotions.length > 0) {
			const lastPromotion = promotions[promotions.length - 1];
			return new Date(lastPromotion.date);
		}
		// 승급 기록이 없으면 등록일 반환
		const registration = gradeHistory.find(h => h.type === 'registration');
		if (registration) {
			return new Date(registration.date);
		}
		return null;
	}

	// ⭐ userId로 등록 정보 찾기
	function getRegistrationInfo(user) {
		// userId가 ObjectId인 경우 문자열로 변환
		const userId = user.userId?.toString ? user.userId.toString() : user.userId;
		return allRegistrations.find(reg => reg.id === userId);
	}

	// ⭐ 사용자의 보험 가입기한 조회
	function getUserInsuranceDeadline(user) {
		// user.gradeHistory가 있으면 사용, 없으면 allRegistrations에서 찾기
		const reg = getRegistrationInfo(user);
		if (!reg) return null;

		const gradeLimit = GRADE_LIMITS[reg.grade];
		if (!gradeLimit?.insuranceRequired) return null;

		return getInsuranceDeadline(reg);
	}

	// ⭐ 보험 필요 여부 체크 (gradeCount에서 가장 높은 등급 기준)
	function getInsuranceInfo(user) {
		const grades = Object.keys(user.gradeCount || {});
		if (grades.length === 0) {
			return { isRequired: false, isActive: false, ratio: 1 };
		}
		// 가장 높은 등급 확인 (F4 이상이면 보험 필수)
		const hasHighGrade = grades.some(g => {
			const gradeLimit = GRADE_LIMITS[g];
			return gradeLimit?.insuranceRequired;
		});
		const isActive = user.insuranceActive || false;
		// ratio: 보험 필수인데 미유지면 0, 그 외는 1
		const ratio = hasHighGrade ? (isActive ? 1 : 0) : 1;
		return {
			isRequired: hasHighGrade,
			isActive: isActive,
			ratio: ratio
		};
	}

	let userInfo = $state(null);
	let allRegistrations = $state([]); // ⭐ v8.0: 모든 등록 정보
	let registrationViewMode = $state('card'); // 'card' | 'list' 보기 모드
	let paymentSummary = $state(null);
	let allPayments = $state([]); // 전체 데이터
	let filteredPayments = $state([]); // 필터링된 데이터
	let displayedPayments = $state([]); // 현재 페이지에 표시할 데이터
	let isLoading = $state(true);
	let error = $state(null);

	// ⭐ 날짜 포맷 함수 (YYYY-MM-DD)
	function formatDateYMD(date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// ⭐ 기본 기간: 이번주 금요일 ~ 3주 후 금요일 (이번주 포함 4주)
	const defaultStartDate = (() => {
		return formatDateYMD(getCurrentFriday());
	})();

	const defaultEndDate = (() => {
		return formatDateYMD(getMaxFriday());
	})();

	// ⭐ 최대 선택 가능 날짜 (이번주 포함 4주)
	const maxDate = (() => {
		return formatDateYMD(getMaxFriday());
	})();

	// 필터 상태 (날짜 기반)
	let filters = $state({
		startDate: defaultStartDate,
		endDate: defaultEndDate,
		grade: ''
	});

	// 페이지네이션 상태
	let currentPage = $state(1);
	let itemsPerPage = $state(5); // ⭐ 기본값 5개
	let totalPages = $state(1);
	let itemsPerPageOptions = [5, 10, 20, 50];

	onMount(async () => {
		try {
			const response = await fetch('/api/user/payments');
			const data = await response.json();

			console.log('🔥 API 응답:', data);

			if (!response.ok) {
				throw new Error(data.message || '지원비 정보를 불러오는데 실패했습니다.');
			}

			if (data.success) {
				userInfo = data.user;
				allRegistrations = data.allRegistrations || []; // ⭐ v8.0
				paymentSummary = data.summary;
				allPayments = data.payments;
				console.log('✅ allPayments 설정됨:', allPayments.length, '건');
				console.log('✅ allRegistrations 설정됨:', allRegistrations.length, '건');
				console.log('📅 첫 번째 데이터:', allPayments[0]);
			} else {
				throw new Error('지원비 정보가 없습니다.');
			}

			// 암호 변경 필요 여부 체크 (세션 스토리지)
			const requirePasswordChange = sessionStorage.getItem('requirePasswordChange');
			if (requirePasswordChange === 'true') {
				sessionStorage.removeItem('requirePasswordChange');
				isProfileModalOpen = true;
				// UserProfileModal에 암호 탭으로 전환하라는 신호 보내기
				setTimeout(() => {
					const event = new CustomEvent('force-password-tab');
					window.dispatchEvent(event);
				}, 100);
			}

			// ⭐ 보험 미유지 계좌 확인
			const needInsurance = allRegistrations.filter(reg => {
				const gradeLimit = GRADE_LIMITS[reg.grade];
				const isRequired = gradeLimit?.insuranceRequired || false;
				return isRequired && !reg.insuranceActive;
			});

			if (needInsurance.length > 0) {
				accountsNeedingInsurance = needInsurance;
				showInsuranceAlert = true;
			}
		} catch (err) {
			console.error('❌ Error loading payments:', err);
			error = err.message;
		} finally {
			isLoading = false;
		}
	});

	// ⭐ 현재 주의 금요일 계산
	function getCurrentFriday() {
		const now = new Date();
		const dayOfWeek = now.getDay(); // 0=일, 1=월, ..., 5=금, 6=토
		const daysToFriday = dayOfWeek <= 5 ? (5 - dayOfWeek) : (5 - dayOfWeek + 7);
		const friday = new Date(now);
		friday.setDate(now.getDate() + daysToFriday);
		friday.setHours(0, 0, 0, 0);
		return friday;
	}

	// ⭐ 최대 선택 가능 금요일 (이번주 포함 4주 = 3주 후)
	function getMaxFriday() {
		const currentFriday = getCurrentFriday();
		const maxFriday = new Date(currentFriday);
		maxFriday.setDate(currentFriday.getDate() + 21); // 이번주 포함 4주
		return maxFriday;
	}

	// ⭐ 기간 제한 검증 (현재주 포함 4주 초과 시 경고)
	$effect(() => {
		const maxFriday = getMaxFriday();
		const maxDateStr = `${maxFriday.getFullYear()}-${String(maxFriday.getMonth() + 1).padStart(2, '0')}-${String(maxFriday.getDate()).padStart(2, '0')}`;

		let wasAdjusted = false;

		// 시작 기간 제한
		if (filters.startDate > maxDateStr) {
			filters.startDate = maxDateStr;
			wasAdjusted = true;
		}

		// 종료 기간 제한
		if (filters.endDate > maxDateStr) {
			filters.endDate = maxDateStr;
			wasAdjusted = true;
		}

		// 시작일이 종료일보다 늦으면 조정
		if (filters.startDate > filters.endDate) {
			filters.startDate = filters.endDate;
		}

		// ⭐ 제한 초과 시 알림 모달 표시
		if (wasAdjusted) {
			showPeriodLimitAlert = true;
		}
	});

	// 필터가 변경될 때마다 자동으로 적용
	$effect(() => {
		// 필터만 추적 (날짜 기반)
		const startDate = filters.startDate;
		const endDate = filters.endDate;
		const grade = filters.grade;

		// ⭐ 미래 데이터 제한 (현재주 포함 4주까지만)
		const maxFriday = getMaxFriday();

		// ⭐ 날짜 파싱
		const startDateObj = new Date(startDate);
		const endDateObj = new Date(endDate);
		endDateObj.setHours(23, 59, 59, 999); // 종료일 끝까지 포함

		// ⭐ v8.0: 개별 행 필터링 (날짜 기반)
		const filtered = allPayments.filter((payment) => {
			const paymentDate = new Date(payment.weekDate);

			// ⭐ 미래 주차 제한 (현재주 포함 4주까지만 표시)
			if (paymentDate > maxFriday) {
				return false;
			}

			// 시작 날짜 필터 - 이상(>=)
			if (paymentDate < startDateObj) {
				return false;
			}

			// 종료 날짜 필터 - 이하(<=)
			if (paymentDate > endDateObj) {
				return false;
			}

			// ⭐ v8.0: 등급 필터 (gradeCount에 해당 등급이 있는지 확인)
			if (grade && !payment.gradeCount[grade]) {
				return false;
			}

			return true;
		});

		filteredPayments = filtered;
		currentPage = 1;
	});

	// ⭐ v8.0: 주차별로 그룹화 (날짜 기준)
	let groupedPayments = $state([]);
	let periodSummary = $state({ totalAmount: 0, totalTax: 0, totalNet: 0 }); // ⭐ 기간 총액

	$effect(() => {
		// 주차별 그룹화 + 사용자별 등급 집계
		const grouped = new Map();
		let periodTotal = 0;
		let periodTax = 0;
		let periodNet = 0;

		for (const payment of filteredPayments) {
			const weekKey = payment.weekDate;

			if (!grouped.has(weekKey)) {
				grouped.set(weekKey, {
					weekDate: payment.weekDate,
					weekNumber: payment.weekNumber,
					users: [],
					userGrades: new Map(), // ⭐ 사용자별 등급 집계 (userId_regNum -> gradeCount)
					totalAmount: 0,
					totalTax: 0,
					totalNet: 0
				});
			}

			const group = grouped.get(weekKey);
			group.users.push(payment);

			// ⭐ 사용자별 등급 집계
			const userKey = `${payment.userId}_${payment.registrationNumber}`;
			if (!group.userGrades.has(userKey)) {
				group.userGrades.set(userKey, {});
			}
			const gradeCount = group.userGrades.get(userKey);
			// payment.gradeCount의 모든 등급을 집계
			for (const [grade, count] of Object.entries(payment.gradeCount || {})) {
				gradeCount[grade] = (gradeCount[grade] || 0) + count;
			}

			group.totalAmount += payment.amount || 0;
			group.totalTax += payment.tax || 0;
			group.totalNet += payment.netAmount || 0;

			periodTotal += payment.amount || 0;
			periodTax += payment.tax || 0;
			periodNet += payment.netAmount || 0;
		}

		// ⭐ 사용자별로 합산 (같은 사용자의 여러 등급 지급을 하나로)
		for (const group of grouped.values()) {
			const userMap = new Map();

			for (const payment of group.users) {
				const userKey = `${payment.userId}_${payment.registrationNumber}`;

				if (!userMap.has(userKey)) {
					userMap.set(userKey, {
						...payment,
						gradeCount: {},
						totalAmount: 0,
						totalTax: 0,
						totalNet: 0
					});
				}

				const merged = userMap.get(userKey);
				// ⭐ payment.gradeCount의 모든 등급을 병합
				for (const [grade, count] of Object.entries(payment.gradeCount || {})) {
					merged.gradeCount[grade] = (merged.gradeCount[grade] || 0) + count;
				}
				merged.totalAmount += payment.amount || 0;
				merged.totalTax += payment.tax || 0;
				merged.totalNet += payment.netAmount || 0;
			}

			// 합산된 사용자 목록으로 교체 (registrationNumber 순 정렬)
			group.users = Array.from(userMap.values()).sort((a, b) => a.registrationNumber - b.registrationNumber);

			// 각 사용자의 amount, tax, netAmount를 합산된 값으로 업데이트
			for (const user of group.users) {
				user.amount = user.totalAmount;
				user.tax = user.totalTax;
				user.netAmount = user.totalNet;
			}
		}

		groupedPayments = Array.from(grouped.values());
		periodSummary = { totalAmount: periodTotal, totalTax: periodTax, totalNet: periodNet };
	});

	// 페이지네이션 업데이트 (필터나 페이지가 변경될 때마다)
	$effect(() => {
		const total = Math.ceil(groupedPayments.length / itemsPerPage);
		const startIndex = (currentPage - 1) * itemsPerPage;
		const endIndex = startIndex + itemsPerPage;
		const displayed = groupedPayments.slice(startIndex, endIndex);

		totalPages = total;
		displayedPayments = displayed;
	});

	// 페이지 변경
	function goToPage(page) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
	}

	// 필터 초기화
	function resetFilters() {
		filters.startDate = currentDate;
		filters.endDate = currentDate;
		filters.grade = '';
	}

	// 날짜 포맷팅
	function formatDate(dateStr) {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// 금액 포맷팅
	function formatAmount(amount) {
		if (!amount && amount !== 0) return '-';
		return amount.toLocaleString() + '원';
	}

	// ⭐ 지급액 내역 계산 (50:25:25, 100원 단위 절삭)
	function calculateBreakdown(amount) {
		if (!amount) return { 영업: 0, 홍보: 0, 판촉: 0 };
		return {
			영업: Math.floor((amount * 0.5) / 100) * 100,
			홍보: Math.floor((amount * 0.25) / 100) * 100,
			판촉: Math.floor((amount * 0.25) / 100) * 100
		};
	}

	// 등급 목록
	const grades = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

	// 프로필 모달 상태
	let isProfileModalOpen = $state(false);

	function openProfileModal() {
		isProfileModalOpen = true;
	}
</script>

<svelte:head>
	<title>내 지원비 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex h-screen items-center justify-center">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else if error}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<p class="mb-2 text-red-500">{error}</p>
		</div>
	</div>
{:else}
	<div class="w-full px-2 pb-2">
		<!-- 전체 Base 카드 -->
		<div class="rounded-lg bg-white shadow-lg p-4">
			<!-- 상단 요약 카드 -->
			<div class="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
			<!-- 사용자 정보 카드 -->
			<div class="rounded-lg border-2 border-indigo-200 bg-gradient-to-br from-blue-50 to-indigo-100 p-3 shadow-lg">
				<div class="mb-2 flex items-center justify-between">
					<div class="flex items-center gap-2">
						<img src="/icons/user.svg" alt="사용자" class="h-5 w-5 text-indigo-700" />
						<h3 class="text-base font-bold text-indigo-900">내 정보</h3>
					</div>
					<button
					onclick={openProfileModal}
					class="text-xs text-indigo-600 underline decoration-dotted underline-offset-2 transition-colors hover:text-indigo-800"
				>
					상세보기
				</button>
				</div>

				<!-- ⭐ v8.0: 여러 등록 정보 표시 (보기 모드 선택 가능) -->
				{#if allRegistrations.length > 0}
					<div class="mb-2 rounded border border-indigo-200 bg-indigo-50 p-2">
						<!-- 헤더: 제목 + 보기 모드 토글 -->
						<div class="mb-1.5 flex items-center justify-between">
							<div class="text-xs font-semibold text-indigo-700">
								등록 계약 목록(총 {allRegistrations.length}건){#if userInfo?.canViewSubordinates} <span class="font-normal text-indigo-500">- 클릭 시 산하정보</span>{/if}
							</div>
							<!-- 보기 모드 토글 버튼 -->
							<div class="flex items-center gap-0.5 rounded bg-indigo-100 p-0.5">
								<button
									onclick={() => registrationViewMode = 'card'}
									class="rounded px-1.5 py-0.5 text-[10px] transition-colors {registrationViewMode === 'card' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-500 hover:text-indigo-700'}"
									title="카드 보기"
								>
									▦
								</button>
								<button
									onclick={() => registrationViewMode = 'list'}
									class="rounded px-1.5 py-0.5 text-[10px] transition-colors {registrationViewMode === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-indigo-500 hover:text-indigo-700'}"
									title="리스트 보기"
								>
									≡
								</button>
							</div>
						</div>

						<!-- 카드 보기 (flex-wrap, 2줄 고정 + 스크롤) -->
						{#if registrationViewMode === 'card'}
							<div class="flex flex-wrap gap-1.5 max-h-[56px] overflow-y-auto">
								{#each allRegistrations as reg}
									{@const gradeLimit = GRADE_LIMITS[reg.grade]}
									{#if userInfo?.canViewSubordinates}
										<a
											href="/dashboard/network?userId={reg.id}"
											class="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-indigo-700 border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 transition-colors shadow-sm"
											title="{reg.grade} 등급 - 산하정보 보기"
										>
											<span class="font-medium">{reg.name}</span>
											<span class="text-gray-400">({formatDate(reg.createdAt)})</span>
											{#if gradeLimit?.insuranceRequired}
												<button
													onclick={(e) => handleInsuranceIconClick(e, reg)}
													class="flex-shrink-0 hover:scale-110 transition-transform"
													title="보험 조건 확인"
												>
													{#if reg.insuranceActive}
														<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">유</span>
													{:else}
														<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-red-100 text-red-600 border border-red-300">✕</span>
													{/if}
												</button>
											{/if}
											<img src="/icons/{reg.grade}.svg" alt={reg.grade} class="h-4 w-4" title="{reg.grade} 등급" />
										</a>
									{:else}
										<div class="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-indigo-700 border border-indigo-200 shadow-sm">
											<span class="font-medium">{reg.name}</span>
											<span class="text-gray-400">({formatDate(reg.createdAt)})</span>
											{#if gradeLimit?.insuranceRequired}
												<button
													onclick={(e) => handleInsuranceIconClick(e, reg)}
													class="flex-shrink-0 hover:scale-110 transition-transform"
													title="보험 조건 확인"
												>
													{#if reg.insuranceActive}
														<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">유</span>
													{:else}
														<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-red-100 text-red-600 border border-red-300">✕</span>
													{/if}
												</button>
											{/if}
											<img src="/icons/{reg.grade}.svg" alt={reg.grade} class="h-4 w-4" title="{reg.grade} 등급" />
										</div>
									{/if}
								{/each}
							</div>
						{:else}
							<!-- 리스트 보기 (2줄 고정 + 스크롤) -->
							<div class="max-h-[56px] overflow-y-auto space-y-0.5">
								{#each allRegistrations as reg}
									{@const gradeLimit = GRADE_LIMITS[reg.grade]}
									{#if userInfo?.canViewSubordinates}
										<a
											href="/dashboard/network?userId={reg.id}"
											class="flex items-center justify-between rounded bg-white px-2 py-1 text-xs text-indigo-700 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
											title="{reg.grade} 등급 - 산하정보 보기"
										>
											<span class="font-medium">{reg.name}</span>
											<div class="flex items-center gap-1.5">
												<span class="text-gray-400">{formatDate(reg.createdAt)}</span>
												{#if gradeLimit?.insuranceRequired}
													<button
														onclick={(e) => handleInsuranceIconClick(e, reg)}
														class="flex-shrink-0 hover:scale-110 transition-transform"
														title="보험 조건 확인"
													>
														{#if reg.insuranceActive}
															<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">유</span>
														{:else}
															<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-red-100 text-red-600 border border-red-300">✕</span>
														{/if}
													</button>
												{/if}
												<img src="/icons/{reg.grade}.svg" alt={reg.grade} class="h-4 w-4" title="{reg.grade} 등급" />
											</div>
										</a>
									{:else}
										<div class="flex items-center justify-between rounded bg-white px-2 py-1 text-xs text-indigo-700 border border-indigo-100">
											<span class="font-medium">{reg.name}</span>
											<div class="flex items-center gap-1.5">
												<span class="text-gray-400">{formatDate(reg.createdAt)}</span>
												{#if gradeLimit?.insuranceRequired}
													<button
														onclick={(e) => handleInsuranceIconClick(e, reg)}
														class="flex-shrink-0 hover:scale-110 transition-transform"
														title="보험 조건 확인"
													>
														{#if reg.insuranceActive}
															<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">유</span>
														{:else}
															<span class="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-red-100 text-red-600 border border-red-300">✕</span>
														{/if}
													</button>
												{/if}
												<img src="/icons/{reg.grade}.svg" alt={reg.grade} class="h-4 w-4" title="{reg.grade} 등급" />
											</div>
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- 지원비 요약 카드 -->
			<div class="rounded-lg border-2 border-emerald-200 bg-gradient-to-br from-green-50 to-emerald-100 p-3 shadow-lg">
				<div class="mb-2">
					<h3 class="text-base font-bold text-emerald-900">💰 지원비 요약</h3>
				</div>
				<table class="w-full">
					<thead>
						<tr class="border-b border-emerald-300">
							<th class="py-1 text-left text-xs font-semibold text-emerald-700">구분</th>
							<th class="py-1 text-right text-xs font-semibold text-emerald-700">총액</th>
							<th class="py-1 text-right text-xs font-semibold text-emerald-700">실수령</th>
						</tr>
					</thead>
					<tbody>
						<tr class="border-b border-emerald-200">
							<td class="py-1.5 text-sm font-semibold text-emerald-700">
								💵 이번주 지급액
								{#if paymentSummary?.thisWeek?.date}
									<span class="ml-1 text-xs text-gray-500">({formatDate(paymentSummary.thisWeek.date)})</span>
								{/if}
							</td>
							<td class="py-1.5 text-right text-base font-bold text-emerald-900">{formatAmount(paymentSummary?.thisWeek?.amount)}</td>
							<td class="py-1.5 text-right text-base font-bold text-blue-600">{formatAmount(paymentSummary?.thisWeek?.net)}</td>
						</tr>
						<tr class="border-b border-emerald-200">
							<td class="py-1.5 text-xs font-semibold text-emerald-700">📈 누적 수령액</td>
							<td class="py-1.5 text-right text-xs text-emerald-700">{formatAmount(paymentSummary?.totalPaid?.amount)}</td>
							<td class="py-1.5 text-right text-xs font-semibold text-green-600">{formatAmount(paymentSummary?.totalPaid?.net)}</td>
						</tr>
						</tbody>
				</table>
			</div>

			<!-- 지원비 수령 내역 테이블 -->
			<div class="overflow-hidden rounded-lg border-2 border-blue-200 bg-white shadow-lg md:col-span-2">
			<!-- 제목 -->
			<div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
				<div class="flex items-center gap-2">
					<img src="/icons/receipt.svg" alt="지원비" class="h-5 w-5" />
					<h3 class="text-base font-bold text-gray-900">지원비 수령 내역</h3>
				</div>
			</div>

			<!-- 검색 필터 -->
			<div class="border-b border-gray-200 bg-white px-4 py-3">
				<div class="flex items-center gap-2">
					<span class="text-xs font-medium text-gray-700">시작</span>
					<input
						type="date"
						bind:value={filters.startDate}
						max={maxDate}
						class="min-w-[140px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
					<span class="text-gray-500">~</span>
					<span class="text-xs font-medium text-gray-700">종료</span>
					<input
						type="date"
						bind:value={filters.endDate}
						max={maxDate}
						class="min-w-[140px] rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>

				<!-- ⭐ 기간 총액 정보 -->
				<div class="mt-3 rounded-md bg-blue-50 p-3">
					<div class="flex items-center justify-between">
						<span class="text-sm font-semibold text-blue-900">선택 기간 총액:</span>
						<div class="flex gap-6">
							<div class="text-right">
								<div class="text-xs text-blue-700">수령총액</div>
								<div class="text-base font-bold text-blue-900">{formatAmount(periodSummary.totalAmount)}</div>
							</div>
							<div class="text-right">
								<div class="text-xs text-blue-700">세금</div>
								<div class="text-sm font-medium text-blue-900">{formatAmount(periodSummary.totalTax)}</div>
							</div>
							<div class="text-right">
								<div class="text-xs text-blue-700">실수령액</div>
								<div class="text-base font-bold text-blue-600">{formatAmount(periodSummary.totalNet)}</div>
							</div>
						</div>
					</div>
				</div>

			</div>

			<!-- 총 건수 및 페이지당 보기 갯수 -->
			<div class="flex items-center justify-between bg-white px-4 py-2">
				<div class="text-sm text-gray-600">
					총 <span class="font-semibold text-gray-900">{groupedPayments.length}</span>주차
				</div>
				<div class="flex items-center gap-2">
					<label class="text-xs font-medium text-gray-700">페이지당:</label>
					<select
						bind:value={itemsPerPage}
						class="w-24 rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none"
					>
						{#each itemsPerPageOptions as option}
							<option value={option}>{option}개</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="table-header" rowspan="2">수령일</th>
							<th class="table-header" rowspan="2">이름</th>
							<th class="table-header" rowspan="2">등급</th>
							<th class="table-header" rowspan="2">유/비</th>
							<th class="table-header" rowspan="2">등록/승급일</th>
							<th class="table-header" rowspan="2">가입기한</th>
							<th class="table-header" colspan="4">수령액</th>
							<th class="table-header" rowspan="2">세금</th>
							<th class="table-header bg-emerald-100" rowspan="2">실수령액</th>
						</tr>
						<tr>
							<th class="table-header">영업</th>
							<th class="table-header">홍보</th>
							<th class="table-header">판촉</th>
							<th class="table-header bg-yellow-200">총액</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200 bg-white">
						{#if displayedPayments.length === 0}
							<tr>
								<td colspan="12" class="px-6 py-8 text-center text-sm text-gray-500">
									지급 내역이 없습니다
								</td>
							</tr>
						{:else}
							{#each displayedPayments as weekGroup}
								{@const isPast = new Date(weekGroup.weekDate) < new Date(new Date().setHours(0, 0, 0, 0))}
								{@const subtotalBreakdown = calculateBreakdown(weekGroup.totalAmount)}
								{#each weekGroup.users as user, index}
									{@const breakdown = calculateBreakdown(user.amount)}
									{@const insuranceInfo = getInsuranceInfo(user)}

									<tr class="{isPast ? 'bg-gray-100 hover:bg-gray-200' : 'hover:bg-gray-50'}">
										{#if index === 0}
											<!-- 첫 번째 행만 지급일 표시 (rowspan) - 소계 행 포함 -->
											<td class="table-cell" rowspan={weekGroup.users.length + (weekGroup.users.length >= 2 ? 1 : 0)}>
												{formatDate(weekGroup.weekDate)}
												{#if isPast}
													<span class="ml-1 text-xs font-semibold text-green-600">(완)</span>
												{/if}
											</td>
										{/if}
										<td class="table-cell">{user.userName || '-'}</td>
										<!-- ⭐ 등급: 모든 사용자 표시 (이미 합산됨) -->
										<td class="table-cell">
											<div class="flex flex-wrap items-center justify-center gap-1">
												{#each Object.entries(user.gradeCount || {}).sort((a, b) => b[0].localeCompare(a[0])) as [grade, count]}
													<div class="flex items-center gap-0.5">
														<GradeBadge {grade} size="sm" />
														{#if count > 1}
															<span class="text-xs font-medium text-gray-600">x{count}</span>
														{/if}
													</div>
												{/each}
											</div>
										</td>
										<!-- ⭐ 유/비 컬럼: 등급 뒤 -->
										<td class="table-cell">
											{#if !insuranceInfo.isRequired}
												<span class="text-gray-400">-</span>
											{:else if insuranceInfo.isActive}
												<span class="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold bg-green-100 text-green-700 border border-green-300">유</span>
												<span class="text-xs text-green-600 ml-0.5">{insuranceInfo.ratio}</span>
											{:else}
												<span class="inline-flex items-center justify-center w-5 h-5 rounded text-xs font-bold bg-red-100 text-red-600 border border-red-300">✕</span>
												<span class="text-xs text-red-600 ml-0.5">{insuranceInfo.ratio}</span>
											{/if}
										</td>
										<!-- ⭐ 승급일 -->
										<td class="table-cell text-center text-sm">
											{#if getLastPromotionDate(user)}
												{getLastPromotionDate(user).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '')}
											{:else}
												<span class="text-gray-400">-</span>
											{/if}
										</td>
										<!-- ⭐ 가입기한 -->
										<td class="table-cell text-center text-sm">
											{#if getUserInsuranceDeadline(user)}
												{getUserInsuranceDeadline(user).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '')}
											{:else}
												<span class="text-gray-400">-</span>
											{/if}
										</td>
										<!-- ⭐ 영업/홍보/판촉/총액 -->
										<td class="table-cell text-right">{breakdown.영업.toLocaleString()}원</td>
										<td class="table-cell text-right">{breakdown.홍보.toLocaleString()}원</td>
										<td class="table-cell text-right">{breakdown.판촉.toLocaleString()}원</td>
										<td class="table-cell text-right font-medium bg-yellow-100">{formatAmount(user.amount)}</td>
										<!-- ⭐ 세금, 실수령액 -->
										<td class="table-cell text-right">{formatAmount(user.tax)}</td>
										<td class="table-cell text-right font-medium bg-emerald-100 text-emerald-800">{formatAmount(user.netAmount)}</td>
									</tr>
								{/each}
								<!-- ⭐ 일자별 소계 행 (2개 이상일 때만 표시) -->
								{#if weekGroup.users.length >= 2}
									<tr class="bg-purple-100 font-semibold">
										<td class="table-cell text-center text-purple-800" colspan="5">소계</td>
										<td class="table-cell text-right text-purple-800">{subtotalBreakdown.영업.toLocaleString()}원</td>
										<td class="table-cell text-right text-purple-800">{subtotalBreakdown.홍보.toLocaleString()}원</td>
										<td class="table-cell text-right text-purple-800">{subtotalBreakdown.판촉.toLocaleString()}원</td>
										<td class="table-cell text-right text-purple-900 bg-yellow-200">{formatAmount(weekGroup.totalAmount)}</td>
										<td class="table-cell text-right text-purple-800">{formatAmount(weekGroup.totalTax)}</td>
										<td class="table-cell text-right font-bold bg-emerald-200 text-emerald-900">{formatAmount(weekGroup.totalNet)}</td>
									</tr>
								{/if}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			<!-- 페이지네이션 -->
			{#if totalPages > 1}
				<div class="border-t border-gray-200 bg-gray-50 px-4 py-3">
					<div class="flex items-center justify-center gap-1">
						<button
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage === 1}
							class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							이전
						</button>
						{#each Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
							const startPage = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
							return startPage + i;
						}) as page}
							<button
								onclick={() => goToPage(page)}
								class="rounded-md border px-3 py-1 text-sm font-medium transition-colors {currentPage === page
									? 'border-blue-500 bg-blue-500 text-white'
									: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}"
							>
								{page}
							</button>
						{/each}
						<button
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage === totalPages}
							class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							다음
						</button>
					</div>
				</div>
			{/if}
			</div>
		</div>
		</div>
	</div>
{/if}

<!-- 프로필 모달 -->
<UserProfileModal
	isOpen={isProfileModalOpen}
	onClose={() => (isProfileModalOpen = false)}
/>

<!-- 기간 제한 알림 모달 -->
<WindowsModal
	isOpen={showPeriodLimitAlert}
	title="알림"
	size="xs"
	onClose={() => showPeriodLimitAlert = false}
	showFooter={true}
>
	<div class="text-center py-2">
		<p class="text-sm text-gray-700">현재주 포함 4주까지만 조회할 수 있어요.</p>
	</div>
	<svelte:fragment slot="footer">
		<button
			onclick={() => showPeriodLimitAlert = false}
			class="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
		>
			확인
		</button>
	</svelte:fragment>
</WindowsModal>

<!-- ⭐ 보험 미유지 알림 모달 -->
<WindowsModal
	isOpen={showInsuranceAlert}
	title="⚠️ 보험 유지 필요"
	size="sm"
	onClose={() => showInsuranceAlert = false}
	showFooter={true}
>
	<div class="py-2">
		<div class="mb-3 text-sm text-gray-700">
			<p class="font-semibold text-red-600 mb-2">아래 계좌에서 보험 유지가 필요합니다.</p>
			<p class="text-xs text-gray-500 mb-3">보험 미유지 시 지급이 중단될 수 있습니다.</p>
		</div>
		<div class="space-y-2 max-h-60 overflow-y-auto">
			{#each accountsNeedingInsurance as account}
				{@const gradeLimit = GRADE_LIMITS[account.grade]}
				{@const deadline = getInsuranceDeadline(account)}
				<div class="p-2 bg-red-50 border border-red-200 rounded">
					<div class="flex items-center justify-between mb-1">
						<div class="flex items-center gap-2">
							<img src="/icons/{account.grade}.svg" alt={account.grade} class="h-5 w-5" />
							<span class="text-sm font-medium text-gray-900">{account.name}</span>
						</div>
						<div class="text-xs text-red-600">
							보험 {gradeLimit?.insuranceAmount?.toLocaleString() || 0}원 이상 필요
						</div>
					</div>
					{#if deadline}
						<div class="text-xs text-red-600 text-right">
							가입기한: <span class="font-semibold">{formatDeadlineDate(deadline)}</span> 까지
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
	<svelte:fragment slot="footer">
		<button
			onclick={() => showInsuranceAlert = false}
			class="px-4 py-1.5 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
		>
			확인
		</button>
	</svelte:fragment>
</WindowsModal>

<!-- ⭐ 보험 조건 정보 모달 -->
<WindowsModal
	isOpen={showInsuranceInfoModal}
	title="보험 유지 조건"
	size="sm"
	onClose={() => showInsuranceInfoModal = false}
	showFooter={true}
>
	{#if selectedInsuranceInfo}
		<div class="py-2">
			<div class="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
				<img src="/icons/{selectedInsuranceInfo.grade}.svg" alt={selectedInsuranceInfo.grade} class="h-8 w-8" />
				<div>
					<div class="font-semibold text-gray-900">{selectedInsuranceInfo.name}</div>
					<div class="text-sm text-gray-500">{selectedInsuranceInfo.grade} 등급</div>
				</div>
			</div>
			
			<div class="space-y-3">
				<div class="flex items-center justify-between p-3 border rounded-lg {selectedInsuranceInfo.insuranceActive ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}">
					<span class="text-sm font-medium">보험 유지 상태</span>
					<span class="text-sm font-bold {selectedInsuranceInfo.insuranceActive ? 'text-green-600' : 'text-red-600'}">
						{selectedInsuranceInfo.insuranceActive ? '유지 중 ✓' : '미유지 ✗'}
					</span>
				</div>
				
				<div class="flex items-center justify-between p-3 border border-blue-200 bg-blue-50 rounded-lg">
					<span class="text-sm font-medium">필요 보험료</span>
					<span class="text-sm font-bold text-blue-600">
						월 {selectedInsuranceInfo.insuranceAmount?.toLocaleString() || 0}원 이상
					</span>
				</div>
				
				{#if !selectedInsuranceInfo.insuranceActive}
					<div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
						<p class="text-xs text-yellow-800">
							⚠️ 보험 미유지 시 지급이 중단될 수 있습니다. 담당 설계사에게 문의하세요.
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
	<svelte:fragment slot="footer">
		<button
			onclick={() => showInsuranceInfoModal = false}
			class="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
		>
			확인
		</button>
	</svelte:fragment>
</WindowsModal>

<style>
	@reference "$lib/../app.css";

	.title {
		font-size: 1.25rem;
		font-weight: 700;
		text-align: center;
		margin-bottom: 20px;
		color: #1f2937;
	}

	.table-header {
		@apply border border-gray-300 px-2 py-1.5 text-center text-sm font-bold uppercase tracking-wider text-gray-900;
		min-width: 80px;
	}

	.table-cell {
		@apply whitespace-nowrap border border-gray-300 px-2 py-1.5 text-center text-sm text-gray-900;
		min-width: 80px;
	}

	/* 모바일 반응형 */
	@media (max-width: 480px) {
		.title {
			font-size: 1.125rem;
			margin-bottom: 15px;
		}

		.table-header,
		.table-cell {
			@apply px-2 py-2 text-xs;
		}
	}
</style>
