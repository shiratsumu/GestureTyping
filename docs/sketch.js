import { initializeLandmarkers, startDetection, stopDetection, faceResults, gestureResults } from "./mediapipe_manager.js";
import { submitScore, loadRanking } from "./script.js";

// ▼▼▼【重要な修正】MediaPipe関数をグローバルに公開（冗長チェック追加） ▼▼▼
// practice.htmlで既に公開されている場合は重複を避ける
if (typeof window.initializeLandmarkers === 'undefined') {
    window.initializeLandmarkers = initializeLandmarkers;
    console.log("initializeLandmarkers exported to global scope from sketch.js");
} else {
    console.log("initializeLandmarkers already available in global scope");
}

// カメラ制御用のグローバル変数
let globalCam = null;
let globalCameraEnabled = false;
let globalCameraInitialized = false;

// グローバルカメラ制御関数
window.startCamera = async function() {
    console.log("Global startCamera called");
    
    // sketch関数内のstartCamera関数を呼び出す
    if (typeof window.sketchStartCamera === 'function') {
        window.sketchStartCamera();
        return;
    }
    
    // フォールバック：直接的なカメラ制御
    if (globalCameraInitialized && globalCam && globalCam.elt && globalCam.elt.srcObject) {
        // 既に初期化済みの場合は再開のみ
        globalCam.elt.play();
        startDetection(globalCam.elt);
        globalCameraEnabled = true;
        return;
    }
    
    console.log("Starting camera initialization...");
    
    // 新規初期化
    stopDetection();
    const constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 } } };
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (globalCam && globalCam.elt) {
            globalCam.elt.srcObject = stream;
            globalCam.elt.play();
            startDetection(globalCam.elt);
            globalCameraEnabled = true;
            globalCameraInitialized = true;
            console.log("Camera started successfully");
        } else {
            console.error("globalCam not available");
        }
    } catch (err) {
        console.error('Global camera start error', err);
        throw err;
    }
};

window.stopCamera = function() {
    console.log("Global stopCamera called");
    stopDetection();
    if (globalCam && globalCam.elt && globalCam.elt.srcObject) {
        globalCam.elt.srcObject.getTracks().forEach(track => track.stop());
        globalCam.elt.srcObject = null;
    }
    globalCameraEnabled = false;
};

console.log("MediaPipe functions exported to global scope");
// ▲▲▲【重要な修正】▲▲▲

