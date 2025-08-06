/* =========  CONFIG  ========= */
const SHEET_NAME = 'scores';
const COL_TIMESTAMP = 1, COL_SCORE = 2, COL_ID = 3;

/* =========  POST : スコア登録  ========= */
function doPost(e) {
  const { score, id } = JSON.parse(e.postData.contents);
  const sh   = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const lastRow = sh.getLastRow();
  const rows = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, 3).getValues() : [];

  // 既存 ID を検索
  const idx = rows.findIndex(r => r[COL_ID - 1] === id);
  if (idx === -1) {
    // 新規
    sh.appendRow([new Date(), score, id]);
  } else if (score < rows[idx][COL_SCORE - 1]) {
    // 高スコア更新
    sh.getRange(idx + 2, COL_TIMESTAMP, 1, 2)
      .setValues([[new Date(), score]]);
  }
  return json({ status: 'ok' });
}

/* =========  GET : ランキング取得  ========= */
function doGet(e) {
  try {
    // e.parameter が存在しない場合のフォールバック処理
    const params = e && e.parameter ? e.parameter : {};
    const limit = Number(params.limit) || 20;
    const id    = params.id;
    Logger.log(`doGet called with limit: ${limit}, id: ${id}`); // パラメータをログ出力

    const sh    = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    const lastRow = sh.getLastRow();
    const numColumnsToFetch = COL_ID - COL_TIMESTAMP + 1;
    const dataRange = lastRow > 1 ? sh.getRange(2, COL_TIMESTAMP, lastRow - 1, numColumnsToFetch) : null;
    const rows  = dataRange ? dataRange.getValues() : [];
    Logger.log(`Fetched ${rows.length} rows from sheet.`);

    const sorted = rows.sort((a, b) => a[COL_SCORE - 1] - b[COL_SCORE - 1]);
    const limited = sorted.slice(0, limit);
    const result = limited.map(toObject);
    Logger.log(`Processed ${result.length} rows for ranking.`);

    let playerRank = {};
    if (id) {
      const playerRow = sorted.find(r => r[COL_ID -1] === id);
      if (playerRow) {
        const rank = sorted.findIndex(r => r[COL_ID -1] === id) + 1;
        playerRank = { ...toObject(playerRow), rank };
        Logger.log(`Player ${id} found with rank ${rank}.`);
      } else {
        Logger.log(`Player ${id} not found.`);
      }
    }

    const json = JSON.stringify({
      rows: result,
      total: sorted.length,
      player: playerRank,
    });
    Logger.log(`Returning JSON: ${json}`);
    // setHeader の呼び出しを削除
    return ContentService.createTextOutput(json).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (err) {
    Logger.log(`Error in doGet: ${err.message} Stack: ${err.stack}`);
    // エラー時もJSON形式で返す
    const errorResponse = JSON.stringify({
      error: err.message,
      stack: err.stack, // デバッグ用にスタックトレースも含める
    });
    // setHeader の呼び出しを削除
    return ContentService.createTextOutput(errorResponse).setMimeType(
      ContentService.MimeType.JSON
    );
  }
}

/* =========  UTIL  ========= */
function toObject(row) {
  return {
    time: row[COL_TIMESTAMP - 1],
    score: row[COL_SCORE - 1],
    id: row[COL_ID - 1]
  };
}

function json(obj) {
  // ... (existing json function)
}