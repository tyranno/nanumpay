#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
월별 용역자 등록 테스트 데이터 생성 스크립트 v2
- 판매인은 반드시 이전에 등록된 사람이어야 함 (이진 트리 규칙)
- 각 부모는 최대 2명의 자식만 가질 수 있음 (이진 트리)
"""

import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from datetime import datetime
from collections import defaultdict
import os

# 스타일 정의
header_font = Font(name='맑은 고딕', size=11, bold=True, color='FFFFFF')
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
data_font = Font(name='맑은 고딕', size=10)
center_alignment = Alignment(horizontal='center', vertical='center')
left_alignment = Alignment(horizontal='left', vertical='center')
thin_border = Border(
    left=Side(style='thin', color='D3D3D3'),
    right=Side(style='thin', color='D3D3D3'),
    top=Side(style='thin', color='D3D3D3'),
    bottom=Side(style='thin', color='D3D3D3')
)

# 보험 상품 정보 (5개 순환)
insurance_products = [
    ('삼성화재 실손보험', '삼성화재', '강남지점'),
    ('현대해상 암보험', '현대해상', '서초지점'),
    ('DB손해보험 운전자보험', 'DB손해보험', '송파지점'),
    ('KB손해보험 여행자보험', 'KB손해보험', '광화문지점'),
    ('메리츠화재 건강보험', '메리츠화재', '종로지점'),
]

def create_excel(filename, data, month_name):
    """엑셀 파일 생성"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"{month_name} 용역자명단"

    # 헤더 (15 columns)
    headers = ['순번', '날짜', 'ID', '성명', '연락처', '주민번호', '은행', '계좌번호',
               '판매인', '연락처', '설계사', '연락처', '보험상품명', '보험회사', '지사']

    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_alignment
        cell.border = thin_border

    # 열 너비 설정
    ws.column_dimensions['A'].width = 8   # 순번
    ws.column_dimensions['B'].width = 12  # 날짜
    ws.column_dimensions['C'].width = 12  # ID
    ws.column_dimensions['D'].width = 12  # 성명
    ws.column_dimensions['E'].width = 14  # 연락처
    ws.column_dimensions['F'].width = 16  # 주민번호
    ws.column_dimensions['G'].width = 12  # 은행
    ws.column_dimensions['H'].width = 16  # 계좌번호
    ws.column_dimensions['I'].width = 12  # 판매인
    ws.column_dimensions['J'].width = 14  # 연락처
    ws.column_dimensions['K'].width = 12  # 설계사
    ws.column_dimensions['L'].width = 14  # 연락처
    ws.column_dimensions['M'].width = 18  # 보험상품명
    ws.column_dimensions['N'].width = 14  # 보험회사
    ws.column_dimensions['O'].width = 12  # 지사

    # 이름별 카운트 (ID 중복 시 성명에 번호 붙이기)
    name_count = defaultdict(int)

    # 데이터 입력
    for idx, row in enumerate(data, 1):
        user_id, name, phone, resident_num, bank, account, salesperson, salesperson_phone, agent, agent_phone = row

        # 이름 중복 처리
        name_count[user_id] += 1
        count = name_count[user_id]

        if count == 1:
            final_name = name
        else:
            final_name = f"{name}{count}"  # 박철수, 박철수2, 박철수3

        # 보험 상품 (순환)
        insurance = insurance_products[idx % len(insurance_products)]

        row_num = idx + 1
        cells = [
            (1, idx, center_alignment),                          # 순번
            (2, month_name, center_alignment),                   # 날짜
            (3, user_id, center_alignment),                      # ID
            (4, final_name, center_alignment),                   # 성명
            (5, phone, center_alignment),                        # 연락처
            (6, resident_num, center_alignment),                 # 주민번호
            (7, bank, center_alignment),                         # 은행
            (8, account, center_alignment),                      # 계좌번호
            (9, salesperson, center_alignment),                  # 판매인
            (10, salesperson_phone, center_alignment),           # 연락처
            (11, agent, center_alignment),                       # 설계사
            (12, agent_phone, center_alignment),                 # 연락처
            (13, insurance[0], left_alignment),                  # 보험상품명
            (14, insurance[1], center_alignment),                # 보험회사
            (15, insurance[2], center_alignment),                # 지사
        ]

        for col, value, alignment in cells:
            cell = ws.cell(row=row_num + 1, column=col, value=value)
            cell.font = data_font
            cell.alignment = alignment
            cell.border = thin_border

    # 파일 저장
    output_dir = '/home/doowon/project/my/nanumpay/test-data'
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    wb.save(filepath)
    print(f'✅ {filename} 생성 완료 ({len(data)}명)')

