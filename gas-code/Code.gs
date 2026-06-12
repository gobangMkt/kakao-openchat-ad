var SPREADSHEET_ID = '18_OqLH7IuTznPL7gmhC-bfFeS9n28hIL6-fQy089Qxc';
var DRIVE_FOLDER_NAME = '고방광고_신청이미지';

// SOLAPI 템플릿 (등록 후 채움) — 토스링크는 버튼에 박힘 (빌리투어 방식)
var TEMPLATE_PAYMENT_BASIC = '';  // 게시1회 결제요청
var TEMPLATE_PAYMENT_PIN   = '';  // 게시+공지고정 결제요청

// 토스 결제링크 (생성 후 채움) — 참고용
var PAY_LINK_BASIC = '';  // 게시1회 55,000
var PAY_LINK_PIN   = 'https://s.tosspayments.com/BnrvjvvM6g1';  // 게시+공지고정 110,000

/* ───────────────────────────────────────────
   설정 시트 (A=라벨, B=값)
   1행 활성화 / 2행 시작일 / 3행 종료일 / 4행 알림이메일
   6행~ 상품 카탈로그(미래 어드민이 읽는 데이터)
─────────────────────────────────────────── */
function getSettings() {
  var s = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('설정');
  var data = s.getRange(1, 1, 4, 2).getValues();
  return {
    active:    String(data[0][1]).trim(),
    startDate: data[1][1] ? new Date(data[1][1]) : null,
    endDate:   data[2][1] ? new Date(data[2][1]) : null,
    notifyEmails: String(data[3][1] || '')
      .split(/[,\s]+/).filter(function(x){ return x; }).join(',')
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

/* ───────────────────────────────────────────
   신청 폼 저장
   신청 내역(13열):
     A=신청일시, B=결제완료일, C=상호, D=연락처, E=상품선택,
     F=광고문구, G=이미지URL, H=게시희망일, I=사업자정보,
     J=검수메모, K=결제링크발송(발송대기/발송하기/발송완료), L=발송시간, M=게시완료
─────────────────────────────────────────── */
function submitForm(formData) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('신청 내역');
  var now = new Date();
  var label = productLabel(formData.product);
  var imageUrl = '';
  if (formData.imageData) imageUrl = saveImageToDrive(formData);

  sheet.appendRow([
    now, '', formData.company || '', formData.phone || '', label,
    formData.adText || '', imageUrl, formData.publishDate || '',
    formData.bizInfo || '', '', '발송대기', '', '대기'
  ]);
  var r = sheet.getLastRow();
  sheet.getRange(r, 11).setValue('발송대기');
  sheet.getRange(r, 13).setValue('대기');

  try {
    var to = getSettings().notifyEmails || 'archoit94@neoflat.net';
    MailApp.sendEmail(to, '[고방광고] 새 신청 — ' + (formData.company || '') + ' / ' + label, [
      '신청일시: ' + Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
      '상호: ' + (formData.company || ''),
      '연락처: ' + (formData.phone || ''),
      '상품: ' + label,
      '게시희망일: ' + (formData.publishDate || ''),
      '광고문구:\n' + (formData.adText || ''),
      '이미지: ' + imageUrl,
      '사업자정보: ' + (formData.bizInfo || ''),
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

/* ───────────────────────────────────────────
   onEdit — 신청 내역 K열(11) '발송하기' → 결제링크 알림톡
─────────────────────────────────────────── */
function onEdit(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== '신청 내역') return;
  var row = e.range.getRow(), col = e.range.getColumn();
  if (row < 2) return;
  if (col === 11) handlePaymentSend(e, sheet, row);
}

function handlePaymentSend(e, sheet, row) {
  if (String(e.range.getValue()).trim() !== '발송하기') return;
  if (sheet.getRange(row, 12).getValue()) { e.range.setValue('발송완료'); return; } // L 발송시간 가드
  var rowData = sheet.getRange(row, 1, 1, 13).getValues()[0];
  var company = String(rowData[2] || '').trim();          // C 상호
  var phone   = String(rowData[3]).replace(/[^0-9]/g, ''); // D 연락처
  var label   = String(rowData[4] || '').trim();           // E 상품선택
  var templateId = label === '게시+공지고정' ? TEMPLATE_PAYMENT_PIN : TEMPLATE_PAYMENT_BASIC;
  try {
    sendAlimtalk(phone, templateId, { '#{신청자}': company });
    sheet.getRange(row, 12).setValue(Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'));
    sheet.getRange(row, 11).setValue('발송완료');
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
    s.getRange(1, 1, 4, 2).setValues([
      ['활성화(ON/OFF)', 'ON'],
      ['시작일', ''],
      ['종료일', ''],
      ['알림 이메일', 'archoit94@neoflat.net']
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
      '광고문구', '이미지URL', '게시희망일', '사업자정보',
      '검수메모', '결제링크 발송', '발송시간', '게시완료']);
    apply.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#f0f0f0');
  }
  setupDropdowns();
  Logger.log('시트 초기화 완료');
}

function setupDropdowns() {
  var apply = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('신청 내역');
  if (!apply) return;
  var range = apply.getRange(2, 11, 1000, 1); // K열 결제링크 발송
  range.clearDataValidations();
  range.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['발송대기', '발송하기'], false).build());
  var keep = apply.getConditionalFormatRules().filter(function(r){
    return r.getRanges().every(function(rng){ return rng.getColumn() !== 11; }); });
  apply.setConditionalFormatRules(keep.concat([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('발송대기')
      .setBackground('#F5F5F5').setFontColor('#9E9E9E').setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('발송하기')
      .setBackground('#FFF8E1').setFontColor('#F57F17').setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('발송완료')
      .setBackground('#E8F5E9').setFontColor('#388E3C').setRanges([range]).build()
  ]));
  var pub = apply.getRange(2, 13, 1000, 1); // M열 게시완료
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
