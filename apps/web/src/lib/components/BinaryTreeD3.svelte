<script>
	import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
	import * as d3 from 'd3';

	// === Props ===
	export let data;
	export let nodeWidth = 80;
	export let nodeHeight = 40;
	export let levelGapY = 60;
	export let siblingGapX = 10;
	export let nodeComponent = null;
	export let maxDepth = 6;
	export let onselect = null; // 선택 이벤트 콜백

	// 상단 간격 압축(상위 레벨 수평 간격 축소)
	export let topScale = 0.3;
	export let curveGamma = 1.15;

	// 선택 루트를 “상단 중앙”에 둘 때 여백
	export let focusTopPadding = 24; // px

	// === 가로 스프레드 제어 (휠 줌 → 가로 간격만 변화) ===
	// spreadX = clamp(spreadMin, spreadMax, (1 + spreadGain*(k/kFitBase-1))^spreadGamma)
	export let spreadGamma = 1.0; // 지수 감도 (1.0 기본, 0.8~1.3 권장, 크게 벌리고 싶으면 1.2~1.5)
	export let spreadGain = 2.0; // 선형 증폭 (k가 1→2 되면 기본값으로 1 + 2*(2-1) = 3배 기반)
	export let spreadMax = 200; // 가로 간격 최대 배수 (넉넉히)
	export let spreadMin = 0.35; // 가로 간격 최소 배수 (축소 한계)

	// === Refs ===
	let wrapEl, svgEl, gEl, nodeLayerEl;

	// === State ===
	const dispatch = createEventDispatcher();
	let zoomBehavior, ro;
	let originalData;
	let currentRoot;
	let currentPath = '';
	let layoutNodes = [];
	let layoutLinks = [];
	let tx = 0,
		ty = 0; // 화면상 translate
	let k = 1; // 휠 줌 상태(시각적 scale 미사용)

	// d3 transform 추적(드래그 delta 계산용)
	let lastZX = 0,
		lastZY = 0,
		lastZK = 1;

	const PADDING = 24;
	const ZOOM_MIN = 0.25;
	const ZOOM_MAX = 20; // 넉넉히 키워서 spread를 큰 범위로 제어

	// 기준 배율 (초기 = 1)
	let kFitBase = 1;

	const clone = (o) =>
		typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o));
	const raf = () => new Promise((r) => requestAnimationFrame(r));

	// === 경로 주입 / 경로로 노드 찾기 ===
	function annotatePaths(node, path = '') {
		if (!node) return;
		node.__path = path;
		if (node.left) annotatePaths(node.left, path + 'L');
		if (node.right) annotatePaths(node.right, path + 'R');
	}
	function findByPath(root, path = '') {
		let cur = root;
		for (const ch of path) {
			if (!cur) return null;
			cur = ch === 'L' ? cur.left : cur.right;
		}
		return cur || null;
	}

	// 경로 문자열을 노드 레이블 배열로 변환
	function getNodeNamePath(root, path = '') {
		const names = [];
		let cur = root;
		
		// 루트 노드 추가
		if (cur) {
			names.push(cur.label);
		}
		
		// 경로 따라가면서 노드 이름 수집
		for (const ch of path) {
			if (!cur) break;
			cur = ch === 'L' ? cur.left : cur.right;
			if (cur) {
				names.push(cur.label);
			}
		}
		
		return names;
	}

	// === 깊이 제한 (잘린 곳은 플래그 달기) ===
	function limitDepth(node, maxDepth, currentDepth = 1) {
		if (!node) return null;
		if (currentDepth > maxDepth) {
			return { label: node.label, __path: node.__path, __hasMoreBelow: true };
		}
		const copy = { ...node };
		if (node.left) copy.left = limitDepth(node.left, maxDepth, currentDepth + 1);
		if (node.right) copy.right = limitDepth(node.right, maxDepth, currentDepth + 1);
		return copy;
	}

	const toHierarchy = (d) => d3.hierarchy(d, (n) => [n.left, n.right].filter(Boolean));

	// === 가로 간격 스프레드 계산 ===
	function getSpreadX(_k = k) {
		const rel = Math.max(1e-6, _k / Math.max(1e-6, kFitBase)); // 상대 배율
		const base = 1 + spreadGain * (rel - 1); // 선형 증폭
		const pow = Math.pow(Math.max(1e-6, base), spreadGamma); // 지수 감도 적용
		return Math.min(spreadMax, Math.max(spreadMin, pow)); // 클램프
	}

	// === 레이아웃 계산 (X만 spread, Y는 고정) ===
	function computeLayout(rootData) {
		if (!rootData) {
			layoutNodes = [];
			layoutLinks = [];
			return;
		}

		rootData.__hasParentAbove = currentPath !== '';

		const limited = limitDepth(rootData, maxDepth);
		const tree = d3
			.tree()
			.nodeSize([siblingGapX + nodeWidth, levelGapY + nodeHeight])
			.separation((a, b) => (a.parent === b.parent ? 0.9 : 1.0));

		const tr = tree(toHierarchy(limited));
		const nodes = tr.descendants();
		const links = tr.links();
		if (!nodes.length) {
			layoutNodes = [];
			layoutLinks = [];
			return;
		}

		// 수평 압축 준비
		const minX = Math.min(...nodes.map((d) => d.x - nodeWidth / 2));
		const maxX = Math.max(...nodes.map((d) => d.x + nodeWidth / 2));
		const cx = (minX + maxX) / 2;
		const maxD = d3.max(nodes, (d) => d.depth) ?? 0;

		// 피라미드 스케일
		const depthScale = (depth) => {
			if (maxD === 0) return 1;
			const t = Math.pow(depth / maxD, curveGamma);
			return topScale + (1 - topScale) * t;
		};

		// depthScale 후 예비 좌표
		const preX = (x, depth) => cx + (x - cx) * depthScale(depth);

		// 전역 조임 s (초기 화면 폭 기준, k와 무관)
		const preLefts = nodes.map((d) => preX(d.x, d.depth) - nodeWidth / 2);
		const preRights = nodes.map((d) => preX(d.x, d.depth) + nodeWidth / 2);
		const preWidth = Math.max(...preRights) - Math.min(...preLefts);
		const viewW = wrapEl?.clientWidth ?? 1024;
		const availWorldW = viewW - 2 * PADDING;
		const s = preWidth > 0 ? Math.min(1, availWorldW / preWidth) : 1;

		const spreadX = getSpreadX();

		const xmap = (x, depth) => (cx + (x - cx) * depthScale(depth) * s) * spreadX;
		const ymap = (y) => y; // ★ 세로는 고정

		layoutNodes = nodes.map((d) => ({
			x: xmap(d.x, d.depth),
			y: ymap(d.y),
			data: d.data
		}));
		layoutLinks = links.map((l) => ({
			source: { x: xmap(l.source.x, l.source.depth), y: ymap(l.source.y) },
			target: { x: xmap(l.target.x, l.target.depth), y: ymap(l.target.y) }
		}));
	}

	// === BBox (좌표 기준) ===
	function getBBoxFallback() {
		if (!layoutNodes.length) return null;
		const minX = Math.min(...layoutNodes.map((n) => n.x - nodeWidth / 2));
		const maxX = Math.max(...layoutNodes.map((n) => n.x + nodeWidth / 2));
		const minY = Math.min(...layoutNodes.map((n) => n.y - nodeHeight / 2));
		const maxY = Math.max(...layoutNodes.map((n) => n.y + nodeHeight / 2));
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	}

	// === 화면 적용: scale 미사용 (translate만) ===
	function applyTransforms() {
		if (gEl) gEl.setAttribute('transform', `translate(${tx},${ty})`);
		if (nodeLayerEl) {
			nodeLayerEl.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
			nodeLayerEl.style.transformOrigin = '0 0';
		}
	}

	// === 포커싱 (reroot 시 상단 중앙) ===
	function focusCurrentRoot(topPad = focusTopPadding) {
		if (!layoutNodes.length) return;
		const rootNode = layoutNodes.find((n) => n.data.__path === currentPath);
		if (!rootNode) return;
		const viewW = wrapEl.clientWidth;
		const targetScreenX = viewW / 2;
		const targetScreenY = topPad + nodeHeight / 2;
		tx = targetScreenX - rootNode.x;
		ty = targetScreenY - rootNode.y;
		applyTransforms();
	}

	// 가운데 정렬(Y) (작을 때만)
	function focusCenterY(padding = PADDING) {
		const bbox = getBBoxFallback();
		if (!bbox) return;
		const viewH = wrapEl.clientHeight;
		const cy = bbox.y + bbox.height / 2;
		ty = viewH / 2 - cy;
		applyTransforms();
	}
	function focusCenterYIfFits(padding = PADDING, resetX = false) {
		const bbox = getBBoxFallback();
		if (!bbox) return false;
		const viewW = wrapEl.clientWidth;
		const viewH = wrapEl.clientHeight;
		if (bbox.height + padding * 2 < viewH) {
			const cx = bbox.x + bbox.width / 2;
			const cy = bbox.y + bbox.height / 2;
			const nx = resetX ? viewW / 2 - cx : tx;
			const ny = viewH / 2 - cy;
			tx = nx;
			ty = ny;
			applyTransforms();
			return true;
		}
		return false;
	}
	function focusSmart(resetX = false) {
		if (!focusCenterYIfFits(PADDING, resetX)) {
			focusCurrentRoot(focusTopPadding);
		}
	}

	// === 호버 위치 (scale 없음) ===
	let hoverPath = '';
	let hoverPos = null;
	function onEnterNode(path) {
		hoverPath = path;
	}
	function onLeaveNode() {
		hoverPath = '';
	}
	$: {
		if (!hoverPath) {
			hoverPos = null;
		} else {
			const n = layoutNodes.find((m) => m.data.__path === hoverPath);
			if (n) {
				hoverPos = { x: tx + n.x, y: ty + (n.y - nodeHeight / 2) };
			} else {
				hoverPos = null;
			}
		}
	}

	// === 공개 메서드 ===
	export function rerootByPath(path = '') {
		const sub = findByPath(originalData, path);
		if (!sub) return;
		currentRoot = sub;
		currentPath = path;
		computeLayout(currentRoot);
		Promise.resolve().then(async () => {
			await tick();
			await raf();
			focusSmart(true);
		});
		const namePath = getNodeNamePath(originalData, path);
		const eventData = { path, node: sub, namePath };
		dispatch('select', eventData);
		if (onselect) onselect({ detail: eventData });
	}
	export function backToFull() {
		rerootByPath('');
	}
	export function getCurrentPath() {
		return currentPath;
	}

	// === Lifecycle ===
	onMount(async () => {
		if (!data) {
			console.warn('[Tree] data가 없습니다.');
			return;
		}

		originalData = clone(data);
		annotatePaths(originalData);
		currentRoot = originalData;
		currentPath = '';

		computeLayout(currentRoot);
		await tick();
		await raf();

		zoomBehavior = d3
			.zoom()
			.scaleExtent([ZOOM_MIN, ZOOM_MAX]) // k는 간격 계산에만 사용
			.filter((e) => {
				// 드래그(좌클릭) 허용, 휠/터치 허용
				if (e.type === 'mousedown')
					return e.button === 0 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
				return true;
			})
			.on('start', () => (wrapEl.style.cursor = 'grabbing'))
			.on('end', () => (wrapEl.style.cursor = 'grab'))
			.on('zoom', (e) => {
				const t = e.transform;

				// 1) 드래그(팬): k 변화 없으면 delta로 이동
				const dx = t.x - lastZX;
				const dy = t.y - lastZY;
				if (t.k === lastZK) {
					if (dx || dy) {
						tx += dx;
						ty += dy;
					}
				} else {
					// 2) 휠 줌: 가로 간격만 변경 + 마우스 X 앵커 유지
					const prevSpreadX = getSpreadX(lastZK);
					const nextSpreadX = getSpreadX(t.k);

					// 마우스 X 위치 (없으면 화면 중앙)
					let mx = wrapEl.clientWidth / 2;
					if (e.sourceEvent) {
						const p = d3.pointer(e.sourceEvent, wrapEl);
						mx = p[0];
					}
					// world X (spread 전 좌표)
					const wx = (mx - tx) / Math.max(1e-6, prevSpreadX);
					// 새 spreadX에서 같은 화면점 유지되도록 보정
					tx = mx - nextSpreadX * wx;

					k = t.k;
					computeLayout(currentRoot); // X만 재배치(세로 고정)
				}

				applyTransforms();
				lastZX = t.x;
				lastZY = t.y;
				lastZK = t.k;
			});

		d3.select(wrapEl).call(zoomBehavior);
		wrapEl.style.cursor = 'grab';

		// 초기 포커스
		focusCurrentRoot(0);
		await raf();
		focusSmart();

		// 기준 배율(상대 스프레드 기준)
		kFitBase = 1;

		// 리사이즈
		ro = new ResizeObserver(() => {
			computeLayout(currentRoot);
			focusSmart();
		});
		ro.observe(wrapEl);

		const initialEventData = { path: '', node: originalData, namePath: originalData ? [originalData.label] : [] };
		dispatch('select', initialEventData);
		if (onselect) onselect({ detail: initialEventData });
		applyTransforms();
	});

	onDestroy(() => {
		ro && ro.disconnect();
	});

	// === UI 이벤트 ===
	function handleClick(e) {
		const path = e.currentTarget?.dataset?.path || '';
		rerootByPath(path);
	}
	function handleKeydown(e) {
		if (e.key === 'Enter' || e.key === ' ') {
			const path = e.currentTarget?.dataset?.path || '';
			rerootByPath(path);
		}
	}
	function goParent() {
		if (!currentPath) return;
		const parentPath = currentPath.slice(0, -1);
		rerootByPath(parentPath);
	}
