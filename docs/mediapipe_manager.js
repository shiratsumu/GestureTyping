// 【重要】GestureRecognizerはジェスチャー認識とランドマーク検出を同時に行います。
// そのため、HandLandmarkerは不要になり、GestureRecognizerに置き換わります。
import { FaceLandmarker, GestureRecognizer, FilesetResolver, DrawingUtils } from "./mediapipe_libs/vision_bundle.js";

// sketch.js と共有するための変数
export let faceResults = null;
export let gestureResults = null;
let faceLandmarker;
let gestureRecognizer;
let runningMode = "VIDEO";

/**
 * MediaPipeのタスク（FaceLandmarkerとGestureRecognizer）を初期化する
 */
export async function initializeLandmarkers() {
    console.log("Initializing MediaPipe tasks...");

    const filesetResolver = await FilesetResolver.forVisionTasks("./mediapipe_libs/wasm");

    // FaceLandmarkerの作成
    faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
        },
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        runningMode: runningMode,
        numFaces: 1
    });

    // GestureRecognizerの作成（カスタムモデルを使用）
    gestureRecognizer = await GestureRecognizer.createFromOptions(filesetResolver, {
        baseOptions: {
            // ここでご自身のカスタムモデルを指定します
            modelAssetPath: `./models/gesture_recognizer.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 2, // 検出する手の最大数
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    console.log("FaceLandmarker and GestureRecognizer created successfully.");
}

let video = null;
let lastVideoTime = -1;
let rafId = null;

/**
 * ウェブカメラを起動し、検出ループを開始する
 * @param {HTMLVideoElement} videoElement - 映像を取得するvideo要素
 */
export async function startDetection(videoElement) {
    if (!faceLandmarker || !gestureRecognizer) {
        console.error("Landmarkers not initialized yet.");
        return;
    }
    
    video = videoElement;

    // カメラの制約
    const constraints = { video: { width: { ideal: 640 }, height: { ideal: 480 } } };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
        console.log("Webcam started.");
    }).catch((err) => {
        console.error("getUserMedia error:", err);
    });
}

/**
 * 毎フレームの検出処理
 */
async function predictWebcam() {
    if (video.readyState < 2) {
        window.requestAnimationFrame(predictWebcam);
        return;
    }

    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        
        // 結果を更新
        faceResults = faceLandmarker.detectForVideo(video, performance.now());
        gestureResults = gestureRecognizer.recognizeForVideo(video, performance.now());
    }

        rafId = window.requestAnimationFrame(predictWebcam);
}

export function stopDetection() {
    if (video) {
        video.removeEventListener("loadeddata", predictWebcam);
        if (video.srcObject) {
            video.srcObject.getTracks().forEach((t) => t.stop());
            video.srcObject = null;
        }
    }
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
}