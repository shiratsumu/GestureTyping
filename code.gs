/* =========  CONFIG  ========= */
const SHEET_NAME = 'scores';
const COL_TIMESTAMP = 1, COL_SCORE = 2, COL_ID = 3;

/* =========  POST : スコア登録  ========= */
function doPost(e) {
  const { score, id } = JSON.parse(e.postData.contents);
  const sh   = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues(); // 全データ

  // 既存 ID を検索
  const idx = rows.findIndex(r => r[COL_ID - 1] === id);
  if (idx === -1) {
    // 新規
    sh.appendRow([new Date(), score, id]);
  } else if (score > rows[idx][COL_SCORE - 1]) {
    // 高スコア更新
    sh.getRange(idx + 2, COL_TIMESTAMP, 1, 2)
      .setValues([[new Date(), score]]);
  }
  return json({ status: 'ok' });
}

/* =========  GET : ランキング取得  ========= */
function doGet(e) {
  const limit = Number(e.parameter.limit) || 20;
  const sh    = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const rows  = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();

  const sorted = rows
    .sort((a, b) => b[COL_SCORE - 1] - a[COL_SCORE - 1])
    .slice(0, limit)
    .map(r => ({ time: r[0], score: r[1], id: r[2] }));
  return json(sorted);
}

/* =========  UTIL  ========= */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
         .setMimeType(ContentService.MimeType.JSON)
         .setHeader('Access-Control-Allow-Origin', '*');
}