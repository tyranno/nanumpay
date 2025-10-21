/**
 * 트리 자동 재구성 서비스
 * 엑셀 업로드 후 모든 사용자를 최적의 이진 트리 구조로 재배치
 */

import User from '../models/User.js';

/**
 * 너비 우선 탐색으로 트리 자동 재구성
 * @param {Array} users - 배치할 사용자 리스트
 * @param {Object} options - 옵션
 * @returns {Object} 재구성 결과
 */
export async function restructureTreeBFS(users, options = {}) {
	const results = {
		successful: 0,
		failed: 0,
		errors: [],
		structure: []
	};

	try {
		// 1. 판매인 관계로 그룹화
		const usersBySalesperson = new Map();
		const rootUsers = [];
		const allUsers = new Map();

		// 모든 사용자를 Map에 저장 (빠른 검색을 위해)
		for (const user of users) {
			allUsers.set(user.name, user);
			allUsers.set(user.loginId, user);
		}

		// 판매인별로 그룹화
		for (const user of users) {
			if (!user.salesperson || user.salesperson === '-' || user.salesperson === '') {
				rootUsers.push(user);
			} else {
				if (!usersBySalesperson.has(user.salesperson)) {
					usersBySalesperson.set(user.salesperson, []);
				}
				usersBySalesperson.get(user.salesperson).push(user);
			}
		}

		// 2. BFS 큐 초기화 (루트부터 시작)
		const queue = [];

		// 루트 노드 설정
		if (rootUsers.length > 0) {
			const root = rootUsers[0];
			queue.push({
				user: root,
				level: 0
			});
			results.structure.push({
				name: root.name,
				loginId: root.loginId,
				level: 0,
				parent: null,
				position: null
			});
		}

		// 3. BFS로 트리 구성
		const processedUsers = new Set();
		processedUsers.add(rootUsers[0]?.loginId);

		while (queue.length > 0) {
			const { user: currentUser, level } = queue.shift();

			// 현재 사용자의 하위 사용자들 찾기
			const children = usersBySalesperson.get(currentUser.name) || [];

			// 좌측, 우측 자식 배치
			let leftChild = null;
			let rightChild = null;
			const remainingChildren = [];

			for (const child of children) {
				if (processedUsers.has(child.loginId)) {
					continue; // 이미 처리된 사용자 건너뛰기
				}

				if (!leftChild) {
					leftChild = child;
					processedUsers.add(child.loginId);
				} else if (!rightChild) {
					rightChild = child;
					processedUsers.add(child.loginId);
				} else {
					// 좌우가 모두 찬 경우, 다음 레벨로 미루기
					remainingChildren.push(child);
				}
			}

			// 좌측 자식 업데이트
			if (leftChild) {
				await User.findByIdAndUpdate(leftChild._id, {
					parentId: currentUser.loginId,
					position: 'L'
				});

				await User.findByIdAndUpdate(currentUser._id, {
					leftChildId: leftChild.loginId
				});

				queue.push({
					user: leftChild,
					level: level + 1
				});

				results.structure.push({
					name: leftChild.name,
					loginId: leftChild.loginId,
					level: level + 1,
					parent: currentUser.loginId,
					position: 'L'
				});

				results.successful++;
			}

			// 우측 자식 업데이트
			if (rightChild) {
				await User.findByIdAndUpdate(rightChild._id, {
					parentId: currentUser.loginId,
					position: 'R'
				});

				await User.findByIdAndUpdate(currentUser._id, {
					rightChildId: rightChild.loginId
				});

				queue.push({
					user: rightChild,
					level: level + 1
				});

				results.structure.push({
					name: rightChild.name,
					loginId: rightChild.loginId,
					level: level + 1,
					parent: currentUser.loginId,
					position: 'R'
				});

				results.successful++;
			}

			// 남은 자식들은 다음 가능한 위치 찾기
			if (remainingChildren.length > 0) {
				// 현재 레벨의 다른 노드들 찾기 (빈 자리가 있는지 확인)
				await placeRemainingChildren(remainingChildren, level + 1, processedUsers, queue, results);
			}
		}

		// 4. 배치되지 않은 사용자 처리
		const unplacedUsers = [];
		for (const user of users) {
			if (!processedUsers.has(user.loginId) && user.loginId !== rootUsers[0]?.loginId) {
				unplacedUsers.push(user);
			}
		}

		if (unplacedUsers.length > 0) {
			// 트리의 빈 자리 찾아서 배치
			await placeUnplacedUsers(unplacedUsers, results);
		}

		return results;

	} catch (error) {
		console.error('트리 재구성 오류:', error);
		throw error;
	}
}

