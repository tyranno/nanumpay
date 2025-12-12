<script>
	import { onMount, onDestroy, tick, createEventDispatcher } from 'svelte';
	import * as d3 from 'd3';
	import panzoom from 'panzoom';

	// === Props ===
	export let data;
	export let nodeWidth = 80;
	export let nodeHeight = 40;
	export let levelGapY = 60;
	export let siblingGapX = 10;
	export let nodeComponent = null;
	export let maxDepth = 8;
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
	let wrapEl, svgEl, gEl, nodeLayerEl, transformContainerEl;

	// === State ===
	const dispatch = createEventDispatcher();
	let panzoomInstance, ro;
	let originalData;
	let currentRoot;
	let currentPath = '';
	let layoutNodes = [];
	let layoutLinks = [];
	let k = 1; // 휠 줌 상태(가로 간격 제어용)
	let containerWidth = 0;  // 혼합 방식: 스크롤바를 위한 컨테이너 크기
	let containerHeight = 0;
	let isLayouting = false; // 레이아웃 계산 중 플래그 (ResizeObserver 루프 방지)
	let isRendered = false; // ⭐ 초기 렌더링 완료 플래그

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

	// ID로 노드 찾기 (BFS)
	function findNodeById(root, targetId) {
		if (!root) return null;

		const queue = [{ node: root, path: '' }];

		while (queue.length > 0) {
			const { node, path } = queue.shift();

			if (node.id === targetId) {
				return { node, path };
			}

			if (node.left) {
				queue.push({ node: node.left, path: path + 'L' });
			}
			if (node.right) {
				queue.push({ node: node.right, path: path + 'R' });
			}
		}

		return null;
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
		isLayouting = true; // 레이아웃 시작

		if (!rootData) {
			layoutNodes = [];
			layoutLinks = [];
			isLayouting = false;
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

		// 임시 좌표 계산
		const tempNodes = nodes.map((d) => ({
			x: xmap(d.x, d.depth),
			y: ymap(d.y),
			data: d.data
		}));

		// 오프셋 없이 절대 좌표로 노드/링크 배치 (panzoom이 transform 처리)
		layoutNodes = tempNodes.map((n) => ({
			x: n.x,
			y: n.y,
			data: n.data
		}));

		layoutLinks = links.map((l) => ({
			source: {
				x: xmap(l.source.x, l.source.depth),
				y: ymap(l.source.y)
			},
			target: {
				x: xmap(l.target.x, l.target.depth),
				y: ymap(l.target.y)
			}
		}));

		// 컨테이너 크기 계산 (절대 좌표 기준 + 충분한 여백)
		if (layoutNodes.length > 0) {
			const minX = Math.min(...layoutNodes.map((n) => n.x - nodeWidth / 2));
			const maxX = Math.max(...layoutNodes.map((n) => n.x + nodeWidth / 2));
			const minY = Math.min(...layoutNodes.map((n) => n.y - nodeHeight / 2));
			const maxY = Math.max(...layoutNodes.map((n) => n.y + nodeHeight / 2));

			// 충분한 여백을 포함한 컨테이너 크기 (panzoom 드래그 범위 확보)
			const extraPadding = 500; // 드래그 여유 공간
			const newWidth = Math.round(maxX - minX + PADDING * 2 + extraPadding * 2);
			const newHeight = Math.round(maxY - minY + PADDING * 2 + extraPadding * 2);

			// DOM 직접 업데이트 (reactive 루프 방지)
			if (transformContainerEl && (containerWidth !== newWidth || containerHeight !== newHeight)) {
				transformContainerEl.style.width = `${newWidth}px`;
				transformContainerEl.style.height = `${newHeight}px`;
				containerWidth = newWidth;
				containerHeight = newHeight;
			}
		}

		isLayouting = false; // 레이아웃 완료
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


	// === 포커싱 (reroot 시 상단 중앙) ===
	function focusCurrentRoot(topPad = focusTopPadding) {
		if (!layoutNodes.length || !panzoomInstance) return;
		const rootNode = layoutNodes.find((n) => n.data.__path === currentPath);
		if (!rootNode) return;
		const viewW = wrapEl.clientWidth;
		const targetScreenX = viewW / 2;
		const targetScreenY = topPad + nodeHeight / 2;
		const tx = targetScreenX - rootNode.x;
		const ty = targetScreenY - rootNode.y;
		panzoomInstance.moveTo(tx, ty);
	}

	// 가운데 정렬(Y) (작을 때만)
	function focusCenterY(padding = PADDING) {
		if (!panzoomInstance) return;
		const bbox = getBBoxFallback();
		if (!bbox) return;
		const viewH = wrapEl.clientHeight;
		const cy = bbox.y + bbox.height / 2;
		const transform = panzoomInstance.getTransform();
		panzoomInstance.moveTo(transform.x, viewH / 2 - cy);
	}
	function focusCenterYIfFits(padding = PADDING, resetX = false) {
		if (!panzoomInstance) return false;
		const bbox = getBBoxFallback();
		if (!bbox) return false;
		const viewW = wrapEl.clientWidth;
		const viewH = wrapEl.clientHeight;
		if (bbox.height + padding * 2 < viewH) {
			const cx = bbox.x + bbox.width / 2;
			const cy = bbox.y + bbox.height / 2;
			const nx = resetX ? viewW / 2 - cx : panzoomInstance.getTransform().x;
			const ny = viewH / 2 - cy;
			panzoomInstance.moveTo(nx, ny);
			return true;
		}
		return false;
	}
	function focusSmart(resetX = false) {
		if (!focusCenterYIfFits(PADDING, resetX)) {
			focusCurrentRoot(focusTopPadding);
		}
	}

	// === 호버 관리 (스타일 변경용) ===
	let hoverPath = '';
	function onEnterNode(path) {
		hoverPath = path;
	}
	function onLeaveNode() {
		hoverPath = '';
	}

	// 날짜 포맷팅 함수
	function formatDate(dateStr) {
		if (!dateStr) return '-';
		const date = new Date(dateStr);
		if (isNaN(date.getTime())) return '-';
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

	// ID로 노드를 찾아서 해당 노드로 포커스
	export function focusOnNodeById(nodeId) {
		if (!originalData) {
			console.warn('[Tree] originalData가 없습니다.');
			return;
		}

		const result = findNodeById(originalData, nodeId);
		if (!result) {
			console.warn('[Tree] ID에 해당하는 노드를 찾을 수 없습니다:', nodeId);
			return;
		}

		// 해당 노드로 reroot
		rerootByPath(result.path);
	}

	// 트리를 이미지로 다운로드 (현재 확대 상태 그대로)
	export async function downloadAsImage(filename = '계층도.png') {
		if (!wrapEl || !svgEl || !nodeLayerEl) {
			console.warn('[Tree] 트리 요소가 없습니다.');
			return;
		}

		try {
			// 1. 현재 transform 상태 가져오기
			const transform = panzoomInstance ? panzoomInstance.getTransform() : { x: 0, y: 0, scale: 1 };

			// 2. BBox 계산 (확대된 전체 트리 영역)
			const bbox = getBBoxFallback();
			if (!bbox) {
				console.warn('[Tree] BBox를 계산할 수 없습니다.');
				return;
			}

			// 3. 캔버스 생성 (여백 포함)
			const padding = 40;
			const canvasWidth = bbox.width + padding * 2;
			const canvasHeight = bbox.height + padding * 2;

			const canvas = document.createElement('canvas');
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;
			const ctx = canvas.getContext('2d');

			// 4. 배경 흰색
			ctx.fillStyle = '#dcfce7';
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);

			// 5. 링크 그리기 (SVG path를 캔버스에 그리기)
			ctx.strokeStyle = '#3b82f6';
			ctx.lineWidth = 2;
			layoutLinks.forEach((l) => {
				const sx = l.source.x - bbox.x + padding;
				const sy = l.source.y + nodeHeight / 2 - bbox.y + padding;
				const tx = l.target.x - bbox.x + padding;
				const ty = l.target.y - nodeHeight / 2 - bbox.y + padding;
				const midY = (sy + ty) / 2;

				ctx.beginPath();
				ctx.moveTo(sx, sy);
				ctx.bezierCurveTo(sx, midY, tx, midY, tx, ty);
				ctx.stroke();
			});

			// 6. 노드 그리기
			ctx.font = '14px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';

			for (const n of layoutNodes) {
				const x = n.x - nodeWidth / 2 - bbox.x + padding;
				const y = n.y - nodeHeight / 2 - bbox.y + padding;

				// 노드 박스
				ctx.fillStyle = '#ffffff';
				ctx.strokeStyle = '#3b82f6';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.roundRect(x, y, nodeWidth, nodeHeight, 10);
				ctx.fill();
				ctx.stroke();

				// 노드 텍스트
				ctx.fillStyle = '#111827';
				ctx.font = 'bold 14px sans-serif';
				ctx.fillText(n.data.label, x + nodeWidth / 2, y + nodeHeight / 2);

				// 등급 아이콘 (텍스트로 표시)
				if (n.data.grade) {
					ctx.font = '10px sans-serif';
					ctx.fillStyle = '#6b7280';
					ctx.fillText(`[${n.data.grade}]`, x + nodeWidth / 2, y + nodeHeight / 2 + 12);
				}
			}

			// 7. 캔버스를 Blob으로 변환 후 다운로드
			canvas.toBlob((blob) => {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				a.click();
				URL.revokeObjectURL(url);
			});
		} catch (err) {
			console.error('[Tree] 이미지 다운로드 실패:', err);
		}
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

		// 🔧 panzoom 초기화: 드래그/팬만 사용 (줌은 완전히 비활성화)
		panzoomInstance = panzoom(transformContainerEl, {
			minZoom: 1,
			maxZoom: 1, // scale 고정 = 드래그만 허용
			smoothScroll: false,
			zoomDoubleClickSpeed: 1,
			beforeWheel: function (e) {
				// 모든 휠 이벤트 차단 (커스텀 처리)
				e.preventDefault();
				return false;
			},
			onTouch: function (e) {
				// 모바일: 노드 위 터치는 비활성화 (클릭 이벤트 허용)
				if (e.target.closest && e.target.closest('.node-box')) {
					return false;
				}
				return true;
			}
		});

		// 🔧 데스크톱 휠: 가로 간격만 조정
		wrapEl.addEventListener('wheel', function (e) {
			e.preventDefault();
			const delta = e.deltaY;
			const zoomSpeed = 0.002;
			const prevK = k;
			k = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, k * (1 - delta * zoomSpeed)));
			if (k !== prevK) {
				computeLayout(currentRoot);
			}
		}, { passive: false });

		// 🔧 모바일 핀치: 가로 간격만 조정 (네이티브 터치 이벤트 사용)
		let initialPinchDistance = null;
		let initialK = 1;

		wrapEl.addEventListener('touchstart', function (e) {
			// 노드 위에서 시작된 터치는 무시 (클릭 이벤트 허용)
			if (e.target.closest && e.target.closest('.node-box')) {
				return;
			}

			if (e.touches.length === 2) {
				// 핀치 시작
				const dx = e.touches[0].clientX - e.touches[1].clientX;
				const dy = e.touches[0].clientY - e.touches[1].clientY;
				initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
				initialK = k;
			}
		}, { passive: true });

		wrapEl.addEventListener('touchmove', function (e) {
			if (e.touches.length === 2 && initialPinchDistance) {
				e.preventDefault();
				// 핀치 진행 중
				const dx = e.touches[0].clientX - e.touches[1].clientX;
				const dy = e.touches[0].clientY - e.touches[1].clientY;
				const currentDistance = Math.sqrt(dx * dx + dy * dy);
				const scale = currentDistance / initialPinchDistance;
				const newK = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, initialK * scale));

				if (newK !== k) {
					k = newK;
					computeLayout(currentRoot);
				}
			}
		}, { passive: false });

		wrapEl.addEventListener('touchend', function (e) {
			if (e.touches.length < 2) {
				initialPinchDistance = null;
			}
		}, { passive: true });

		wrapEl.style.cursor = 'grab';

		// 초기 포커스
		focusCurrentRoot(0);
		await raf();
		focusSmart();

		// 기준 배율(상대 스프레드 기준)
		kFitBase = 1;

		// ⭐ 렌더링 완료 (레이아웃 계산 및 위치 조정 완료)
		isRendered = true;

		// 리사이즈 (레이아웃 계산 중이면 무시하여 루프 방지)
		ro = new ResizeObserver(() => {
			if (isLayouting) return; // 레이아웃 중이면 무시
			computeLayout(currentRoot);
			focusSmart();
		});
		ro.observe(wrapEl);

		const initialEventData = {
			path: '',
			node: originalData,
			namePath: originalData ? [originalData.label] : []
		};
		dispatch('select', initialEventData);
		if (onselect) onselect({ detail: initialEventData });
	});

	onDestroy(() => {
		ro && ro.disconnect();
		panzoomInstance && panzoomInstance.dispose();
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

<div bind:this={wrapEl} class="tree-wrap" class:rendered={isRendered} ondblclick={() => backToFull()}>
	<!-- 툴팁 제거: 노드 아래에 직접 표시 -->
	<!-- SVG와 HTML을 하나의 컨테이너로 묶음 (모바일 pinch-zoom 대응) -->
	<div
		bind:this={transformContainerEl}
		class="transform-container"
	>
		<!-- 링크 -->
		<svg bind:this={svgEl} class="link-svg">
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
		<div bind:this={nodeLayerEl} class="node-layer">
			{#each layoutNodes as n}
				<div
					class="node-box {hoverPath === n.data.__path ? 'hovered' : ''}"
					data-path={n.data.__path}
					style={`left:${n.x - nodeWidth / 2}px; top:${n.y - nodeHeight / 2}px; width:${nodeWidth}px; height:${nodeHeight}px;`}
					role="button"
					tabindex="0"
					onclick={handleClick}
					onkeydown={handleKeydown}
					onmouseenter={() => onEnterNode(n.data.__path)}
					onmouseleave={onLeaveNode}
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
										alt={n.data.grade}
										class="absolute -right-5 -top-1.5 h-5 w-5"
										title="{n.data.grade} 등급"
									/>
								{/if}
							</div>
								<!-- 등록일/승급정보 표시 (hover 시에만) -->
								{#if hoverPath === n.data.__path}
									<div class="node-info-tooltip">
										<div class="info-row">등록: {formatDate(n.data.createdAt)}</div>
										{#if n.data.gradeHistory?.length > 0}
											{#each n.data.gradeHistory.filter(h => h.type === 'promotion') as promo}
												<div class="info-row promo">{promo.fromGrade}→{promo.toGrade} ({formatDate(promo.date)})</div>
											{/each}
										{/if}
									</div>
								{/if}
							{#if n.data.__hasMoreBelow}
								<span class="hint">▼ 아래 단계</span>
							{/if}
							{#if n.data.__path === currentPath && currentRoot?.__hasParentAbove}
								<button
									class="hint-btn"
									onclick={(e) => {
										e.stopPropagation();
										goParent();
									}}
									title="윗 단계 이동"
								>
									▲ 윗 단계
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.tree-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: auto; /* 혼합 방식: 스크롤바 표시 */
		background: #dcfce7;
		cursor: grab;
		touch-action: none;
		/* ⭐ 초기 렌더링 완료 전까지 완전히 숨김 */
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.05s ease-in;
	}
	.tree-wrap.rendered {
		opacity: 1;
		visibility: visible;
	}
	.transform-container {
		position: relative; /* 혼합 방식: 스크롤 가능하도록 relative 사용 */
		min-width: 100%;
		min-height: 100%;
		/* width, height는 JavaScript에서 직접 설정 (reactive 루프 방지) */
	}
	.link-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
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
		pointer-events: none;
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
		overflow: visible; /* 등록일이 노드 밖으로 표시되도록 */
		user-select: none;
		pointer-events: auto; /* panzoom이 beforeMouseDown/onTouch에서 처리 */
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
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.2;
		gap: 2px;
	}
	.hint {
		font-size: 0.6875rem;
		line-height: 1;
		color: #9ca3af;
	}
	.hint-btn {
		font-size: 0.6875rem;
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
	/* 등록일/승급정보 표시 스타일 (노드 밖 아래) */
	.node-info-tooltip {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 4px;
		font-size: 0.65rem;
		color: #374151;
		background: rgba(255, 255, 255, 0.98);
		padding: 4px 8px;
		border-radius: 4px;
		white-space: nowrap;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.node-info-tooltip .info-row {
		line-height: 1.3;
	}
	.node-info-tooltip .info-row.promo {
		color: #2563eb;
		font-weight: 500;
	}
</style>
