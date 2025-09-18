# UI 컴포넌트 사용 가이드

## 설치 및 Import

```svelte
<script>
  import { Button, Input, Select, Modal, Card, IconButton } from '$lib/components';
</script>
```

## 1. Button 컴포넌트

### 기본 사용법

```svelte
<Button>기본 버튼</Button>
<Button variant="primary" size="sm">작은 주요 버튼</Button>
<Button variant="success" size="md">중간 성공 버튼</Button>
<Button variant="danger" size="lg">큰 위험 버튼</Button>
<Button variant="outline">아웃라인 버튼</Button>
```

### 아이콘 포함 버튼

```svelte
<Button icon="/icons/user-add.svg" variant="success">
  새 회원 등록
</Button>

<Button icon="/icons/excel.svg" iconPosition="right">
  엑셀 업로드
</Button>
```

### Props

- `variant`: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'outline' | 'ghost'
- `size`: 'xs' | 'sm' | 'md' | 'lg'
- `icon`: 아이콘 경로
- `iconPosition`: 'left' | 'right'
- `isIconOnly`: 아이콘만 표시
- `disabled`: 비활성화 상태
- `onclick`: 클릭 이벤트 핸들러

## 2. IconButton 컴포넌트

### 기본 사용법

```svelte
<IconButton
  icon="/icons/edit.svg"
  variant="primary"
  size="sm"
  title="수정"
  onclick={() => editItem()}
/>

<IconButton
  icon="/icons/trash.svg"
  variant="danger"
  size="xs"
  title="삭제"
/>
```

## 3. Input 컴포넌트

### 기본 사용법

```svelte
<script>
  let name = $state('');
  let phone = $state('');
</script>

<Input bind:value={name} placeholder="이름을 입력하세요" size="sm" />
<Input bind:value={phone} type="tel" placeholder="전화번호" size="md" />
```

### Props

- `size`: 'sm' | 'md' | 'lg'
- `type`: HTML input type
- `value`: 바인딩할 값
- `placeholder`: placeholder 텍스트
- `disabled`: 비활성화 상태

## 4. Select 컴포넌트

### 기본 사용법

```svelte
<script>
  let itemsPerPage = $state(20);
</script>

<Select bind:value={itemsPerPage} size="sm">
  <option value={10}>10개씩 보기</option>
  <option value={20}>20개씩 보기</option>
  <option value={50}>50개씩 보기</option>
</Select>
```

## 5. Modal 컴포넌트

### 기본 사용법

```svelte
<script>
  let showModal = $state(false);

  function handleConfirm() {
    console.log('확인 클릭');
    showModal = false;
  }
</script>

<Button onclick={() => showModal = true}>모달 열기</Button>

<Modal
  bind:show={showModal}
  title="회원 정보 수정"
  size="md"
  onConfirm={handleConfirm}
  confirmText="수정"
  cancelText="취소"
>
  <div>모달 내용이 들어갑니다</div>
</Modal>
```

### Props

- `show`: 표시 여부
- `size`: 'sm' | 'md' | 'lg' | 'xl'
- `title`: 모달 제목
- `showFooter`: 하단 버튼 표시 여부
- `onCancel`: 취소 버튼 핸들러
- `onConfirm`: 확인 버튼 핸들러
- `cancelText`: 취소 버튼 텍스트
- `confirmText`: 확인 버튼 텍스트
- `confirmVariant`: 확인 버튼 스타일

## 6. Card 컴포넌트

### 기본 사용법

```svelte
<Card padding="md">
  <h3>카드 제목</h3>
  <p>카드 내용입니다.</p>
</Card>

<Card padding="lg" class="mt-4">
  <div>큰 패딩의 카드</div>
</Card>
```

## 테마 커스터마이징

`src/lib/theme.js` 파일을 수정하여 전체 앱의 스타일을 한번에 변경할 수 있습니다.

### 예시: 버튼 색상 변경

```javascript
// theme.js
export const theme = {
  button: {
    variant: {
      primary: 'bg-indigo-600 text-white hover:bg-indigo-700', // 파란색을 인디고로 변경
      // ...
    }
  }
}
```

### 예시: 크기 조정

```javascript
// theme.js
export const theme = {
  button: {
    size: {
      sm: 'px-2.5 py-1 text-xs', // 더 작게 조정
      // ...
    }
  }
}
```

## 실제 사용 예시

### 회원 관리 페이지 헤더

```svelte
<div class="flex justify-between items-center">
  <div>
    <h2 class="text-2xl font-bold text-gray-800">용역자 관리명부</h2>
    <p class="text-gray-600 mt-1">총 {totalMembers}명의 용역자가 등록되어 있습니다.</p>
  </div>
  <div class="flex gap-3">
    <Button
      variant="primary"
      size="sm"
      icon="/icons/excel.svg"
      onclick={() => showUploadModal = true}
    >
      엑셀 업로드
    </Button>
    <Button
      variant="success"
      size="sm"
      icon="/icons/user-add.svg"
      onclick={() => showAddModal = true}
    >
      새 회원 등록
    </Button>
  </div>
</div>
```

### 테이블 액션 버튼

```svelte
<div class="flex gap-1">
  <IconButton
    icon="/icons/edit.svg"
    variant="primary"
    size="xs"
    title="수정"
    onclick={() => openEditModal(member)}
  />
  <IconButton
    icon="/icons/trash.svg"
    variant="danger"
    size="xs"
    title="삭제"
    onclick={() => deleteMember(member)}
  />
</div>
```

### 모달 사용

```svelte
<Modal
  bind:show={showEditModal}
  title="회원 정보 수정"
  size="lg"
  onConfirm={handleEditMember}
  confirmText="수정"
  confirmVariant="primary"
>
  <div class="grid grid-cols-2 gap-6">
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">성명</label>
      <Input bind:value={editingMember.name} size="sm" />
    </div>
    <div>
      <label class="block text-sm font-medium text-gray-700 mb-1">연락처</label>
      <Input bind:value={editingMember.phone} type="tel" size="sm" />
    </div>
  </div>
</Modal>
```

## 장점

1. **일관성**: 모든 페이지에서 동일한 스타일 유지
2. **유지보수**: 한 곳에서 전체 스타일 변경 가능
3. **재사용성**: 컴포넌트 재사용으로 코드 중복 제거
4. **타입 안정성**: Props로 명확한 인터페이스 제공
5. **테마 지원**: 다크모드 등 테마 전환 쉽게 구현 가능