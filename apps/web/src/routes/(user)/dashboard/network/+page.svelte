<script>
	import { onMount } from 'svelte';
	import BinaryTreeD3 from '$lib/components/BinaryTreeD3.svelte';

	// 사용자 본인이 최상위 루트
	let treeData = {
		label: '나 (홍길동)',
		level: 'F2',
		isMe: true,
		left: {
			label: '김철수',
			level: 'F1',
			left: {
				label: '박영희',
				left: { label: '이민수' },
				right: { label: '정수연' }
			},
			right: {
				label: '최지훈',
				left: { label: '한미영' },
				right: { label: '오성준' }
			}
		},
		right: {
			label: '이영미',
			level: 'F1',
			left: {
				label: '강민호',
				left: { label: '서현진' },
				right: { label: '백승민' }
			},
			right: {
				label: '조은경',
				left: { label: '임재현' },
				right: { label: '윤서아' }
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
		console.log('Selected:', node.label, 'Path:', path);
	}
</script>

<svelte:head>
	<title>나의 산하정보 - 나눔페이</title>
</svelte:head>

{#if isLoading}
	<div class="flex justify-center items-center h-64">
		<div class="text-gray-500">로딩 중...</div>
	</div>
{:else}
	<div class="h-screen w-full overflow-hidden bg-gray-50">
		<div class="h-full relative">
			<div class="absolute top-4 left-4 z-10 bg-white shadow-md rounded-lg p-3">
				<h3 class="text-lg font-medium text-gray-900">나의 산하정보</h3>
				{#if selectedNode}
					<p class="mt-1 text-sm text-gray-600">선택: {selectedNode.node.label}</p>
				{/if}
			</div>

			<BinaryTreeD3
				data={treeData}
				nodeWidth={100}
				nodeHeight={50}
				levelGapY={80}
				siblingGapX={20}
				maxDepth={6}
				topScale={0.3}
				curveGamma={1.15}
				on:select={handleSelect}
			/>
		</div>
	</div>
{/if}