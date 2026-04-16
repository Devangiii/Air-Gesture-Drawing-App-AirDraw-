import { MEDIAPIPE_SCRIPT_URLS } from '../config/airDrawConstants';

const scriptLoadCache = new Map();

function loadScript(src) {
  if (scriptLoadCache.has(src)) {
    return scriptLoadCache.get(src);
  }

  const existingScript = document.querySelector(`script[src="${src}"]`);
  if (existingScript?.dataset.loaded === 'true') {
    const loadedPromise = Promise.resolve();
    scriptLoadCache.set(src, loadedPromise);
    return loadedPromise;
  }

  const promise = new Promise((resolve, reject) => {
    const script = existingScript ?? document.createElement('script');

    const onLoad = () => {
      script.dataset.loaded = 'true';
      resolve();
    };

    const onError = () => {
      reject(new Error(`Failed to load script: ${src}`));
    };

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existingScript) {
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.body.appendChild(script);
    }
  });

  scriptLoadCache.set(src, promise);
  return promise;
}

export async function ensureMediaPipeLoaded() {
  await Promise.all(MEDIAPIPE_SCRIPT_URLS.map(loadScript));

  if (!window.Hands || !window.Camera) {
    throw new Error('MediaPipe loaded but required globals are missing.');
  }
}
