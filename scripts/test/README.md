# 테스트 스크립트 사용법

## 개요
용역자 등록을 개별적으로 테스트할 수 있는 스크립트입니다.
7월 3명, 8월 3명, 9월 1명 총 7명의 용역자를 단계별로 등록할 수 있습니다.

## 등록 구조
사장님 (ROOT)
├─ 김영수 (왼쪽)
│  ├─ 박철수 (왼쪽)
│  └─ 최영희 (오른쪽)
└─ 이미영 (오른쪽)
   ├─ 정민수 (왼쪽)
   └─ 강민지 (오른쪽)

## 사용법

### 전체 등록 (기본)
python3 scripts/test/test_individual_registration.py

### 월별 전체 등록
python3 scripts/test/test_individual_registration.py 7    # 7월 3명
python3 scripts/test/test_individual_registration.py 8    # 8월 3명
python3 scripts/test/test_individual_registration.py 9    # 9월 1명

### 개별 등록
python3 scripts/test/test_individual_registration.py 7-1  # 사장님
python3 scripts/test/test_individual_registration.py 7-2  # 김영수
python3 scripts/test/test_individual_registration.py 7-3  # 이미영
python3 scripts/test/test_individual_registration.py 8-1  # 박철수
python3 scripts/test/test_individual_registration.py 8-2  # 최영희
python3 scripts/test/test_individual_registration.py 8-3  # 정민수
python3 scripts/test/test_individual_registration.py 9-1  # 강민지

## DB 초기화
DB_DIR=/home/tyranno/project/bill/nanumpay/apps/web/install/linux/db bash /home/tyranno/project/bill/nanumpay/apps/web/install/linux/db_init.sh --force

## 서버 로그 확인
Step 2: 월별 인원 현황 (등록자, 승급자, 매출)
Step 3: 지급 대상자 분류 (승급자, 미승급 등록자, 추가지급 대상자, 등급별 금액)
