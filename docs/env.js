// 環境設定ファイル
export const config = {
  // Google Apps Script のWebアプリURL
  GAS_URL: "https://script.google.com/macros/s/AKfycbycWIHf9XHg65fJ1ivWzneBNFOYJ06JWEwInMr4YHiM6x7Vq3zKfgzUJNcaq4pTI04vrQ/exec",
  
  // CORS対応用プロキシ（開発時のみ）
  CORS_PROXY: "https://corsproxy.io/?",
  
  // 実験設定
  EXPERIMENT: {
    CONDITIONS: ['A', 'B'], // 実験条件
    TRIALS_PER_CONDITION: 3, // 各条件での試行回数
    PHRASES_FILE: '../PhraseSets/phrases2.txt' // フレーズファイルのパス
  },
  
  // UI設定
  UI: {
    TIMEOUT_MS: 30000, // タイムアウト時間（30秒）
    FEEDBACK_DURATION_MS: 1000 // フィードバック表示時間
  }
};

// グローバルアクセス用
window.GAS_ENDPOINT = config.CORS_PROXY + config.GAS_URL;
