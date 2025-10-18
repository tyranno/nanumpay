<script>
	import { onMount } from 'svelte';
	import BinaryTreeD3 from '$lib/components/BinaryTreeD3.svelte';

	let treeData = null;
	let selectedNode = null;
	let breadcrumbPath = []; // 트리 로드 시 초기화됨
	let breadcrumbPaths = ['']; // 초기 경로는 빈 문자열 (루트)
	let isLoading = true;
	let treeComponent; // BinaryTreeD3 컴포넌트 참조
	let error = null;

	// 노드 검색 관련
	let searchQuery = '';
	let searchResults = [];
	let showSearchResults = false;
	let isSearching = false;

	// 트리 내 노드 검색 (CLIENT-SIDE)
	function searchNodesInTree(query) {
		if (!query || query.trim().length < 2) {
			searchResults = [];
			showSearchResults = false;
			return;
		}

		if (!treeData) {
			searchResults = [];
			showSearchResults = false;
			return;
		}

		isSearching = true;
		const searchTerm = query.trim().toLowerCase();
		const results = [];

		// BFS를 사용하여 트리 순회
		function traverseTree(node) {
			if (!node) return;

			// 노드 이름이 검색어를 포함하는지 확인
			if (node.label && node.label.toLowerCase().includes(searchTerm)) {
				results.push({
					id: node.id,
					name: node.label,
					loginId: node.loginId || '',
					level: node.level,
					grade: node.grade
				});
			}

			// 자식 노드 재귀 검색
			if (node.left) traverseTree(node.left);
			if (node.right) traverseTree(node.right);
		}

		traverseTree(treeData);

		searchResults = results;
		showSearchResults = results.length > 0;
		isSearching = false;
	}

	// 검색어 입력 디바운싱
	let searchTimeout;
	function handleSearchInput() {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			searchNodesInTree(searchQuery);
		}, 300);
	}

	// 검색 결과에서 노드 선택
	function selectSearchResult(user) {
		showSearchResults = false;
		// BinaryTreeD3의 메서드를 사용하여 해당 노드로 이동
		if (treeComponent && user.id) {
			treeComponent.focusOnNodeById(user.id);
		}
		searchQuery = '';
		searchResults = [];
	}

	// 트리 데이터 로드
	async function loadTreeData(userId = null) {
		try {
			isLoading = true;
			error = null;

			const params = new URLSearchParams();
			if (userId) {
				params.append('userId', userId);
			}
			params.append('depth', '7'); // 최대 7단계까지 표시

			const response = await fetch(`/api/users/tree?${params}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || '트리 데이터를 불러오는데 실패했습니다.');
			}

			if (data.success && data.tree) {
				treeData = data.tree;
			} else {
				throw new Error('트리 데이터가 없습니다.');
			}
		} catch (err) {
			console.error('Error loading tree:', err);
			error = err.message;
			treeData = null;
		} finally {
			isLoading = false;
		}
	}

	// 드롭다운 외부 클릭 시 닫기
	function handleClickOutside(event) {
		if (!showSearchResults) return;

		const target = event.target;
		const searchContainer = target.closest('.search-container');
		if (!searchContainer) {
			showSearchResults = false;
		}
	}

	onMount(async () => {
		// 관리자는 루트부터 로드 (userId 없이)
		await loadTreeData();

		// 외부 클릭 이벤트 리스너
		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			if (searchTimeout) clearTimeout(searchTimeout);
		};
	});

	function handleSelect(event) {
		const { node, path, namePath } = event.detail;
		selectedNode = { node, path };

		// ★ 계층 경로 업데이트 (부모 경로 표시)
		breadcrumbPath = namePath || [node.label];

		// 각 breadcrumb 항목의 경로를 저장
		breadcrumbPaths = [];
		for (let i = 0; i < path.length + 1; i++) {
			breadcrumbPaths.push(path.substring(0, i));
		}

		console.log(
			'Selected:',
			node.label,
			'Path:',
			path,
			'NamePath:',
			namePath,
			'Breadcrumb:',
			breadcrumbPath
		);
	}

	function handleBreadcrumbClick(index) {
		if (index < breadcrumbPaths.length && treeComponent) {
			const targetPath = breadcrumbPaths[index];
			treeComponent.rerootByPath(targetPath);
		}
	}
</script>

<svelte:head>
	<title>용역자 산하정보 - 나눔페이</title>
</svelte:head>

<div class="container">
	<!-- 제목 -->
	<h1 class="title">용역자 산하정보</h1>

	<!-- 검색 영역 -->
	<div class="search-section">
		<div class="search-container relative">
			<input
				type="text"
				bind:value={searchQuery}
				oninput={handleSearchInput}
				onfocus={() => {
					if (searchResults.length > 0) showSearchResults = true;
				}}
				placeholder="이름 검색..."
				class="input-search"
			/>
			<button class="btn-search" disabled>
				<img src="/icons/search.svg" alt="검색" class="btn-icon" />
			</button>

			<!-- 검색 결과 드롭다운 -->
			{#if showSearchResults && searchResults.length > 0}
				<div
					class="absolute right-0 top-full z-50 mt-2 max-h-96 w-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl"
				>
					<div class="p-2">
						<div class="border-b px-3 py-2 text-xs text-gray-500">
							{searchResults.length}명의 용역자를 찾았습니다
						</div>
						{#each searchResults as user}
							<button
								type="button"
								onclick={() => selectSearchResult(user)}
								class="group flex w-full items-center justify-between rounded px-3 py-2.5 text-left transition-colors hover:bg-blue-50"
							>
								<div class="flex-1">
									<div class="font-medium text-gray-900 group-hover:text-blue-600">
										{user.name}
									</div>
								</div>
								{#if user.grade}
									<img
										src="/icons/{user.grade}.svg"
										alt={user.grade}
										class="h-6 w-6 flex-shrink-0"
										title="{user.grade} 등급"
									/>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if showSearchResults && searchResults.length === 0 && searchQuery.trim().length >= 2 && !isSearching}
				<div
					class="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
				>
					<div class="text-center text-sm text-gray-500">검색 결과가 없습니다</div>
				</div>
			{/if}

			{#if isSearching}
				<div
					class="absolute right-0 top-full z-50 mt-2 w-96 rounded-lg border border-gray-200 bg-white p-4 shadow-xl"
				>
					<div class="text-center text-sm text-gray-500">검색 중...</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- 트리 영역 -->
	{#if isLoading}
		<div class="flex h-96 items-center justify-center rounded-lg bg-white shadow">
			<div class="text-gray-500">로딩 중...</div>
		</div>
	{:else if error}
		<div class="flex h-96 items-center justify-center rounded-lg bg-white shadow">
			<div class="text-center">
				<p class="mb-2 text-red-500">{error}</p>
				<button
					onclick={() => loadTreeData()}
					class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
				>
					다시 시도
				</button>
			</div>
		</div>
	{:else if treeData}
		<!-- 트리 표시 영역 (전체 화면 높이 - 상단 요소들 - 하단 breadcrumb) -->
		<div class="tree-container">
			<BinaryTreeD3
				bind:this={treeComponent}
				data={treeData}
				nodeWidth={100}
				nodeHeight={50}
				levelGapY={80}
				siblingGapX={20}
				maxDepth={7}
				topScale={0.3}
				curveGamma={1.15}
				onselect={handleSelect}
			/>
		</div>
	{/if}
</div>

<!-- 🔧 브라우저 하단 고정 계층 경로 -->
{#if treeData && breadcrumbPath.length > 0}
	<div class="breadcrumb-fixed">
		<div class="flex items-center gap-2 text-sm">
			<span class="font-medium text-gray-700">계층 경로:</span>
			<nav class="flex flex-wrap items-center gap-1" aria-label="Breadcrumb">
				{#each breadcrumbPath as item, index}
					{#if index > 0}
						<svg
							class="h-4 w-4 flex-shrink-0 text-gray-400"
							fill="currentColor"
							viewBox="0 0 20 20"
						>
							<path
								fill-rule="evenodd"
								d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					{/if}
					<button
						type="button"
						onclick={() => handleBreadcrumbClick(index)}
						class="rounded px-2 py-1 transition-colors {index === breadcrumbPath.length - 1
							? 'cursor-default bg-blue-100 font-medium text-blue-800'
							: 'cursor-pointer text-gray-600 hover:bg-gray-100'}"
						disabled={index === breadcrumbPath.length - 1}
					>
						{item}
					</button>
				{/each}
			</nav>
		</div>
	</div>
{/if}

<style>
	@reference "$lib/../app.css";

	/* 컨테이너 */
	.container {
		padding: 20px;
		max-width: 100%;
		background: white;
	}

	/* 트리 컨테이너 - viewport 기준 동적 높이 */
	.tree-container {
		background: #f9fafb;
		/* 전체 화면 - 상단 패딩(20px) - 제목(~40px) - 검색(~60px) - 하단 패딩(20px) - breadcrumb(80px) */
		height: calc(100vh - 280px);
		overflow: hidden;
		position: relative;
	}

	/* 제목 */
	.title {
		font-size: 20px;
		font-weight: 700;
		text-align: center;
		margin-bottom: 20px;
		color: #1f2937;
	}

	/* 검색 섹션 */
	.search-section {
		margin-bottom: 20px;
	}

	.search-container {
		@apply flex items-center gap-2.5 rounded-md bg-gradient-to-b from-gray-50 to-white p-3 shadow-sm;
	}

	.input-search {
		@apply h-7 min-w-[300px] flex-1 rounded border-2 border-gray-200 bg-white px-1.5 py-1 text-[13px] leading-[1.4] outline-none transition-all hover:border-gray-400 focus:border-blue-500 focus:shadow-[0_0_0_2px_rgba(0,123,255,0.15)];
	}

	.btn-search {
		@apply flex h-7 flex-shrink-0 cursor-pointer items-center justify-center rounded border-none bg-gradient-to-br from-blue-500 to-blue-700 px-2 text-white shadow-[0_1px_4px_rgba(0,123,255,0.3)] transition-all hover:-translate-y-px hover:from-blue-700 hover:to-blue-900 hover:shadow-[0_2px_8px_rgba(0,123,255,0.4)] active:translate-y-0 active:shadow-[0_1px_3px_rgba(0,123,255,0.3)];
	}

	.btn-search:disabled {
		@apply cursor-default opacity-50 hover:translate-y-0 hover:from-blue-500 hover:to-blue-700 hover:shadow-[0_1px_4px_rgba(0,123,255,0.3)];
	}

	.btn-icon {
		@apply h-4 w-4 brightness-0 invert filter;
	}

	/* 브라우저 하단 고정 계층 경로 */
	.breadcrumb-fixed {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: white;
		border-top: 2px solid #e5e7eb;
		padding: 12px 20px;
		box-shadow:
			0 -4px 6px -1px rgba(0, 0, 0, 0.1),
			0 -2px 4px -1px rgba(0, 0, 0, 0.06);
		z-index: 40;
		max-height: 80px;
		overflow-y: auto;
	}

	/* 반응형 - 모바일 */
	@media (max-width: 480px) {
		.container {
			padding: 5px;
		}

		.tree-container {
			/* 모바일: 전체 화면 - 상단(5px) - 제목(~35px) - 검색(~55px) - breadcrumb(70px) */
			height: calc(100vh - 280px);
		}

		.title {
			font-size: 20px;
			margin-bottom: 6px;
		}

		.search-section {
			margin-bottom: 10px;
		}

		.input-search {
			min-width: 200px;
		}

		.breadcrumb-fixed {
			padding: 8px 10px;
			font-size: 12px;
		}
	}
</style>
