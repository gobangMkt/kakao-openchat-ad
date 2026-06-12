# 고방 오픈카톡방 광고 구매 신청폼

## 개요
고방 오픈카톡방("청년 주거·주택·자금 지원 정보공유", 1,178명)의 **스폰서 게시 광고**를 광고주가 직접 신청하는 폼. 제출 → 검수(방 규칙 위반 확인) → 통과 시 토스 결제링크 카카오 알림톡 자동발송 → 결제 → [광고] 표기 게시. 6/25~ **고방 광고 어드민**의 구매자 페이지 피처로 흡수 예정.

## 코어
- **흐름**: 신청폼(정적) → GAS `doPost` → 구글시트 `신청 내역` 저장 + 광고이미지 Drive 저장 → 운영자 시트 검수 → `결제링크 발송` 드롭박스 '발송하기' → `onEdit` → SOLAPI 알림톡(상품별 토스 결제링크).
- **상품 2종 (VAT 포함)**: 게시 1회 `55,000` / 게시 1회 + 공지고정 24h `110,000`.
- **상품·검수기준 데이터화**: 구글시트 `설정`탭 6행~ 상품 카탈로그 → 미래 어드민이 그대로 읽음.
- **기술 스택**: HTML + Vanilla JS / Google Apps Script + 구글시트 / SOLAPI / 토스페이먼츠 결제링크 / GitHub Pages.
- **시트 구조**: `설정`(활성여부·기간·알림이메일·상품카탈로그) / `신청 내역`(13열: 신청일시·결제완료일·상호·연락처·상품·광고문구·이미지URL·게시희망일·사업자정보·검수메모·결제링크발송·발송시간·게시완료).
- **빌리투어 대비**: 지점검증·유튜브크롤링·작업내역 탭 제거. 광고이미지 1장 Drive 업로드 추가.

## 실행 / 배포
- **로컬 미리보기**: `시작 8080.bat` → `http://localhost:8080`
- **신청폼 배포**: GitHub Pages (`master` push 자동) — `https://gobangmkt.github.io/kakao-openchat-ad/`
- **백엔드(GAS)**: clasp로 배포 완료. 재배포 시 `gas-code/`에서 `clasp push` → `clasp create-deployment`.
  - scriptId `1sgpvphwXyq5iNram5nIM8sENe7rwMYVZkUhR4jKZW0b0r3Wd7d10J5Dn`
  - 웹앱 `/exec` (index.html `GAS_URL`에 반영됨): `https://script.google.com/macros/s/AKfycbx4XYws7n2YJUsib-6kRzOCdivAL9moaNXMjGKPIIAFhRYKmkDzkgopyRuhlJpgg30E/exec`
  - ⚠️ clasp가 기존 시트에 바인딩 못 해 빈 컨테이너 시트(`1opKfQ…`)가 자동생성됨. 코드는 `openById('18_Oq…')`로 실제 시트를 직접 지정하므로 무관(빈 시트는 방치 가능).
- **바인딩(실데이터) 시트**: `18_OqLH7IuTznPL7gmhC-bfFeS9n28hIL6-fQy089Qxc`
- **시크릿 (GAS Script Property, 값 미기재)**: `SOLAPI_API_KEY` · `SOLAPI_API_SECRET` · `SOLAPI_PF_ID`. 토스 결제링크는 `Code.gs` 상수 `PAY_LINK_BASIC/PIN` + 알림톡 템플릿 버튼.
- **초기화**: GAS 편집기에서 `setupSheets()` → `setupTrigger()` 1회 실행(최초 실행 시 권한 승인).

## 배포링크
- 신청폼: `https://gobangmkt.github.io/kakao-openchat-ad/`
- GitHub repo: `https://github.com/gobangMkt/kakao-openchat-ad`
- 노션 허브: "고방 광고상품" (`6703826995438395956001d30bc52f09`) — 관련 URL·결제링크 상품내용 단일 진실 소스

## 운영자 선행작업 (코드와 별개)
1. 토스 결제링크 2종 생성(55,000 / 110,000) → `Code.gs` 상수 + 알림톡 템플릿 버튼 반영
2. SOLAPI 카카오 알림톡 템플릿 2종 등록 → `TEMPLATE_PAYMENT_BASIC/PIN` 기입
3. GAS Script Property 3종 등록
4. `clasp deploy` → `index.html` `GAS_URL` 기입 → 재푸시
5. `setupSheets()` + `setupTrigger()` 실행
6. E2E: 폼 제출 → 시트 1행 + Drive 이미지 → '발송하기' → 알림톡 수신 확인
