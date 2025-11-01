<script>
	import { onMount } from 'svelte';

	// 상태
	let activeTab = $state('admin'); // 'admin' | 'password' | 'features' | 'system'
	let isSubmitting = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let isLoading = $state(true);

	// 관리자 정보
	let adminInfo = $state({
		name: '',
		loginId: '',
		email: '',
		phone: '',
		permissions: []
	});

	// 암호 변경
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');

	// 암호 보기 토글
	let showCurrentPassword = $state(false);
	let showNewPassword = $state(false);
	let showConfirmPassword = $state(false);

	// 시스템 설정
	let systemSettings = $state({
		maintenanceMode: false,
		backup: {
			enabled: true,
			frequency: 'daily',
			time: '02:00',
			dayOfWeek: 0,
			dayOfMonth: 1,
			retention: {
				count: 7,
				days: 30,
				compress: true
			},
			storage: {
				type: 'ftp',
				s3: {
					region: 'ap-northeast-2',
					bucket: '',
					accessKeyId: '',
					secretAccessKey: '',
					prefix: 'nanumpay-backup/'
				},
				ftp: {
					host: '',
					port: 21,
					username: '',
					password: '',
					remotePath: '/backup/nanumpay',
					secure: false
				}
			}
		}
	});

	onMount(async () => {
		await loadAdminInfo();
	});

	async function loadAdminInfo() {
		isLoading = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/admin/settings/info');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '관리자 정보를 불러오는데 실패했습니다.');
			}

			if (data.success) {
				adminInfo = data.admin;
				if (data.systemSettings) {
					// 기본값과 병합
					systemSettings = {
						maintenanceMode: data.systemSettings.maintenanceMode ?? false,
						backup: {
							enabled: data.systemSettings.backup?.enabled ?? true,
							frequency: data.systemSettings.backup?.frequency ?? 'daily',
							time: data.systemSettings.backup?.time ?? '02:00',
							dayOfWeek: data.systemSettings.backup?.dayOfWeek ?? 0,
							dayOfMonth: data.systemSettings.backup?.dayOfMonth ?? 1,
							retention: {
								count: data.systemSettings.backup?.retention?.count ?? 7,
								days: data.systemSettings.backup?.retention?.days ?? 30,
								compress: data.systemSettings.backup?.retention?.compress ?? true
							},
							storage: {
								type: data.systemSettings.backup?.storage?.type ?? 'ftp',
								s3: {
									region: data.systemSettings.backup?.storage?.s3?.region ?? 'ap-northeast-2',
									bucket: data.systemSettings.backup?.storage?.s3?.bucket ?? '',
									accessKeyId: data.systemSettings.backup?.storage?.s3?.accessKeyId ?? '',
									secretAccessKey: data.systemSettings.backup?.storage?.s3?.secretAccessKey ?? '',
									prefix: data.systemSettings.backup?.storage?.s3?.prefix ?? 'nanumpay-backup/'
								},
								ftp: {
									host: data.systemSettings.backup?.storage?.ftp?.host ?? '',
									port: data.systemSettings.backup?.storage?.ftp?.port ?? 21,
									username: data.systemSettings.backup?.storage?.ftp?.username ?? '',
									password: data.systemSettings.backup?.storage?.ftp?.password ?? '',
									remotePath: data.systemSettings.backup?.storage?.ftp?.remotePath ?? '/backup/nanumpay',
									secure: data.systemSettings.backup?.storage?.ftp?.secure ?? false
								}
							}
						}
					};
				}
			}
		} catch (err) {
			console.error('❌ Error loading admin info:', err);
			errorMessage = err.message;
		} finally {
			isLoading = false;
		}
	}

	async function handleSaveAdminInfo() {
		errorMessage = '';
		successMessage = '';
		isSubmitting = true;

		try {
			const response = await fetch('/api/admin/settings/info', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					name: adminInfo.name,
					email: adminInfo.email,
					phone: adminInfo.phone
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '저장에 실패했습니다.');
			}

			successMessage = '관리자 정보가 저장되었습니다.';
			setTimeout(() => {
				successMessage = '';
			}, 3000);
		} catch (err) {
			console.error('❌ Error saving admin info:', err);
			errorMessage = err.message;
		} finally {
			isSubmitting = false;
		}
	}

	async function handleChangePassword() {
		errorMessage = '';
		successMessage = '';

		if (!currentPassword || !newPassword || !confirmPassword) {
			errorMessage = '모든 암호 필드를 입력해주세요.';
			return;
		}

		if (newPassword !== confirmPassword) {
			errorMessage = '새 암호와 암호 확인이 일치하지 않습니다.';
			return;
		}

		if (newPassword.length < 10) {
			errorMessage = '암호는 최소 10자 이상이어야 합니다.';
			return;
		}

		// 대문자, 소문자, 숫자, 특수문자 포함 검사
		const hasUpperCase = /[A-Z]/.test(newPassword);
		const hasLowerCase = /[a-z]/.test(newPassword);
		const hasNumber = /[0-9]/.test(newPassword);
		const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

		if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
			errorMessage = '암호는 대문자, 소문자, 숫자, 특수문자를 모두 포함해야 합니다.';
			return;
		}

		isSubmitting = true;

		try {
			const response = await fetch('/api/admin/settings/password', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ currentPassword, newPassword })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '암호 변경에 실패했습니다.');
			}

			successMessage = '암호가 변경되었습니다.';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			setTimeout(() => {
				successMessage = '';
			}, 3000);
		} catch (err) {
			console.error('❌ Error changing password:', err);
			errorMessage = err.message;
		} finally {
			isSubmitting = false;
		}
	}

	async function handleSaveSystemSettings() {
		errorMessage = '';
		successMessage = '';
		isSubmitting = true;

		try {
			const response = await fetch('/api/admin/settings/system', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(systemSettings)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '시스템 설정 저장에 실패했습니다.');
			}

			successMessage = '시스템 설정이 저장되었습니다.';
			setTimeout(() => {
				successMessage = '';
			}, 3000);
		} catch (err) {
			console.error('❌ Error saving system settings:', err);
			errorMessage = err.message;
		} finally {
			isSubmitting = false;
		}
	}

	// 백업 실행 상태
	let isBackupRunning = $state(false);
	let backupMessage = $state('');

	async function handleExecuteBackup() {
		errorMessage = '';
		successMessage = '';
		backupMessage = '';
		isBackupRunning = true;

		try {
			backupMessage = '백업을 실행 중입니다... (최대 5분 소요)';

			const response = await fetch('/api/admin/backup/execute', {
				method: 'POST'
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || '백업 실행에 실패했습니다.');
			}

			if (data.success && data.backupFile) {
				backupMessage = '백업 완료! 다운로드를 시작합니다...';

				// 다운로드 시작
				const downloadUrl = `/api/admin/backup/download?file=${encodeURIComponent(data.backupFile.filename)}`;
				const a = document.createElement('a');
				a.href = downloadUrl;
				a.download = data.backupFile.filename;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);

				successMessage = `백업이 완료되고 다운로드되었습니다: ${data.backupFile.filename}`;
				backupMessage = '';
				setTimeout(() => {
					successMessage = '';
				}, 5000);
			} else {
				throw new Error('백업 파일 정보를 받지 못했습니다.');
			}
		} catch (err) {
			console.error('❌ Error executing backup:', err);
			errorMessage = err.message;
			backupMessage = '';
		} finally {
			isBackupRunning = false;
		}
	}
