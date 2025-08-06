// ログ送信用クラス
import { config } from './env.js';

export class Logger {
  constructor() {
    this.userId = this.generateUserId();
    this.sessionId = this.generateSessionId();
  }

  // ユーザーIDを生成（永続化）
  generateUserId() {
    let userId = localStorage.getItem('research_userId');
    if (!userId) {
      userId = this.safeRandomId();
      localStorage.setItem('research_userId', userId);
    }
    return userId;
  }

  // セッションIDを生成
  generateSessionId() {
    return this.safeRandomId();
  }

  // 安全なランダムID生成
  safeRandomId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return (
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    );
  }

  // 実験ログを送信 (type: 'log')
  async logTrialData(data) {
    const payload = {
      type: 'log',
      userId: this.userId,
      sessionId: this.sessionId,
      condition: data.condition,    // 'A' or 'B'
      trial: data.trial,           // 1-3
      t_select: data.t_select,     // 選択時刻 (ms epoch)
      t_confirm: data.t_confirm,   // 確定時刻 (ms epoch)
      character: data.character,   // 入力文字
      errorFlag: data.errorFlag,   // 0 / 1
      latency: data.latency        // レイテンシ (ms)
    };

    return this.sendToGAS(payload);
  }

  // 即座にログを送信する関数
  async writeLog(row) {
    /* row = {
         type: 'log',
         userId, sessionId, condition, trial,
         t_select, t_confirm, character, errorFlag, latency
      } */
    
    // 必要なフィールドを補完
    const payload = {
      type: 'log',
      userId: row.userId || this.userId,
      sessionId: row.sessionId || this.sessionId,
      condition: row.condition,
      trial: row.trial,
      t_select: row.t_select,
      t_confirm: row.t_confirm,
      character: row.character,
      errorFlag: row.errorFlag || 0,
      latency: row.latency
    };
    
    return this.sendToGAS(payload);
  }

  // グローバル関数としてエクスポート
  static async writeLogGlobal(row) {
    const loggerInstance = window.logger || new Logger();
    return loggerInstance.writeLog(row);
  }

  // ユーザー情報を送信 (type: 'form')
  async logUserInfo(data) {
    const payload = {
      type: 'form',
      userId: this.userId,
      age: data.age,
      gender: data.gender,
      experience: data.experience,           // "楽器;書道;なし" など
      handFatigue_A: data.handFatigue_A,
      mouthFatigue_A: data.mouthFatigue_A,
      handFatigue_B: data.handFatigue_B,
      mouthFatigue_B: data.mouthFatigue_B,
      preference: data.preference,
      comments: data.comments
    };

    return this.sendToGAS(payload);
  }

  // GASにデータを送信
  async sendToGAS(payload) {
    try {
      const url = config.CORS_PROXY + config.GAS_URL;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // レスポンスをJSONとして解析を試行
      let result;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
        
        // GASからの成功/失敗を確認
        if (result.status === 'error') {
          throw new Error(`GAS Error: ${result.message}`);
        }
        
        console.log('Data sent successfully:', result);
        return result;
      } else {
        // テキストレスポンスの場合（後方互換性）
        result = await response.text();
        
        if (result.includes('ERROR')) {
          throw new Error(`GAS Error: ${result}`);
        }
        
        console.log('Data sent successfully:', result);
        return { status: 'success', message: result };
      }

    } catch (error) {
      console.error('Failed to send data to GAS:', error);
      throw error;
    }
  }

  // ゲッター
  getUserId() {
    return this.userId;
  }

  getSessionId() {
    return this.sessionId;
  }
}

// シングルトンインスタンス
export const logger = new Logger();

// グローバルアクセス用
window.logger = logger;

// グローバル関数
window.writeLog = function(row) {
  return logger.writeLog(row);
};
