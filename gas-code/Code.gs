var SPREADSHEET_ID = '18_OqLH7IuTznPL7gmhC-bfFeS9n28hIL6-fQy089Qxc';
var DRIVE_FOLDER_NAME = '고방광고_신청이미지';

// SOLAPI 알림톡 템플릿 ID는 Script Property에 저장 (SOLAPI_TPL_BASIC / SOLAPI_TPL_PIN)
// API 키도 Script Property (SOLAPI_API_KEY / SOLAPI_API_SECRET / SOLAPI_PF_ID)
// 토스 결제링크는 알림톡 템플릿 '버튼(웹링크)'에 직접 박음 (빌리투어 방식)

// 토스 결제링크 (참고용 — 템플릿 버튼에 사용)
var PAY_LINK_BASIC = 'https://s.tosspayments.com/BnrvwJX8Jsg';  // 게시1회 (50,000 + VAT)
var PAY_LINK_PIN   = 'https://s.tosspayments.com/BnrvjvvM6g1';  // 게시+공지고정 (100,000 + VAT)

/* ───────────────────────────────────────────
   설정 시트 (A=라벨, B=값)
   1행 활성화 / 2행 시작일 / 3행 종료일
   4행 신청접수 알림 이메일 / 5행 결제완료 알림 이메일
   6행~ 상품 카탈로그(미래 어드민이 읽는 데이터)
─────────────────────────────────────────── */
function getSettings() {
  var s = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('설정');
  var data = s.getRange(1, 1, 5, 2).getValues();
  function emails(v) { return String(v || '').split(/[,\s]+/).filter(function(x){ return x; }).join(','); }
  return {
    active:    String(data[0][1]).trim(),
    startDate: data[1][1] ? new Date(data[1][1]) : null,
    endDate:   data[2][1] ? new Date(data[2][1]) : null,
    notifyEmails: emails(data[3][1]),  // 4행: 신청접수 알림 수신자
    paidEmails:   emails(data[4][1])   // 5행: 결제완료 알림 수신자
  };
}

function checkAccess() {
  var cfg = getSettings();
  var now = new Date();
  if (cfg.active !== 'ON') return { ok: false, reason: '현재 신청을 받지 않고 있어요.' };
  if (cfg.startDate) {
    cfg.startDate.setHours(0, 0, 0, 0);
    if (now < cfg.startDate) {
      var diff = Math.ceil((cfg.startDate - now) / 86400000);
      return { ok: false, reason: diff + '일 후 신청 가능합니다.' };
    }
  }
  if (cfg.endDate) {
    cfg.endDate.setHours(23, 59, 59, 999);
    if (now > cfg.endDate) return { ok: false, reason: '신청 기간이 마감되었어요.' };
  }
  return { ok: true };
}

function productLabel(code) { return code === 'B' ? '게시+공지고정' : '게시1회'; }

/* 광고 문구 자동 검수 — 검수메모(J)에 기록할 플래그 문자열 반환
   외부 링크는 허용. 사기·도박·대출 등 리스크/불법 소지 콘텐츠만 검수 주의로 플래그 */
function flagAdText_(text) {
  var t = String(text || '');
  var flags = [];
  var riskRe = /(도박|카지노|토토|배팅|베팅|사다리|사기|먹튀|대출|급전|일수|코인\s*리딩|리딩방|투자\s*리딩|불법|유흥|환전|성인)/;
  if (riskRe.test(t)) flags.push('리스크/불법 소지 키워드');
  if (t.replace(/\s/g, '').length < 10) flags.push('문구 과소(10자 미만)');
  return flags.length ? '⚠️ 검수확인 — ' + flags.join(' / ') : '✅ 자동검사 이상 없음';
}