</script>

<svelte:head>
	<title>관리자 설정 - 나눔페이</title>
</svelte:head>

<div class="w-full px-4 py-6">
	<h1 class="mb-6 text-2xl font-bold text-gray-900">관리자 설정</h1>

	<!-- Tabs -->
	<div class="mb-6 border-b border-gray-200">
		<nav class="-mb-px flex space-x-8">
			<button
				class="tab {activeTab === 'admin' ? 'active' : ''}"
				onclick={() => (activeTab = 'admin')}
			>
				<svg class="tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
				</svg>
				관리자 정보
			</button>
			<button
				class="tab {activeTab === 'password' ? 'active' : ''}"
				onclick={() => (activeTab = 'password')}
			>
				<svg class="tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
				</svg>
				암호 변경
			</button>
			<button
				class="tab {activeTab === 'system' ? 'active' : ''}"
				onclick={() => (activeTab = 'system')}
			>
				<svg class="tab-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
				</svg>
				시스템 설정
			</button>
		</nav>
	</div>

	<!-- Alerts -->
	{#if errorMessage}
		<div class="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
			{errorMessage}
		</div>
	{/if}

	{#if successMessage}
		<div class="mb-4 rounded-lg bg-green-50 p-4 text-sm text-green-700 border border-green-200">
			{successMessage}
		</div>
	{/if}

	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div class="text-gray-500">로딩 중...</div>
		</div>
	{:else}
		<!-- Tab Content -->
		<div class="rounded-lg bg-white p-6 shadow">
			{#if activeTab === 'admin'}
				<!-- 관리자 정보 탭 -->
				<form onsubmit={(e) => { e.preventDefault(); handleSaveAdminInfo(); }}>
					<div class="space-y-4">
						<div>
							<label class="label">이름 <span class="text-red-600">*</span></label>
							<input
								type="text"
								bind:value={adminInfo.name}
								placeholder="관리자 이름"
								required
								class="input"
							/>
						</div>
						<div>
							<label class="label">이메일</label>
							<input
								type="email"
								bind:value={adminInfo.email}
								placeholder="example@email.com"
								class="input"
							/>
						</div>
						<div>
							<label class="label">전화번호</label>
							<input
								type="tel"
								bind:value={adminInfo.phone}
								placeholder="010-0000-0000"
								class="input"
							/>
						</div>
					</div>
					<div class="mt-6 flex justify-end">
						<button type="submit" class="btn-primary" disabled={isSubmitting}>
							{isSubmitting ? '저장 중...' : '저장'}
						</button>
					</div>
				</form>
			{:else if activeTab === 'password'}
				<!-- 암호 변경 탭 -->
				<form onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }}>
					<div class="space-y-4">
						<div>
							<label class="label">아이디 <span class="text-red-600">*</span></label>
							<input
								type="text"
								bind:value={adminInfo.loginId}
								placeholder="로그인 아이디"
								required
								autocomplete="username"
								class="input"
							/>
						</div>
						<div>
							<label class="label">현재 암호 <span class="text-red-600">*</span></label>
							<div class="password-field">
								<input
									type={showCurrentPassword ? 'text' : 'password'}
									bind:value={currentPassword}
									placeholder="현재 암호"
									required
									autocomplete="current-password"
									class="input"
								/>
								<button
									type="button"
									class="password-toggle"
									onclick={() => (showCurrentPassword = !showCurrentPassword)}
									tabindex="-1"
								>
									{#if showCurrentPassword}
										<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
										</svg>
									{:else}
										<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
										</svg>
									{/if}
								</button>
							</div>
						</div>
						<div>
							<label class="label">새 암호 <span class="text-red-600">*</span></label>
							<div class="password-field">
								<input
									type={showNewPassword ? 'text' : 'password'}
									bind:value={newPassword}
									placeholder="최소 10자, 대소문자+숫자+특수문자"
									required
									minlength="10"
									autocomplete="new-password"
									class="input"
								/>
								<button
									type="button"
									class="password-toggle"
									onclick={() => (showNewPassword = !showNewPassword)}
									tabindex="-1"
								>
									{#if showNewPassword}
										<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
										</svg>
									{:else}
										<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
										</svg>
									{/if}
								</button>
							</div>
						</div>
						<div>
							<label class="label">암호 확인 <span class="text-red-600">*</span></label>
							<div class="password-field">
								<input
									type={showConfirmPassword ? 'text' : 'password'}
									bind:value={confirmPassword}
									placeholder="새 암호 확인"
									required
									minlength="10"
									autocomplete="new-password"
									class="input"
								/>
								<button
									type="button"
									class="password-toggle"
									onclick={() => (showConfirmPassword = !showConfirmPassword)}
									tabindex="-1"
								>
									{#if showConfirmPassword}
										<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
										</svg>
									{:else}
										<svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
										</svg>
									{/if}
								</button>
							</div>
						</div>
					</div>
					<div class="mt-6 flex justify-end">
						<button type="submit" class="btn-primary" disabled={isSubmitting}>
							{isSubmitting ? '변경 중...' : '암호 변경'}
						</button>
					</div>
				</form>
			{:else if activeTab === 'system'}
				<!-- 시스템 설정 탭 -->
				<div class="space-y-4">
					<div>
						<h3 class="mb-3 text-lg font-medium text-gray-900">시스템 설정</h3>
						<div class="space-y-3">
							<div class="flex items-center justify-between rounded-lg border p-3 border-orange-300 bg-orange-50">
								<p class="font-medium text-gray-900">유지보수 모드</p>
								<label class="toggle-switch">
									<input type="checkbox" bind:checked={systemSettings.maintenanceMode} />
									<span class="toggle-slider"></span>
								</label>
							</div>
							<div class="rounded-lg border p-3">
								<div class="flex items-center justify-between mb-3">
									<div class="flex items-center gap-3">
										<p class="font-medium text-gray-900">자동 백업</p>
										<button
											type="button"
											onclick={handleExecuteBackup}
											disabled={isBackupRunning}
											class="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded transition-colors"
										>
											{isBackupRunning ? '백업 중...' : '즉시 백업 및 다운로드'}
										</button>
									</div>
									<label class="toggle-switch">
										<input type="checkbox" bind:checked={systemSettings.backup.enabled} />
										<span class="toggle-slider"></span>
									</label>
								</div>
								
								{#if backupMessage}
									<div class="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
										{backupMessage}
									</div>
								{/if}

								{#if systemSettings.backup.enabled}
									<div class="space-y-2 pl-3 border-l-2 border-blue-200">
										<div class="grid grid-cols-2 gap-2">
											<div>
												<label class="label text-sm">백업 주기</label>
												<select bind:value={systemSettings.backup.frequency} class="input text-sm py-1.5">
													<option value="daily">매일</option>
													<option value="weekly">매주</option>
													<option value="monthly">매월</option>
												</select>
											</div>
											<div>
												<label class="label text-sm">백업 시각</label>
												<input
													type="time"
													bind:value={systemSettings.backup.time}
													class="input text-sm py-1.5"
												/>
											</div>
										</div>

										{#if systemSettings.backup.frequency === 'weekly'}
											<div>
												<label class="label text-sm">백업 요일</label>
												<select bind:value={systemSettings.backup.dayOfWeek} class="input text-sm py-1.5">
													<option value={0}>일요일</option>
													<option value={1}>월요일</option>
													<option value={2}>화요일</option>
													<option value={3}>수요일</option>
													<option value={4}>목요일</option>
													<option value={5}>금요일</option>
													<option value={6}>토요일</option>
												</select>
											</div>
										{/if}

										{#if systemSettings.backup.frequency === 'monthly'}
											<div>
												<label class="label text-sm">백업 일자</label>
												<select bind:value={systemSettings.backup.dayOfMonth} class="input text-sm py-1.5">
													{#each Array(31) as _, i}
														<option value={i + 1}>{i + 1}일</option>
													{/each}
												</select>
											</div>
										{/if}

										<hr class="my-2 border-gray-200" />

										<!-- 보관 정책 -->
										<div>
											<p class="font-medium text-sm text-gray-900 mb-1.5">보관 정책</p>
											<div class="grid grid-cols-2 gap-2">
												<div>
													<label class="label text-sm">최대 개수</label>
													<input
														type="number"
														bind:value={systemSettings.backup.retention.count}
														min="1"
														max="365"
														class="input text-sm py-1.5"
													/>
												</div>
												<div>
													<label class="label text-sm">보관 기간 (일)</label>
													<input
														type="number"
														bind:value={systemSettings.backup.retention.days}
														min="1"
														max="365"
														class="input text-sm py-1.5"
													/>
												</div>
											</div>
											<div class="flex items-center gap-2 mt-2">
												<input
													type="checkbox"
													bind:checked={systemSettings.backup.retention.compress}
													id="compress-backup"
													class="rounded"
												/>
												<label for="compress-backup" class="text-xs text-gray-700">
													압축 사용 (gzip)
												</label>
											</div>
										</div>

										<hr class="my-2 border-gray-200" />

										<!-- 저장소 설정 -->
										<div>
											<label class="label text-sm">저장소 유형</label>
											<select bind:value={systemSettings.backup.storage.type} class="input text-sm py-1.5">
												<option value="ftp">FTP/FTPS</option>
												<option value="s3">AWS S3</option>
											</select>
										</div>

										<!-- AWS S3 설정 -->
										{#if systemSettings.backup.storage.type === 's3'}
											<div class="space-y-2">
												<div class="grid grid-cols-2 gap-2">
													<div>
														<label class="label text-sm">리전</label>
														<select bind:value={systemSettings.backup.storage.s3.region} class="input text-sm py-1.5">
															<option value="ap-northeast-2">서울</option>
															<option value="ap-northeast-1">도쿄</option>
															<option value="us-east-1">버지니아</option>
															<option value="us-west-2">오레곤</option>
														</select>
													</div>
													<div>
														<label class="label text-sm">버킷 이름 <span class="text-red-600">*</span></label>
														<input
															type="text"
															bind:value={systemSettings.backup.storage.s3.bucket}
															placeholder="my-backup-bucket"
															class="input text-sm py-1.5"
														/>
													</div>
												</div>
												<div>
													<label class="label text-sm">Access Key ID <span class="text-red-600">*</span></label>
													<input
														type="text"
														bind:value={systemSettings.backup.storage.s3.accessKeyId}
														placeholder="AKIAIOSFODNN7EXAMPLE"
														class="input text-sm py-1.5"
													/>
												</div>
												<div>
													<label class="label text-sm">Secret Access Key <span class="text-red-600">*</span></label>
													<input
														type="password"
														bind:value={systemSettings.backup.storage.s3.secretAccessKey}
														placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
														class="input text-sm py-1.5"
													/>
												</div>
												<div>
													<label class="label text-sm">경로 접두사</label>
													<input
														type="text"
														bind:value={systemSettings.backup.storage.s3.prefix}
														placeholder="nanumpay-backup/"
														class="input text-sm py-1.5"
													/>
												</div>
											</div>
										{/if}

										<!-- FTP 설정 -->
										{#if systemSettings.backup.storage.type === 'ftp'}
											<div class="space-y-2">
												<div class="grid grid-cols-2 gap-2">
													<div>
														<label class="label text-sm">호스트 <span class="text-red-600">*</span></label>
														<input
															type="text"
															bind:value={systemSettings.backup.storage.ftp.host}
															placeholder="ftp.example.com"
															class="input text-sm py-1.5"
														/>
													</div>
													<div>
														<label class="label text-sm">포트</label>
														<input
															type="number"
															bind:value={systemSettings.backup.storage.ftp.port}
															placeholder="21"
															class="input text-sm py-1.5"
														/>
													</div>
												</div>
												<div class="grid grid-cols-2 gap-2">
													<div>
														<label class="label text-sm">사용자명 <span class="text-red-600">*</span></label>
														<input
															type="text"
															bind:value={systemSettings.backup.storage.ftp.username}
															placeholder="ftpuser"
															class="input text-sm py-1.5"
														/>
													</div>
													<div>
														<label class="label text-sm">암호 <span class="text-red-600">*</span></label>
														<input
															type="password"
															bind:value={systemSettings.backup.storage.ftp.password}
															placeholder="••••••••"
															class="input text-sm py-1.5"
														/>
													</div>
												</div>
												<div>
													<label class="label text-sm">원격 경로</label>
													<input
														type="text"
														bind:value={systemSettings.backup.storage.ftp.remotePath}
														placeholder="/backup/nanumpay"
														class="input text-sm py-1.5"
													/>
												</div>
												<div class="flex items-center gap-2">
													<input
														type="checkbox"
														bind:checked={systemSettings.backup.storage.ftp.secure}
														id="ftp-secure"
														class="rounded"
													/>
													<label for="ftp-secure" class="text-xs text-gray-700">
														보안 연결 사용 (FTPS)
													</label>
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>
					<div class="flex justify-end">
						<button class="btn-primary" onclick={handleSaveSystemSettings} disabled={isSubmitting}>
							{isSubmitting ? '저장 중...' : '설정 저장'}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tab {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		border-bottom: 2px solid transparent;
		font-size: 0.875rem;
		font-weight: 500;
		color: #6b7280;
		transition: all 0.2s;
		background: none;
		border-top: none;
		border-left: none;
		border-right: none;
		cursor: pointer;
	}

	.tab:hover {
		color: #374151;
		border-bottom-color: #d1d5db;
	}

	.tab.active {
		color: #2563eb;
		border-bottom-color: #2563eb;
	}

	.tab-icon {
		width: 1.25rem;
		height: 1.25rem;
	}

	.label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}

	.input,
	.input-disabled {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		transition: all 0.15s;
	}

	.input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.input-disabled {
		background-color: #f9fafb;
		color: #6b7280;
		cursor: not-allowed;
	}

	.password-field {
		position: relative;
		width: 100%;
	}

	.password-field .input {
		padding-right: 2.5rem;
	}

	.password-toggle {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		padding: 0.25rem;
		background: none;
		border: none;
		color: #6b7280;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.password-toggle:hover {
		color: #3b82f6;
	}

	.password-toggle .icon {
		width: 1.25rem;
		height: 1.25rem;
	}

	.btn-primary {
		padding: 0.5rem 1rem;
		background-color: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		background-color: #2563eb;
	}

	.btn-primary:disabled {
		background-color: #9ca3af;
		cursor: not-allowed;
	}

	.badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background-color: #dbeafe;
		color: #1e40af;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.toggle-switch {
		position: relative;
		display: inline-block;
		width: 3rem;
		height: 1.75rem;
	}

	.toggle-switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.toggle-slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: #cbd5e1;
		transition: 0.3s;
		border-radius: 1.75rem;
	}

	.toggle-slider:before {
		position: absolute;
		content: '';
		height: 1.25rem;
		width: 1.25rem;
		left: 0.25rem;
		bottom: 0.25rem;
		background-color: white;
		transition: 0.3s;
		border-radius: 50%;
	}

	input:checked + .toggle-slider {
		background-color: #3b82f6;
	}

	input:checked + .toggle-slider:before {
		transform: translateX(1.25rem);
	}
</style>