class BinaryTreeBuilder:
    """이진 트리 구조로 데이터 생성 헬퍼"""
    def __init__(self):
        self.nodes = []  # 모든 노드 (성명 리스트)
        self.child_count = defaultdict(int)  # 각 부모의 자식 수

    def add_root(self, user_data):
        """루트 노드 추가"""
        self.nodes.append(user_data)
        return len(self.nodes) - 1

    def add_children(self, parent_name, children_data, force=False):
        """
        부모에게 자식 추가 (최대 2명)
        children_data: [(user_id, name, phone, ...), ...]
        force: True이면 이진 트리 제약 무시하고 강제 추가
        """
        current_count = self.child_count[parent_name]

        for child_data in children_data:
            if current_count >= 2 and not force:
                print(f'⚠️  {parent_name}은(는) 이미 2명의 자식이 있어 추가 불가')
                break

            self.nodes.append(child_data)
            self.child_count[parent_name] += 1
            current_count += 1

    def get_available_parents(self):
        """자식이 2명 미만인 부모 리스트"""
        available = []
        for node_data in self.nodes:
            node_name = node_data[1]  # 성명
            if self.child_count[node_name] < 2:
                available.append(node_name)
        return available

    def get_all_nodes(self):
        """모든 노드 반환"""
        return self.nodes

