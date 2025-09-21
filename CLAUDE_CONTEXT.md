# Claude Code 작업 컨텍스트

**최종 업데이트**: 2025년 9월 20일

## 🔄 현재 작업 상태

### 완료된 작업
- ✅ MLM 지급 시스템 핵심 기능 구현
- ✅ 2진 트리 계층 구조 구현
- ✅ 등급 시스템 (F1-F8) 자동 계산
- ✅ 월별 매출 자동 계산
- ✅ 배치 프로세서 구현
- ✅ 엑셀 일괄 등록 기능
- ✅ 한글 loginId 지원
- ✅ 등급별 0명 처리 오류 수정
- ✅ 작업일지 작성 (작업일지_2025_09_20.md)

### 진행 중인 작업
- 용역비지급명부 페이지 완성
- WeeklyPayment 실제 지급 처리
- 트리 구조 시각화 (D3.js)

## 📋 주요 파일 및 모델

### 핵심 모델
- `User.js`: 2진 트리 구조, 한글 loginId
- `MonthlyRevenue.js`: 월별 매출 관리
- `UserPaymentPlan.js`: 개인별 지급 계획
- `WeeklyPayment.js`: 주간 지급 내역

### 핵심 서비스
- `batchProcessor.js`: 자동화 처리 (등급, 매출, 지급계획)
- `gradeCalculation.js`: 등급 계산 로직
- `treeExtractor.js`: 트리 구조 추출

### API 엔드포인트
- `/api/admin/dashboard`: 관리자 대시보드
- `/api/admin/users/bulk`: 엑셀 일괄 등록
- `/api/admin/revenue/calculate`: 매출 계산

## ⚠️ 중요 규칙

### 등급 시스템 (work_plan.txt 기준)
```
F1: 자식이 없거나 하나
F2: 좌우 자식 모두 있음
F3: F2가 2개 && 좌우 각 1개
F4: F3가 2개 && 좌우 각 1개
F5: F4가 2개 && (좌2,우1 또는 좌1,우2)
F6: F5가 2개 && (좌2,우1 또는 좌1,우2)
F7: F6가 2개 && (좌2,우1 또는 좌1,우2)
F8: F7가 2개 && (좌2,우1 또는 좌1,우2)
```

### 지급액 계산 (누적식)
```
F1: (총매출×24%) ÷ (F1+F2인원)
F2: F1지급액 + [(총매출×19%) ÷ (F2+F3인원)]
F3: F2지급액 + [(총매출×14%) ÷ (F3+F4인원)]
...
※ 해당 등급 0명이면 0원 처리
```

### 개발 규칙
1. **패키지 매니저**: pnpm 사용 (npm 절대 금지)
2. **ID 형식**: loginId는 한글 사용
3. **컬렉션 분리**: Admin과 User는 별도 컬렉션
4. **자동 처리**: 용역자 등록 시 모든 계산 자동 실행
5. **참조 방식**: parentId, leftChildId, rightChildId는 loginId로 참조

## 🔧 주요 명령어

```bash
# 서버 실행
pnpm run dev

# 데이터 초기화
node scripts/reset-all-data.js

# 관리자 생성
pnpm run create:admin

# 매출 재계산
node scripts/fix-monthly-revenue.js

# 트리 구조 확인
node scripts/check-tree-structure.js
```

## 📌 테스트 계정
- 관리자: ID `관리자`, PW `1234`

## 🚨 주의사항

### 자주 발생한 문제
1. **매출 0원 표시**: MonthlyRevenue import 누락 확인
2. **등급 계산 오류**: 0명 처리 로직 확인
3. **엑셀 등록 순서**: sequence 필드 확인
4. **트리 구조 깨짐**: 2단계 처리 확인

### Git 작업
- 점검 스크립트는 commit 제외
- 작업 문서는 별도 관리
- 소스 코드만 commit

## 📚 참고 문서
- `work_plan.txt`: 전체 시스템 요구사항
- `총매출_지급_방안.txt`: 지급액 계산 상세
- `작업일지_2025_09_20.md`: 오늘 작업 내역

## 💬 대화 재개 시 확인사항
1. 서버 실행 상태 확인
2. DB 연결 상태 확인
3. 최근 git commit 확인
4. 진행 중인 작업 확인

---
이 파일은 Claude Code 세션 간 컨텍스트를 유지하기 위한 문서입니다.
새 세션 시작 시 이 파일을 참조하여 작업을 이어갈 수 있습니다.