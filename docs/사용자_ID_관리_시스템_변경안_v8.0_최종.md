# 사용자 ID 관리 시스템 변경안 (v8.0) - 최종

**버전**: 8.0 (최종)
**작성일**: 2025-10-20
**목적**: ID 기반 계정 관리 및 용역 등록 다중화 (최소 변경)

---

## 📋 목차

1. [변경 배경](#1-변경-배경)
2. [핵심 개념](#2-핵심-개념)
3. [변경 범위](#3-변경-범위)
4. [데이터베이스 구조](#4-데이터베이스-구조)
5. [구현 단계](#5-구현-단계)
6. [예시 시나리오](#6-예시-시나리오)
7. [마이그레이션 계획](#7-마이그레이션-계획)

---

## 1. 변경 배경

### 1.1 기존 엑셀 헤더
```
순번 | 날짜 | 성명 | 연락처 | 주민번호 | 은행 | 계좌번호 | 판매인 | 설계사 | ...
```

### 1.2 신규 엑셀 헤더
```
순번 | 날짜 | ID | 성명 | 연락처 | 주민번호 | 은행 | 계좌번호 | 판매인 | 설계사 | ...
```

**주요 변경사항:**
- ✅ **ID 컬럼 추가**: 사용자가 직접 ID 지정
- ✅ **동일 ID로 여러 용역 계약 가능**
- ✅ **성명 뒤에 숫자로 구분** (홍길동, 홍길동2, 홍길동3)
- ✅ **설계사 계정 자동 생성** (이름으로 로그인, 초기 비밀번호: 전화번호 뒷4자리)
- ✅ **기존 코드 최소 수정** ⭐

---

## 2. 핵심 개념

### 2.1 컬렉션 구조

```
┌─────────────────────────────────────┐
│ Admin (기존 유지)                    │
│ - 관리자 계정                         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ UserAccount (신규)                   │
│ - 용역자 로그인 계정                  │
│ - 개인정보 저장                       │
└─────────────────────────────────────┘
        │
        │ userAccountId (1:N)
        ▼
┌─────────────────────────────────────┐
│ User (기존, 최소 수정)                │
│ - 용역 등록 정보                      │
│ - 트리, 등급, 지급 (변경 없음) ⭐      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ PlannerAccount (신규)                │
│ - 설계사 로그인 계정                  │
│ - 자동 생성                          │
└─────────────────────────────────────┘
```

### 2.2 용어 정리

| 용어 | 설명 | 예시 |
|-----|------|------|
| **ID (엑셀)** | 계정 식별자 | `hong` |
| **UserAccount** | 용역자 로그인 계정 | 1개 |
| **User** | 용역 등록 (기존 구조 유지) | N개 |
| **PlannerAccount** | 설계사 로그인 계정 | 자동 생성 |
| **name** | 트리 표시명 (숫자 추가) | `홍길동`, `홍길동2` |

### 2.3 핵심 원칙

1. **기존 User 구조 100% 유지** - 트리, 등급, 지급 로직 변경 없음 ⭐
2. **컬렉션 분리** - Admin, UserAccount, PlannerAccount
3. **name 자동 생성** - 재등록 시 숫자 추가
4. **최소 수정** - User에 필드 2개만 추가

---

## 3. 변경 범위

### 3.1 변경 없음 (기존 유지) ⭐

| 항목 | 상태 |
|-----|------|
| **User 트리 구조** | ✅ 변경 없음 (parentId, position, left/right) |
| **등급 계산 로직** | ✅ 변경 없음 (gradeCalculation.js) |
| **지급 계획 생성** | ✅ 변경 없음 (paymentPlanService.js) |
| **트리 재구성** | ✅ 변경 없음 (treeRestructure.js) |
| **주간 지급 처리** | ✅ 변경 없음 (weeklyPaymentService.js) |
| **등급/지급 처리** | ✅ 변경 없음 (registrationService.js) |

### 3.2 신규 추가

| 항목 | 설명 |
|-----|------|
| **UserAccount 모델** | 용역자 로그인 계정 (신규) |
| **PlannerAccount 모델** | 설계사 로그인 계정 (신규) |
| **userAccountId (User)** | UserAccount 참조 (FK 추가) |
| **plannerAccountId (User)** | PlannerAccount 참조 (FK 추가, 필수) ⭐ |
| **registrationNumber (User)** | 등록 차수 (1, 2, 3...) |

### 3.3 수정 필요 (최소)

| 항목 | 변경 내용 |
|-----|---------|
| **userRegistrationService.js** | UserAccount 생성/조회, PlannerAccount 자동 생성 |
| **엑셀 파싱** | ID 컬럼 읽기 |
| **로그인 API** | 3개 컬렉션 순차 조회 |
| **판매인 검증** | UserAccount.loginId 추가 조회 |

---

## 4. 데이터베이스 구조

### 4.1 Admin 모델 (기존 유지)

```javascript
// apps/web/src/lib/server/models/Admin.js (변경 없음)

const adminSchema = new mongoose.Schema({
  loginId: String,
  passwordHash: String,
  name: String,
  isAdmin: Boolean,
  // ... 기존 필드 유지
});
```

### 4.2 UserAccount 모델 (신규)

**역할**: 용역자 로그인 계정 관리 (개인정보 저장)

```javascript
// apps/web/src/lib/server/models/UserAccount.js

import mongoose from 'mongoose';

const userAccountSchema = new mongoose.Schema({
  // 계정 정보
  loginId: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true
  },

  // 개인 정보 (User에서 이동)
  name: {
    type: String,
    required: true
  },
  phone: String,
  idNumber: String,
  bank: String,
  accountNumber: String,
  email: String,

  // 상태 관리
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

// 비밀번호 검증
userAccountSchema.methods.validatePassword = async function(password) {
  const bcrypt = await import('bcryptjs');
  return await bcrypt.compare(password, this.passwordHash);
};

const UserAccount = mongoose.model('UserAccount', userAccountSchema);
export default UserAccount;
```

### 4.3 PlannerAccount 모델 (신규)

**역할**: 설계사 로그인 계정 관리

```javascript
// apps/web/src/lib/server/models/PlannerAccount.js

import mongoose from 'mongoose';

const plannerAccountSchema = new mongoose.Schema({
  // 계정 정보
  loginId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true
  },

  // 설계사 정보
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },

  // 상태 관리
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
});

// 비밀번호 검증
plannerAccountSchema.methods.validatePassword = async function(password) {
  const bcrypt = await import('bcryptjs');
  return await bcrypt.compare(password, this.passwordHash);
};

const PlannerAccount = mongoose.model('PlannerAccount', plannerAccountSchema);
export default PlannerAccount;
```

### 4.4 User 모델 (최소 수정)

**변경사항:**
- ✅ `userAccountId` 추가 (UserAccount 참조)
- ✅ `registrationNumber` 추가 (등록 차수)
- ✅ `plannerAccountId` 변경 (String → ObjectId, PlannerAccount 참조, 필수) ⭐
- ❌ 개인정보 필드 제거 (UserAccount로 이동)
- ❌ `planner`, `plannerPhone` 제거 (PlannerAccount로 대체)
- ✅ **나머지 전부 그대로** (트리, 등급, 지급) ⭐

```javascript
// apps/web/src/lib/server/models/User.js

const userSchema = new mongoose.Schema({
  // ========== 신규 추가 (3개) ==========
  userAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserAccount',
    required: true,
    index: true
  },
  registrationNumber: {
    type: Number,
    required: true,
    default: 1
  },
  plannerAccountId: {                    // ⭐ 신규 추가
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlannerAccount',
    required: true,                      // ⭐ 필수
    index: true
  },

  // ========== 기존 필드 (그대로) ==========
  name: {
    type: String,
    required: true
  },

  // 트리 구조 (변경 없음)
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  position: {
    type: String,
    enum: ['L', 'R'],
    default: null
  },
  leftChildId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rightChildId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // 등급 (변경 없음)
  grade: {
    type: String,
    enum: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'],
    default: 'F1'
  },

  // 용역 정보
  salesperson: String,
  salespersonPhone: String,
  plannerAccountId: {                    // ⭐ 변경: String → ObjectId
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PlannerAccount',
    required: true,                      // ⭐ 필수
    index: true
  },
  insuranceProduct: String,
  insuranceCompany: String,
  branch: String,

  // 보험 (변경 없음)
  insuranceActive: Boolean,
  insuranceAmount: Number,

  // 지급 (변경 없음)
  balance: Number,
  totalEarnings: Number,

  // 상태 (변경 없음)
  status: String,
  sequence: Number,
  joinedAt: Date,
  createdAt: Date,
  updatedAt: Date

  // ========== 제거/변경된 필드 ==========
  // loginId → UserAccount로 이동
  // passwordHash → UserAccount로 이동
  // phone → UserAccount로 이동
  // idNumber → UserAccount로 이동
  // bank → UserAccount로 이동
  // accountNumber → UserAccount로 이동
  // email → UserAccount로 이동
  // planner (String) → plannerAccountId (ObjectId)로 변경 ⭐
  // plannerPhone → 제거 (PlannerAccount.phone 사용)
});

// 인덱스
userSchema.index({ userAccountId: 1, registrationNumber: 1 });
userSchema.index({ parentId: 1, position: 1 });
userSchema.index({ status: 1, createdAt: -1 });

// 트리 헬퍼 메서드 (기존 그대로)
userSchema.methods.getChildren = async function() { ... };
userSchema.methods.getParent = async function() { ... };
userSchema.methods.findEmptyPosition = async function() { ... };

const User = mongoose.model('User', userSchema);
export default User;
```

### 4.5 관계도

```
Admin (기존)
  - loginId: "관리자"
  - 전체 시스템 관리

UserAccount (신규)
  - loginId: "hong"
  - name: "홍길동"
  - phone, bank, accountNumber...
    │
    │ userAccountId (FK, 1:N)
    ├─ User 1: 홍길동   (registrationNumber: 1)
    │   ├─ parentId, position, left/right
    │   ├─ grade: F2
    │   ├─ planner: "김영희"
    │   └─ WeeklyPaymentPlans
    │
    ├─ User 2: 홍길동2  (registrationNumber: 2)
    │   ├─ parentId, position, left/right
    │   ├─ grade: F1
    │   ├─ planner: "이철수"
    │   └─ WeeklyPaymentPlans
    │
    └─ User 3: 홍길동3  (registrationNumber: 3)
        ├─ parentId, position, left/right
        ├─ grade: F1
        ├─ planner: "김영희"
        └─ WeeklyPaymentPlans

PlannerAccount (신규, 자동 생성)
  - loginId: "김영희"
  - name: "김영희"
  - phone: "010-1234-5678"
  - password: "5678" (전화번호 뒷4자리)
    │
    │ User.planner (문자열 참조, 1:N)
    ├─ User: 홍길동 (담당)
    ├─ User: 홍길동3 (담당)
    └─ ... (기타 담당 용역자)
```

---

## 5. 구현 단계

### 5.1 Phase 1: 모델 생성

**신규 파일:**
```bash
apps/web/src/lib/server/models/UserAccount.js      # 용역자 계정
apps/web/src/lib/server/models/PlannerAccount.js   # 설계사 계정
```

### 5.2 Phase 2: User 모델 수정

**파일**: `apps/web/src/lib/server/models/User.js`

**변경 내용:**
1. `userAccountId` 필드 추가 (UserAccount 참조)
2. `registrationNumber` 필드 추가
3. `plannerAccountId` 필드 추가 (PlannerAccount 참조, 필수) ⭐
4. 개인정보 필드 제거 (UserAccount로 이동)
5. `planner`, `plannerPhone` 제거 (plannerAccountId로 대체)
6. **나머지 그대로** (트리, 등급, 지급) ⭐

### 5.3 Phase 3: 등록 서비스 수정

**파일**: `apps/web/src/lib/server/services/userRegistrationService.js`

**핵심 로직:**

```javascript
async createUsers(users) {
  const results = { created: 0, failed: 0, errors: [], alerts: [] };

  for (let i = 0; i < users.length; i++) {
    const userData = users[i];

    // 1. 엑셀 파싱 (ID 추가)
    const loginId = getValue(userData, ['ID', 'id', '__EMPTY_2']);
    const name = getValue(userData, ['성명', 'name', '__EMPTY_3']);
    const plannerName = getValue(userData, ['설계사', '__EMPTY_10']);
    const plannerPhone = getValue(userData, ['연락처', '__EMPTY_11']);

    if (!loginId) {
      results.errors.push(`행 ${i + 1}: ID가 비어있습니다.`);
      continue;
    }

    // 2. UserAccount 조회 또는 생성
    let userAccount = await UserAccount.findOne({ loginId: loginId.toLowerCase() });
    let isNewAccount = false;

    if (!userAccount) {
      // 신규 UserAccount 생성
      const passwordHash = await bcrypt.hash('1234', 10);
      userAccount = new UserAccount({
        loginId: loginId.toLowerCase(),
        passwordHash,
        name,
        phone: getValue(userData, ['연락처', '__EMPTY_4']),
        idNumber: getValue(userData, ['주민번호', '__EMPTY_5']),
        bank: getValue(userData, ['은행', '__EMPTY_6']),
        accountNumber: getValue(userData, ['계좌번호', '__EMPTY_7']),
        status: 'active'
      });
      await userAccount.save();
      isNewAccount = true;
    }
    // 기존 UserAccount 사용 - 개인정보 갱신하지 않음 ⭐

    // 3. PlannerAccount 생성 또는 조회 (필수) ⭐
    if (!plannerName) {
      results.errors.push(`행 ${i + 1}: 설계사가 비어있습니다.`);
      continue;
    }

    let plannerAccount = await PlannerAccount.findOne({ loginId: plannerName });

    if (!plannerAccount) {
      // 자동 생성
      const last4Digits = plannerPhone.slice(-4);
      const plannerPasswordHash = await bcrypt.hash(last4Digits, 10);

      plannerAccount = new PlannerAccount({
        loginId: plannerName,
        passwordHash: plannerPasswordHash,
        name: plannerName,
        phone: plannerPhone,
        status: 'active'
      });
      await plannerAccount.save();

      results.alerts.push({
        type: 'success',
        message: `✅ 설계사 계정 생성: ${plannerName} (초기 비밀번호: ${last4Digits})`
      });
    }

    // 4. 등록 차수 계산
    const existingUsers = await User.find({ userAccountId: userAccount._id })
      .sort({ registrationNumber: -1 })
      .limit(1);

    const registrationNumber = existingUsers.length > 0
      ? existingUsers[0].registrationNumber + 1
      : 1;

    // 5. 트리 표시용 name 생성
    const displayName = registrationNumber === 1
      ? name
      : `${name}${registrationNumber}`;

    // 6. 중복 등록 알림
    if (!isNewAccount) {
      results.alerts.push({
        type: 'info',
        message: `ℹ️ ID '${loginId}'는 이미 등록된 계정입니다. ${registrationNumber}차 등록(${displayName})이 추가되었습니다.`
      });
    }

    // 7. User 생성 (기존 로직 그대로, 필드 3개 추가)
    const newUser = new User({
      userAccountId: userAccount._id,        // ⭐ 추가
      registrationNumber,                     // ⭐ 추가
      plannerAccountId: plannerAccount._id,   // ⭐ 추가 (FK)
      name: displayName,
      salesperson: getValue(userData, ['판매인', '__EMPTY_8']),
      salespersonPhone: getValue(userData, ['연락처', '__EMPTY_9']),
      insuranceProduct: getValue(userData, ['보험상품명', '__EMPTY_12']),
      insuranceCompany: getValue(userData, ['보험회사', '__EMPTY_13']),
      branch: getValue(userData, ['지사', '__EMPTY_14']),
      joinedAt: new Date(),
      sequence: i + 1
    });

    await newUser.save();

    // 8. 등록 추적 (트리 재구성용)
    this.registeredUsers.set(displayName, {
      user: newUser,
      originalName: name,
      userAccountId: userAccount._id,
      loginId: loginId
    });

    results.created++;
  }

  return results;
}
```

### 5.4 Phase 4: 로그인 API 수정

**파일**: `apps/web/src/routes/api/auth/login/+server.js`

**핵심: 3개 컬렉션 순차 조회**

```javascript
import Admin from '$lib/server/models/Admin.js';
import UserAccount from '$lib/server/models/UserAccount.js';
import PlannerAccount from '$lib/server/models/PlannerAccount.js';
import User from '$lib/server/models/User.js';

export async function POST({ request, cookies }) {
  const { loginId, password } = await request.json();

  // 1. 3개 컬렉션 순차 조회
  let account = await Admin.findOne({ loginId });
  let accountType = 'admin';

  if (!account) {
    account = await UserAccount.findOne({ loginId: loginId.toLowerCase() });
    accountType = 'user';
  }

  if (!account) {
    account = await PlannerAccount.findOne({ loginId });
    accountType = 'planner';
  }

  if (!account) {
    return json({ error: '존재하지 않는 계정입니다.' }, { status: 401 });
  }

  // 2. 비밀번호 검증
  const isValid = await account.validatePassword(password);
  if (!isValid) {
    return json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 401 });
  }

  // 3. 세션 생성
  const sessionId = generateSessionId();
  cookies.set('session', sessionId, {
    path: '/',
    httpOnly: true,
    secure: true,
    maxAge: 60 * 60 * 24 * 7
  });

  // 4. accountType에 따라 응답 분기
  if (accountType === 'admin') {
    return json({
      success: true,
      accountType: 'admin',
      account: {
        loginId: account.loginId,
        name: account.name,
        isAdmin: true
      }
    });
  }

  if (accountType === 'user') {
    // 해당 UserAccount의 User 목록 조회
    const users = await User.find({ userAccountId: account._id })
      .sort({ registrationNumber: 1 });

    // 첫 번째 User를 primary로 설정 (계층도 root)
    const primaryUser = users[0] || null;

    return json({
      success: true,
      accountType: 'user',
      account: {
        loginId: account.loginId,
        name: account.name
      },
      primaryUser: primaryUser ? {
        _id: primaryUser._id,
        name: primaryUser.name,
        grade: primaryUser.grade,
        registrationNumber: primaryUser.registrationNumber
      } : null,
      registrations: users
    });
  }

  if (accountType === 'planner') {
    // 담당 용역자 조회 ⭐ FK 기반
    const clients = await User.find({ plannerAccountId: account._id })
      .populate('userAccountId')
      .populate('plannerAccountId')  // ⭐ 추가
      .sort({ joinedAt: -1 });

    return json({
      success: true,
      accountType: 'planner',
      account: {
        loginId: account.loginId,
        name: account.name
      },
      clients: clients.map(user => ({
        _id: user._id,
        name: user.name,
        accountName: user.userAccountId?.name,
        grade: user.grade,
        insuranceProduct: user.insuranceProduct,
        joinedAt: user.joinedAt,
        registrationNumber: user.registrationNumber
      }))
    });
  }
}
```

### 5.5 Phase 5: 판매인 검증 수정

**파일**: `apps/web/src/lib/server/services/userRegistrationService.js`

```javascript
// 판매인 검증
if (salesperson && salesperson !== '-') {
  const isInExcel = this.excelUserNames.has(salesperson);

  // DB 확인 - UserAccount.loginId 또는 User.name으로 조회
  const existingUserAccount = await UserAccount.findOne({ loginId: salesperson });
  const existingUser = await User.findOne({ name: salesperson });

  if (!isInExcel && !existingUserAccount && !existingUser) {
    return {
      isValid: false,
      error: `판매인 "${salesperson}"이(가) 시스템에 등록되어 있지 않습니다.`
    };
  }
}
```

### 5.6 Phase 6: 트리 재구성 수정

**파일**: `apps/web/src/lib/server/services/treeRestructure.js`

```javascript
// 판매인(부모) 찾기
let parent = null;

// 1) UserAccount.loginId로 조회
const userAccount = await UserAccount.findOne({ loginId: salesperson });
if (userAccount) {
  // 해당 UserAccount의 첫 번째 User를 부모로
  parent = await User.findOne({ userAccountId: userAccount._id })
    .sort({ registrationNumber: 1 })
    .limit(1);
}

// 2) User.name으로 조회 (fallback)
if (!parent) {
  parent = await User.findOne({ name: salesperson });
}
```

### 5.7 Phase 7: 계층도 조회 API

**파일**: `apps/web/src/routes/api/user/tree/+server.js`

```javascript
export async function GET({ locals }) {
  const account = locals.user; // UserAccount

  // 첫 번째 User 조회 (계층도 root)
  const primaryUser = await User.findOne({ userAccountId: account._id })
    .sort({ registrationNumber: 1 });

  if (!primaryUser) {
    return json({ error: '등록된 용역이 없습니다.' }, { status: 404 });
  }

  // primaryUser를 root로 하위 트리 조회 (기존 로직 그대로)
  const tree = await buildTree(primaryUser._id);

  return json({
    root: primaryUser,
    tree: tree
  });
}
```

---

## 6. 예시 시나리오

### 시나리오 1: 홍길동 1차 등록 (7월)

**엑셀:**
```
ID: hong
성명: 홍길동
연락처: 010-1234-5678
은행: KB국민
계좌번호: 123-456-789
판매인: 김철수
설계사: 김영희
설계사 연락처: 010-9999-5678
```

**DB 저장:**

```javascript
// UserAccount (신규 생성)
{
  _id: ObjectId("ua001"),
  loginId: "hong",
  passwordHash: "...",  // 1234
  name: "홍길동",
  phone: "010-1234-5678",
  bank: "KB국민",
  accountNumber: "123-456-789"
}

// PlannerAccount (자동 생성)
{
  _id: ObjectId("pa001"),
  loginId: "김영희",
  passwordHash: "...",  // 5678 (전화번호 뒷4자리)
  name: "김영희",
  phone: "010-9999-5678"
}

// User (신규 생성)
{
  _id: ObjectId("user001"),
  userAccountId: ObjectId("ua001"),
  plannerAccountId: ObjectId("pa001"),  // ⭐ FK
  registrationNumber: 1,
  name: "홍길동",           // 숫자 없음 (1차)
  salesperson: "김철수",
  parentId: ObjectId("user_kim"),
  grade: "F1",
  // ... 트리, 등급, 지급 정보 (기존과 동일)
}
```

**알림:**
```
✅ 용역자 등록: 홍길동
✅ 설계사 계정 생성: 김영희 (초기 비밀번호: 5678)
```

### 시나리오 2: 홍길동 2차 등록 (8월)

**엑셀:**
```
ID: hong              ← 동일!
성명: 홍길동
판매인: 이영희
설계사: 이철수
설계사 연락처: 010-8888-1234
```

**DB 저장:**

```javascript
// UserAccount (기존 사용)
{
  _id: ObjectId("ua001"),
  loginId: "hong",
  // ... 변경 없음 (개인정보 갱신하지 않음)
}

// PlannerAccount (자동 생성)
{
  _id: ObjectId("pa002"),
  loginId: "이철수",
  passwordHash: "...",  // 1234
  name: "이철수",
  phone: "010-8888-1234"
}

// User (신규 추가)
{
  _id: ObjectId("user002"),
  userAccountId: ObjectId("ua001"),       // 동일 UserAccount!
  plannerAccountId: ObjectId("pa002"),    // ⭐ 다른 PlannerAccount
  registrationNumber: 2,                  // ⭐ 증가
  name: "홍길동2",                         // ⭐ 숫자 추가
  salesperson: "이영희",
  parentId: ObjectId("user_lee"),         // 다른 부모
  grade: "F1",                            // 독립 등급
  // ... 독립적인 트리, 지급
}
```

**알림:**
```
ℹ️ ID 'hong'은 이미 등록된 계정입니다. 2차 등록(홍길동2)이 추가되었습니다.
✅ 설계사 계정 생성: 이철수 (초기 비밀번호: 1234)
```

**트리:**
```
김철수
  └─ 홍길동 (F2)

이영희
  └─ 홍길동2 (F1)
```

### 시나리오 3: 로그인

#### 3-1. 용역자 로그인

**로그인:**
```
ID: hong
Password: 1234
```

**응답:**
```json
{
  "accountType": "user",
  "account": {
    "loginId": "hong",
    "name": "홍길동"
  },
  "primaryUser": {
    "_id": "user001",
    "name": "홍길동",
    "grade": "F2",
    "registrationNumber": 1
  },
  "registrations": [
    {
      "_id": "user001",
      "name": "홍길동",
      "grade": "F2",
      "registrationNumber": 1
    },
    {
      "_id": "user002",
      "name": "홍길동2",
      "grade": "F1",
      "registrationNumber": 2
    }
  ]
}
```

**화면:**
```
계층도: 홍길동 (F2) ← primaryUser (root)
  ├─ L: 김영수
  └─ R: 이미영

나의 용역 등록:
  1차: 홍길동 (F2) - 판매인: 김철수
  2차: 홍길동2 (F1) - 판매인: 이영희
```

#### 3-2. 설계사 로그인

**로그인:**
```
ID: 김영희
Password: 5678
```

**응답:**
```json
{
  "accountType": "planner",
  "account": {
    "loginId": "김영희",
    "name": "김영희"
  },
  "clients": [
    {
      "_id": "user001",
      "name": "홍길동",
      "accountName": "홍길동",
      "grade": "F2",
      "insuranceProduct": "삼성화재 종신보험",
      "registrationNumber": 1
    },
    {
      "_id": "user003",
      "name": "홍길동3",
      "accountName": "홍길동",
      "grade": "F1",
      "insuranceProduct": "삼성화재 연금보험",
      "registrationNumber": 3
    }
  ]
}
```

**화면:**
```
설계사 대시보드 - 김영희

담당 용역자: 2명
  1. 홍길동 (F2) - 삼성화재 종신보험
  2. 홍길동3 (F1) - 삼성화재 연금보험
```

#### 3-3. 관리자 로그인

**로그인:**
```
ID: 관리자
Password: admin1234!!
```

**응답:**
```json
{
  "accountType": "admin",
  "account": {
    "loginId": "관리자",
    "name": "관리자",
    "isAdmin": true
  }
}
```

---

## 7. 마이그레이션 계획

### 7.1 마이그레이션 스크립트

```javascript
// apps/web/install/linux/migrate_v8.js

import mongoose from 'mongoose';
import Admin from '../../src/lib/server/models/Admin.js';
import UserAccount from '../../src/lib/server/models/UserAccount.js';
import User from '../../src/lib/server/models/User.js';

async function migrateToV8() {
  await mongoose.connect('mongodb://localhost:27017/nanumpay');

  console.log('🔄 v8.0 마이그레이션 시작...');

  // 1. 기존 User 조회 (Admin이 아닌 것만)
  const oldUsers = await mongoose.connection.db
    .collection('users')
    .find({ type: { $ne: 'admin' } })
    .toArray();

  let createdAccounts = 0;
  let updatedUsers = 0;

  for (const oldUser of oldUsers) {
    try {
      // 2. UserAccount 생성 (User의 개인정보 이동)
      const userAccount = new UserAccount({
        loginId: oldUser.loginId,
        passwordHash: oldUser.passwordHash,
        name: oldUser.name,
        phone: oldUser.phone,
        idNumber: oldUser.idNumber,
        bank: oldUser.bank,
        accountNumber: oldUser.accountNumber,
        email: oldUser.email,
        status: oldUser.status || 'active',
        createdAt: oldUser.createdAt
      });

      await userAccount.save();
      createdAccounts++;

      // 3. User 업데이트
      await User.updateOne(
        { _id: oldUser._id },
        {
          $set: {
            userAccountId: userAccount._id,
            registrationNumber: 1  // 기존은 모두 1차
          },
          $unset: {
            loginId: '',
            passwordHash: '',
            phone: '',
            idNumber: '',
            bank: '',
            accountNumber: '',
            email: '',
            type: ''
          }
        }
      );

      updatedUsers++;

    } catch (error) {
      console.error(`❌ ${oldUser.name}:`, error.message);
    }
  }

  console.log(`✅ UserAccount ${createdAccounts}개 생성`);
  console.log(`✅ User ${updatedUsers}개 업데이트`);

  await mongoose.disconnect();
}

migrateToV8();
```

**실행:**
```bash
# 백업
mongodump --db nanumpay --out /backup/nanumpay_v7

# 마이그레이션
node apps/web/install/linux/migrate_v8.js

# 검증
mongosh mongodb://localhost:27017/nanumpay
> db.useraccounts.count()
> db.users.count()
> db.users.findOne({ phone: { $exists: true } })  // null이어야 함
```

### 7.2 검증 쿼리

```javascript
// MongoDB shell
use nanumpay;

// 1. UserAccount 개수 확인
db.useraccounts.count();

// 2. User와 UserAccount 연결 확인
db.users.aggregate([
  {
    $lookup: {
      from: "useraccounts",
      localField: "userAccountId",
      foreignField: "_id",
      as: "account"
    }
  },
  { $match: { "account": { $size: 0 } } }
]).toArray();
// 결과: [] (비어있어야 함)

// 3. 개인정보 이동 확인
db.users.find({ phone: { $exists: true } }).count();
// 결과: 0

// 4. Admin은 그대로 유지
db.admins.count();
```

---

## 8. 변경 요약

### 8.1 신규 파일

- `apps/web/src/lib/server/models/UserAccount.js`
- `apps/web/src/lib/server/models/PlannerAccount.js`
- `apps/web/install/linux/migrate_v8.js`

### 8.2 수정 파일

| 파일 | 변경 내용 |
|-----|---------|
| `User.js` | `userAccountId`, `registrationNumber` 추가, 개인정보 제거 |
| `userRegistrationService.js` | UserAccount/PlannerAccount 생성, name 숫자 추가 |
| `treeRestructure.js` | 판매인 조회 시 UserAccount 확인 |
| `login/+server.js` | 3개 컬렉션 순차 조회, accountType 분기 |
| `users/+page.svelte` | 엑셀 템플릿 ID 컬럼 추가 |

### 8.3 변경 없음 (기존 100% 유지) ⭐

- ✅ `gradeCalculation.js` - 등급 계산
- ✅ `paymentPlanService.js` - 지급 계획
- ✅ `weeklyPaymentService.js` - 주간 지급
- ✅ `registrationService.js` - 등급/지급 처리
- ✅ `MonthlyRegistrations.js` - 월별 등록
- ✅ `WeeklyPaymentPlans.js` - 지급 계획
- ✅ User 트리 구조 로직 전부

---

## 9. FAQ

### Q1: 기존 트리 구조는?
**A**: 변경 없음. User 테이블의 parentId, position, left/right 그대로 사용.

### Q2: 등급 계산은?
**A**: 변경 없음. User 단위로 독립적으로 계산.

### Q3: 지급 계획은?
**A**: 변경 없음. WeeklyPaymentPlans는 User._id 기준으로 생성.

### Q4: 홍길동2는 어떻게 생성?
**A**: userRegistrationService.js에서 자동 생성 (registrationNumber 기반).

### Q5: 판매인 지정 방법은?
**A**: 엑셀에 ID (예: `hong`) 또는 이름 (예: `홍길동2`) 입력.

### Q6: 설계사 비밀번호는?
**A**: 전화번호 뒷4자리로 자동 생성. 로그인 후 변경 가능.

### Q7: 재등록 시 개인정보가 다르면?
**A**: 무시됨. 첫 등록 시 UserAccount에 저장된 정보 유지.

### Q8: 로그인 후 계층도는?
**A**: 첫 번째 User (registrationNumber: 1)를 root로 표시.

### Q9: 관리자는 어떻게 로그인?
**A**: Admin 컬렉션 (기존 유지). 로그인 시 가장 먼저 조회됨.

---

## 10. 개인정보 관리 원칙

**원칙**: UserAccount 정보는 첫 등록 시에만 저장, 재등록 시 갱신하지 않음 ⭐

**예시:**
```
1차 등록 (7월):
  ID: hong
  성명: 홍길동
  연락처: 010-1111-1111
  → UserAccount 생성

2차 등록 (8월):
  ID: hong
  성명: 홍길동
  연락처: 010-2222-2222  ← 다른 번호
  → UserAccount 정보 갱신하지 않음 (010-1111-1111 유지)
```

**개인정보 변경 방법:**
1. 관리자 페이지에서 UserAccount 직접 수정
2. MongoDB에서 직접 수정

---

## 11. 설계사 계정 관리

### 11.1 자동 생성

**엑셀 등록 시 자동 생성:**
```
설계사: 김영희
설계사 연락처: 010-1234-5678

→ PlannerAccount 자동 생성:
  - loginId: "김영희"
  - password: "5678" (전화번호 뒷4자리)
```

### 11.2 설계사 대시보드

**로그인 후:**
- 담당 용역자 목록 조회
- 용역자별 지급 내역
- 용역자 계층도 보기

**API:**
```javascript
// GET /api/planner/clients
const clients = await User.find({ plannerAccountId: account._id })  // ⭐ FK 기반
  .populate('userAccountId')
  .populate('plannerAccountId');
```

### 11.3 권한 구분

| 역할 | 로그인 ID | 초기 비밀번호 | 접근 권한 |
|-----|---------|-------------|---------|
| **관리자** | 관리자 | admin1234!! | 전체 시스템 |
| **용역자** | 엑셀 ID | 1234 | 본인 계층도/지급 |
| **설계사** | 이름 | 전화번호 뒷4자리 | 담당 용역자 조회 |

---

**작성자**: Claude AI Assistant
**최종 수정일**: 2025-10-20
**버전**: 8.0 (최종 - 컬렉션 분리, 최소 변경)
