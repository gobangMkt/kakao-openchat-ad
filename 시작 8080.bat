@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 로컬 서버 시작 중... (이 창을 닫으면 서버가 꺼집니다)
start "고방광고 로컬서버" python -m http.server 8080 --bind 127.0.0.1
timeout /t 2 /nobreak >nul
start "" http://localhost:8080
