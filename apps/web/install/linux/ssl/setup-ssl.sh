#!/bin/bash

# Nanumpay SSL 설정 스크립트
# Let's Encrypt 인증서 자동 발급 및 nginx HTTPS 설정
# 사용법: sudo ./setup-ssl.sh <도메인> [이메일] [--redirect]
# 예시: sudo ./setup-ssl.sh www.nanumpay.xyz admin@nanumasset.com
#       sudo ./setup-ssl.sh www.nanumasset.com admin@nanumasset.com --redirect

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 기본값
DEFAULT_EMAIL="admin@nanumasset.com"
REDIRECT_MODE=false

# 인자 파싱
DOMAIN=""
EMAIL=""

for arg in "$@"; do
    case $arg in
        --redirect)
            REDIRECT_MODE=true
            ;;
        *)
            if [ -z "$DOMAIN" ]; then
                DOMAIN="$arg"
            elif [ -z "$EMAIL" ]; then
                EMAIL="$arg"
            fi
            ;;
    esac
done

EMAIL="${EMAIL:-$DEFAULT_EMAIL}"

if [ -z "$DOMAIN" ]; then
    echo -e "${RED}❌ 도메인을 지정해주세요${NC}"
    echo ""
    echo "사용법: sudo $0 <도메인> [이메일] [--redirect]"
    echo ""
    echo "옵션:"
    echo "  --redirect    HTTP를 HTTPS로 리다이렉트 (기본: HTTP+HTTPS 병행)"
    echo ""
    echo "예시:"
    echo "  sudo $0 www.nanumpay.xyz                        # 테스트 서버 (HTTP+HTTPS 병행)"
    echo "  sudo $0 www.nanumasset.com --redirect          # 정식 서버 (HTTPS만)"
    exit 1
fi

# Root 권한 확인
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ 이 스크립트는 root 권한이 필요합니다${NC}"
    echo -e "${YELLOW}   sudo $0 $DOMAIN 로 실행해주세요${NC}"
    exit 1
fi

echo "========================================="
echo "  Nanumpay SSL 설정"
echo "========================================="
echo ""
echo -e "${BLUE}도메인:${NC} $DOMAIN"
echo -e "${BLUE}이메일:${NC} $EMAIL"
if [ "$REDIRECT_MODE" = true ]; then
    echo -e "${BLUE}모드:${NC} HTTPS 전용 (HTTP 리다이렉트)"
else
    echo -e "${BLUE}모드:${NC} HTTP + HTTPS 병행"
fi
echo ""

# 1. certbot 설치 확인
echo -e "${BLUE}[1/6]${NC} Certbot 설치 확인 중..."

if ! command -v certbot >/dev/null 2>&1; then
    echo -e "${YELLOW}   Certbot이 설치되어 있지 않습니다. 설치를 진행합니다...${NC}"

    apt-get update -qq
    apt-get install -y certbot python3-certbot-nginx

    echo -e "${GREEN}✓${NC} Certbot 설치 완료"
else
    echo -e "${GREEN}✓${NC} Certbot이 이미 설치되어 있습니다"
fi
echo ""

# 2. nginx 실행 확인
echo -e "${BLUE}[2/6]${NC} Nginx 상태 확인 중..."

if ! systemctl is-active --quiet nginx; then
    echo -e "${YELLOW}   Nginx가 실행되지 않고 있습니다. 시작합니다...${NC}"
    systemctl start nginx
fi
echo -e "${GREEN}✓${NC} Nginx가 실행 중입니다"
echo ""

# 3. 기존 HTTP nginx 설정 백업 및 준비
echo -e "${BLUE}[3/6]${NC} Nginx 설정 준비 중..."

NGINX_CONF="/etc/nginx/sites-available/nanumpay"
NGINX_CONF_BACKUP="/etc/nginx/sites-available/nanumpay.http.backup"

# 기존 설정 백업
if [ -f "$NGINX_CONF" ]; then
    cp "$NGINX_CONF" "$NGINX_CONF_BACKUP"
    echo -e "${GREEN}✓${NC} 기존 설정 백업 완료: $NGINX_CONF_BACKUP"
