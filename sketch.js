import { initializeLandmarkers, startDetection, faceResults, gestureResults } from "./mediapipe_manager.js";
import { submitScore, loadRanking } from "./script.js";

const sketch = (p) => {
    
    // ▼▼▼【ここから追加】デバッグログ用の変数を追加します ▼▼▼
    let lastLogTime = 0; // 最後にログを出力した時間
    const LOG_INTERVAL = 1000; // ログを出力する間隔 (1000ms = 1秒)
    let lastDetectedCode = "N/A"; // 最後に検出されたコードを保持
    let lastDetectedChar = "N/A"; // 最後に検出された文字を保持
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
    // notready: ゲーム開始前 （カメラ起動前）
    // ready: ゲーム開始前（カメラ起動後）
    // playing: ゲーム中
    // finished: ゲーム終了後
    // ready, playing, finished
    // 'notready' と 'previous' は不要になります。
        let game_mode = {
        now: "ready", // カメラが起動したらすぐに「準備完了」状態にする
        previous: "ready",
    };// 初期状態は "ready"（準備完了）
    let game_start_time = 0;


    // ▼▼▼【ここから修正】文字を大きく表示するための変数を修正 ▼▼▼
    let displayedChar = ''; // 画面に大きく表示する文字
    // ▲▲▲【ここまで修正】▲▲▲


    // ジェスチャー入力の連続防止(デバウンズ)　用
    // When gestures are found, the following function is called. The detection results are stored in results.
    let lastChar = ""; // 入力候補の文字を保持
    // ▼▼▼【ここから修正】口の開閉による入力制御のため、以下の変数をコメントアウトまたは削除 ▼▼▼
    // let lastCharTime = 0; 
    // const GESTURE_HOLD_TIME = 1000; // 1秒間同じジェスチャーを保持する
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
                charContainer.className = 'text-center mb-2';
                
                // 文字要素を作成
                const charElement = document.createElement('div');
                
                // 文字の状態に応じてスタイルを設定
                if (i < currentInputIndex) {
                    // 入力済み（正解）の文字 - 緑色で小さく
                    charElement.className = 'text-green-600 text-lg font-bold';
                    charElement.style.opacity = '0.8';
                } else if (i === currentInputIndex) {
                    // 次に入力する文字 - エラー状態かどうかで色を変える
                    if (isErrorState) {
                        charElement.className = 'text-red-600 text-4xl font-black';
                        charElement.style.opacity = '1';
                    } else {
                        charElement.className = 'text-gray-800 text-4xl font-black';
                        charElement.style.opacity = '1';
                    }
                } else {
                    // 今後入力する文字 - 中サイズ
                    charElement.className = 'text-gray-600 text-lg font-normal';
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
                        codeElement.className = 'text-gray-600 text-xs font-medium mt-1';
                    } else {
                        codeElement.className = 'text-gray-400 text-xs font-light mt-1';
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
        // レスポンシブなキャンバスサイズを計算
        let canvasWidth = Math.min(window.innerWidth - 32, 640); // 左右の余白を考慮
        let canvasHeight = (canvasWidth * 3) / 4; // 4:3のアスペクト比を維持
        
        // スマホサイズでの調整
        if (window.innerWidth <= 640) {
            canvasWidth = Math.min(window.innerWidth - 32, 480);
            canvasHeight = (canvasWidth * 3) / 4;
        }
        
        p.createCanvas(canvasWidth, canvasHeight);
        
        // HTMLのvideo要素を作成（非表示）
        cam = p.createCapture(p.VIDEO);
        cam.size(p.width, p.height);
        cam.hide();

        // ▼▼▼【修正点 1/3】UI要素を取得し、初期化処理を分離します ▼▼▼
        const loadingUI = document.querySelector('#loading-ui');
        const startUI = document.querySelector('#start-ui');
        const errorUI = document.querySelector('#error-ui');
        const errorMessage = document.querySelector('#error-message');
        const startButton = document.querySelector('#startButton');
        
        try {
            await initializeLandmarkers();            
            // 成功した場合
            loadingUI.classList.add('hidden');
            startUI.classList.remove('hidden');
        } catch (err) {
            // 失敗した場合
            loadingUI.classList.add('hidden');
            errorUI.classList.remove('hidden');
            errorMessage.innerText = err.message;
            return;
        }
        
        // スタートボタンがクリックされたら、カメラ起動とゲームUI表示を行う
        startButton.onclick = () => {
            const uiOverlay = document.querySelector('#ui-overlay');
            const gameUI = document.querySelector('#game-ui');

            uiOverlay.classList.add('hidden'); // スタート画面を隠す
            gameUI.classList.remove('hidden'); // ゲームUIを表示
            
            startDetection(cam.elt); // MediaPipeの検出を開始

            // ゲームの状態をリセットして開始
            game_mode.now = "playing";
            game_start_time = p.millis();
            document.querySelector('#message').innerText = sample_texts[0];
            document.querySelector('#typing-input').value = "";
            
            // ▼▼▼【ここから追加】ゲーム開始時にもエラー状態をリセット ▼▼▼
            isErrorState = false;
            currentInputIndex = 0;
            currentTargetText = "";
            hideErrorMessage();
            // ▲▲▲【ここまで追加】▲▲▲
        };

        // ▼▼▼【ここから追加】リスタートボタンの処理 ▼▼▼
        const restartButton = document.querySelector('#restartButton');
        restartButton.onclick = () => {
            // ゲームの状態をリセット
            game_mode.now = "ready"; // ← "playing" から "ready" に変更
            // game_start_time = p.millis(); // スタート時に設定するので不要

            // sample_texts を初期状態に戻す
            sample_texts = [
                "the quick brown fox jumps over the lazy dog",
            ];
            // HTMLの表示を初期状態に戻す
            document.querySelector('#message').innerText = "Press the start button to begin"; // ← スタート前のメッセージに変更
            document.querySelector('#typing-input').value = "";
            displayedChar = ''; 
            lastChar = '';
            
            // ▼▼▼【ここから追加】エラー状態もリセット ▼▼▼
            isErrorState = false;
            currentInputIndex = 0;
            currentTargetText = "";
            hideErrorMessage();
            // ▲▲▲【ここまで追加】▲▲▲ 

            // UIの状態をリセット
            const uiOverlay = document.querySelector('#ui-overlay');
            const gameUI = document.querySelector('#game-ui');
            
            // スタート画面を表示し、ゲームUIを隠す
            uiOverlay.classList.remove('hidden'); 
            gameUI.classList.add('hidden');
            
            // MediaPipeの検出はスタートボタンで開始するので、ここでは呼び出さない
            // startDetection(cam.elt); 

            console.log("Game reset to ready state.");
        };
        // ▲▲▲【ここまで追加】▲▲▲

    };
    
    // ウィンドウリサイズ時の処理
    p.windowResized = () => {
        // レスポンシブなキャンバスサイズを再計算
        let canvasWidth = Math.min(window.innerWidth - 32, 640);
        let canvasHeight = (canvasWidth * 3) / 4;
        
        // スマホサイズでの調整
        if (window.innerWidth <= 640) {
            canvasWidth = Math.min(window.innerWidth - 32, 480);
            canvasHeight = (canvasWidth * 3) / 4;
        }
        
        p.resizeCanvas(canvasWidth, canvasHeight);
        
        // カメラサイズも調整
        if (cam) {
            cam.size(p.width, p.height);
        }
    };

    // p5.jsの毎フレーム描画関数
    p.draw = () => {
        // 画面を反転させて鏡のように見せる
        p.translate(p.width, 0);
        p.scale(-1, 1);
        
        // 背景にカメラ映像を描画
        p.background(127);
        if (cam) {
            p.image(cam, 0, 0, p.width, p.height);
        }
        
        // 描画のために再度反転（文字などが反転しないように）
        p.translate(p.width, 0);
        p.scale(-1, 1);

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

        // ▼▼▼【ここに追加】毎フレーム、ログ出力関数を呼び出します ▼▼▼
        // logDebugInfo(); // デバッグ用のためコメントアウト
    };

    //=================
    //ここまで編集可能(drawを書き換えないのは不可能なのでここまで編集可能と一旦定義する)
    //=================

    /**
     * 顔ランドマークと口の状態を描画する関数
     */
    function drawFaceLandmarks() {
        if (!faceResults || !faceResults.faceLandmarks || faceResults.faceLandmarks.length === 0) {
            displayMouthStatus("顔検出なし");
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
            p.resetMatrix(); // 変換行列をリセット（原点が左上、反転なし）
            p.rectMode(p.CORNER); // 矩形の描画モードを左上隅基準に設定
            //口の状態に応じて画面を薄く変える
            if (mouthStatus === "OPEN") {
                p.fill(33, 150, 243, 100);
            } else {
                p.fill(255, 179, 0, 100);
            }
            p.noStroke();
            p.rect(0, 0, p.width, p.height);
            
            p.pop(); // 保存しておいた描画スタイルに戻す

            // 唇に赤い点を描画
            p.fill('red');
            p.circle(p.width - upperLipPoint.x * p.width, upperLipPoint.y * p.height,8); // x座標を反転
            p.circle(p.width - lowerLipPoint.x * p.width, lowerLipPoint.y * p.height, 8); // x座標を反転
            
            // 最後に口の状態テキストを表示
            displayMouthStatus(`口の状態: ${mouthStatus}`);
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
                    p.circle(p.width - landmark.x * p.width, landmark.y * p.height, 10); // x座標を反転
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
                    // x座標を反転
                    // ▼▼▼【ここから修正】表示するcategoryNameを変更 ▼▼▼
                    p.text(`${displayCategoryName} (${score})`, p.width - handPos.x * p.width, handPos.y * p.height - 30);
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
            lastChar = c;
        }


        // ▼▼▼【ここから修正】口の開閉による入力判定 ▼▼▼
        if (wasMouthOpen && !isMouthOpen) { // 口が「開」から「閉」に変わった瞬間
            if (lastChar) { // 有効な入力候補文字があれば
                typeChar(lastChar);
                // lastChar = ''; // 一度入力したら入力候補をクリアする場合。今回はジェスチャー維持なら連続入力可とする
            }
        }
        // ▲▲▲【ここまで修正】▲▲▲

        // ▼▼▼【ここからコメントアウト】時間ベースの入力ロジック ▼▼▼
        /*
        let now = p.millis();
        if (c && c === lastChar) { // ここでの c は、この関数内で定義された一時的な文字 `c`
            if (now - lastCharTime > GESTURE_HOLD_TIME) {
                typeChar(c);
                lastCharTime = now;
            }
        } else {
            lastChar = c; // グローバルな lastChar (入力候補) を更新
            lastCharTime = now;
        }
        */
        // ▲▲▲【ここまでコメントアウト】▲▲▲
    }

    /**
     * 口の状態を画面左上に表示するヘルパー関数
     */
    function displayMouthStatus(textToShow) {
        p.push(); // 現在の描画スタイルを保存
        p.fill(0, 0, 0, 0.5);
        p.noStroke();
        p.rect(0, 0, 250, 40); // 背景
        
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

    function drawGameUI(){
        if (game_mode.now === "playing") {
            let elapsedSec = ((p.millis() - game_start_time) / 1000).toFixed(2);
            let msg = `${elapsedSec} [s]`;
            p.textSize(24);
            let tw = p.textWidth(msg) + 40;
            let th = 50;
            let tx = p.width / 2;
            let ty = th / 2;
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
   
};

// p5.jsをインスタンスモードで開始し、<#canvas-container>タグの中にCanvasを生成
new p5(sketch, document.querySelector('#canvas-container'));