</script>

<div bind:this={wrapEl} class="tree-wrap">
	<!-- 링크 -->
	<svg bind:this={svgEl} class="link-svg" on:dblclick={() => backToFull()}>
		<g bind:this={gEl}>
			{#each layoutLinks as l}
				<path
					class="link"
					d={`M ${l.source.x} ${l.source.y + nodeHeight / 2}
              C ${l.source.x} ${(l.source.y + l.target.y) / 2}
                ${l.target.x} ${(l.source.y + l.target.y) / 2}
                ${l.target.x} ${l.target.y - nodeHeight / 2}`}
				/>
			{/each}
		</g>
	</svg>

	<!-- 노드 -->
	<div bind:this={nodeLayerEl} class="node-layer" style="transform-origin: 0 0;">
		{#each layoutNodes as n}
			<div
				class="node-box {hoverPath === n.data.__path ? 'hovered' : ''}"
				data-path={n.data.__path}
				style={`left:${n.x - nodeWidth / 2}px; top:${n.y - nodeHeight / 2}px; width:${nodeWidth}px; height:${nodeHeight}px; z-index:${hoverPath === n.data.__path ? 10 : 1};`}
				role="button"
				tabindex="0"
				on:click={handleClick}
				on:keydown={handleKeydown}
				on:mouseenter={() => onEnterNode(n.data.__path)}
				on:mouseleave={onLeaveNode}
			>
				{#if nodeComponent}
					<svelte:component this={nodeComponent} node={n.data} />
				{:else}
					<div class="node-default">
						<div class="relative inline-block">
							<strong>{n.data.label}</strong>
							{#if n.data.grade}
								<img
									src="/icons/{n.data.grade}.svg"
									alt="{n.data.grade}"
									class="w-3.5 h-3.5 absolute -top-1 -right-4"
									title="{n.data.grade} 등급"
								/>
							{/if}
						</div>
						{#if n.data.__hasMoreBelow}
							<span class="hint">▼ 아래 단계</span>
						{/if}
						{#if n.data.__path === currentPath && currentRoot?.__hasParentAbove}
							<button class="hint-btn" on:click|stopPropagation={goParent} title="윗 단계 이동">
								▲ 윗 단계
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.tree-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
		background: #fff;
		cursor: grab;
		touch-action: none;
	}
	.link-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		z-index: 0;
		pointer-events: none;
	}
	.link {
		fill: none;
		stroke: #3b82f6;
		stroke-width: 2;
	}
	.node-layer {
		position: absolute;
		inset: 0;
		z-index: 1;
	}
	.node-box {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fff;
		color: #111827;
		border: 2px solid #3b82f6;
		border-radius: 10px;
		box-sizing: border-box;
		overflow: hidden;
		user-select: none;
		transition:
			box-shadow 120ms ease,
			border-color 120ms ease;
	}
	.node-box.hovered {
		/* ★ 호버 시 강조 */
		border-color: #1d4ed8; /* blue-700 */
		box-shadow:
			0 8px 16px rgba(29, 78, 216, 0.25),
			0 0 0 2px rgba(29, 78, 216, 0.15) inset;
	}
	.node-default {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.2;
		gap: 2px;
	}
	.hint {
		font-size: 11px;
		line-height: 1;
		color: #9ca3af;
	}
	.hint-btn {
		font-size: 11px;
		line-height: 1;
		color: #3b82f6;
		text-decoration: underline;
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.hint-btn:hover {
		color: #1d4ed8;
	}
</style>
