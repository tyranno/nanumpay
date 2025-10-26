# DEB 패키지 설치 테스트 결과

**일시**: 2025-10-26
**테스트 환경**: Ubuntu 개발 서버 (tyranno-VirtualBox)
**패키지**: nanumpay_0.0.1-20251026_amd64.deb

---

## ✅ 테스트 결과 요약

### 성공 항목
- ✅ DEB 패키지 빌드 (30MB)
- ✅ 패키지 설치
- ✅ systemd 서비스 등록
- ✅ 서비스 시작 및 포트 3100 바인딩
- ✅ HTTP 응답 정상 (302 redirect)
- ✅ 관리자 로그인 페이지 로드
- ✅ 파일 구조 확인
- ✅ DB 초기화 (관리자 계정)

### 주요 검증 사항
1. **패키지 구조**
   ```
   /opt/nanumpay/
   ├── nanumpay (실행파일, 113MB)
   ├── backups/ (백업 디렉토리)
   ├── db/ (데이터베이스)
   ├── logs/ (로그)
   ├── bin/
   └── tools/
   ```

2. **서비스 상태**
   ```bash
   $ sudo systemctl status nanumpay
   ● nanumpay.service - Nanumpay EXE service
        Loaded: loaded (/etc/systemd/system/nanumpay.service; enabled)
        Active: active (running)
      Main PID: 12770 (nanumpay)
   ```

3. **네트워크 바인딩**
   ```
   💿 Listening on http://localhost:3100
   ```

4. **HTTP 테스트**
   - `GET /`: 302 redirect to `/admin`
   - `GET /admin`: 200 OK (로그인 페이지)

---

## 🔧 테스트 과정

### 1. 빌드
```bash
$ node scripts/release-linux.cjs
[nginx] ✅ Nginx 설정 파일 포함 완료
dpkg-deb: building package 'nanumpay' in 'release/nanumpay_0.0.1-20251026_amd64.deb'
```

### 2. 설치
```bash
$ sudo dpkg -i release/nanumpay_0.0.1-20251026_amd64.deb
Unpacking nanumpay (0.0.1-20251026) ...
nanumpay (0.0.1-20251026) 설정하는 중입니다 ...
Created symlink /etc/systemd/system/multi-user.target.wants/nanumpay.service
Database initialization completed successfully
⚠️  Nginx not installed - application will run on port 3100
```

### 3. 서비스 시작
```bash
$ sudo systemctl start nanumpay
$ sudo systemctl status nanumpay
● nanumpay.service - Nanumpay EXE service
     Active: active (running) since Sun 2025-10-26 13:47:31 KST
```

### 4. 기능 확인
```bash
$ curl -I http://localhost:3100/
HTTP/1.1 302 Found
Location: /admin

$ curl -I http://localhost:3100/admin
HTTP/1.1 200 OK
Content-Type: text/html
```

---

## ⚠️ 발견된 이슈

### 1. 포트 충돌
**문제**: 개발 서버가 실행 중이면 포트 3100 충돌로 서비스 시작 실패
**증상**: `error: Failed to start server. Is port 3100 in use?`
**해결**: 개발 서버 종료 후 서비스 시작
```bash
$ pkill -9 -f "pnpm dev:web"
$ pkill -9 -f "vite"
$ sudo systemctl start nanumpay
```

### 2. Nginx 미설치 경고
**현상**: 패키지 설치 시 Nginx 미설치 경고 메시지
**메시지**: `⚠️  Nginx not installed - application will run on port 3100`
**영향**: 없음 (개발 테스트 환경에서는 정상)
**프로덕션 해결**: Nginx 설치 후 `sudo dpkg-reconfigure nanumpay`

---

## 📝 테스트 스크립트

자동화된 테스트 스크립트 작성: `scripts/test/test_deb_install.sh`

**주요 기능**:
1. DEB 패키지 빌드
2. 기존 패키지 제거
3. 새 패키지 설치
4. 서비스 시작 및 상태 확인
5. HTTP 응답 테스트
6. 포트 3100 바인딩 확인
7. 백업 기능 테스트 (선택적)

**실행 방법**:
```bash
$ bash scripts/test/test_deb_install.sh
```

---

## 🎯 다음 단계

### 개발 환경 (완료)
- ✅ DEB 패키지 빌드 검증
- ✅ 설치 스크립트 검증
- ✅ systemd 서비스 검증
- ✅ HTTP 서비스 검증

### 프로덕션 배포 전 체크리스트
1. **Nginx 설정**
   - [ ] Nginx 설치
   - [ ] 리버스 프록시 설정 검증
   - [ ] SSL/TLS 인증서 설정
   - [ ] 포트 80/443 바인딩 확인

2. **백업 기능**
   - [ ] 백업 도구 빌드 포함
   - [ ] FTP/S3 업로드 설정
   - [ ] Cron 작업 확인
   - [ ] 자동 백업 스케줄 확인

3. **보안**
   - [ ] 방화벽 설정
   - [ ] 파일 권한 확인
   - [ ] 관리자 비밀번호 변경
   - [ ] JWT 시크릿 키 변경

4. **성능**
   - [ ] 메모리 사용량 모니터링
   - [ ] CPU 사용량 확인
   - [ ] 로그 로테이션 설정
   - [ ] DB 연결 풀 설정

---

## 📚 관련 문서

- **빌드 스크립트**: [apps/web/scripts/release-linux.cjs](../apps/web/scripts/release-linux.cjs)
- **테스트 스크립트**: [scripts/test/test_deb_install.sh](../scripts/test/test_deb_install.sh)
- **Nginx 통합**: [docs/Nginx_리버스프록시_통합.md](./Nginx_리버스프록시_통합.md)

---

## 💡 서비스 관리 명령

```bash
# 상태 확인
sudo systemctl status nanumpay

# 시작
sudo systemctl start nanumpay

# 중지
sudo systemctl stop nanumpay

# 재시작
sudo systemctl restart nanumpay

# 로그 확인
sudo journalctl -u nanumpay -f

# 로그 (최근 100줄)
sudo journalctl -u nanumpay -n 100
```

---

## 🌐 접속 정보

- **URL**: http://localhost:3100
- **관리자 페이지**: http://localhost:3100/admin
- **기본 계정**:
  - 아이디: `관리자`
  - 비밀번호: `admin1234!!`

---

**작성**: 2025-10-26
**검증자**: tyranno
**상태**: ✅ 성공
