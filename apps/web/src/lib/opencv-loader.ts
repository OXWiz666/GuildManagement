// Lazily load OpenCV.js (WASM) from CDN, once, in the browser. Returns the ready
// `cv` namespace. ~10MB download on first use; cached by the browser afterward.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    cv?: any;
  }
}

const OPENCV_URL = "https://docs.opencv.org/4.9.0/opencv.js";
let loadPromise: Promise<any> | null = null;

export function loadOpenCv(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("OpenCV needs a browser"));
  if (window.cv && window.cv.Mat) return Promise.resolve(window.cv);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const finish = async () => {
      try {
        let cv = window.cv;
        if (cv && typeof cv.then === "function") cv = await cv; // some builds export a Promise
        if (!cv) return reject(new Error("OpenCV failed to initialize"));
        if (cv.Mat) {
          window.cv = cv;
          resolve(cv);
        } else {
          cv["onRuntimeInitialized"] = () => {
            window.cv = cv;
            resolve(cv);
          };
        }
      } catch (err) {
        reject(err as Error);
      }
    };

    const existing = document.getElementById("opencv-js-script") as HTMLScriptElement | null;
    if (existing) {
      if (window.cv) void finish();
      else existing.addEventListener("load", () => void finish());
      return;
    }

    const script = document.createElement("script");
    script.id = "opencv-js-script";
    script.src = OPENCV_URL;
    script.async = true;
    script.onload = () => void finish();
    script.onerror = () => reject(new Error("Failed to download OpenCV.js"));
    document.body.appendChild(script);
  });

  return loadPromise;
}