fi

# 임시 HTTP 설정 (certbot 인증용)
cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # certbot 인증용
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # 프록시
    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# nginx 테스트 및 리로드
nginx -t
systemctl reload nginx
echo -e "${GREEN}✓${NC} Nginx 설정 준비 완료"
echo ""

# 4. Let's Encrypt 인증서 발급
echo -e "${BLUE}[4/6]${NC} Let's Encrypt 인증서 발급 중..."
echo ""

# 기존 인증서 확인
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo -e "${YELLOW}   기존 인증서가 있습니다. 갱신을 시도합니다...${NC}"
    certbot renew --cert-name "$DOMAIN" --quiet || true
else
    echo -e "${BLUE}   새 인증서 발급 중...${NC}"
    certbot certonly \
        --nginx \
        --non-interactive \
        --agree-tos \
        --email "$EMAIL" \
        -d "$DOMAIN"
fi

# 인증서 발급 확인
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo -e "${RED}❌ 인증서 발급 실패${NC}"
    echo -e "${YELLOW}   다음을 확인하세요:${NC}"
    echo "   1. 도메인 DNS가 이 서버 IP를 가리키는지 확인"
    echo "   2. 포트 80이 외부에서 접근 가능한지 확인"
    echo "   3. 방화벽 설정 확인"

    # 원래 설정 복구
    if [ -f "$NGINX_CONF_BACKUP" ]; then
        cp "$NGINX_CONF_BACKUP" "$NGINX_CONF"
        systemctl reload nginx
    fi
    exit 1
fi

echo -e "${GREEN}✓${NC} 인증서 발급 완료"
echo ""

# 5. HTTP+HTTPS 또는 HTTPS 전용 nginx 설정 적용
echo -e "${BLUE}[5/6]${NC} Nginx 설정 적용 중..."

if [ "$REDIRECT_MODE" = true ]; then
    # HTTPS 전용 모드 (HTTP → HTTPS 리다이렉트)
    cat > "$NGINX_CONF" << EOF
# Nanumpay HTTPS 설정 (HTTPS 전용)
# 도메인: $DOMAIN
# 생성일: $(date '+%Y-%m-%d %H:%M:%S')

# HTTP -> HTTPS 리다이렉트
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # certbot 갱신용
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # HTTPS로 리다이렉트
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS 서버
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    # SSL 인증서
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL 설정 (권장 보안 설정)
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # 최신 프로토콜만 사용
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (선택사항 - 주석 해제하면 활성화)
    # add_header Strict-Transport-Security "max-age=63072000" always;

    # 최대 업로드 크기 (Excel 파일 업로드용)
    client_max_body_size 10M;

    # 로그
    access_log /var/log/nginx/nanumpay-access.log;
    error_log /var/log/nginx/nanumpay-error.log;

    # Proxy 설정
    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;
}
EOF
    echo -e "${GREEN}✓${NC} HTTPS 전용 모드 설정 완료 (HTTP → HTTPS 리다이렉트)"
else
    # HTTP + HTTPS 병행 모드
    cat > "$NGINX_CONF" << EOF
# Nanumpay HTTP + HTTPS 병행 설정
# 도메인: $DOMAIN
# 생성일: $(date '+%Y-%m-%d %H:%M:%S')

# HTTP 서버 (80 포트)
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # certbot 갱신용
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # 최대 업로드 크기 (Excel 파일 업로드용)
    client_max_body_size 10M;

    # 로그
    access_log /var/log/nginx/nanumpay-access.log;
    error_log /var/log/nginx/nanumpay-error.log;

    # Proxy 설정 (HTTP)
    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;
}

# HTTPS 서버 (443 포트)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN;

    # SSL 인증서
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL 설정 (권장 보안 설정)
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # 최신 프로토콜만 사용
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # 최대 업로드 크기 (Excel 파일 업로드용)
    client_max_body_size 10M;

    # 로그
    access_log /var/log/nginx/nanumpay-access.log;
    error_log /var/log/nginx/nanumpay-error.log;

    # Proxy 설정 (HTTPS)
    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;
}
EOF
    echo -e "${GREEN}✓${NC} HTTP + HTTPS 병행 모드 설정 완료"
