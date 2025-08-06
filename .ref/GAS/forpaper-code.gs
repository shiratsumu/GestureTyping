/**
 * *********************************************
 *  Google Apps Script  ——  受信（doPost）側
 *  ・JSON で送られてくるデータを Google Sheets へ追記
 *  ・type が "log"   → RawLogs  シート
 *            "form" → UserInfo シート
 * *********************************************
 */

/** スプレッドシートIDを自分のものに置き換えてください */
const SPREADSHEET_ID = '1wx6ulkyu7WUryuXg_LngaJBlnXqZVYySq8R1awWy8_Y';

/** シート名（ヘッダーは initializeSheets() で生成） */
const SHEET_LOG  = 'RawLogs';
const SHEET_USER = 'UserInfo';

/**
 * Web アプリの POST 入口
 *  - Content-Type: application/json を想定
 *  - 返り値はテキスト（200）
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);

    switch (data.type) {
      case 'log':
        appendLogRow(ss, data);
        break;

      case 'form':
        appendUserRow(ss, data);
        break;

      default:
        throw new Error(`Unknown payload type: ${data.type}`);
    }
    return ContentService.createTextOutput('OK')
                         .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    Logger.log(err);
    return ContentService.createTextOutput('ERROR: ' + err)
                         .setMimeType(ContentService.MimeType.TEXT);
  }
}

/** RawLogs 追加処理 */
function appendLogRow(ss, d) {
  const sheet = ss.getSheetByName(SHEET_LOG);
  sheet.appendRow([
    d.userId,
    d.sessionId,
    d.condition,      // 'A' or 'B'
    d.trial,          // 1–3
    d.t_select,       // ms epoch
    d.t_confirm,      // ms epoch
    d.character,
    d.errorFlag,      // 0 / 1
    d.latency         // ms
  ]);
}

/** UserInfo 追加処理 */
function appendUserRow(ss, d) {
  const sheet = ss.getSheetByName(SHEET_USER);
  sheet.appendRow([
    d.userId,
    new Date().toISOString(),
    d.age,
    d.gender,
    d.experience,            // "楽器;書道;なし" など
    d.handFatigue_A,
    d.mouthFatigue_A,
    d.handFatigue_B,
    d.mouthFatigue_B,
    d.preference,
    d.comments
  ]);
}