/* ───────────────────────────────────────────
   신청 폼 저장
   신청 내역(12열):
     A=신청일시, B=결제완료일, C=상호, D=연락처, E=상품선택,
     F=광고문구, G=이미지URL, H=게시희망일,
     I=검수메모, J=결제링크발송(발송대기/발송하기/발송완료), K=발송시간, L=게시완료
─────────────────────────────────────────── */
function submitForm(formData) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('신청 내역');
  var now = new Date();
  var label = productLabel(formData.product);
  var imageUrl = '';
  if (formData.imageData) imageUrl = saveImageToDrive(formData);
  var memo = flagAdText_(formData.adText);  // 광고문구 자동 검수 플래그

  sheet.appendRow([
    now, '', formData.company || '', formData.phone || '', label,
    formData.adText || '', imageUrl, formData.publishDate || '',
    memo, '발송대기', '', '대기'
  ]);
  var r = sheet.getLastRow();
  sheet.getRange(r, 10).setValue('발송대기');
  sheet.getRange(r, 12).setValue('대기');

  try {
    var to = getSettings().notifyEmails || 'archoit94@neoflat.net';
    MailApp.sendEmail(to, '[고방광고] 새 신청 접수 — ' + (formData.company || '') + ' / ' + label, [
      '신청일시: ' + Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
      '상호: ' + (formData.company || ''),
      '연락처: ' + (formData.phone || ''),
      '상품: ' + label,
      '게시희망일: ' + (formData.publishDate || ''),
      '광고문구:\n' + (formData.adText || ''),
      '이미지: ' + imageUrl,
      '자동검수: ' + memo,
      '▶ 시트: https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID
    ].join('\n'));
  } catch (mailErr) {}

  return { success: true };
}

/* base64 dataURL → Drive 저장 → 공개 보기 URL */
function saveImageToDrive(formData) {
  try {
    var m = String(formData.imageData).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return '';
    var contentType = m[1];
    var bytes = Utilities.base64Decode(m[2]);
    var safeName = (formData.company || 'ad') + '_' +
      Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss') + '_' +
      (formData.imageName || 'image');
    var blob = Utilities.newBlob(bytes, contentType, safeName);
    var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER_NAME);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/uc?id=' + file.getId();
  } catch (err) {
    Logger.log('이미지 저장 실패: ' + err);
    return '';
  }
}

/* ───────────────────────────────────────────
   SOLAPI 인증 + 알림톡 발송
─────────────────────────────────────────── */
function getSolapiAuthHeader() {
  var props = PropertiesService.getScriptProperties();
  var date = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  var salt = Utilities.getUuid();
  var sig = Utilities.computeHmacSha256Signature(date + salt, props.getProperty('SOLAPI_API_SECRET'))
    .map(function(b){ return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  return 'HMAC-SHA256 apiKey=' + props.getProperty('SOLAPI_API_KEY') +
    ', date=' + date + ', salt=' + salt + ', signature=' + sig;
}

function sendAlimtalk(to, templateId, variables) {
  var pfId = PropertiesService.getScriptProperties().getProperty('SOLAPI_PF_ID');
  var payload = { message: { to: String(to).replace(/[^0-9]/g, ''),
    kakaoOptions: { pfId: pfId, templateId: templateId, variables: variables } } };
  var res = UrlFetchApp.fetch('https://api.solapi.com/messages/v4/send', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: getSolapiAuthHeader() },
    payload: JSON.stringify(payload), muteHttpExceptions: true });
  Logger.log('알림톡 응답: ' + res.getContentText());
  return res;
}

/* SOLAPI 설정 점검 — 속성 SET/MISSING 로그 (값 미노출) */
function checkSolapiConfig() {
  var p = PropertiesService.getScriptProperties();
  ['SOLAPI_API_KEY', 'SOLAPI_API_SECRET', 'SOLAPI_PF_ID', 'SOLAPI_TPL_BASIC', 'SOLAPI_TPL_PIN'].forEach(function(k) {
    Logger.log(k + ': ' + (p.getProperty(k) ? 'SET' : 'MISSING'));
  });
}