fi

# nginx 테스트 및 리로드
if nginx -t 2>&1 | grep -q "successful"; then
    systemctl reload nginx
    echo -e "${GREEN}✓${NC} Nginx 설정 적용 완료"
else
    echo -e "${RED}❌ Nginx 설정 오류${NC}"
    nginx -t

    # 원래 설정 복구
    if [ -f "$NGINX_CONF_BACKUP" ]; then
        cp "$NGINX_CONF_BACKUP" "$NGINX_CONF"
        systemctl reload nginx
    fi
    exit 1
fi
echo ""

# 6. 자동 갱신 설정 (systemd timer 또는 cron)
echo -e "${BLUE}[6/6]${NC} 인증서 자동 갱신 설정 중..."

# certbot 자동 갱신 확인 및 설정
if systemctl list-timers 2>/dev/null | grep -q certbot; then
    echo -e "${GREEN}✓${NC} Certbot systemd 타이머가 활성화되어 있습니다"
elif [ -f "/etc/cron.d/certbot" ]; then
    echo -e "${GREEN}✓${NC} Certbot cron job이 설정되어 있습니다"
else
    # systemd timer 설치 시도
    if [ -d "/etc/systemd/system" ]; then
        # certbot 갱신 서비스
        cat > "/etc/systemd/system/certbot-renew.service" << EOF
[Unit]
Description=Certbot Renewal
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --post-hook "systemctl reload nginx"
EOF

        # certbot 갱신 타이머 (매일 2번: 오전 3시, 오후 3시)
        cat > "/etc/systemd/system/certbot-renew.timer" << EOF
[Unit]
Description=Run certbot renewal twice daily

[Timer]
OnCalendar=*-*-* 03:00:00
OnCalendar=*-*-* 15:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
EOF

        systemctl daemon-reload
        systemctl enable certbot-renew.timer
        systemctl start certbot-renew.timer
        echo -e "${GREEN}✓${NC} Certbot systemd 타이머 설정 완료 (매일 2회 갱신 확인)"
    else
        # cron으로 대체
        CRON_FILE="/etc/cron.d/certbot-nanumpay"
        echo "0 3,15 * * * root /usr/bin/certbot renew --quiet --post-hook 'systemctl reload nginx'" > "$CRON_FILE"
        chmod 644 "$CRON_FILE"
        echo -e "${GREEN}✓${NC} 인증서 자동 갱신 cron 설정 완료 (매일 2회)"
    fi
fi
echo ""

# 결과 출력
echo "========================================="
echo -e "${GREEN}  SSL 설정 완료!${NC}"
echo "========================================="
echo ""
echo -e "${GREEN}✓${NC} 인증서 위치: /etc/letsencrypt/live/$DOMAIN/"
echo -e "${GREEN}✓${NC} Nginx 설정: $NGINX_CONF"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}접속 정보:${NC}"
if [ "$REDIRECT_MODE" = true ]; then
    echo "  URL: https://$DOMAIN (HTTP는 자동 리다이렉트)"
else
    echo "  HTTP: http://$DOMAIN"
    echo "  HTTPS: https://$DOMAIN"
fi
echo "  관리자: https://$DOMAIN/admin"
echo ""
echo -e "${BLUE}인증서 관리:${NC}"
echo "  상태 확인: sudo certbot certificates"
echo "  수동 갱신: sudo certbot renew"
echo "  갱신 테스트: sudo certbot renew --dry-run"
echo "  만료일 확인: sudo openssl x509 -enddate -noout -in /etc/letsencrypt/live/$DOMAIN/cert.pem"
echo ""
echo -e "${BLUE}모드 변경:${NC}"
if [ "$REDIRECT_MODE" = true ]; then
    echo "  HTTP+HTTPS 병행으로 변경: sudo $0 $DOMAIN"
else
    echo "  HTTPS 전용으로 변경: sudo $0 $DOMAIN --redirect"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}브라우저에서 https://$DOMAIN 로 접속하세요!${NC}"
echo ""
