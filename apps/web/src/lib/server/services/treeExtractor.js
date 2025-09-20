import User from '../models/User.js';
import { db } from '../db.js';

/**
 * 2진 트리 계층 구조 추출 서비스
 * 계층도 그리기 위한 트리 데이터 추출
 */
export class TreeExtractor {
  /**
   * 전체 트리 구조 추출
   */
  async extractFullTree() {
    await db();

    const users = await User.find().select(
      'name loginId parentId position leftChildId rightChildId grade status balance'
    );

    // loginId로 사용자 매핑
    const userMap = new Map();
    users.forEach(user => {
      userMap.set(user.loginId, {
        id: user.loginId,
        name: user.name,
        grade: user.grade,
        status: user.status,
        balance: user.balance,
        parentId: user.parentId,
        position: user.position,
        leftChildId: user.leftChildId,
        rightChildId: user.rightChildId,
        children: []
      });
    });

    // 트리 구조 생성
    const roots = [];

    userMap.forEach(node => {
      if (!node.parentId) {
        // 루트 노드
        roots.push(node);
      } else {
        // 부모에 자식으로 추가
        const parent = userMap.get(node.parentId);
        if (parent) {
          if (node.position === 'L') {
            parent.leftChild = node;
          } else if (node.position === 'R') {
            parent.rightChild = node;
          }
          parent.children.push(node);
        }
      }
    });

    return {
      roots,
      totalUsers: users.length,
      userMap
    };
  }

  /**
   * 특정 사용자 기준 트리 추출
   * @param {string} loginId - 기준 사용자 loginId
   * @param {number} depth - 추출할 깊이 (기본값: 전체)
   */
  async extractUserTree(loginId, depth = -1) {
    await db();

    const rootUser = await User.findOne({ loginId }).select(
      'name loginId parentId position leftChildId rightChildId grade status balance'
    );

    if (!rootUser) {
      throw new Error(`사용자를 찾을 수 없습니다: ${loginId}`);
    }

    const tree = await this.buildTreeNode(rootUser, depth);
    return tree;
  }

  /**
   * 재귀적으로 트리 노드 구성
   */
  async buildTreeNode(user, remainingDepth) {
    const node = {
      id: user.loginId,
      name: user.name,
      grade: user.grade,
      status: user.status,
      balance: user.balance,
      leftChild: null,
      rightChild: null,
      children: []
    };

    // 깊이 제한 확인
    if (remainingDepth === 0) {
      return node;
    }

    // 왼쪽 자식 추출
    if (user.leftChildId) {
      const leftChild = await User.findOne({ loginId: user.leftChildId });
      if (leftChild) {
        node.leftChild = await this.buildTreeNode(leftChild, remainingDepth - 1);
        node.children.push(node.leftChild);
      }
    }

    // 오른쪽 자식 추출
    if (user.rightChildId) {
      const rightChild = await User.findOne({ loginId: user.rightChildId });
      if (rightChild) {
        node.rightChild = await this.buildTreeNode(rightChild, remainingDepth - 1);
        node.children.push(node.rightChild);
      }
    }

    return node;
  }

  /**
   * 트리 통계 추출
   */
  async getTreeStatistics(loginId = null) {
    await db();

    let query = {};
    if (loginId) {
      // 특정 사용자의 하위 조직 통계
      const descendants = await this.getDescendants(loginId);
      const descendantIds = descendants.map(d => d.loginId);
      query = { loginId: { $in: [loginId, ...descendantIds] } };
    }

    const users = await User.find(query);

    // 통계 계산
    const stats = {
      totalCount: users.length,
      gradeDistribution: {},
      depthDistribution: {},
      completeness: {
        full: 0,      // 좌우 모두 있음
        leftOnly: 0,  // 왼쪽만
        rightOnly: 0, // 오른쪽만
        leaf: 0       // 자식 없음
      }
    };

    // 등급별 분포
    users.forEach(user => {
      const grade = user.grade || 'F1';
      stats.gradeDistribution[grade] = (stats.gradeDistribution[grade] || 0) + 1;

      // 완성도 분석
      if (user.leftChildId && user.rightChildId) {
        stats.completeness.full++;
      } else if (user.leftChildId) {
        stats.completeness.leftOnly++;
      } else if (user.rightChildId) {
        stats.completeness.rightOnly++;
      } else {
        stats.completeness.leaf++;
      }
    });

    return stats;
  }

  /**
   * 하위 모든 조직원 추출
   */
  async getDescendants(loginId) {
    const descendants = [];
    const queue = [loginId];
    const visited = new Set();

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const user = await User.findOne({ loginId: currentId });
      if (!user) continue;

      // 자식들 큐에 추가
      if (user.leftChildId) queue.push(user.leftChildId);
      if (user.rightChildId) queue.push(user.rightChildId);

      // 본인 제외하고 추가
      if (currentId !== loginId) {
        descendants.push({
          loginId: user.loginId,
          name: user.name,
          grade: user.grade,
          position: user.position,
          parentId: user.parentId
        });
      }
    }

    return descendants;
  }

  /**
   * D3.js 형식으로 트리 데이터 변환
   */
  formatForD3(tree) {
    return {
      name: tree.name,
      id: tree.id,
      grade: tree.grade,
      children: [
        tree.leftChild ? { ...this.formatForD3(tree.leftChild), position: 'L' } : null,
        tree.rightChild ? { ...this.formatForD3(tree.rightChild), position: 'R' } : null
      ].filter(Boolean)
    };
  }

  /**
   * 계층 레벨별 사용자 그룹핑
   */
  async getTreeByLevels(loginId = null) {
    const tree = loginId
      ? await this.extractUserTree(loginId)
      : (await this.extractFullTree()).roots[0];

    if (!tree) return [];

    const levels = [];
    const queue = [{ node: tree, level: 0 }];

    while (queue.length > 0) {
      const { node, level } = queue.shift();

      if (!levels[level]) {
        levels[level] = [];
      }

      levels[level].push({
        id: node.id,
        name: node.name,
        grade: node.grade,
        hasLeftChild: !!node.leftChild,
        hasRightChild: !!node.rightChild
      });

      if (node.leftChild) {
        queue.push({ node: node.leftChild, level: level + 1 });
      }
      if (node.rightChild) {
        queue.push({ node: node.rightChild, level: level + 1 });
      }
    }

    return levels;
  }
}

// 싱글톤 인스턴스
export const treeExtractor = new TreeExtractor();