/* 알림톡 테스트 발송 — Script Property SOLAPI_TEST_PHONE 번호로 게시1회 템플릿 발송 */
function testAlimtalk() {
  var p = PropertiesService.getScriptProperties();
  var to = p.getProperty('SOLAPI_TEST_PHONE');
  var tpl = p.getProperty('SOLAPI_TPL_BASIC');
  if (!to || !tpl) { Logger.log('SOLAPI_TEST_PHONE / SOLAPI_TPL_BASIC 설정 필요'); return; }
  var res = sendAlimtalk(to, tpl, { '#{신청자}': '테스트' });
  Logger.log('테스트 발송 응답: ' + res.getContentText());
}

/* ───────────────────────────────────────────
   onEdit — 신청 내역 K열(11) '발송하기' → 결제링크 알림톡
─────────────────────────────────────────── */
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== '신청 내역') return;
  var row = e.range.getRow(), col = e.range.getColumn();
  if (row < 2) return;
  if (col === 10) handlePaymentSend(e, sheet, row);          // J 결제링크 발송
  else if (col === 2) handlePaymentComplete(e, sheet, row);  // B 결제완료일 입력 → 결제완료 알림
}

/* B열(2) 결제완료일 입력 시 → 결제완료 알림 메일 (결제완료 수신자에게) */
function handlePaymentComplete(e, sheet, row) {
  if (!e.range.getValue()) return;  // 비우면(취소) 무시
  var rowData = sheet.getRange(row, 1, 1, 12).getValues()[0];
  var company  = String(rowData[2] || '');  // C 상호
  var phone    = String(rowData[3] || '');  // D 연락처
  var label    = String(rowData[4] || '');  // E 상품선택
  var paidDate = e.range.getDisplayValue();
  try {
    var to = getSettings().paidEmails || 'lneleovvnae@neoflat.net';
    MailApp.sendEmail(to, '[고방광고] 결제 완료 — ' + company + ' / ' + label, [
      '결제가 완료 처리됐어요.',
      '',
      '결제완료일: ' + paidDate,
      '상호: ' + company,
      '연락처: ' + phone,
      '상품: ' + label,
      '▶ 시트: https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID
    ].join('\n'));
  } catch (err) {
    Logger.log('결제완료 알림 실패: ' + err);
  }
}

function handlePaymentSend(e, sheet, row) {
  if (String(e.range.getValue()).trim() !== '발송하기') return;
  if (sheet.getRange(row, 11).getValue()) { e.range.setValue('발송완료'); return; } // K 발송시간 가드
  var rowData = sheet.getRange(row, 1, 1, 12).getValues()[0];
  var company = String(rowData[2] || '').trim();          // C 상호
  var phone   = String(rowData[3]).replace(/[^0-9]/g, ''); // D 연락처
  var label   = String(rowData[4] || '').trim();           // E 상품선택
  var props = PropertiesService.getScriptProperties();
  var templateId = (label === '게시+공지고정')
    ? props.getProperty('SOLAPI_TPL_PIN')
    : props.getProperty('SOLAPI_TPL_BASIC');
  if (!templateId) {
    Logger.log('알림톡 템플릿 미설정 (SOLAPI_TPL_BASIC/PIN) — 발송 보류');
    e.range.setValue('발송대기');
    return;
  }
  try {
    sendAlimtalk(phone, templateId, { '#{신청자}': company });
    sheet.getRange(row, 11).setValue(Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'));
    sheet.getRange(row, 10).setValue('발송완료');
  } catch (err) {
    Logger.log('결제링크 알림톡 실패: ' + err);
    e.range.setValue('발송대기');
  }
}

/* ───────────────────────────────────────────
   시트 초기화 / 드롭박스 / 트리거 (수동 실행)
─────────────────────────────────────────── */
function ensureSheet(ss, name) { if (!ss.getSheetByName(name)) ss.insertSheet(name); }

function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureSheet(ss, '설정');
  ensureSheet(ss, '신청 내역');

  var s = ss.getSheetByName('설정');
  if (String(s.getRange(1, 1).getValue()).trim() === '') {
    s.getRange(1, 1, 5, 2).setValues([
      ['활성화(ON/OFF)', 'ON'],
      ['시작일', ''],
      ['종료일', ''],
      ['신청접수 알림 이메일', 'archoit94@neoflat.net'],
      ['결제완료 알림 이메일', 'lneleovvnae@neoflat.net']
    ]);
    // 상품 카탈로그(미래 어드민이 읽는 데이터) — 6행~
    s.getRange(6, 1, 3, 4).setValues([
      ['코드', '상품명', '금액(VAT포함)', '정책'],
      ['A', '게시1회', 55000, '[광고] 표기 업로드, 다음날 자정까지 유지'],
      ['B', '게시+공지고정', 110000, '게시 + 공지 고정 24시간']
    ]);
  }

  var apply = ss.getSheetByName('신청 내역');
  if (apply.getLastRow() === 0) {
    apply.appendRow(['신청일시', '결제완료일', '상호', '연락처', '상품선택',
      '광고문구', '이미지URL', '게시희망일',
      '검수메모', '결제링크 발송', '발송시간', '게시완료']);
    apply.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#f0f0f0');
  }
  setupDropdowns();
  Logger.log('시트 초기화 완료');
}

