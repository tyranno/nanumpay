import User from '../models/User.js';
import TreeSnapshot from '../models/TreeSnapshot.js';
import logger from '../logger.js';

class SnapshotService {
  /**
   * 월별 변경된 사용자 추출 및 스냅샷 생성
   * @param {Array} registeredUserIds - 신규 등록된 사용자 ID 목록
   * @param {Number} year - 년도
   * @param {Number} month - 월
   */
  static async createMonthlySnapshot(registeredUserIds, year, month) {
    try {
      logger.info(`월별 스냅샷 생성 시작: ${year}년 ${month}월`);

      // 1. 현재 전체 트리 구조 가져오기
      const allUsers = await User.find({ type: 'user', status: 'active' })
        .select('_id loginId name grade parentId leftChildId rightChildId createdAt');

      // 2. 신규 등록자 정보
      const newUsers = allUsers.filter(user =>
        registeredUserIds.includes(user._id.toString())
      );

      // 3. 등급이 변경된 사용자 찾기 (이전 스냅샷과 비교)
      const previousSnapshot = await TreeSnapshot.findOne({
        date: { $lt: new Date(year, month - 1, 1) }
      }).sort({ date: -1 });

      const affectedUsers = [];

      if (previousSnapshot) {
        // 이전 스냅샷과 현재 상태 비교
        for (const user of allUsers) {
          const prevNode = previousSnapshot.nodes.find(n => n.userId === user.loginId);

          if (!prevNode && !registeredUserIds.includes(user._id.toString())) {
            continue; // 이전에도 없고 신규도 아님
          }

          if (prevNode && prevNode.grade !== user.grade) {
            // 등급이 변경된 경우
            affectedUsers.push({
              userId: user._id,
              loginId: user.loginId,
              name: user.name,
              previousGrade: prevNode.grade,
              newGrade: user.grade,
              changeType: 'grade_change'
            });
          } else if (registeredUserIds.includes(user._id.toString())) {
            // 신규 등록자
            affectedUsers.push({
              userId: user._id,
              loginId: user.loginId,
              name: user.name,
              previousGrade: null,
              newGrade: user.grade,
              changeType: 'new_registration'
            });
          }
        }
      } else {
        // 첫 스냅샷인 경우 모든 사용자가 신규
        for (const user of newUsers) {
          affectedUsers.push({
            userId: user._id,
            loginId: user.loginId,
            name: user.name,
            previousGrade: null,
            newGrade: user.grade,
            changeType: 'new_registration'
          });
        }
      }

      // 4. 등급별 분포 계산
      const gradeDistribution = {
        F1: 0, F2: 0, F3: 0, F4: 0, F5: 0, F6: 0, F7: 0, F8: 0
      };

      allUsers.forEach(user => {
        if (user.grade) {
          gradeDistribution[user.grade]++;
        }
      });

      // 5. 트리 구조 노드 생성
      const nodes = allUsers.map(user => ({
        userId: user.loginId,
        name: user.name,
        grade: user.grade,
        parentId: user.parentId ?
          allUsers.find(u => u._id.toString() === user.parentId.toString())?.loginId : null,
        leftChildId: user.leftChildId ?
          allUsers.find(u => u._id.toString() === user.leftChildId.toString())?.loginId : null,
        rightChildId: user.rightChildId ?
          allUsers.find(u => u._id.toString() === user.rightChildId.toString())?.loginId : null,
        position: user.parentId ?
          (allUsers.find(u => u._id.toString() === user.parentId.toString())?.leftChildId?.toString() === user._id.toString() ? 'L' : 'R') : null,
        isActive: true
      }));

      // 6. 스냅샷 저장 또는 업데이트
      const snapshotDate = new Date(year, month - 1, 1); // 월의 첫날

      const snapshot = await TreeSnapshot.findOneAndUpdate(
        { date: snapshotDate },
        {
          date: snapshotDate,
          purpose: 'registration',
          nodes,
          statistics: {
            totalUsers: allUsers.length,
            activeUsers: allUsers.length,
            gradeDistribution,
            maxDepth: this.calculateMaxDepth(nodes)
          }
        },
        { upsert: true, new: true }
      );

      logger.info(`월별 스냅샷 생성 완료: ${affectedUsers.length}명 영향받음`);

      return {
        snapshot,
        newUsers: newUsers.map(u => ({
          userId: u._id,
          loginId: u.loginId,
          name: u.name,
          grade: u.grade
        })),
        affectedUsers,
        gradeDistribution
      };
    } catch (error) {
      logger.error('스냅샷 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 트리 최대 깊이 계산
   */
  static calculateMaxDepth(nodes) {
    if (!nodes || nodes.length === 0) return 0;

    const depthMap = {};
    const rootNodes = nodes.filter(n => !n.parentId);

    function calculateDepth(nodeId, depth = 0) {
      if (depthMap[nodeId] !== undefined) return depthMap[nodeId];

      const node = nodes.find(n => n.userId === nodeId);
      if (!node) return depth;

      depthMap[nodeId] = depth;

      if (node.leftChildId) {
        calculateDepth(node.leftChildId, depth + 1);
      }
      if (node.rightChildId) {
        calculateDepth(node.rightChildId, depth + 1);
      }

      return depth;
    }

    rootNodes.forEach(root => calculateDepth(root.userId, 0));

    return Math.max(...Object.values(depthMap), 0);
  }

  /**
   * 특정 월의 변경된 사용자만 가져오기
   */
  static async getMonthlyAffectedUsers(year, month) {
    const snapshotDate = new Date(year, month - 1, 1);
    const nextMonthDate = new Date(year, month, 1);

    // 해당 월에 등록된 사용자
    const newUsers = await User.find({
      type: 'user',
      createdAt: {
        $gte: snapshotDate,
        $lt: nextMonthDate
      }
    }).select('_id loginId name grade');

    // 이전 스냅샷과 비교하여 등급 변경된 사용자 찾기
    const currentSnapshot = await TreeSnapshot.findOne({ date: snapshotDate });
    const previousSnapshot = await TreeSnapshot.findOne({
      date: { $lt: snapshotDate }
    }).sort({ date: -1 });

    const affectedUsers = [...newUsers];

    if (currentSnapshot && previousSnapshot) {
      for (const currentNode of currentSnapshot.nodes) {
        const prevNode = previousSnapshot.nodes.find(n => n.userId === currentNode.userId);
        if (prevNode && prevNode.grade !== currentNode.grade) {
          const user = await User.findOne({ loginId: currentNode.userId })
            .select('_id loginId name grade');
          if (user && !affectedUsers.find(u => u._id.toString() === user._id.toString())) {
            affectedUsers.push(user);
          }
        }
      }
    }

    return affectedUsers;
  }
}

export default SnapshotService;