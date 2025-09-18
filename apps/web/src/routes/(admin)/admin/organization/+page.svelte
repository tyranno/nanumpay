<script>
	import { onMount } from 'svelte';
	import BinaryTreeD3 from '$lib/components/BinaryTreeD3.svelte';

	let selectedUser = '홍길동23';
	let treeData = {
		label: '홍길동23',
		level: '▲월단계',
		left: {
			label: '홍길동46',
			left: {
				label: '홍길동92',
				left: { label: '홍길동184' },
				right: { label: '홍길동185' }
			},
			right: {
				label: '홍길동93',
				left: { label: '홍길동186' },
				right: { label: '홍길동187' }
			}
		},
		right: {
			label: '홍길동47',
			left: {
				label: '홍길동94',
				left: { label: '홍길동188' },
				right: { label: '홍길동189' }
			},
			right: {
				label: '홍길동95',
				left: { label: '홍길동190' },
				right: { label: '홍길동191' }
			}
		}
	};

	let selectedNode = null;
	let isLoading = false;

	onMount(() => {
		isLoading = false;
	});

	function handleSelect(event) {
		const { node, path } = event.detail;
		selectedNode = { node, path };
		selectedUser = node.label;
		console.log('Selected:', node.label, 'Path:', path);
	}

	function handleUserChange(event) {
		selectedUser = event.target.value;
		// 실제로는 선택한 사용자의 트리 데이터를 로드
		console.log('User changed to:', selectedUser);
	}
</script>

<svelte:head>
	<title>용역자 산하정보 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="h-screen w-full overflow-hidden bg-gray-50">
		<div class="h-full relative">
			<div class="absolute top-4 left-4 z-10 bg-white shadow-md rounded-lg p-4">
				<h3 class="text-lg font-medium text-gray-900 mb-2">용역자 산하정보</h3>
				<div class="flex items-center gap-2">
					<label class="text-sm font-medium text-gray-700">사용자 선택:</label>
					<select
						bind:value={selectedUser}
						on:change={handleUserChange}
						class="block w-48 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
					>
						<option value="홍길동23">홍길동23</option>
						<option value="홍길동46">홍길동46</option>
						<option value="홍길동47">홍길동47</option>
						<option value="전체">전체 조직도</option>
					</select>
				</div>
				{#if selectedNode}
					<p class="mt-2 text-sm text-gray-600">선택된 노드: {selectedNode.node.label}</p>
				{/if}
			</div>

			<BinaryTreeD3
				data={treeData}
				nodeWidth={100}
				nodeHeight={50}
				levelGapY={80}
				siblingGapX={20}
				maxDepth={7}
				topScale={0.3}
				curveGamma={1.15}
				on:select={handleSelect}
			/>
		</div>
	</div>
{/if}