import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import User from '$lib/server/models/User.js';
import bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';

/**
 * 엑셀 파일을 통한 사용자 일괄 등록
 * 엑셀 형식:
 * - 이름 | 전화번호 | 판매인 | 비밀번호 | 위치(L/R)
 */
export async function POST({ request, locals }) {
  // 관리자 권한 확인
  if (!locals.user || locals.user.type !== 'admin') {
    return json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  await db();

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    
    if (!file) {
      return json({ success: false, message: '파일이 없습니다.' }, { status: 400 });
    }

    // 파일 데이터 읽기
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // 철 번째 시트 선택
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 엑셀 데이터를 JSON으로 변환
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // 헤더 제거 (철 번째 행이 헤더라고 가정)
    const headers = data.shift();
    
    console.log('Excel 헤더:', headers);
    console.log(`총 ${data.length}개의 데이터 행`);

    const results = {
      success: [],
      failed: [],
      total: data.length
    };

    // 사용자 등록을 위한 캐시
    const userCache = {};
    
    // 기존 사용자를 캐시에 로드
    const existingUsers = await User.find({});
    existingUsers.forEach(user => {
      userCache[user.name] = user;
    });

    // 각 행 처리
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // 비어있는 행 건너뛰기
      if (!row || row.length === 0 || !row[0]) {
        continue;
      }

      const [
        name,
        phone,
        salesperson,
        password,
        position
      ] = row;

      try {
        // 필수 필드 확인
        if (!name || !phone) {
          results.failed.push({
            row: i + 2, // 엑셀 행 번호 (헤더 포함)
            name,
            reason: '이름 또는 전화번호 누락'
          });
          continue;
        }

        // loginId 자동 생성
        let baseLoginId = name.toLowerCase().replace(/\s+/g, '');
        let loginId = baseLoginId;
        let suffix = '';
        let counter = 0;

        // 중복 확인
        while (await User.exists({ loginId }) || userCache[loginId]) {
          counter++;
          suffix = String.fromCharCode(64 + counter); // A, B, C, ...
          loginId = baseLoginId + suffix;
          
          if (counter > 26) {
            loginId = baseLoginId + counter;
          }
        }

        // 판매인 처리
        let parentId = null;
        let finalPosition = position || 'L';
        
        if (salesperson) {
          const parentUser = userCache[salesperson] || await User.findOne({ name: salesperson });
          
          if (parentUser) {
            parentId = parentUser.loginId || parentUser._id;
            
            // 자동 위치 할당 (입력이 없으면)
            if (!position) {
              const leftChild = await User.findOne({ 
                parentId: parentUser.loginId || parentUser._id, 
                position: 'L' 
              });
              const rightChild = await User.findOne({ 
                parentId: parentUser.loginId || parentUser._id, 
                position: 'R' 
              });
              
              if (!leftChild) {
                finalPosition = 'L';
              } else if (!rightChild) {
                finalPosition = 'R';
              } else {
                results.failed.push({
                  row: i + 2,
                  name,
                  reason: `${salesperson}님은 이미 2개의 하위 노드를 가지고 있습니다.`
                });
                continue;
              }
            }
          } else {
            console.log(`판매인 ${salesperson}을(를) 찾을 수 없습니다.`);
          }
        }

        // 비밀번호 처리 (기본값: 1234)
        const finalPassword = password || '1234';
        const passwordHash = await bcrypt.hash(finalPassword.toString(), 10);

        // 등급 계산 (기본 F1)
        let grade = 'F1';
        if (parentId) {
          // 좌우 둘 다 있으면 F2
          const leftChild = await User.findOne({ parentId, position: 'L' });
          const rightChild = await User.findOne({ parentId, position: 'R' });
          
          // 현재 등록하는 사용자가 두 번째 자식이 되는 경우
          if ((finalPosition === 'L' && rightChild) || 
              (finalPosition === 'R' && leftChild)) {
            // 부모를 F2로 업그레이드
            await User.findOneAndUpdate(
              { loginId: parentId },
              { grade: 'F2' }
            );
          }
        }

        // 사용자 생성
        const newUser = new User({
          name,
          loginId,
          passwordHash,
          phone: phone.toString(),
          parentId,
          position: parentId ? finalPosition : null,
          salesperson,
          grade,
          status: 'active',
          type: 'user'
        });

        const savedUser = await newUser.save();
        
        // 캐시에 추가
        userCache[name] = savedUser;
        userCache[loginId] = savedUser;

        results.success.push({
          row: i + 2,
          name,
          loginId,
          message: `등록 성공 (ID: ${loginId})`
        });

      } catch (error) {
        console.error(`Row ${i + 2} error:`, error);
        results.failed.push({
          row: i + 2,
          name,
          reason: error.message
        });
      }
    }

    // 등급 재계산
    console.log('\n등급 재계산 시작...');
    await recalculateAllGrades();

    return json({
      success: true,
      message: `총 ${results.total}개 중 ${results.success.length}개 성공, ${results.failed.length}개 실패`,
      results
    });

  } catch (error) {
    console.error('Excel import error:', error);
    return json({ 
      success: false, 
      message: '파일 처리 중 오류가 발생했습니다.',
      error: error.message 
    }, { status: 500 });
  }
}

/**
 * 모든 사용자의 등급 재계산
 */
async function recalculateAllGrades() {
  const users = await User.find({ type: { $ne: 'admin' } });
  
  for (const user of users) {
    const leftChild = await User.findOne({ parentId: user.loginId, position: 'L' });
    const rightChild = await User.findOne({ parentId: user.loginId, position: 'R' });
    
    let newGrade = 'F1';
    
    if (leftChild && rightChild) {
      // 좌우 자식이 모두 있으면 F2
      newGrade = 'F2';
      
      // 더 복잡한 등급 계산 로직을 여기에 추가할 수 있음
      // 예: F3은 F2가 2개 이상 있어야 함 등
    }
    
    if (user.grade !== newGrade) {
      await User.findByIdAndUpdate(user._id, { grade: newGrade });
      console.log(`${user.name}: ${user.grade} → ${newGrade}`);
    }
  }
}

/**
 * 엑셀 템플릿 다운로드
 */
export async function GET({ locals }) {
  // 관리자 권한 확인
  if (!locals.user || locals.user.type !== 'admin') {
    return json({ success: false, message: '권한이 없습니다.' }, { status: 401 });
  }

  // 샘플 엑셀 파일 생성
  const sampleData = [
    ['이름', '전화번호', '판매인', '비밀번호', '위치(L/R)'],
    ['홍길동', '010-1234-5678', '', '1234', ''],
    ['김철수', '010-2345-6789', '홍길동', '1234', 'L'],
    ['이영희', '010-3456-7890', '홍길동', '1234', 'R'],
    ['박민수', '010-4567-8901', '김철수', '1234', ''],
  ];

  // 워크북 생성
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(workbook, worksheet, '사용자등록');

  // 바이너리로 변환
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="user_import_template.xlsx"'
    }
  });
}