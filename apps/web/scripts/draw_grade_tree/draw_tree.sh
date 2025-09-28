#!/bin/bash

echo "=== MLM 계층 트리 시각화 도구 ==="
echo

# Graphviz 설치 확인
if ! command -v dot &> /dev/null; then
    echo "Graphviz 설치 중..."
    sudo apt update && sudo apt install -y graphviz
fi

# 현재 스크립트 디렉토리
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/output"

# 출력 디렉토리 생성
mkdir -p "${OUTPUT_DIR}"

echo "DOT 파일 생성 중..."
mongosh nanumpay --eval "$(cat "${SCRIPT_DIR}/generate_tree.js")" > "${OUTPUT_DIR}/mlm_tree.dot"

echo "트리 이미지 생성 중..."

# 다양한 포맷으로 생성
dot -Tpng "${OUTPUT_DIR}/mlm_tree.dot" -o "${OUTPUT_DIR}/mlm_tree.png"
dot -Tsvg "${OUTPUT_DIR}/mlm_tree.dot" -o "${OUTPUT_DIR}/mlm_tree.svg"
dot -Tpdf "${OUTPUT_DIR}/mlm_tree.dot" -o "${OUTPUT_DIR}/mlm_tree.pdf"

echo "생성 완료!"
echo "파일 위치:"
echo "  PNG: ${OUTPUT_DIR}/mlm_tree.png"
echo "  SVG: ${OUTPUT_DIR}/mlm_tree.svg"
echo "  PDF: ${OUTPUT_DIR}/mlm_tree.pdf"
echo

# 이미지 뷰어로 열기
if command -v eog &> /dev/null; then
    echo "이미지 뷰어로 열기..."
    eog "${OUTPUT_DIR}/mlm_tree.png" &
elif command -v feh &> /dev/null; then
    echo "feh로 열기..."
    feh "${OUTPUT_DIR}/mlm_tree.png" &
elif command -v xdg-open &> /dev/null; then
    echo "기본 프로그램으로 열기..."
    xdg-open "${OUTPUT_DIR}/mlm_tree.png" &
fi

echo "트리 통계:"
mongosh nanumpay --eval "
const users = db.users.find({type: 'user'}).toArray();
const gradeCount = {};
users.forEach(u => {
  gradeCount[u.grade] = (gradeCount[u.grade] || 0) + 1;
});

print('총 인원:', users.length);
Object.keys(gradeCount).sort().forEach(grade => {
  print(grade + ':', gradeCount[grade] + '명');
});
"