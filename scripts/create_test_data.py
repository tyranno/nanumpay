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

    # ⭐ ID별 카운트 (성명 자동 번호 부여)
    # ID는 한글 그대로 (박철수), 성명은 번호 붙임 (박철수, 박철수2, ...)
    name_count = defaultdict(int)

    # 데이터 입력
    for idx, row in enumerate(data, 1):
        user_id, name, phone, resident_num, bank, account, salesperson, salesperson_phone, agent, agent_phone = row

        # ⭐ 성명 중복 처리 (ID 기준)
        name_count[user_id] += 1
        count = name_count[user_id]

        if count == 1:
            final_name = name
        else:
            final_name = f"{name}{count}"  # 박철수, 박철수2, 박철수3

        # ⭐ 판매인 빈 값 처리 (루트는 '-')
        if not salesperson or salesperson == '':
            salesperson = '-'
            salesperson_phone = '-'

        # 보험 상품 (순환)
        insurance = insurance_products[(idx - 1) % len(insurance_products)]

        # ⭐ 헤더 다음 행부터 데이터 입력 (row 2부터)
        row_num = idx + 1
        cells = [
            (1, idx, center_alignment),                          # 순번
            (2, month_name, center_alignment),                   # 날짜
            (3, user_id, center_alignment),                      # ⭐ ID (한글 그대로)
            (4, final_name, center_alignment),                   # 성명 (번호 붙음)
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
            cell = ws.cell(row=row_num, column=col, value=value)
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
        ('사장님', '사장님', '010-1234-5678', '800101-1234567', '국민은행', '123-456-789012', '', '', '김설계', '010-1234-5678'),
        ('김영수', '김영수', '010-1234-5678', '850202-1234567', '신한은행', '234-567-890123', '사장님', '010-1234-5678', '이설계', '010-1234-5678'),
        ('이미영', '이미영', '010-1234-5678', '900303-2234567', '우리은행', '345-678-901234', '사장님', '010-1234-5678', '박설계', '010-1234-5678'),
    ]

    # ===== 7월_추가 (7명) - 2단계까지 =====
    july_add_tree = BinaryTreeBuilder()

    # 김영수 밑 2명
    july_add_tree.add_children('김영수', [
        ('박철수', '박철수', '010-1234-5678', '880404-1234567', '하나은행', '456-789-012345', '김영수', '010-1234-5678', '최설계', '010-1234-5678'),
        ('박철수', '박철수', '010-1234-5678', '880405-1234567', '하나은행', '456-789-012346', '김영수', '010-1234-5678', '정설계', '010-1234-5678'),
    ])

    # 이미영 밑 2명
    july_add_tree.add_children('이미영', [
        ('박철수', '박철수', '010-1234-5678', '880406-1234567', '하나은행', '456-789-012347', '이미영', '010-1234-5678', '강설계', '010-1234-5678'),
        ('강민지', '강민지', '010-1234-5678', '920505-2234567', 'KB국민은행', '567-890-123456', '이미영', '010-1234-5678', '윤설계', '010-1234-5678'),
    ])

    # 박철수(첫번째) 밑 2명
    july_add_tree.add_children('박철수', [
        ('이순신', '이순신', '010-1234-5678', '700606-1234567', '농협은행', '678-901-234567', '박철수', '010-1234-5678', '서설계', '010-1234-5678'),
        ('김유신', '김유신', '010-1234-5678', '750707-1234567', '기업은행', '789-012-345678', '박철수', '010-1234-5678', '노설계', '010-1234-5678'),
    ])

    # 박철수2(두번째) 밑 1명
    july_add_tree.add_children('박철수2', [
        ('조동현', '조동현', '010-1234-5678', '930808-1234567', '신협', '890-123-456789', '박철수2', '010-1234-5678', '구설계', '010-1234-5678'),
    ])

    july_add = july_add_tree.get_all_nodes()

    # ===== 8월 (15명) - 3단계 채우기 =====
    august_tree = BinaryTreeBuilder()

    # 박철수3 밑 2명
    august_tree.add_children('박철수3', [
        ('한예진', '한예진', '010-1234-5678', '910101-2234567', '국민은행', '100-200-300001', '박철수3', '010-1234-5678', '가설계', '010-1234-5678'),
        ('한예진', '한예진', '010-1234-5678', '910102-2234567', '국민은행', '100-200-300002', '박철수3', '010-1234-5678', '나설계', '010-1234-5678'),
    ])

    # 강민지 밑 2명
    august_tree.add_children('강민지', [
        ('한예진', '한예진', '010-1234-5678', '910103-2234567', '국민은행', '100-200-300003', '강민지', '010-1234-5678', '다설계', '010-1234-5678'),
        ('황민정', '황민정', '010-1234-5678', '920201-2234567', '신한은행', '200-300-400001', '강민지', '010-1234-5678', '라설계', '010-1234-5678'),
    ])

    # 이순신 밑 2명
    august_tree.add_children('이순신', [
        ('황민정', '황민정', '010-1234-5678', '920202-2234567', '신한은행', '200-300-400002', '이순신', '010-1234-5678', '마설계', '010-1234-5678'),
        ('황민정', '황민정', '010-1234-5678', '920203-2234567', '신한은행', '200-300-400003', '이순신', '010-1234-5678', '바설계', '010-1234-5678'),
    ])

    # 김유신 밑 2명
    august_tree.add_children('김유신', [
        ('신윤복', '신윤복', '010-1234-5678', '930301-2234567', '우리은행', '300-400-500001', '김유신', '010-1234-5678', '사설계', '010-1234-5678'),
        ('신윤복', '신윤복', '010-1234-5678', '930302-2234567', '우리은행', '300-400-500002', '김유신', '010-1234-5678', '아설계', '010-1234-5678'),
    ])

    # 조동현 밑 2명
    august_tree.add_children('조동현', [
        ('신윤복', '신윤복', '010-1234-5678', '930303-2234567', '우리은행', '300-400-500003', '조동현', '010-1234-5678', '자설계', '010-1234-5678'),
        ('정선', '정선', '010-1234-5678', '940401-1234567', '하나은행', '400-500-600001', '조동현', '010-1234-5678', '차설계', '010-1234-5678'),
    ])

    # 한예진 밑 2명
    august_tree.add_children('한예진', [
        ('정선', '정선', '010-1234-5678', '940402-1234567', '하나은행', '400-500-600002', '한예진', '010-1234-5678', '카설계', '010-1234-5678'),
        ('정선', '정선', '010-1234-5678', '940403-1234567', '하나은행', '400-500-600003', '한예진', '010-1234-5678', '타설계', '010-1234-5678'),
    ])

    # 한예진2 밑 2명
    august_tree.add_children('한예진2', [
        ('박지원', '박지원', '010-1234-5678', '950501-2234567', 'KB국민은행', '500-600-700001', '한예진2', '010-1234-5678', '파설계', '010-1234-5678'),
        ('박지원', '박지원', '010-1234-5678', '950502-2234567', 'KB국민은행', '500-600-700002', '한예진2', '010-1234-5678', '하설계', '010-1234-5678'),
    ])

    # 한예진3 밑 1명
    august_tree.add_children('한예진3', [
        ('박지원', '박지원', '010-1234-5678', '950503-2234567', 'KB국민은행', '500-600-700003', '한예진3', '010-1234-5678', '가설계', '010-1234-5678'),
    ])

    august_simple = august_tree.get_all_nodes()

    # ===== 9월 (24명) - 4단계 채우기 =====
    # ⚠️ 8월에 자식을 가지지 않은 사람만 부모 가능!
    # 한예진, 한예진2, 한예진3은 8월에 이미 자식을 가짐 → 제외
    september_tree = BinaryTreeBuilder()
    sep_names = ['최민수', '송가인', '류현진', '안정환', '배용준', '전지현', '고소영']

    # 8월에 추가되었지만 아직 자식이 없는 12명만 부모 가능 (12 × 2 = 24명)
    aug_parents = [
        # '한예진', '한예진2', '한예진3',  # ⭐ 8월에 이미 자식 있음! 제외
        '황민정', '황민정2', '황민정3',
        '신윤복', '신윤복2', '신윤복3',
        '정선', '정선2', '정선3',
        '박지원', '박지원2', '박지원3'
    ]

    idx = 0
    # 8월에 자식 없는 12명 부모: 각 2명씩 = 24명
    for parent_name in aug_parents:
        children = []
        for j in range(2):
            name_base = sep_names[idx % len(sep_names)]
            children.append((
                name_base,  # ⭐ ID: 한글 이름
                name_base,
                '010-1234-5678',  # ⭐ 연락처 통일
                f'{90 + (idx % 10):02d}{(idx % 12) + 1:02d}{(idx % 28) + 1:02d}-{1 + (idx % 2)}234567',
                ['국민은행', '신한은행', '우리은행', '하나은행', 'KB국민은행'][idx % 5],
                f'{600 + idx:03d}-{700 + idx:03d}-{800000 + idx:06d}',
                parent_name,
                '010-1234-5678',  # ⭐ 판매인 연락처 통일
                f'{name_base[:1]}설계',
                '010-1234-5678'  # ⭐ 설계사 연락처 통일
            ))
            idx += 1
        september_tree.add_children(parent_name, children)

    september_simple = september_tree.get_all_nodes()

    # ===== 10월 (48명) - 5단계 채우기 =====
    october_tree = BinaryTreeBuilder()
    oct_names = ['김민재', '이강인', '손흥민', '황희찬', '이재성', '황인범', '김영권', '조현우', '김승규', '홍철']

    # 9월에 24명 추가되었으므로, 부모 가능 인원:
    # - 9월 신규 24명 전원 (자식 0명)
    # - 24명 × 2 = 48명

    sep_parent_base_names = sep_names  # ['최민수', '송가인', '류현진', '안정환', '배용준', '전지현', '고소영']

    # 24명의 부모 이름 생성 (최민수, 최민수2, ..., 최민수4, 송가인, ...)
    sep_parents = []
    for i in range(24):
        base = sep_parent_base_names[i % len(sep_parent_base_names)]
        count = (i // len(sep_parent_base_names)) + 1
        if count == 1:
            sep_parents.append(base)
        else:
            sep_parents.append(f"{base}{count}")

    idx = 0
    for i, parent_name in enumerate(sep_parents):
        children = []
        for j in range(2):  # 각 부모당 2명
            name_base = oct_names[idx % len(oct_names)]
            children.append((
                name_base,  # ⭐ ID: 한글 이름
                name_base,
                '010-1234-5678',  # ⭐ 연락처 통일
                f'{85 + (idx % 15):02d}{(idx % 12) + 1:02d}{(idx % 28) + 1:02d}-{1 + (idx % 2)}234567',
                ['국민은행', '신한은행', '우리은행', '하나은행', 'KB국민은행', '농협은행'][idx % 6],
                f'{700 + idx:03d}-{800 + idx:03d}-{900000 + idx:06d}',
                parent_name,
                '010-1234-5678',  # ⭐ 판매인 연락처 통일
                f'{name_base[:1]}설계',
                '010-1234-5678'  # ⭐ 설계사 연락처 통일
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
    print(f'  9월: 24명 (누적 49명)')
    print(f'  10월: 48명 (누적 97명)')
    print('\n✅ 모든 파일 생성 완료!')
    print('⚠️  판매인은 모두 이전에 등록된 사람으로 설정됨')
    print('⚠️  각 부모는 최대 2명의 자식만 가짐 (이진 트리 규칙 완전 준수)')
    print('⚠️  8월에 자식을 가진 한예진×3은 9월 부모에서 제외')
    print('✅  모든 데이터가 검증 통과 가능!')

if __name__ == '__main__':
    main()