/**
 * 남은 자식들을 다음 가능한 위치에 배치
 */
async function placeRemainingChildren(children, targetLevel, processedUsers, queue, results) {
	// 현재 레벨의 모든 노드 찾기
	const nodesAtLevel = await User.find({
		$or: [
			{ leftChildId: { $exists: false } },
			{ leftChildId: null },
			{ rightChildId: { $exists: false } },
			{ rightChildId: null }
		]
	});

	for (const child of children) {
		let placed = false;

		// 빈 자리가 있는 노드 찾기
		for (const node of nodesAtLevel) {
			if (!node.leftChildId) {
				// 좌측 자리가 비어있음
				await User.findByIdAndUpdate(child._id, {
					parentId: node.loginId,
					position: 'L'
				});

				await User.findByIdAndUpdate(node._id, {
					leftChildId: child.loginId
				});

				queue.push({
					user: child,
					level: targetLevel
				});

				results.structure.push({
					name: child.name,
					loginId: child.loginId,
					level: targetLevel,
					parent: node.loginId,
					position: 'L'
				});

				processedUsers.add(child.loginId);
				results.successful++;
				placed = true;
				break;

			} else if (!node.rightChildId) {
				// 우측 자리가 비어있음
				await User.findByIdAndUpdate(child._id, {
					parentId: node.loginId,
					position: 'R'
				});

				await User.findByIdAndUpdate(node._id, {
					rightChildId: child.loginId
				});

				queue.push({
					user: child,
					level: targetLevel
				});

				results.structure.push({
					name: child.name,
					loginId: child.loginId,
					level: targetLevel,
					parent: node.loginId,
					position: 'R'
				});

				processedUsers.add(child.loginId);
				results.successful++;
				placed = true;
				break;
			}
		}

		if (!placed) {
			results.failed++;
			results.errors.push(`${child.name}을(를) 배치할 수 없습니다 - 적절한 위치를 찾을 수 없음`);
		}
	}
}

/**
 * 배치되지 않은 사용자들을 트리의 빈 자리에 배치
 */
async function placeUnplacedUsers(unplacedUsers, results) {
	// 트리의 모든 노드 중 빈 자리가 있는 노드 찾기
	const nodesWithSpace = await User.find({
		$or: [
			{ leftChildId: { $exists: false } },
			{ leftChildId: null },
			{ rightChildId: { $exists: false } },
			{ rightChildId: null }
		],
		type: 'user'
	}).sort({ createdAt: 1 }); // 등록 순서대로

	for (const user of unplacedUsers) {
		let placed = false;

		for (const node of nodesWithSpace) {
			if (!node.leftChildId) {
				await User.findByIdAndUpdate(user._id, {
					parentId: node.loginId,
					position: 'L'
				});

				await User.findByIdAndUpdate(node._id, {
					leftChildId: user.loginId
				});

				results.structure.push({
					name: user.name,
					loginId: user.loginId,
					parent: node.loginId,
					position: 'L',
					note: '자동 배치 (판매인 관계 없음)'
				});

				results.successful++;
				placed = true;
				// 배치 후 해당 노드의 leftChildId 업데이트
				node.leftChildId = user.loginId;
				break;

			} else if (!node.rightChildId) {
				await User.findByIdAndUpdate(user._id, {
					parentId: node.loginId,
					position: 'R'
				});

				await User.findByIdAndUpdate(node._id, {
					rightChildId: user.loginId
				});

				results.structure.push({
					name: user.name,
					loginId: user.loginId,
					parent: node.loginId,
					position: 'R',
					note: '자동 배치 (판매인 관계 없음)'
				});

				results.successful++;
				placed = true;
				// 배치 후 해당 노드의 rightChildId 업데이트
				node.rightChildId = user.loginId;
				break;
			}
		}

		if (!placed) {
			results.failed++;
			results.errors.push(`${user.name}을(를) 배치할 수 없습니다 - 트리가 가득 참`);
		}
	}
}

/**
 * 판매인 기반 스마트 트리 재구성
 * 판매인 관계를 최대한 유지하면서 트리 구조 최적화
 */