/* 설정 시트에 알림 이메일 행(4·5) 라벨 추가 — 1회 실행.
   B4=신청접수 수신자, B5=결제완료 수신자. 값은 사용자가 직접 입력. */
function setupEmails() {
  var s = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('설정');
  s.getRange(4, 1).setValue('신청접수 알림 이메일');
  if (!String(s.getRange(4, 2).getValue()).trim()) s.getRange(4, 2).setValue('archoit94@neoflat.net');
  s.getRange(5, 1).setValue('결제완료 알림 이메일');   // B5에 결제완료 수신자 직접 입력
  Logger.log('알림 이메일 라벨 추가 완료 — 결제완료 수신자를 B5에 입력하세요');
}

function setupDropdowns() {
  var apply = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('신청 내역');
  if (!apply) return;
  var range = apply.getRange(2, 10, 1000, 1); // J열 결제링크 발송
  range.clearDataValidations();
  range.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['발송대기', '발송하기'], false).build());
  var keep = apply.getConditionalFormatRules().filter(function(r){
    return r.getRanges().every(function(rng){ return rng.getColumn() !== 10; }); });
  apply.setConditionalFormatRules(keep.concat([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('발송대기')
      .setBackground('#F5F5F5').setFontColor('#9E9E9E').setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('발송하기')
      .setBackground('#FFF8E1').setFontColor('#F57F17').setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('발송완료')
      .setBackground('#E8F5E9').setFontColor('#388E3C').setRanges([range]).build()
  ]));
  var pub = apply.getRange(2, 12, 1000, 1); // L열 게시완료
  pub.clearDataValidations();
  pub.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['대기', '완료'], false).build());
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'onEdit') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(SpreadsheetApp.openById(SPREADSHEET_ID)).onEdit().create();
}

/* ───────────────────────────────────────────
   GAS 웹앱 엔드포인트
─────────────────────────────────────────── */
/* 컬럼 구조 변경 후 — 신청 내역 시트 초기화 + 새 헤더로 재생성 (수동 1회 실행)
   ⚠️ '신청 내역'의 모든 행·서식을 지웁니다(설정 시트는 보존). 실데이터 없을 때만 사용. */
function resetDataSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName('신청 내역');
  if (sh) {
    sh.clear();
    sh.clearConditionalFormatRules();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  }
  setupSheets();
  Logger.log('신청 내역 초기화 + 재생성 완료(12열)');
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var result;
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.action === 'checkAccess') {
      var a = checkAccess();
      result = { ok: a.ok, reason: a.reason || '' };
    } else if (payload.action === 'submitForm') {
      result = submitForm(payload);
    } else {
      result = { error: 'Unknown action: ' + payload.action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