def main():
    """메인 실행 함수"""

    # ===== 7월_간단 (3명) - 루트 =====
    july_simple = [
        # ID, 이름, 연락처, 주민번호, 은행, 계좌번호, 판매인, 판매인연락처, 설계사, 설계사연락처
        ('boss', '사장님', '010-1111-1111', '800101-1234567', '국민은행', '123-456-789012', '', '', '김설계', '010-9991-0001'),
        ('kim001', '김영수', '010-2222-2222', '850202-1234567', '신한은행', '234-567-890123', '사장님', '010-1111-1111', '이설계', '010-9992-0002'),
        ('lee001', '이미영', '010-3333-3333', '900303-2234567', '우리은행', '345-678-901234', '사장님', '010-1111-1111', '박설계', '010-9993-0003'),
    ]

    # ===== 7월_추가 (7명) - 2단계까지 =====
    july_add_tree = BinaryTreeBuilder()

    # 김영수 밑 2명
    july_add_tree.add_children('김영수', [
        ('park001', '박철수', '010-4444-4444', '880404-1234567', '하나은행', '456-789-012345', '김영수', '010-2222-2222', '최설계', '010-9994-0004'),
        ('park001', '박철수', '010-4445-4445', '880405-1234567', '하나은행', '456-789-012346', '김영수', '010-2222-2222', '정설계', '010-9995-0005'),
    ])

    # 이미영 밑 2명
    july_add_tree.add_children('이미영', [
        ('park001', '박철수', '010-4446-4446', '880406-1234567', '하나은행', '456-789-012347', '이미영', '010-3333-3333', '강설계', '010-9996-0006'),
        ('kang001', '강민지', '010-5555-5555', '920505-2234567', 'KB국민은행', '567-890-123456', '이미영', '010-3333-3333', '윤설계', '010-9997-0007'),
    ])

    # 박철수(첫번째) 밑 2명
    july_add_tree.add_children('박철수', [
        ('lee002', '이순신', '010-6666-6666', '700606-1234567', '농협은행', '678-901-234567', '박철수', '010-4444-4444', '서설계', '010-9998-0008'),
        ('kim002', '김유신', '010-7777-7777', '750707-1234567', '기업은행', '789-012-345678', '박철수', '010-4444-4444', '노설계', '010-9999-0009'),
    ])

    # 박철수2(두번째) 밑 1명
    july_add_tree.add_children('박철수2', [
        ('jo001', '조동현', '010-8888-8888', '930808-1234567', '신협', '890-123-456789', '박철수2', '010-4445-4445', '구설계', '010-9990-0010'),
    ])

    july_add = july_add_tree.get_all_nodes()

    # ===== 8월 (15명) - 3단계 채우기 =====
    august_tree = BinaryTreeBuilder()

    # 박철수3 밑 2명
    august_tree.add_children('박철수3', [
        ('han001', '한예진', '010-5001-5001', '910101-2234567', '국민은행', '100-200-300001', '박철수3', '010-4446-4446', '가설계', '010-8001-0001'),
        ('han001', '한예진', '010-5002-5002', '910102-2234567', '국민은행', '100-200-300002', '박철수3', '010-4446-4446', '나설계', '010-8002-0002'),
    ])

    # 강민지 밑 2명
    august_tree.add_children('강민지', [
        ('han001', '한예진', '010-5003-5003', '910103-2234567', '국민은행', '100-200-300003', '강민지', '010-5555-5555', '다설계', '010-8003-0003'),
        ('hwang001', '황민정', '010-5004-5004', '920201-2234567', '신한은행', '200-300-400001', '강민지', '010-5555-5555', '라설계', '010-8004-0004'),
    ])

    # 이순신 밑 2명
    august_tree.add_children('이순신', [
        ('hwang001', '황민정', '010-5005-5005', '920202-2234567', '신한은행', '200-300-400002', '이순신', '010-6666-6666', '마설계', '010-8005-0005'),
        ('hwang001', '황민정', '010-5006-5006', '920203-2234567', '신한은행', '200-300-400003', '이순신', '010-6666-6666', '바설계', '010-8006-0006'),
    ])

    # 김유신 밑 2명
    august_tree.add_children('김유신', [
        ('shin001', '신윤복', '010-5007-5007', '930301-2234567', '우리은행', '300-400-500001', '김유신', '010-7777-7777', '사설계', '010-8007-0007'),
        ('shin001', '신윤복', '010-5008-5008', '930302-2234567', '우리은행', '300-400-500002', '김유신', '010-7777-7777', '아설계', '010-8008-0008'),
    ])

    # 조동현 밑 2명
    august_tree.add_children('조동현', [
        ('shin001', '신윤복', '010-5009-5009', '930303-2234567', '우리은행', '300-400-500003', '조동현', '010-8888-8888', '자설계', '010-8009-0009'),
        ('jung001', '정선', '010-5010-5010', '940401-1234567', '하나은행', '400-500-600001', '조동현', '010-8888-8888', '차설계', '010-8010-0010'),
    ])

    # 한예진 밑 2명
    august_tree.add_children('한예진', [
        ('jung001', '정선', '010-5011-5011', '940402-1234567', '하나은행', '400-500-600002', '한예진', '010-5001-5001', '카설계', '010-8011-0011'),
        ('jung001', '정선', '010-5012-5012', '940403-1234567', '하나은행', '400-500-600003', '한예진', '010-5001-5001', '타설계', '010-8012-0012'),
    ])

    # 한예진2 밑 2명
    august_tree.add_children('한예진2', [
        ('park002', '박지원', '010-5013-5013', '950501-2234567', 'KB국민은행', '500-600-700001', '한예진2', '010-5002-5002', '파설계', '010-8013-0013'),
        ('park002', '박지원', '010-5014-5014', '950502-2234567', 'KB국민은행', '500-600-700002', '한예진2', '010-5002-5002', '하설계', '010-8014-0014'),
    ])

    # 한예진3 밑 1명
    august_tree.add_children('한예진3', [
        ('park002', '박지원', '010-5015-5015', '950503-2234567', 'KB국민은행', '500-600-700003', '한예진3', '010-5003-5003', '가설계', '010-8015-0015'),
    ])

    august_simple = august_tree.get_all_nodes()

    # ===== 9월 (45명) - 4단계 채우기 =====
    september_tree = BinaryTreeBuilder()
    sep_names = ['최민수', '송가인', '류현진', '안정환', '배용준', '전지현', '고소영']

    # 9월에 45명 추가하려면 부모 23명 필요 (45 ÷ 2 = 22.5 → 23명)
    # 8월 15명 + 조동현(자식 1명), 한예진3(자식 1명), ... 등 8명 = 23명

    # 8월에 추가된 15명 (모두 자식 0명, 2명씩 추가 가능)
    aug_parents = [
        '한예진', '한예진2', '한예진3',
        '황민정', '황민정2', '황민정3',
        '신윤복', '신윤복2', '신윤복3',
        '정선', '정선2', '정선3',
        '박지원', '박지원2', '박지원3'
    ]

    # 7월에 추가된 사람 중 자식이 1명인 경우 (1명 더 추가 가능)
    july_parents_with_one_child = ['박철수2', '조동현', '한예진3']  # 3명

    # 7월에 추가된 사람 중 자식이 0명인 경우 (2명 추가 가능)
    july_parents_no_child = ['강민지']  # 1명이지만 이미 8월에 2명 추가함

    # 추가로 필요한 부모: 45명 만들려면
    # - 15명 × 2 = 30명
    # - 3명 × 1 = 3명
    # - 나머지 12명은 추가 부모 6명 필요

    # 실제로는: 15명×2 + 8명×1 = 30 + 8 = 38명... 부족
    # 더 간단하게: 23명 부모 × 2명 - 1명(마지막 홀수) = 45명

    all_sep_parents = aug_parents + july_parents_with_one_child + \
                      ['박철수', '이순신', '김유신']  # 7월 레벨에서 자식 2명 있지만 일부 추가

    # 실제로는 23명 부모 구성:
    # 8월 15명 (각 2명) + 조동현, 박철수2, 한예진3 (각 1명) + 이순신, 김유신, 박철수, 강민지 중 5명 (각 2명)

    # 간단히: 8월 15명 전원 + 7월 8명 선별 = 23명
    sep_all_parents = [
        # 8월 15명 (각 2명씩)
        '한예진', '한예진2', '한예진3',
        '황민정', '황민정2', '황민정3',
        '신윤복', '신윤복2', '신윤복3',
        '정선', '정선2', '정선3',
        '박지원', '박지원2', '박지원3',
        # 7월 8명 추가 (조동현은 자식 1명, 나머지는 자식 2명이지만 추가 가능하다고 가정)
        '조동현', '박철수2'  # 자식 1명인 경우
        # 위 17명 × 2 = 34명... 부족
        # 더 추가: 이순신, 김유신, 박철수, 강민지 (7월 레벨, 이미 자식 있지만 포함)
        # 실제로는 불가능... 이진 트리 제약
    ]

    # ⚠️ 실제로는 45명 불가능! 최대 30명 (15 × 2)
    # 하지만 요구사항이 45명이므로, 7월 사람들도 추가 자식을 가질 수 있다고 가정
    # (검증 로직에서는 막히지만, 일단 데이터는 생성)

    idx = 0
    # 8월 15명 부모: 각 2명씩 = 30명
    for parent_name in aug_parents:
        children = []
        for j in range(2):
            name_base = sep_names[idx % len(sep_names)]
            children.append((
                f'sep{idx+1:03d}',
                name_base,
                f'010-6{idx+1:03d}-{idx+1:04d}',
                f'{90 + (idx % 10):02d}{(idx % 12) + 1:02d}{(idx % 28) + 1:02d}-{1 + (idx % 2)}234567',
                ['국민은행', '신한은행', '우리은행', '하나은행', 'KB국민은행'][idx % 5],
                f'{600 + idx:03d}-{700 + idx:03d}-{800000 + idx:06d}',
                parent_name,
                f'010-5{((aug_parents.index(parent_name)) + 1):03d}-5{((aug_parents.index(parent_name)) + 1):03d}',
                f'{name_base[:1]}설계',
                f'010-9{idx+1:03d}-{idx+1:04d}'
            ))
            idx += 1
        september_tree.add_children(parent_name, children)

    # 박철수2, 조동현: 각 1명씩 = 2명 (누적 32명)
    # 한예진3은 8월에 이미 자식 1명 있음! 제외
    additional_parents_one = ['박철수2', '조동현']
    for parent_name in additional_parents_one:
        name_base = sep_names[idx % len(sep_names)]
        september_tree.add_children(parent_name, [(
            f'sep{idx+1:03d}',
            name_base,
            f'010-6{idx+1:03d}-{idx+1:04d}',
            f'{90 + (idx % 10):02d}{(idx % 12) + 1:02d}{(idx % 28) + 1:02d}-{1 + (idx % 2)}234567',
            ['국민은행', '신한은행', '우리은행', '하나은행', 'KB국민은행'][idx % 5],
            f'{600 + idx:03d}-{700 + idx:03d}-{800000 + idx:06d}',
            parent_name,
            '010-' + parent_name[:2] + '00-0000',  # 임시 연락처
            f'{name_base[:1]}설계',
            f'010-9{idx+1:03d}-{idx+1:04d}'
        )])
        idx += 1

    # 나머지 13명: 추가 부모 필요 (6명×2 + 1명×1 = 13명)
    # 이순신, 김유신, 박철수 (이미 자식 2명), 강민지 (이미 자식 2명)
    # ⚠️ 실제로는 이진 트리 위반이지만, 요구사항대로 데이터 생성 (force=True)
    additional_parents_two = ['이순신', '김유신', '박철수', '강민지', '사장님', '김영수']
    for pi, parent_name in enumerate(additional_parents_two):
        # 마지막 부모(김영수)는 1명만 추가
        num_children = 1 if pi == len(additional_parents_two) - 1 else 2
        for j in range(num_children):
            name_base = sep_names[idx % len(sep_names)]
            september_tree.add_children(parent_name, [(
                f'sep{idx+1:03d}',
                name_base,
                f'010-6{idx+1:03d}-{idx+1:04d}',
                f'{90 + (idx % 10):02d}{(idx % 12) + 1:02d}{(idx % 28) + 1:02d}-{1 + (idx % 2)}234567',
                ['국민은행', '신한은행', '우리은행', '하나은행', 'KB국민은행'][idx % 5],
                f'{600 + idx:03d}-{700 + idx:03d}-{800000 + idx:06d}',
                parent_name,
                '010-' + parent_name[:2] + '00-0000',
                f'{name_base[:1]}설계',
                f'010-9{idx+1:03d}-{idx+1:04d}'
            )], force=True)  # ⭐ 강제 추가
            idx += 1

    # ⚠️ BinaryTreeBuilder 사용하지 않고 직접 추가 (이진 트리 제약 무시)
    # 현재 43명이므로 2명 더 직접 추가
    while len(september_tree.get_all_nodes()) < 45:
        name_base = sep_names[idx % len(sep_names)]
        september_tree.nodes.append((
            f'sep{idx+1:03d}',
            name_base,
            f'010-6{idx+1:03d}-{idx+1:04d}',
            f'{90 + (idx % 10):02d}{(idx % 12) + 1:02d}{(idx % 28) + 1:02d}-{1 + (idx % 2)}234567',
            ['국민은행', '신한은행', '우리은행', '하나은행', 'KB국민은행'][idx % 5],
            f'{600 + idx:03d}-{700 + idx:03d}-{800000 + idx:06d}',
            '이미영',  # 임의의 부모
            '010-3333-3333',
            f'{name_base[:1]}설계',
            f'010-9{idx+1:03d}-{idx+1:04d}'
        ))
        idx += 1

    september_simple = september_tree.get_all_nodes()

    # ===== 10월 (90명) - 5단계 채우기 =====
    october_tree = BinaryTreeBuilder()
    oct_names = ['김민재', '이강인', '손흥민', '황희찬', '이재성', '황인범', '김영권', '조현우', '김승규', '홍철']

    # 9월에 45명 추가되었으므로, 부모 가능 인원:
    # - 9월 신규 45명 전원 (자식 0명)
    # - 45명 × 2 = 90명 정확히 가능!

    sep_parent_base_names = sep_names  # ['최민수', '송가인', '류현진', '안정환', '배용준', '전지현', '고소영']

    # 45명의 부모 이름 생성 (최민수, 최민수2, ..., 최민수7, 송가인, ...)
    sep_parents = []
    for i in range(45):
        base = sep_parent_base_names[i % len(sep_parent_base_names)]
        count = (i // len(sep_parent_base_names)) + 1
        if count == 1:
            sep_parents.append(base)
        else:
            sep_parents.append(f"{base}{count}")

    idx = 0
    for parent_name in sep_parents:
        children = []
        for j in range(2):  # 각 부모당 2명
            name_base = oct_names[idx % len(oct_names)]
            children.append((
                f'oct{idx+1:03d}',
                name_base,
                f'010-7{idx+1:03d}-{idx+1:04d}',
                f'{85 + (idx % 15):02d}{(idx % 12) + 1:02d}{(idx % 28) + 1:02d}-{1 + (idx % 2)}234567',
                ['국민은행', '신한은행', '우리은행', '하나은행', 'KB국민은행', '농협은행'][idx % 6],
                f'{700 + idx:03d}-{800 + idx:03d}-{900000 + idx:06d}',
                parent_name,
                f'010-6{(i + 1):03d}-{(i + 1):04d}',  # 부모 인덱스 기반
                f'{name_base[:1]}설계',
                f'010-9{100 + idx:03d}-{idx+1:04d}'
            ))
            idx += 1

        october_tree.add_children(parent_name, children)

    october_simple = october_tree.get_all_nodes()

    # 파일 생성
    create_excel('7월_용역자명단_간단.xlsx', july_simple, '2025-07')
    create_excel('7월_용역자명단_추가.xlsx', july_add, '2025-07')
    create_excel('8월_용역자명단_간단.xlsx', august_simple, '2025-08')
    create_excel('9월_용역자명단_간단.xlsx', september_simple, '2025-09')
    create_excel('10월_용역자명단_간단.xlsx', october_simple, '2025-10')

    print('\n📊 전체 요약:')
    print(f'  7월 간단: 3명 (누적 3명)')
    print(f'  7월 추가: 7명 (누적 10명)')
    print(f'  8월: 15명 (누적 25명)')
    print(f'  9월: 45명 (누적 70명)')
    print(f'  10월: 90명 (누적 160명)')
    print('\n✅ 모든 파일 생성 완료!')
    print('⚠️  판매인은 모두 이전에 등록된 사람으로 설정됨')
    print('⚠️  9월 데이터: 일부 부모가 이미 2명의 자식을 가지고 있어 등록 시 검증 오류 발생할 수 있음')
    print('⚠️  이진 트리 제약상 8월까지만 완전한 데이터, 9월부터는 테스트용 데이터')

if __name__ == '__main__':
    main()
