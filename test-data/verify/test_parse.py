# -*- coding: utf-8 -*-
from __future__ import print_function
import re
import sys

reload(sys)
sys.setdefaultencoding('utf-8')

def extract_grade_number(grade_str):
    """등급 문자열에서 숫자 추출 (예: F1 -> 1, F2 -> 2)"""
    match = re.search(r'F(\d+)', grade_str)
    if match:
        return match.group(1)
    return None

def extract_round_number(round_str):
    """차수 문자열에서 숫자 추출 (예: 1차 -> 1, 2차 -> 2)"""
    match = re.search(r'(\d+)차', round_str)
    if match:
        return match.group(1)
    return None

def parse_name_info(text):
    """텍스트에서 이름과 정보 추출"""
    match = re.match(r'([^(]+)\(([^)]+)\)', text.strip())
    if match:
        return match.group(1), match.group(2)
    return None, None

# 테스트
test_str = u'최민수2(F1,1차)'
name, info = parse_name_info(test_str)
print(u"입력: {}".format(test_str))
print(u"이름: {}".format(name))
print(u"정보: {}".format(info))

if info and ',' in info:
    parts = info.split(',')
    print(u"parts: {}".format(parts))
    grade_part = parts[0].strip()
    round_part = parts[1].strip()
    print(u"grade_part: '{}'".format(grade_part))
    print(u"round_part: '{}'".format(round_part))

    grade_num = extract_grade_number(grade_part)
    round_num = extract_round_number(round_part)
    print(u"grade_num: {}".format(grade_num))
    print(u"round_num: {}".format(round_num))

    if grade_num and round_num:
        result = u"{},추{}".format(grade_num, round_num)
        print(u"결과: {}".format(result))
