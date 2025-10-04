import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Admin } from './src/lib/server/models/Admin.js';

async function createAdmin() {
  try {
    // MongoDB 연결
    await mongoose.connect('mongodb://localhost:27017/nanumpay');
    console.log('MongoDB 연결 완료');

    // 기존 관리자 삭제
    await Admin.deleteMany({});
    console.log('기존 관리자 삭제 완료');

    // 비밀번호 해시 생성
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync('1234', salt);

    // 관리자 생성
    const admin = new Admin({
      loginId: '관리자',
      passwordHash: passwordHash,
      name: '관리자',
      permissions: ['full_access'],
      isActive: true
    });

    await admin.save();

    console.log('관리자 계정 생성 완료');
    console.log('로그인 정보:');
    console.log('  아이디: 관리자');
    console.log('  비밀번호: 1234');
    console.log('  ObjectId:', admin._id);

    await mongoose.disconnect();
    console.log('작업 완료');
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

createAdmin();