export async function smartTreeRestructure(users, options = {}) {
	const results = {
		successful: 0,
		failed: 0,
		errors: [],
		warnings: [],
		structure: []
	};

	try {
		// 1. 기존 트리 구조 분석
		const existingRoot = await User.findOne({ parentId: null, type: 'user' });

		// 2. 판매인 관계 맵 구성
		const salesMap = new Map(); // 판매인 -> [판매된 사용자들]
		const userMap = new Map(); // loginId/name -> user

		for (const user of users) {
			userMap.set(user.loginId, user);
			userMap.set(user.name, user);

			if (user.salesperson && user.salesperson !== '-') {
				if (!salesMap.has(user.salesperson)) {
					salesMap.set(user.salesperson, []);
				}
				salesMap.get(user.salesperson).push(user);
			}
		}

		// 3. 각 판매인의 판매 실적에 따라 우선순위 결정
		const salesPriority = [];
		for (const [salesperson, soldUsers] of salesMap.entries()) {
			salesPriority.push({
				salesperson,
				count: soldUsers.length,
				users: soldUsers
			});
		}

		// 판매 실적이 많은 순으로 정렬
		salesPriority.sort((a, b) => b.count - a.count);

		// 4. 우선순위에 따라 트리에 배치
		for (const { salesperson, users: soldUsers } of salesPriority) {
			// 판매인 찾기
			const seller = await User.findOne({
				$or: [
					{ name: salesperson },
					{ loginId: salesperson }
				]
			});

			if (!seller) {
				results.warnings.push(`판매인 ${salesperson}을(를) 찾을 수 없습니다`);
				continue;
			}

			// 판매인의 직접 하위에 우선 배치
			let leftPlaced = false;
			let rightPlaced = false;

			for (const soldUser of soldUsers) {
				if (!seller.leftChildId && !leftPlaced) {
					// 좌측 자식으로 배치
					await User.findByIdAndUpdate(soldUser._id, {
						parentId: seller._id,
						position: 'L'
					});
					await User.findByIdAndUpdate(seller._id, {
						leftChildId: soldUser._id
					});

					results.structure.push({
						name: soldUser.name,
						parent: seller.loginId,
						position: 'L',
						relationship: 'direct'
					});

					leftPlaced = true;
					results.successful++;

				} else if (!seller.rightChildId && !rightPlaced) {
					// 우측 자식으로 배치
					await User.findByIdAndUpdate(soldUser._id, {
						parentId: seller._id,
						position: 'R'
					});
					await User.findByIdAndUpdate(seller._id, {
						rightChildId: soldUser._id
					});

					results.structure.push({
						name: soldUser.name,
						parent: seller.loginId,
						position: 'R',
						relationship: 'direct'
					});

					rightPlaced = true;
					results.successful++;

				} else {
					// 판매인의 하위 트리에서 가장 가까운 빈 자리 찾기
					const nearestSpot = await findNearestEmptySpot(seller._id);

					if (nearestSpot) {
						await User.findByIdAndUpdate(soldUser._id, {
							parentId: nearestSpot.parentId,
							position: nearestSpot.position
						});

						const updateField = nearestSpot.position === 'L' ? 'leftChildId' : 'rightChildId';
						await User.findByIdAndUpdate(nearestSpot.parent._id, {
							[updateField]: soldUser._id
						});

						results.structure.push({
							name: soldUser.name,
							parent: nearestSpot.parentId,
							position: nearestSpot.position,
							relationship: 'indirect',
							distance: nearestSpot.distance
						});

						results.successful++;
					} else {
						results.warnings.push(`${soldUser.name}을(를) ${salesperson}의 하위 트리에 배치할 수 없습니다`);
					}
				}
			}
		}

		return results;

	} catch (error) {
		console.error('스마트 트리 재구성 오류:', error);
		throw error;
	}
}

/**
 * 특정 노드에서 가장 가까운 빈 자리 찾기 (BFS)
 * @param {ObjectId} startUserId - 시작 노드의 _id
 */
async function findNearestEmptySpot(startUserId) {
	const queue = [{ userId: startUserId, distance: 0 }];
	const visited = new Set();

	while (queue.length > 0) {
		const { userId, distance } = queue.shift();

		const userIdStr = userId.toString();
		if (visited.has(userIdStr)) continue;
		visited.add(userIdStr);

		const node = await User.findById(userId);
		if (!node) continue;

		// 좌측 자리 확인
		if (!node.leftChildId) {
			return {
				parent: node,
				parentId: node._id,
				position: 'L',
				distance: distance + 1
			};
		}

		// 우측 자리 확인
		if (!node.rightChildId) {
			return {
				parent: node,
				parentId: node._id,
				position: 'R',
				distance: distance + 1
			};
		}

		// 하위 노드들을 큐에 추가
		if (node.leftChildId) {
			queue.push({ userId: node.leftChildId, distance: distance + 1 });
		}
		if (node.rightChildId) {
			queue.push({ userId: node.rightChildId, distance: distance + 1 });
		}
	}

	return null; // 빈 자리를 찾지 못함
}

export default {
	restructureTreeBFS,
	smartTreeRestructure
};