const sketch = (p) => {
    
    // ▼▼▼【ここから追加】デバッグログ用の変数を追加します ▼▼▼
    let lastLogTime = 0; // 最後にログを出力した時間
    const LOG_INTERVAL = 1000; // ログを出力する間隔 (1000ms = 1秒)
    let lastDetectedCode = "N/A"; // 最後に検出されたコードを保持
    let lastDetectedChar = "N/A"; // 最後に検出された文字を保持
    // ▲▲▲【ここまで追加】▲▲▲

    // ▼▼▼【ここから追加】入力モード管理の変数を追加 ▼▼▼
    // 入力モードの設定（外部から変更可能）
    let inputMode = "lip-click"; // "lip-click" または "time-hold"
    
    // グローバルに定数をエクスポート
    window.INPUT_MODE = {
        LIP_CLICK: "lip-click",    // リップクリックモード（口の開閉で確定）
        TIME_HOLD: "time-hold"     // 時間経過モード（一定時間保持で確定）
    };
    const INPUT_MODE = window.INPUT_MODE;
    
    // 時間経過モード用の設定
    const GESTURE_HOLD_TIME = 1000; // 1秒間同じジェスチャーを保持する時間
    
    // ▼▼▼【ここから追加】B方式用青い背景効果の変数 ▼▼▼
    let blueEffectEndTime = 0; // 青い背景効果の終了時刻
    const BLUE_EFFECT_DURATION = 200; // 青い背景効果の持続時間（ミリ秒）
    // ▲▲▲【ここまで追加】▲▲▲
    
    // ▼▼▼【追加】実験用タイミング変数 ▼▼▼
    let trialStartTime = null; // 試行開始時刻
    let gestureStartTime = null; // ジェスチャー開始時刻
    let isPracticeMode = false; // 練習モードフラグ
    
    // ▼▼▼【ここから追加】絶対時間での開始時刻記録 ▼▼▼
    let absoluteGameStartTime = null; // ゲーム開始の絶対時刻（Date.now()）
    let absoluteTrialStartTime = null; // 試行開始の絶対時刻（Date.now()）
    // ▲▲▲【ここまで追加】▲▲▲
    
    // 初期化関数
    function initializeTrialTiming() {
        if (!trialStartTime) {
            trialStartTime = Date.now();
            absoluteTrialStartTime = trialStartTime; // 統一
            console.log("Trial timing initialized:", trialStartTime);
        }
    }
    // ▲▲▲【追加】▲▲▲
    
    // 外部からモードを変更するためのグローバル関数
    window.setInputMode = function(mode) {
        if (mode === INPUT_MODE.LIP_CLICK || mode === INPUT_MODE.TIME_HOLD) {
            inputMode = mode;
            console.log(`Input mode changed to: ${mode}`);
            
            // モード変更時に時間関連の変数をリセット
            if (mode === INPUT_MODE.TIME_HOLD) {
                lastCharTime = p.millis();
            }
        } else {
            console.error(`Invalid input mode: ${mode}. Use "${INPUT_MODE.LIP_CLICK}" or "${INPUT_MODE.TIME_HOLD}"`);
        }
    };
    
    // 現在のモードを取得する関数
    window.getInputMode = function() {
        return inputMode;
    };

    // 練習モードを設定する関数
    window.setPracticeMode = function(enabled) {
        isPracticeMode = enabled;
        console.log(`Practice mode set to: ${enabled}`);
    };

    // 目標フレーズを設定する関数（実験用）
    window.setTargetPhrase = function(phrase) {
        sample_texts = [phrase];
        currentTargetText = phrase;
        currentInputIndex = 0;
        isErrorState = false;
        errorCharCount = 0;
        
        // 試行開始時刻を記録
        trialStartTime = Date.now();
        gestureStartTime = null;
        
        // UIを更新
        const messageElem = document.querySelector('#message');
        const inputDisplay = document.querySelector('#typing-input');
        if (messageElem) messageElem.innerText = phrase;
        if (inputDisplay) inputDisplay.innerHTML = '';
        
        console.log(`Target phrase set to: "${phrase}", trial started at: ${trialStartTime}`);
    };
    // ▲▲▲【ここまで追加】▲▲▲

    // ▼▼▼【ここから追加】フレーズファイル読み込み機能 ▼▼▼
    let phrasesPool = []; // 読み込んだフレーズのプール
    
    /**
     * PhraseSets/phrases2.txtファイルからフレーズを読み込む関数
     */
    async function loadPhrasesFromFile() {
        try {
            const response = await fetch('../PhraseSets/phrases2.txt');
            if (!response.ok) {
                throw new Error(`ファイルの読み込みに失敗しました: ${response.status}`);
            }
            const text = await response.text();
            
            // 行ごとに分割し、空行を除去
            const phrases = text.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
            
            if (phrases.length === 0) {
                throw new Error('フレーズファイルが空です');
            }
            
            phrasesPool = phrases;
            console.log(`${phrases.length}個のフレーズを読み込みました`);
            return phrases;
        } catch (error) {
            console.error('フレーズファイルの読み込みエラー:', error);
            // フォールバック：デフォルトのフレーズを使用
            phrasesPool = ["the quick brown fox jumps over the lazy dog"];
            console.log('デフォルトフレーズを使用します');
            return phrasesPool;
        }
    }
    
    /**
     * phrasesPoolからランダムにフレーズを選択する関数
     */
    function getRandomPhrase() {
        if (phrasesPool.length === 0) {
            return "the quick brown fox jumps over the lazy dog"; // フォールバック
        }
        const randomIndex = Math.floor(Math.random() * phrasesPool.length);
        return phrasesPool[randomIndex];
    }
    // ▲▲▲【ここまで追加】▲▲▲

    // ====import from GestureTyping====
    //---gesuturetypingのための変数---
    // 入力サンプル文章 
    let sample_texts = [
        "the quick brown fox jumps over the lazy dog",
    ];

    function getCode(left_gesture, right_gesture) {
        let code_array = {
            "1": 1,
            "2": 2,
            "3": 3,
            "4": 4,
            "5": 5,
            "6": 0,
        }
        let left_code = code_array[left_gesture] || 0; // left_gestureがcode_arrayにない場合は0を使用
        let right_code = code_array[right_gesture] || 0; // right_gestureがcode_arrayにない場合は0を使用
        // left_codeとright_codeを文字として結合
        return String(left_code) + String(right_code);
    }   

    function getCharacter(code) {
        const codeToChar = {
            "11": "a", "12": "b", "13": "c", "14": "d", "15": "e", "10": "f",
            "21": "g", "22": "h", "23": "i", "24": "j", "25": "k", "20": "l",
            "31": "m", "32": "n", "33": "o", "34": "p", "35": "q", "30": "r",
            "41": "s", "42": "t", "43": "u", "44": "v", "45": "w", "40": "x",
            "51": "y", "52": "z", "00": " ", "55": "backspace"
        };
        return codeToChar[code] || "";
    }

    // ゲームの状態を管理する変数
    // welcome: ウェルカムページ表示中
    // loading: モデル読み込み中
    // ready: カメラ起動・ジェスチャー検出待機中
    // countdown: カウントダウン中
    // playing: ゲーム中
    // finished: ゲーム終了後
    let game_mode = {
        now: "welcome", // 初期状態はウェルカムページ
        previous: "welcome",
    };
    window.game_mode = game_mode;
    let game_start_time = 0;
    
    // カウントダウン関連の変数
    let countdownStartTime = 0;
    let countdownDuration = 3000; // 3秒のカウントダウン
    let firstGestureDetected = false; // 初回ジェスチャー検出フラグ


    // ▼▼▼【ここから修正】文字を大きく表示するための変数を修正 ▼▼▼
    let displayedChar = ''; // 画面に大きく表示する文字
    // ▲▲▲【ここまで修正】▲▲▲


    // ジェスチャー入力の連続防止(デバウンズ)　用
    // When gestures are found, the following function is called. The detection results are stored in results.
    let lastChar = ""; // 入力候補の文字を保持
    
    // ▼▼▼【ここから修正】時間経過モード用の変数を追加 ▼▼▼
    let lastCharTime = 0; // 時間経過モード用：最後に文字が変化した時間
    // ▲▲▲【ここまで修正】▲▲▲

    // ▼▼▼【ここから追加】口の開閉状態を追跡する変数を追加 ▼▼▼
    let isMouthOpen = false;    // 現在のフレームで口が開いているか
    let wasMouthOpen = false;   // 前のフレームで口が開いていたか
    // ▲▲▲【ここまで追加】▲▲▲

    // ▼▼▼【ここから追加】文字表示UI用の変数 ▼▼▼
    let currentTargetText = ""; // 現在のターゲットテキスト
    let currentInputIndex = 0;  // 現在の入力位置
    let isErrorState = false;   // エラー状態フラグ
    let errorCharCount = 0; // 間違えた文字の数
    
    // ▼▼▼【ここから追加】最後の文字入力結果を記録する変数 ▼▼▼
    let lastCharacterResult = {
        character: '',
        isError: false,
        timestamp: 0
    };
    
    // ▼▼▼【ここから追加】時間経過モード用の統一された時間管理 ▼▼▼
    let lastGestureChangeTime = 0; // 最後にジェスチャーが変化した絶対時刻（Date.now()）
    // ▲▲▲【ここまで追加】▲▲▲
    // ▲▲▲【ここまで追加】▲▲▲
    // ▲▲▲【ここまで追加】▲▲▲


    //=========================
    //original機能の追加
    // ▼▼▼【ここから追加】新しい関数を作成 ▼▼▼
    /**
     * 入力された文字を画面中央上部に大きく表示する関数
     */
    function drawLargeCharacter() {
        // ▼▼▼【ここから修正】時間経過による表示制御を削除し、常に表示するように変更 ▼▼▼
        if (displayedChar) {
            p.push();
            // テキスト描画時は座標系を元に戻す
            // p.translate(p.width, 0);
            // p.scale(-1, 1);
            
            p.fill(255, 255, 255); // アルファ値を固定
            p.stroke(0);           // アルファ値を固定
            p.strokeWeight(5);
            p.textSize(150);
            p.textAlign(p.CENTER, p.CENTER);
            let charToDraw = (displayedChar === "backspace") ? "⌫" : displayedChar;
            p.text(charToDraw, p.width / 2, p.height / 4);
            p.pop();
        }
        // ▲▲▲【ここまで修正】▲▲▲
    }
    // ▲▲▲【ここまで追加】▲▲▲

    // ▼▼▼【ここから追加】文字表示UIを更新する関数 ▼▼▼
    /**
     * 右側UIに文字入力状況を表示する関数
     * 現在入力すべき文字とその前後2文字ずつ（計5文字）を表示
     */
    function updateCharacterDisplay() {
        const charList = document.querySelector('#char-list');
        const characterDisplay = document.querySelector('#character-display');
        
        if (!charList || !characterDisplay) return;
        
        // 現在のターゲットテキストを取得
        if (currentTargetText !== sample_texts[0]) {
            currentTargetText = sample_texts[0] || "";
            currentInputIndex = 0;
        }
        
        // 入力済み文字数を取得
        const inputDisplayDiv = document.querySelector('#typing-input');
        if (inputDisplayDiv) {
            currentInputIndex = 0; // 初期化
            const childNodes = inputDisplayDiv.childNodes;
            for (let i = 0; i < childNodes.length; i++) {
                const node = childNodes[i];
                // 正しく入力された文字（エラークラスが付与されていないSPAN要素）のみをカウント
                if (node.nodeName === "SPAN" && node.classList && !node.classList.contains('error-char')) {
                    currentInputIndex += node.textContent.length;
                }
            }
        } else {
            currentInputIndex = 0; // 要素が見つからない場合のフォールバック
        }
        
        // UIをクリア
        charList.innerHTML = '';
        
        if (currentTargetText && game_mode.now === "playing") {
            // 表示範囲を計算（現在の文字の前後2文字ずつ、計5文字）
            const startIndex = Math.max(0, currentInputIndex - 2);
            const endIndex = Math.min(currentTargetText.length, currentInputIndex + 3);
            
            // 指定範囲の文字を表示
            for (let i = startIndex; i < endIndex; i++) {
                const char = currentTargetText[i];
                const charContainer = document.createElement('div');
                charContainer.className = 'text-center mb-4';
                
                // 文字要素を作成
                const charElement = document.createElement('div');
                
                // 文字の状態に応じてスタイルを設定
                if (i < currentInputIndex) {
                    // 入力済み（正解）の文字 - 緑色で大きく
                    charElement.className = 'text-green-600 text-3xl font-bold';
                    charElement.style.opacity = '0.8';
                } else if (i === currentInputIndex) {
                    // 次に入力する文字 - エラー状態かどうかで色を変える
                    if (isErrorState) {
                        charElement.className = 'text-red-600 text-6xl font-black';
                        charElement.style.opacity = '1';
                    } else {
                        charElement.className = 'text-gray-800 text-6xl font-black';
                        charElement.style.opacity = '1';
                    }
                } else {
                    // 今後入力する文字 - 大きめサイズ
                    charElement.className = 'text-gray-600 text-3xl font-normal';
                    charElement.style.opacity = '0.7';
                }
                
                // スペースの場合は視覚的に表示
                charElement.textContent = char === ' ' ? '␣' : char;
                charContainer.appendChild(charElement);
                
                // ジェスチャーコード情報を表示（現在入力すべき文字以外は薄く表示）
                const codeElement = document.createElement('div');
                const gestureCode = getGestureCodeForChar(char);
                if (gestureCode) {
                    codeElement.textContent = `(${gestureCode})`;
                    if (i === currentInputIndex) {
                        codeElement.className = 'text-gray-600 text-lg font-medium mt-2';
                    } else {
                        codeElement.className = 'text-gray-400 text-lg font-light mt-2';
                        codeElement.style.opacity = '0.6';
                    }
                    charContainer.appendChild(codeElement);
                }
                
                charList.appendChild(charContainer);
            }
            
            // UIを表示
            characterDisplay.classList.remove('hidden');
        } else {
            // ターゲットテキストがない場合やゲーム中でない場合はUIを非表示
            characterDisplay.classList.add('hidden');
        }
    }
    
    /**
     * 文字に対応するジェスチャーコードを取得する関数
     */
    function getGestureCodeForChar(char) {
        // 文字からコードへの逆引き
        const charToCode = {};
        const codeToChar = {
            "11": "a", "12": "b", "13": "c", "14": "d", "15": "e", "10": "f",
            "21": "g", "22": "h", "23": "i", "24": "j", "25": "k", "20": "l",
            "31": "m", "32": "n", "33": "o", "34": "p", "35": "q", "30": "r",
            "41": "s", "42": "t", "43": "u", "44": "v", "45": "w", "40": "x",
            "51": "y", "52": "z", "00": " ", "55": "backspace"
        };
        
        // 逆引きマップを作成
        for (const [code, character] of Object.entries(codeToChar)) {
            charToCode[character] = code;
        }
        
        const code = charToCode[char];
        if (code) {
            const leftGesture = code[0];
            const rightGesture = code[1];
            return `${leftGesture},${rightGesture}`;
        }
        return null;
    }
    // ▲▲▲【ここまで追加】▲▲▲




let cam; // p5.jsのウェブカメラオブジェクト

    // カメラのオンオフを管理
    let cameraEnabled = false; // 初期状態ではカメラをOFFに変更
    let cameraInitialized = false; // カメラが初期化済みかどうか

    // カメラ描画パラメータ（座標変換用）
    let cameraDrawParams = {
        drawX: 0,
        drawY: 0,
        drawWidth: 0,
        drawHeight: 0
    };

    function startCamera() {
        if (cameraInitialized) {
            // 既に初期化済みの場合は再開のみ
            if (cam && cam.elt && cam.elt.srcObject) {
                cam.elt.play();
                startDetection(cam.elt);
                cameraEnabled = true;
                globalCameraEnabled = true;
                return;
            }
        }
        
        stopDetection();
        const constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 } } };
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            if (cam && cam.elt) {
                cam.elt.srcObject = stream;
                cam.elt.play();
            }
            startDetection(cam.elt);
            cameraEnabled = true;
            globalCameraEnabled = true;
            cameraInitialized = true;
            globalCameraInitialized = true;
            console.log("Local camera started successfully");
        }).catch(err => {
            console.error('camera start error', err);
        });
    }

    function stopCamera() {
        stopDetection();
        if (cam && cam.elt && cam.elt.srcObject) {
            cam.elt.srcObject.getTracks().forEach(track => track.stop());
            cam.elt.srcObject = null;
        }
        cameraEnabled = false;
        globalCameraEnabled = false;
    }

    // --- 安定化（平滑化）のための設定 ---
    let smoothedFaceLandmarks = null;
    const FACE_SMOOTHING_FACTOR = 0.4;
    // ---

    // --- 口の開閉判定の設定 ---
    const UPPER_LIP_INDEX = 13;
    const LOWER_LIP_INDEX = 14;
    const MOUTH_OPEN_THRESHOLD = 0.01;
    // ---

    // p5.jsの初期化関数
    p.setup = async () => {
        // カメラの標準解像度に基づいてキャンバスサイズを設定
        // MediaPipeは640x480での処理に最適化されているため、この比率を維持
        const targetWidth = 640;
        const targetHeight = 480;
        
        // 画面全体にキャンバスを描画
        let canvasWidth = window.innerWidth;
        let canvasHeight = window.innerHeight;
        
        p.createCanvas(canvasWidth, canvasHeight);
        
        // HTMLのvideo要素を作成（非表示）
        // カメラのサイズは標準解像度に固定し、キャンバスでスケーリング
        cam = p.createCapture(p.VIDEO);
        cam.size(targetWidth, targetHeight); // 固定解像度でカメラを設定
        cam.hide();

        // グローバルカメラ参照を設定
        globalCam = cam;

        // カメラは初期状態では起動しない
        cameraEnabled = false;

        // デバッグ: サイズ情報をコンソールに出力
        console.log(`Canvas size: ${p.width} x ${p.height}`);
        console.log(`Camera target size: ${targetWidth} x ${targetHeight}`);
        
        // 初期のカメラ描画パラメータを設定
        cameraDrawParams.drawX = 0;
        cameraDrawParams.drawY = 0;
        cameraDrawParams.drawWidth = canvasWidth;
        cameraDrawParams.drawHeight = canvasHeight;        // ページ遷移のイベントリスナーを設定
        setupPageNavigation();

        // ▼▼▼【修正点 1/3】UI要素を取得し、初期化処理を分離します ▼▼▼
        const loadingUI = document.querySelector('#loading-ui');
        const startUI = document.querySelector('#start-ui');
        const errorUI = document.querySelector('#error-ui');
        const errorMessage = document.querySelector('#error-message');
        const cameraToggle = document.querySelector('#cameraToggleBtn');
        const camOnIcon = document.querySelector('#cameraOnIcon');
        const camOffIcon = document.querySelector('#cameraOffIcon');

        if (cameraToggle) {
            cameraToggle.addEventListener('click', () => {
                if (cameraEnabled) {
                    camOnIcon.classList.add('hidden');
                    camOffIcon.classList.remove('hidden');
                    stopCamera();
                } else {
                    camOffIcon.classList.add('hidden');
                    camOnIcon.classList.remove('hidden');
                    startCamera();
                }
            });
        }
        
        // 初期状態ではゲームページは非表示
        game_mode.now = "welcome";
        
        // ▼▼▼【ここから追加】初期フレーズ読み込み ▼▼▼
        // ページ読み込み時にフレーズファイルを読み込んでおく
        loadPhrasesFromFile().then(() => {
            console.log("初期フレーズ読み込み完了");
        });
        // ▲▲▲【ここまで追加】▲▲▲
        
        // MediaPipeモデルの初期化はゲーム開始時に遅延実行
        console.log("Setup complete - waiting for game start");
        
        // リスタートボタンの処理を追加
        setupRestartButton();
    };

    // ゲームリセット関数
    function resetGameState() {
        // ゲームの状態をリセット
        game_mode.now = "ready";
        firstGestureDetected = false;
        game_start_time = 0;
        countdownStartTime = 0;

        // sample_texts を初期状態に戻す
        // ▼▼▼【ここから修正】ランダムフレーズを選択するように変更 ▼▼▼
        if (phrasesPool.length > 0) {
            const randomPhrase = getRandomPhrase();
            sample_texts = [randomPhrase];
            console.log(`リセット時の選択フレーズ: "${randomPhrase}"`);
        } else {
            // フレーズプールが空の場合のフォールバック
            sample_texts = [
                "the quick brown fox jumps over the lazy dog",
            ];
        }
        // ▲▲▲【ここまで修正】▲▲▲

        // ゲーム変数をリセット
        displayedChar = '';
        lastChar = '';
        lastCharTime = 0; // 時間経過モード用の変数もリセット
        isMouthOpen = false;
        wasMouthOpen = false;

        // ▼▼▼【ここから追加】絶対時間での変数もリセット ▼▼▼
        lastGestureChangeTime = 0;
        gestureStartTime = null;
        absoluteGameStartTime = null;
        absoluteTrialStartTime = null;
        // ▲▲▲【ここまで追加】▲▲▲

        // エラー状態もリセット
        isErrorState = false;
        errorCharCount = 0;
        currentInputIndex = 0;
        currentTargetText = "";

        // UI要素をリセット
        const messageElem = document.querySelector('#message');
        const typingInput = document.querySelector('#typing-input');
        const characterDisplay = document.querySelector('#character-display');
        const recordElem = document.querySelector('#record');
        
        if (messageElem) messageElem.innerText = "Press the start button to begin";
        if (typingInput) typingInput.textContent = "";
        if (characterDisplay) characterDisplay.classList.add('hidden');
        if (recordElem) recordElem.textContent = "";

        // エラーメッセージを隠す
        hideErrorMessage();
        
        // 文字表示UIを更新
        updateCharacterDisplay();

        console.log("Game state completely reset.");
    }

    // リスタートボタンの設定
    function setupRestartButton() {
        const restartButton = document.querySelector('#restartButton');
        if (restartButton) {
            restartButton.onclick = () => {
                // ゲーム状態を完全にリセット
                resetGameState();

                // UIの状態をリセット
                const uiOverlay = document.querySelector('#ui-overlay');
                const gameUI = document.querySelector('#game-ui');
                const loadingUI = document.querySelector('#loading-ui');
                const startUI = document.querySelector('#start-ui');
                
                // スタート画面を表示し、ゲームUIを隠す
                if (uiOverlay) uiOverlay.classList.remove('hidden'); 
                if (gameUI) gameUI.classList.add('hidden');
                if (loadingUI) loadingUI.classList.add('hidden');
                if (startUI) startUI.classList.remove('hidden');
                
                console.log("Game restarted to ready state.");
            };
        }
    }

    // ページナビゲーションの設定
    function setupPageNavigation() {
        const startChallengeBtn = document.querySelector('#startChallengeBtn');
        const backToWelcomeBtn = document.querySelector('#backToWelcomeBtn');
        const welcomePage = document.querySelector('#welcome-page');
        const gamePage = document.querySelector('#game-page');

        // Start Challengeボタンのイベントリスナー
        if (startChallengeBtn) {
            startChallengeBtn.addEventListener('click', async () => {
                // ウェルカムページを非表示、ゲームページを表示
                welcomePage.classList.add('hidden');
                gamePage.classList.remove('hidden');
                
                // ゲームモードを変更
                game_mode.now = "loading";
                
                // MediaPipeモデルの初期化
                const loadingUI = document.querySelector('#loading-ui');
                const startUI = document.querySelector('#start-ui');
                const errorUI = document.querySelector('#error-ui');
                const errorMessage = document.querySelector('#error-message');
                
                loadingUI.classList.remove('hidden');
                startUI.classList.add('hidden');
                errorUI.classList.add('hidden');
                
                try {
                    await initializeLandmarkers();
                    
                    // ▼▼▼【ここから追加】フレーズを読み込んでランダムに選択 ▼▼▼
                    await loadPhrasesFromFile();
                    const randomPhrase = getRandomPhrase();
                    sample_texts = [randomPhrase];
                    console.log(`選択されたフレーズ: "${randomPhrase}"`);
                    // ▲▲▲【ここまで追加】▲▲▲
                    
                    // 成功した場合
                    loadingUI.classList.add('hidden');
                    startUI.classList.remove('hidden');
                    
                    // カメラを起動
                    startCamera();
                    game_mode.now = "ready";
                    firstGestureDetected = false;
                    
                } catch (err) {
                    // 失敗した場合
                    loadingUI.classList.add('hidden');
                    errorUI.classList.remove('hidden');
                    errorMessage.innerText = err.message;
                    game_mode.now = "error";
                }
            });
        }

        // 戻るボタンのイベントリスナー
        if (backToWelcomeBtn) {
            backToWelcomeBtn.addEventListener('click', () => {
                // ゲーム状態を完全にリセット
                resetGameState();
                
                // ゲーム状態をウェルカムに変更
                game_mode.now = "welcome";
                
                // ページ遷移
                gamePage.classList.add('hidden');
                welcomePage.classList.remove('hidden');
                
                // カメラを停止
                stopCamera();
                
                // UIをリセット
                const uiOverlay = document.querySelector('#ui-overlay');
                const gameUI = document.querySelector('#game-ui');
                const loadingUI = document.querySelector('#loading-ui');
                const startUI = document.querySelector('#start-ui');
                const characterDisplay = document.querySelector('#character-display');
                
                if (uiOverlay) uiOverlay.classList.remove('hidden');
                if (gameUI) gameUI.classList.add('hidden');
                if (loadingUI) loadingUI.classList.remove('hidden');
                if (startUI) startUI.classList.add('hidden');
                if (characterDisplay) characterDisplay.classList.add('hidden');
                
                console.log("Returned to welcome page with complete reset");
            });
        }
        
        // ▼▼▼【グローバル関数の公開】sketch関数内のカメラ制御関数を外部から参照可能にする ▼▼▼
        window.sketchStartCamera = startCamera;
        window.sketchStopCamera = stopCamera;
        // ▲▲▲【グローバル関数の公開】▲▲▲
    }

    // ウィンドウリサイズ時の処理
    p.windowResized = () => {
        // 画面全体にキャンバスをリサイズ
        p.resizeCanvas(window.innerWidth, window.innerHeight);
        
        // カメラサイズは固定解像度のまま維持
        // cam.size(p.width, p.height); // この行を削除
    };

    // p5.jsの毎フレーム描画関数
    p.draw = () => {
        // ウェルカムページの場合は描画しない
        if (game_mode.now === "welcome") {
            p.background(127);
            return;
        }
        
        // 画面を反転させて鏡のように見せる
        p.translate(p.width, 0);
        p.scale(-1, 1);
        
        // 背景にカメラ映像を描画
        p.background(127);
        if (cam && (cameraEnabled || globalCameraEnabled)) {
            // カメラ映像を画面全体に描画（アスペクト比を保ちながらスケーリング）
            let camAspect = 640 / 480; // カメラのアスペクト比
            let canvasAspect = p.width / p.height;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (canvasAspect > camAspect) {
                // キャンバスの方が横長の場合
                drawHeight = p.height;
                drawWidth = drawHeight * camAspect;
                drawX = (p.width - drawWidth) / 2;
                drawY = 0;
            } else {
                // キャンバスの方が縦長の場合
                drawWidth = p.width;
                drawHeight = drawWidth / camAspect;
                drawX = 0;
                drawY = (p.height - drawHeight) / 2;
            }
            
            // 描画パラメータを保存（座標変換で使用）
            cameraDrawParams.drawX = drawX;
            cameraDrawParams.drawY = drawY;
            cameraDrawParams.drawWidth = drawWidth;
            cameraDrawParams.drawHeight = drawHeight;
            
            // デバッグ情報（最初の数フレームのみ）
            if (p.frameCount <= 5) {
                console.log(`Camera draw params: x=${drawX}, y=${drawY}, w=${drawWidth}, h=${drawHeight}`);
                console.log(`Canvas size: ${p.width} x ${p.height}`);
            }
            
            p.image(cam, drawX, drawY, drawWidth, drawHeight);
        }
        
        // 描画のために再度反転（文字などが反転しないように）
        p.translate(p.width, 0);
        p.scale(-1, 1);

        // ゲーム状態に応じた処理
        if (game_mode.now === "ready") {
            // ジェスチャー検出待機中
            initializeTrialTiming(); // タイミング初期化
            checkForFirstGesture();
        } else if (game_mode.now === "countdown") {
            // カウントダウン表示
            drawCountdown();
        } else if (game_mode.now === "playing") {
            // 通常のゲーム処理
            // 顔のランドマークを描画
            drawFaceLandmarks();
            
            // 手のランドマークとジェスチャーを描画
            processAndDrawHandGestures();

            // ====import from GestureTyping====
            drawGameUI(); // ゲームのUIを描画
            // ===================

            // ▼▼▼【ここに追加】新しく作成した文字描画関数を呼び出す ▼▼▼
            drawLargeCharacter();
            // ▲▲▲【ここまで追加】▲▲▲

            // ▼▼▼【ここに追加】文字表示UIを更新 ▼▼▼
            updateCharacterDisplay();
            // ▲▲▲【ここまで追加】▲▲▲
        }

        // ▼▼▼【ここに追加】毎フレーム、ログ出力関数を呼び出します ▼▼▼
        // logDebugInfo(); // デバッグ用のためコメントアウト
    };

    //=================
    //ここまで編集可能(drawを書き換えないのは不可能なのでここまで編集可能と一旦定義する)
    //=================

    /**
     * 初回ジェスチャー検出をチェックする関数
     */
    function checkForFirstGesture() {
        if (!firstGestureDetected && gestureResults && gestureResults.gestures) {
            // 手のジェスチャーが検出されているかチェック
            for (let i = 0; i < gestureResults.gestures.length; i++) {
                const gesture = gestureResults.gestures[i];
                if (gesture && gesture.length > 0) {
                    // ジェスチャーが検出された
                    firstGestureDetected = true;
                    countdownStartTime = p.millis();
                    game_mode.now = "countdown";
                    
                    // UIの更新
                    const startUI = document.querySelector('#start-ui');
                    startUI.classList.add('hidden');
                    
                    console.log("First gesture detected - starting countdown");
                    return;
                }
            }
        }
        
        // ジェスチャー検出待機中の表示
        p.push();
        // // テキスト描画時は座標系を元に戻す
        // p.translate(p.width, 0);
        // p.scale(-1, 1);
        
        p.fill(255, 255, 255, 180);
        p.noStroke();
        p.rect(0, 0, p.width, p.height);
        
        p.fill(0);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(20);
        // p.text("手のジェスチャーを\n検出してください", p.width/2, p.height/2);
        p.pop();
    }

    /**
     * カウントダウンを描画する関数
     */
    function drawCountdown() {
        const elapsed = p.millis() - countdownStartTime;
        const remaining = countdownDuration - elapsed;
        
        if (remaining <= 0) {
            // カウントダウン終了 - ゲーム開始
            game_mode.now = "playing";
            game_start_time = p.millis();
            
            // ▼▼▼【ここから修正】既存のログ形式でゲーム開始時刻を記録 ▼▼▼
            absoluteGameStartTime = Date.now();
            
            // ゲーム開始ログを既存形式で送信（実験用）
            const gameStartEvent = new CustomEvent('characterConfirmed', {
                detail: {
                    character: 'GAME_STARTED',
                    t_select: absoluteGameStartTime,
                    t_confirm: absoluteGameStartTime, // 同じ時間を設定
                    errorFlag: 0,
                    latency: 0 // ゲーム開始なのでlatencyは0
                }
            });
            window.dispatchEvent(gameStartEvent);
            // ▲▲▲【ここまで修正】▲▲▲
            
            // タイミング初期化
            initializeTrialTiming();
            
            // ゲームUIを表示
            const uiOverlay = document.querySelector('#ui-overlay');
            const gameUI = document.querySelector('#game-ui');
            uiOverlay.classList.add('hidden');
            gameUI.classList.remove('hidden');
            
            // ターゲットテキストを設定
            document.querySelector('#message').innerText = sample_texts[0];
            document.querySelector('#typing-input').textContent = "";
            
            console.log("Game started!");
            return;
        }
        
        // カウントダウンの描画
        const countNumber = Math.ceil(remaining / 1000);
        
        p.push();
        // // テキスト描画時は座標系を元に戻す
        // p.translate(p.width, 0);
        // p.scale(-1, 1);
        
        p.fill(0, 0, 0, 150);
        p.noStroke();
        p.rect(0, 0, p.width, p.height);
        
        p.fill(255);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(100);
        p.text(countNumber, p.width/2, p.height/2);
        
        p.textSize(20);
        p.text("ゲーム開始まで", p.width/2, p.height/2 + 80);
        p.pop();
    }

    /**
     * MediaPipeの正規化座標をキャンバス座標に変換する関数
     */
    function normalizedToCanvasCoords(normalizedX, normalizedY) {
        // MediaPipeの座標は0.0-1.0の正規化座標
        // カメラ映像の実際の描画エリアに合わせてスケーリング
        return {
            x: cameraDrawParams.drawX + (normalizedX * cameraDrawParams.drawWidth),
            y: cameraDrawParams.drawY + (normalizedY * cameraDrawParams.drawHeight)
        };
    }

    /**
     * 顔ランドマークと口の状態を描画する関数
     */
    function drawFaceLandmarks() {
        if (!faceResults || !faceResults.faceLandmarks || faceResults.faceLandmarks.length === 0) {
            // ゲーム中のみ口の状態を表示
            if (game_mode.now === "playing") {
                const modeText = inputMode === INPUT_MODE.LIP_CLICK ? "リップクリック" : "時間経過";
                displayMouthStatus(`顔検出なし | モード: ${modeText}`);
            }
            smoothedFaceLandmarks = null;
            // ▼▼▼【ここから追加】顔検出がない場合、口の状態を更新 ▼▼▼
            wasMouthOpen = isMouthOpen;
            isMouthOpen = false;
            // ▲▲▲【ここまで追加】▲▲▲
            return;
        }

        const currentLandmarks = faceResults.faceLandmarks[0];

        // 平滑化処理
        if (!smoothedFaceLandmarks) {
            // ▼▼▼【修正点 2/3】平滑化の安定性向上のための修正 ▼▼▼
            // 元のデータを直接参照するのではなく、完全に新しいコピーを作成します。
            // これにより、他の処理からの予期せぬ影響を防ぎます。
            smoothedFaceLandmarks = JSON.parse(JSON.stringify(currentLandmarks));
        } else {
            smoothedFaceLandmarks.forEach((point, index) => {
                point.x = point.x * (1 - FACE_SMOOTHING_FACTOR) + currentLandmarks[index].x * FACE_SMOOTHING_FACTOR;
                point.y = point.y * (1 - FACE_SMOOTHING_FACTOR) + currentLandmarks[index].y * FACE_SMOOTHING_FACTOR;
                point.z = point.z * (1 - FACE_SMOOTHING_FACTOR) + currentLandmarks[index].z * FACE_SMOOTHING_FACTOR;
            });
        }

        const upperLipPoint = smoothedFaceLandmarks[UPPER_LIP_INDEX];
        const lowerLipPoint = smoothedFaceLandmarks[LOWER_LIP_INDEX];

        if (upperLipPoint && lowerLipPoint) {
            //【描画順を修正】先にオーバーレイを描画し、その上に点を描画します
            const lipDistanceY = Math.abs(lowerLipPoint.y - upperLipPoint.y);
            const mouthStatus = (lipDistanceY > MOUTH_OPEN_THRESHOLD) ? "OPEN" : "CLOSE";
            
            // ▼▼▼【ここから追加】口の開閉状態を更新 ▼▼▼
            wasMouthOpen = isMouthOpen;
            isMouthOpen = (mouthStatus === "OPEN");
            // ▲▲▲【ここまで追加】▲▲▲

            p.push(); // 現在の描画スタイル（変換行列、rectModeなど）を保存
            // p.resetMatrix(); // 変換行列をリセット（原点が左上、反転なし） - これが問題の原因なのでコメントアウト
            p.rectMode(p.CORNER); // 矩形の描画モードを左上隅基準に設定
            
            //口の状態に応じて画面を薄く変える
            // ▼▼▼【ここから修正】B方式での青い背景効果を追加 ▼▼▼
            const isBlueEffectActive = (Date.now() < blueEffectEndTime); // 青い背景効果が有効かチェック
            
            if (inputMode === INPUT_MODE.TIME_HOLD && isBlueEffectActive) {
                // B方式で文字確定時の青い背景効果
                p.fill(33, 150, 243, 100);
            } else if (mouthStatus === "OPEN") {
                // A方式での口が開いている時の青い背景
                p.fill(33, 150, 243, 100);
            } else {
                // デフォルトのオレンジ背景
                p.fill(255, 179, 0, 100);
            }
            // ▲▲▲【ここまで修正】▲▲▲
            
            p.noStroke();
            p.rect(0, 0, p.width, p.height);
            
            p.pop(); // 保存しておいた描画スタイルに戻す

            // 唇に赤い点を描画
            p.fill('red');
            const upperCoords = normalizedToCanvasCoords(upperLipPoint.x, upperLipPoint.y);
            const lowerCoords = normalizedToCanvasCoords(lowerLipPoint.x, lowerLipPoint.y);
            
            // x座標を反転（鏡効果のため）
            p.circle(p.width - upperCoords.x, upperCoords.y, 8);
            p.circle(p.width - lowerCoords.x, lowerCoords.y, 8);
            
            // ゲーム中のみ口の状態テキストを表示
            if (game_mode.now === "playing") {
                const modeText = inputMode === INPUT_MODE.LIP_CLICK ? "リップクリック" : "時間経過";
                displayMouthStatus(`口の状態: ${mouthStatus} | モード: ${modeText}`);
            }
        } else {
            // ▼▼▼【ここから追加】唇のランドマークが取得できない場合、口の状態を更新 ▼▼▼
            wasMouthOpen = isMouthOpen;
            isMouthOpen = false;
            // ▲▲▲【ここまで追加】▲▲▲
        }
    }

    /**
     * 手のランドマークとジェスチャー名を描画する関数
     */
    function processAndDrawHandGestures() {
        let c = ""; // このフレームでジェスチャーから得られた文字を一時的に保持

        if (!gestureResults || !gestureResults.landmarks || gestureResults.landmarks.length === 0) {
            // ジェスチャーが全く検出されない場合
            displayedChar = '';
            // lastChar = ''; // lastChar は口を閉じるまで維持する可能性があるため、ここではクリアしない
            lastDetectedCode = "N/A";
            lastDetectedChar = "N/A";
        } else {
            // ▼▼▼ 構造の修正: まず「描画」に関する処理を先にすべて行います ▼▼▼
            // 検出された各手に対して処理
            for (let i = 0; i < gestureResults.landmarks.length; i++) {
                const landmarks = gestureResults.landmarks[i];
            
                // ランドマーク（関節点）を青い点で描画
                for (const landmark of landmarks) {
                    p.noStroke();
                    p.fill(100, 150, 210);
                    const coords = normalizedToCanvasCoords(landmark.x, landmark.y);
                    p.circle(p.width - coords.x, coords.y, 10); // x座標を反転
                }

                // ジェスチャー名を描画
                if (gestureResults.gestures[i] && gestureResults.gestures[i].length > 0) {
                    const gesture = gestureResults.gestures[i][0];
                    let categoryName = gesture.categoryName; // Use let to allow modification
                    const score = gesture.score.toFixed(2);
                    const handPos = landmarks[0]; // 手の根元の位置

                    // ▼▼▼【ここから追加】categoryNameが"6"の場合、"0"として表示 ▼▼▼
                    let displayCategoryName = categoryName;
                    if (categoryName === "6") {
                        displayCategoryName = "0";
                    }
                    // ▲▲▲【ここまで追加】▲▲▲

                    p.fill(255);
                    p.stroke(0);
                    p.strokeWeight(2);
                    p.textSize(24);
                    p.textAlign(p.CENTER, p.CENTER);
                    const handCoords = normalizedToCanvasCoords(handPos.x, handPos.y);
                    // x座標を反転
                    // ▼▼▼【ここから修正】表示するcategoryNameを変更 ▼▼▼
                    p.text(`${displayCategoryName} (${score})`, p.width - handCoords.x, handCoords.y - 30);
                    // ▲▲▲【ここまで修正】▲▲▲
                }
            }
            // ▲▲▲ これで描画処理は完了です ▲▲▲

            // ゲームロジック：ジェスチャーからの文字変換
            if (game_mode.now === 'playing' && gestureResults.gestures && gestureResults.handednesses && gestureResults.gestures.length === 2 && gestureResults.handednesses.length === 2) {
                let left_gesture, right_gesture;
                for (let i = 0; i < gestureResults.handednesses.length; i++) {
                    if (gestureResults.handednesses[i][0].displayName === "Left") {
                        left_gesture = gestureResults.gestures[i][0].categoryName;
                    } else if (gestureResults.handednesses[i][0].displayName === "Right") {
                        right_gesture = gestureResults.gestures[i][0].categoryName;
                    }
                }

                if (left_gesture && right_gesture) {
                    let code = getCode(left_gesture, right_gesture);
                    c = getCharacter(code); // このフレームで認識された文字
                    lastDetectedCode = code;
                    lastDetectedChar = c;
                } else {
                    // 左右両方のジェスチャーが揃わなければ文字はなし
                    lastDetectedCode = "N/A"; // コードは更新するが文字はなし
                    lastDetectedChar = "N/A";
                }
            } else {
                // 条件を満たさない場合（手が2つでない等）も文字はなし
                lastDetectedCode = "N/A";
                lastDetectedChar = "N/A";
            }
        }

        // 画面に大きく表示する文字と、入力候補の文字を更新
        displayedChar = c; // ジェスチャーが認識されていればその文字、されていなければ空文字
        if (c) { // 有効なジェスチャー文字が得られた場合のみ入力候補(lastChar)を更新
            // 新しい文字が検出された場合、ジェスチャー開始時刻を記録
            if (lastChar !== c) {
                gestureStartTime = Date.now();
                // ▼▼▼【ここから追加】時間経過モード用の時間も更新 ▼▼▼
                lastGestureChangeTime = Date.now();
                // ▲▲▲【ここまで追加】▲▲▲
            }
            lastChar = c;
        }

        // ▼▼▼【ここから修正】モードに応じた入力処理 ▼▼▼
        if (inputMode === INPUT_MODE.LIP_CLICK) {
            // リップクリックモード：口の開閉による入力判定
            if (wasMouthOpen && !isMouthOpen) { // 口が「開」から「閉」に変わった瞬間
                if (lastChar) { // 有効な入力候補文字があれば
                    const confirmTime = Date.now();
                    
                    // 文字入力を実行
                    typeChar(lastChar);
                    
                    // ▼▼▼【ここから修正】文字入力結果に基づいてerrorFlagを設定 ▼▼▼
                    // 実験用イベントを発火
                    const event = new CustomEvent('characterConfirmed', {
                        detail: {
                            character: lastChar,
                            t_select: gestureStartTime || trialStartTime || confirmTime - 1000,
                            t_confirm: confirmTime,
                            errorFlag: lastCharacterResult.character === lastChar && lastCharacterResult.isError ? 1 : 0,
                            latency: confirmTime - (gestureStartTime || trialStartTime || confirmTime - 1000)
                        }
                    });
                    window.dispatchEvent(event);
                    // ▲▲▲【ここまで修正】▲▲▲
                    
                    // lastChar = ''; // 一度入力したら入力候補をクリアする場合。今回はジェスチャー維持なら連続入力可とする
                }
            }
        } else if (inputMode === INPUT_MODE.TIME_HOLD) {
            // 時間経過モード：一定時間同じジェスチャーを保持することによる入力判定
            // ▼▼▼【ここから修正】絶対時間で統一された時間管理 ▼▼▼
            let now = Date.now(); // 絶対時間に変更
            if (c && c === lastChar) {
                // 同じ文字が連続して検出されている場合
                if (now - lastGestureChangeTime > GESTURE_HOLD_TIME) {
                    // 設定された時間以上同じ文字が継続している場合
                    const confirmTime = Date.now();
                    
                    // 文字入力を実行
                    typeChar(c);
                    
                    // ▼▼▼【ここから追加】B方式での青い背景効果をトリガー ▼▼▼
                    if (inputMode === INPUT_MODE.TIME_HOLD) {
                        blueEffectEndTime = Date.now() + BLUE_EFFECT_DURATION;
                    }
                    // ▲▲▲【ここまで追加】▲▲▲
                    
                    // 実験用イベントを発火
                    const event = new CustomEvent('characterConfirmed', {
                        detail: {
                            character: c,
                            t_select: lastGestureChangeTime, // 統一された絶対時間
                            t_confirm: confirmTime,
                            errorFlag: lastCharacterResult.character === c && lastCharacterResult.isError ? 1 : 0,
                            latency: confirmTime - lastGestureChangeTime // 正確な1000ms程度になるはず
                        }
                    });
                    window.dispatchEvent(event);
                    
                    lastGestureChangeTime = now; // 入力後、時間をリセット
                }
            } else {
                // 文字が変化した場合、時間をリセット
                lastGestureChangeTime = now;
            }
            // ▲▲▲【ここまで修正】▲▲▲
        }
        // ▲▲▲【ここまで修正】▲▲▲
    }

    /**
     * 口の状態を画面左上に表示するヘルパー関数
     */
    function displayMouthStatus(textToShow) {
        p.push(); // 現在の描画スタイルを保存
        p.fill(0, 0, 0, 0.5);
        p.noStroke();
        p.rect(0, 0, 400, 40); // 背景幅を拡張（250→400）
        
        p.fill(255);
        p.textSize(18);
        p.textAlign(p.LEFT, p.TOP);
        p.text(textToShow, 10, 10);
        p.pop(); // 描画スタイルを元に戻す
    }

    // ▼▼▼【ここから追加】エラーメッセージ表示関数 ▼▼▼
    /**
     * エラーメッセージを表示する関数
     */
    function showErrorMessage(message) {
        const errorDisplay = document.querySelector('#error-message-display');
        const errorText = document.querySelector('#error-text');
        if (errorDisplay && errorText) {
            errorText.textContent = message;
            errorDisplay.classList.remove('hidden');
        }
    }

    /**
     * エラーメッセージを非表示にする関数
     */
    function hideErrorMessage() {
        const errorDisplay = document.querySelector('#error-message-display');
        if (errorDisplay) {
            errorDisplay.classList.add('hidden');
        }
    }
    // ▲▲▲【ここまで追加】▲▲▲

    // ====import from GestureTyping(we can not edit)====
    function typeChar(c) {
        // ▼▼▼【ここから追加】ゲーム終了後は入力を受け付けない ▼▼▼
        if (game_mode.now === "finished") {
            console.log("Game finished. No more input accepted.");
            return;
        }
        // ▲▲▲【ここまで追加】▲▲▲

        // ▼▼▼【ここから修正】displayedCharの更新処理を削除 ▼▼▼
        // displayedChar = c;        // 表示する文字をセット ← この行を削除
        // ▲▲▲【ここまで修正】▲▲▲
        if (c === "") {
            console.warn("Empty character received, ignoring.");
            return;
        }
        // inputにフォーカスする
        // ▼▼▼【修正点 3/3】HTML要素が存在しない場合のエラーを防ぐ修正 ▼▼▼
        // HTML側にinputやmessage要素がない場合でもエラーで停止しないようにします。
        // const input = document.querySelector('input'); // divに変更したためコメントアウト
        const inputDisplay = document.querySelector('#typing-input'); // div要素を取得
        const messageElem = document.querySelector('#message');
        if (!inputDisplay || !messageElem) {
            console.log(`typeChar called, but #typing-input or #message not found in HTML. Character: ${c}`);
            return;
        }

        // inputDisplay.focus(); // div要素なのでフォーカスは不要
        
        // ▼▼▼【ここから追加】入力検証ロジック ▼▼▼
        const target = messageElem.innerText;
        // let currentInputLength = inputDisplay.innerText.length; // divなのでinnerTextを使用
        // 正確な入力文字数を把握するため、エラー文字を除いた長さを計算
        let currentCorrectInputLength = 0;
        const currentSpans = Array.from(inputDisplay.childNodes);
        currentSpans.forEach(span => {
            if (span.nodeName === "SPAN" && !span.classList.contains('error-char')) {
                currentCorrectInputLength += span.textContent.length;
            } else if (span.nodeType === Node.TEXT_NODE) { // 通常のテキストノードも考慮
                currentCorrectInputLength += span.textContent.length;
            }
        });
        
        // バックスペースの処理
        if (c === "backspace") {
            // ▼▼▼【ここから追加】バックスペースの結果を記録 ▼▼▼
            lastCharacterResult = {
                character: c,
                isError: false, // バックスペースは常に正常操作として扱う
                timestamp: Date.now()
            };
            // ▲▲▲【ここまで追加】▲▲▲
            
            if (errorCharCount > 0) {
                // エラー文字を1つ削除
                const spans = inputDisplay.querySelectorAll('span.error-char');
                if (spans.length > 0) {
                    spans[spans.length - 1].remove();
                    errorCharCount--;
                }
                if (errorCharCount === 0) {
                    isErrorState = false;
                    hideErrorMessage();
                }
                console.log("Error character deleted. Errors remaining: ", errorCharCount);
            } else if (currentCorrectInputLength > 0) {
                // 正しい入力文字を1つ削除
                // inputDisplay.innerText = inputDisplay.innerText.slice(0, -1);
                // 最後のspanまたはテキストノードを削除
                if (inputDisplay.lastChild) {
                    inputDisplay.removeChild(inputDisplay.lastChild);
                }
                isErrorState = false; // エラー状態もクリア
                hideErrorMessage();
                console.log("Correct character deleted");
            }
        } else {
            // 通常の文字入力の処理
            // エラー状態でも、新しい文字は入力せず、エラー文字として表示する
            if (currentCorrectInputLength + errorCharCount < target.length) {
                const expectedChar = target[currentCorrectInputLength];
                
                if (c === expectedChar && !isErrorState) {
                    // 正しい文字の場合、入力を受け入れる
                    // inputDisplay.innerText += c;
                    const charSpan = document.createElement('span');
                    charSpan.textContent = c;
                    inputDisplay.appendChild(charSpan);

                    isErrorState = false;
                    hideErrorMessage();
                    
                    // ▼▼▼【ここから追加】文字入力結果を記録 ▼▼▼
                    lastCharacterResult = {
                        character: c,
                        isError: false,
                        timestamp: Date.now()
                    };
                    // ▲▲▲【ここまで追加】▲▲▲
                    
                    console.log(`Correct character entered: ${c}`);
                } else {
                    // 間違った文字の場合、エラー状態にし、エラー文字として表示
                    isErrorState = true;
                    const errorSpan = document.createElement('span');
                    errorSpan.textContent = c;
                    errorSpan.style.color = 'red';
                    errorSpan.classList.add('error-char'); // エラー文字を特定するためのクラス
                    inputDisplay.appendChild(errorSpan);
                    errorCharCount++;
                    showErrorMessage(`間違った文字です。期待される文字: '${expectedChar}', 入力された文字: '${c}'. 削除ジェスチャー (5,5) で削除してください。`);
                    
                    // ▼▼▼【ここから追加】文字入力結果を記録 ▼▼▼
                    lastCharacterResult = {
                        character: c,
                        isError: true,
                        timestamp: Date.now()
                    };
                    // ▲▲▲【ここまで追加】▲▲▲
                    
                    console.warn(`Incorrect character entered. Expected: '${expectedChar}', Got: '${c}'. Error count: ${errorCharCount}`);
                    // return; // 文字は入力しない、というよりエラー文字として表示済み
                }
            } else {
                // 目標文字列を超えた入力は受け付けない（エラー文字も含む）
                console.warn("Target text (or error buffer) already completed");
                return;
            }
        }
        // ▲▲▲【ここまで追加】▲▲▲

        // let inputValue = inputDisplay.innerText; // divなのでinnerTextを使用
        // #messageのinnerTextを色付けして表示
        // エラー文字を除いた正しい入力部分の長さを再計算
        let correctInputValue = "";
        inputDisplay.childNodes.forEach(node => {
            if (node.nodeName === "SPAN" && !node.classList.contains('error-char')) {
                correctInputValue += node.textContent;
            } else if (node.nodeType === Node.TEXT_NODE) {
                correctInputValue += node.textContent;
            }
        });

        let matchLen = 0;
        for (let i = 0; i < Math.min(correctInputValue.length, target.length); i++) {
            if (correctInputValue[i] === target[i]) {
            matchLen++;
            } else {
            break;
            }
        }
        const matched = target.slice(0, matchLen);
        const unmatched = target.slice(matchLen);
        
        // ▼▼▼【ここから修正】エラー状態に応じた表示 ▼▼▼
        if (isErrorState) {
            // エラー状態の場合、次の文字を赤で表示
            const errorChar = target[correctInputValue.length] || "";
            messageElem.innerHTML =
                `<span style="background-color:lightgreen">${matched}</span><span style="background-color:red; color:white">${errorChar}</span><span style="background-color:transparent">${target.slice(correctInputValue.length + 1)}</span>`;
        } else {
            // 通常状態の表示
            messageElem.innerHTML =
                `<span style="background-color:lightgreen">${matched}</span><span style="background-color:transparent">${unmatched}</span>`;
        }
        // ▲▲▲【ここまで修正】▲▲▲

        // もしvalueの値がsample_texts[0]と同じになったら、[0]を削除して、次のサンプル文章に移行する。配列長が0になったらゲームを終了する
        // if (document.querySelector('input').value == sample_texts[0]) { // divに変更したため修正
        if (!isErrorState && correctInputValue === sample_texts[0]) {
            sample_texts.shift(); // 最初の要素を削除
            console.log(sample_texts.length);
            
            // ▼▼▼【ここから修正】文章完了イベントを少し遅延させて最後の文字ログを確実に送信 ▼▼▼
            // 最後の文字のcharacterConfirmedイベントが確実に処理されるように少し遅延
            setTimeout(() => {
                // 文章完了イベントを発火（実験用）
                const event = new CustomEvent('sentenceCompleted', {
                    detail: {
                        completedSentence: correctInputValue,
                        timeElapsed: p.millis() - game_start_time
                    }
                });
                window.dispatchEvent(event);
            }, 10); // 10ms遅延で最後の文字ログを確実に送信
            // ▲▲▲【ここまで修正】▲▲▲
            
            // 練習モードの場合は継続、実験モードの場合は従来通り
            if (isPracticeMode) {
                // 練習モード：新しいフレーズを待つ（外部から設定される）
                console.log("Practice mode: waiting for new phrase");
                // sample_textsが空の場合、一時的にプレースホルダーを追加
                if (sample_texts.length === 0) {
                    sample_texts.push("新しいフレーズを準備中...");
                }
            } else {
                // 実験モード：従来通りの処理
                if (sample_texts.length == 0) {
                    // サンプル文章がなくなったらゲーム終了
                    game_mode.previous = game_mode.now;
                    game_mode.now = "finished";
                    // document.querySelector('input').value = ""; // divに変更したため修正
                    inputDisplay.innerHTML = ""; // 入力表示をクリア
                    errorCharCount = 0; // エラーカウントもリセット
                    const elapsedSec = ((p.millis() - game_start_time) / 1000).toFixed(2); // p.millis()を使用
                    document.querySelector('#message').innerText = `Record: ${elapsedSec} sec`;
                    submitScore(Number(elapsedSec)).then(() => loadRanking());      
                } else {
                    // 次のサンプル文章に移行
                    // document.querySelector('input').value = ""; // divに変更したため修正
                    inputDisplay.innerHTML = ""; // 入力表示をクリア
                    errorCharCount = 0; // エラーカウントもリセット
                    document.querySelector('#message').innerText = sample_texts[0];
                }
            }
        }
    }

    function drawGameUI(){
        if (game_mode.now === "playing") {
            let elapsedSec = ((p.millis() - game_start_time) / 1000).toFixed(2);
            let msg = `${elapsedSec} [s]`;
            p.textSize(24);
            let tw = p.textWidth(msg) + 40;
            let th = 50;
            let tx = p.width / 2;
            let ty = th / 2 + 70; // 少し下にずらす
            p.rectMode(p.CENTER);
            p.fill(0, 150);
            p.noStroke();
            p.rect(tx, ty, tw, th, 8);
            p.fill(255);
            p.textAlign(p.CENTER, p.CENTER);
            p.text(msg, tx, ty);
        }
        // // ゲームの状態に応じてメッセージを表示
        // let msg = "";
        // if (game_mode.now === "notready") {
        //     msg = "Press the start button to begin";
        // } else if (game_mode.now === "ready") {
        //     msg = "Waiting for gestures to start";
        // } else if (game_mode.now === "playing") {
        //     let elapsedSec = ((p.millis() - game_start_time) / 1000).toFixed(2);
        //     msg = `${elapsedSec} [s]`;
        // } else if (game_mode.now === "finished") {
        //     msg = "Game finished!";
        // }

        // if (msg) {
        //     p.textSize(24);
        //     let tw = p.textWidth(msg) + 40;
        //     let th = 50;
        //     let tx = p.width / 2;
        //     let ty = th / 2;

        //     p.rectMode(p.CENTER);
        //     p.fill(0, 150);
        //     p.noStroke();
        //     p.rect(tx, ty, tw, th, 8);
            
        //     p.fill(255);
        //     p.textAlign(p.CENTER, p.CENTER);
        //     p.text(msg, tx, ty);
        // }
    }
         //===================
    /* // デバッグ用のためコメントアウト
    function logDebugInfo() {
        let now = p.millis();
        // LOG_INTERVALで設定した時間が経過していたら、ログを出力
        if (now - lastLogTime > LOG_INTERVAL) {
            console.log(
                `[デバッグ情報] ゲームモード: ${game_mode.now} | 最後に検出したコード: ${lastDetectedCode} | 文字: ${lastDetectedChar}`
            );
            console.log("[Gesture Results]", gestureResults);
            lastLogTime = now; // 最後にログを出力した時間を更新
        }
    }
    */
   
}; // sketch関数の終了

// MediaPipe関数をグローバルに公開
window.initializeLandmarkers = initializeLandmarkers;

// p5.jsをインスタンスモードで開始し、<#canvas-container>タグの中にCanvasを生成
new p5(sketch, document.querySelector('#canvas-container'));
