<script>
	import { onMount } from 'svelte';
	import BinaryTreeD3 from '$lib/components/BinaryTreeD3.svelte';

	let selectedUserId = null;
	let rootUsers = [];
	let treeData = null;
	let selectedNode = null;
	let breadcrumbPath = []; // 트리 로드 시 초기화됨
	let breadcrumbPaths = ['']; // 초기 경로는 빈 문자열 (루트)
	let isLoading = true;
	let treeComponent; // BinaryTreeD3 컴포넌트 참조
	let error = null;

	// 루트 사용자 목록 로드
	async function loadRootUsers() {
		try {
			const response = await fetch('/api/users/tree?getRoots=true');
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || '루트 사용자 목록을 불러오는데 실패했습니다.');
			}

			if (data.success && data.roots) {
				rootUsers = data.roots;
				// 첫 번째 루트 사용자 자동 선택
				if (rootUsers.length > 0) {
					selectedUserId = rootUsers[0].id;
				}
			}
		} catch (err) {
			console.error('Error loading root users:', err);
			error = err.message;
		}
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

	// 루트 사용자 변경 시 트리 재로드
	$: if (selectedUserId) {
		loadTreeData(selectedUserId);
	}

	onMount(async () => {
		await loadRootUsers();
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

		console.log('Selected:', node.label, 'Path:', path, 'NamePath:', namePath, 'Breadcrumb:', breadcrumbPath);
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

<div class="container mx-auto px-4 py-6">
	<!-- 헤더 -->
	<div class="mb-6 flex justify-between items-center">
		<div>
			<h2 class="text-2xl font-bold text-gray-800">용역자 산하정보</h2>
			<p class="text-gray-600 mt-1">조직도 및 산하 구조를 확인할 수 있습니다.</p>
		</div>
		{#if rootUsers.length > 0}
			<div class="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow">
				<label class="text-sm font-medium text-gray-700">루트 사용자:</label>
				<select
					bind:value={selectedUserId}
					class="block w-48 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
				>
					{#each rootUsers as root}
						<option value={root.id}>{root.name} ({root.loginId})</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	{#if isLoading}
		<div class="flex justify-center items-center h-96 bg-white rounded-lg shadow">
			<div class="text-gray-500">로딩 중...</div>
		</div>
	{:else if error}
		<div class="flex justify-center items-center h-96 bg-white rounded-lg shadow">
			<div class="text-center">
				<p class="text-red-500 mb-2">{error}</p>
				<button
					onclick={() => loadTreeData()}
					class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					다시 시도
				</button>
			</div>
		</div>
	{:else if treeData}
		<!-- 트리 표시 영역 -->
		<div class="bg-gray-50" style="height: calc(100vh - 280px);">
			<div class="h-full relative">
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
		</div>

		<!-- 하단 계층 경로 표시 -->
		<div class="mt-4 bg-white rounded-lg shadow p-4">
			<div class="flex items-center gap-2 text-sm">
				<span class="font-medium text-gray-700">계층 경로:</span>
				<nav class="flex items-center gap-1" aria-label="Breadcrumb">
					{#each breadcrumbPath as item, index}
						{#if index > 0}
							<svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
							</svg>
						{/if}
						<button
							type="button"
							onclick={() => handleBreadcrumbClick(index)}
							class="px-2 py-1 rounded transition-colors {index === breadcrumbPath.length - 1 ? 'bg-blue-100 text-blue-800 font-medium cursor-default' : 'text-gray-600 hover:bg-gray-100 cursor-pointer'}"
							disabled={index === breadcrumbPath.length - 1}
						>
							{item}
						</button>
					{/each}
				</nav>
			</div>
		</div>
	{/if}
</div>
