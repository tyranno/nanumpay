import mongoose from 'mongoose';

const treeSnapshotSchema = new mongoose.Schema(
  {
    // 스냅샷 시점
    date: {
      type: Date,
      required: true,
      index: true
    },

    // 스냅샷 목적
    purpose: {
      type: String,
      enum: ['registration', 'grade_change', 'payment_reference', 'daily'],
      default: 'registration'
    },

    // 트리 구조 노드 정보
    nodes: [{
      userId: { type: String, required: true },     // loginId
      name: { type: String, required: true },
      grade: { type: String, required: true },      // 해당 시점의 등급

      // 트리 구조
      parentId: String,
      leftChildId: String,
      rightChildId: String,
      position: { type: String, enum: ['L', 'R'] },

      // 서브트리 통계 (등급별 카운트)
      leftSubtree: {
        F1: { type: Number, default: 0 },
        F2: { type: Number, default: 0 },
        F3: { type: Number, default: 0 },
        F4: { type: Number, default: 0 },
        F5: { type: Number, default: 0 },
        F6: { type: Number, default: 0 },
        F7: { type: Number, default: 0 },
        F8: { type: Number, default: 0 }
      },
      rightSubtree: {
        F1: { type: Number, default: 0 },
        F2: { type: Number, default: 0 },
        F3: { type: Number, default: 0 },
        F4: { type: Number, default: 0 },
        F5: { type: Number, default: 0 },
        F6: { type: Number, default: 0 },
        F7: { type: Number, default: 0 },
        F8: { type: Number, default: 0 }
      },

      // 활성 상태 (가입일 기준)
      isActive: { type: Boolean, default: true }
    }],

    // 전체 통계
    statistics: {
      totalUsers: { type: Number, default: 0 },
      activeUsers: { type: Number, default: 0 },
      gradeDistribution: {
        F1: { type: Number, default: 0 },
        F2: { type: Number, default: 0 },
        F3: { type: Number, default: 0 },
        F4: { type: Number, default: 0 },
        F5: { type: Number, default: 0 },
        F6: { type: Number, default: 0 },
        F7: { type: Number, default: 0 },
        F8: { type: Number, default: 0 }
      },
      maxDepth: { type: Number, default: 0 }
    },

    createdAt: { type: Date, default: Date.now }
  },
  {
    timestamps: false
  }
);

// 인덱스
treeSnapshotSchema.index({ date: 1 }, { unique: true });
treeSnapshotSchema.index({ purpose: 1 });
treeSnapshotSchema.index({ 'nodes.userId': 1 });

const TreeSnapshot = mongoose.models.TreeSnapshot || mongoose.model('TreeSnapshot', treeSnapshotSchema);

export default TreeSnapshot;
