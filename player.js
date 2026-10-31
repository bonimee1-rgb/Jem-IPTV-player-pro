
/* =====================================================
   JEM IPTV PLAYER PRO
   SMART STREAMING PLAYER
   AUTO QUALITY | SMART BUFFERING
   AUTO RECONNECT | PLAYBACK RECOVERY
===================================================== */

(function () {
  "use strict";

  const video = document.getElementById("videoPlayer");

  if (!video) {
    console.error("JEM IPTV: videoPlayer not found.");
    return;
  }

  const CONFIG = {
    maxRetries: 12,
    retryBaseDelay: 2000,
    retryMaxDelay: 30000,

    maxBufferLength: 45,
    maxMaxBufferLength: 90,
    backBufferLength: 30,

    recoveryInterval: 5000,
    maxStallTime: 12000,
    autoQuality: true
  };

  let hls = null;
  let currentUrl = "";
  let currentName = "Live TV";

  let retryCount = 0;
  let retryTimer = null;
  let recoveryTimer = null;

  let manuallyStopped = false;
  let isStarting = false;
  let lastPosition = 0;
  let lastProgressTime = Date.now();
  let lastRecoveryTime = 0;
  let sessionId = 0;

  const container = video.parentElement || video;

  if (container !== video) {
    container.style.position = "relative";
  }

  // PLAYER STATUS
  const status = document.createElement("div");
  status.className = "jem-player-status";
  status.hidden = true;

  if (container !== video) {
    container.appendChild(status);
  }

  function showStatus(message, loading = false) {
    status.replaceChildren();

    if (loading) {
      const spinner = document.createElement("div");
      spinner.className = "jem-spinner";
      status.appendChild(spinner);
    }

    const label = document.createElement("div");
    label.textContent = message;
    status.appendChild(label);

    status.hidden = false;
  }

  function hideStatus() {
    status.hidden = true;
  }

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function clearRecovery() {
    if (recoveryTimer) {
      clearInterval(recoveryTimer);
      recoveryTimer = null;
    }
  }

  function destroyHls() {
    if (hls) {
      try {
        hls.destroy();
      } catch (error) {
        console.warn(error);
      }
      hls = null;
    }
  }

  function cleanupStream() {
    clearRetry();
    clearRecovery();
    destroyHls();

    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  // LOAD HLS.JS
  let hlsLoadingPromise = null;

  function loadHlsLibrary() {
    if (window.Hls) {
      return Promise.resolve(window.Hls);
    }

    if (hlsLoadingPromise) {
      return hlsLoadingPromise;
    }

    hlsLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");

      script.src =
        "https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js";

      script.async = true;

      script.onload = () => {
        if (window.Hls) {
          resolve(window.Hls);
        } else {
          hlsLoadingPromise = null;
          reject(new Error("HLS.js unavailable"));
        }
      };

      script.onerror = () => {
        hlsLoadingPromise = null;
        reject(new Error("HLS.js loading failed"));
      };

      document.head.appendChild(script);
    });

    return hlsLoadingPromise;
  }

  function isOnline() {
    return navigator.onLine !== false;
  }

  function configureVideo() {
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";

    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("controls", "");
  }

  configureVideo();

  // WAIT FOR INTERNET
  function waitForNetwork() {
    return new Promise((resolve) => {
      if (isOnline()) {
        resolve();
        return;
      }

      showStatus("Waiting for internet connection...", true);

      window.addEventListener("online", resolve, {
        once: true
      });
    });
  }

  // START STREAM
  async function startStream(
    isRetry = false,
    expectedSession = sessionId
  ) {
    if (
      !currentUrl ||
      manuallyStopped ||
      isStarting ||
      expectedSession !== sessionId
    ) {
      return;
    }

    isStarting = true;
    clearRetry();
    destroyHls();

    try {
      await waitForNetwork();

      if (
        manuallyStopped ||
        expectedSession !== sessionId
      ) {
        return;
      }

      const streamUrl = currentUrl;

      showStatus(
        isRetry
          ? "Reconnecting..."
          : "Loading channel...",
        true
      );

      video.pause();
      video.removeAttribute("src");
      video.load();

      const isHlsStream =
        /\.m3u8($|[?#])/i.test(streamUrl);

      // SAFARI NATIVE HLS
      const nativeHlsSupported =
        video.canPlayType("application/vnd.apple.mpegurl");

      if (isHlsStream && nativeHlsSupported) {
        video.src = streamUrl;
        video.load();
        video.play().catch(handlePlayError);
        return;
      }

      // HLS.JS ADAPTIVE STREAMING
      if (isHlsStream) {
        const HlsLibrary = await loadHlsLibrary();

        if (
          manuallyStopped ||
          expectedSession !== sessionId
        ) {
          return;
        }

        if (HlsLibrary.isSupported()) {
          hls = new HlsLibrary({
            enableWorker: true,

            maxBufferLength: CONFIG.maxBufferLength,
            maxMaxBufferLength: CONFIG.maxMaxBufferLength,
            backBufferLength: CONFIG.backBufferLength,

            lowLatencyMode: false,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,

            startLevel: -1,
            capLevelToPlayerSize: true,

            manifestLoadingTimeOut: 20000,
            levelLoadingTimeOut: 20000,
            fragLoadingTimeOut: 30000,

            manifestLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 3,
            fragLoadingMaxRetry: 4
          });

          const activeHls = hls;

          activeHls.attachMedia(video);

          activeHls.on(
            HlsLibrary.Events.MEDIA_ATTACHED,
            function () {
              if (hls === activeHls) {
                activeHls.loadSource(streamUrl);
              }
            }
          );

          activeHls.on(
            HlsLibrary.Events.MANIFEST_PARSED,
            function () {
              if (
                hls !== activeHls ||
                manuallyStopped
              ) {
                return;
              }

              activeHls.currentLevel =
                CONFIG.autoQuality ? -1 : 0;

              video.play().catch(handlePlayError);
            }
          );

          activeHls.on(
            HlsLibrary.Events.ERROR,
            function (event, data) {
              if (
                hls !== activeHls ||
                !data.fatal
              ) {
                return;
              }

              if (
                data.type ===
                HlsLibrary.ErrorTypes.NETWORK_ERROR
              ) {
                scheduleReconnect(
                  "Network error.",
                  expectedSession
                );

              } else if (
                data.type ===
                HlsLibrary.ErrorTypes.MEDIA_ERROR
              ) {
                activeHls.recoverMediaError();

              } else {
                scheduleReconnect(
                  "Playback error.",
                  expectedSession
                );
              }
            }
          );

          return;
        }
      }

      // DIRECT VIDEO
      video.src = streamUrl;
      video.load();
      video.play().catch(handlePlayError);

    } catch (error) {
      console.error("JEM IPTV:", error);

      scheduleReconnect(
        "Unable to load channel.",
        expectedSession
      );

    } finally {
      isStarting = false;
    }
  }

  // PLAY ERROR
  function handlePlayError(error) {
    if (!error) return;

    if (error.name === "NotAllowedError") {
      showStatus("Tap Play to start the channel.");
      return;
    }

    if (error.name === "AbortError") {
      return;
    }

    console.warn("Playback error:", error);
    scheduleReconnect("Playback failed.");
  }

  // AUTOMATIC RECONNECT
  function scheduleReconnect(
    message,
    expectedSession = sessionId
  ) {
    if (
      manuallyStopped ||
      !currentUrl ||
      retryTimer ||
      expectedSession !== sessionId
    ) {
      return;
    }

    if (!isOnline()) {
      showStatus("Waiting for internet connection...");
      return;
    }

    if (retryCount >= CONFIG.maxRetries) {
      showStatus("Connection failed. Tap Retry.");
      return;
    }

    retryCount++;

    const delay = Math.min(
      CONFIG.retryBaseDelay *
        Math.pow(2, retryCount - 1),
      CONFIG.retryMaxDelay
    );

    showStatus(
      message +
      " Reconnecting " +
      retryCount +
      "/" +
      CONFIG.maxRetries,
      true
    );

    retryTimer = setTimeout(() => {
      retryTimer = null;
      startStream(true, expectedSession);
    }, delay);
  }

  // PLAYBACK RECOVERY
  function startRecoveryMonitor() {
    clearRecovery();

    recoveryTimer = setInterval(() => {
      if (
        manuallyStopped ||
        !currentUrl ||
        video.paused ||
        video.ended
      ) {
        return;
      }

      const position = video.currentTime;

      if (position > lastPosition + 0.1) {
        lastPosition = position;
        lastProgressTime = Date.now();
        return;
      }

      if (
        video.readyState < 3 &&
        Date.now() - lastProgressTime >
          CONFIG.maxStallTime
      ) {
        if (
          Date.now() - lastRecoveryTime > 15000
        ) {
          lastRecoveryTime = Date.now();

          if (hls) {
            try {
              hls.startLoad();
              return;
            } catch (error) {
              console.warn(error);
            }
          }

          scheduleReconnect("Playback interrupted.");
        }
      }
    }, CONFIG.recoveryInterval);
  }

  // VIDEO EVENTS

  video.addEventListener("playing", function () {
    retryCount = 0;
    lastProgressTime = Date.now();
    lastPosition = video.currentTime;

    clearRetry();
    hideStatus();
    startRecoveryMonitor();
  });

  video.addEventListener("timeupdate", function () {
    lastPosition = video.currentTime;
    lastProgressTime = Date.now();
  });

  // BUFFERING MESSAGE REMOVED
  video.addEventListener("waiting", function () {
    hideStatus();
  });

  video.addEventListener("stalled", function () {
    if (!manuallyStopped) {
      scheduleReconnect("Stream stalled.");
    }
  });

  video.addEventListener("error", function () {
    if (!manuallyStopped && currentUrl) {
      scheduleReconnect("Video connection lost.");
    }
  });

  video.addEventListener("ended", function () {
    if (!manuallyStopped && currentUrl) {
      scheduleReconnect("Stream ended.");
    }
  });

  // INTERNET EVENTS

  window.addEventListener("offline", function () {
    if (currentUrl && !manuallyStopped) {
      clearRetry();
      showStatus("Internet disconnected. Waiting...");
    }
  });

  window.addEventListener("online", function () {
    if (currentUrl && !manuallyStopped) {
      clearRetry();
      retryCount = 0;

      setTimeout(() => {
        startStream(true);
      }, 1000);
    }
  });

  // STOP
  function stop() {
    manuallyStopped = true;
    sessionId++;
    retryCount = 0;

    cleanupStream();
    hideStatus();
  }

  // PUBLIC PLAYER API
  window.JemPlayer = {
    play: function (url, name) {
      if (!url) return;

      sessionId++;
      manuallyStopped = false;

      currentUrl = url;
      currentName = name || "Live TV";

      retryCount = 0;
      lastPosition = 0;
      lastProgressTime = Date.now();

      clearRetry();
      clearRecovery();

      startStream(false, sessionId);
    },

    stop: stop,

    retry: function () {
      if (!currentUrl) return;

      sessionId++;
      manuallyStopped = false;
      retryCount = 0;

      startStream(true, sessionId);
    },

    toggleFullscreen: function () {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    },

    getStatus: function () {
      return {
        online: isOnline(),
        playing: !video.paused,
        buffering: video.readyState < 3,
        retryCount: retryCount,
        channel: currentName
      };
    },

    setAutoQuality: function (enabled) {
      CONFIG.autoQuality = Boolean(enabled);

      if (hls) {
        hls.currentLevel = enabled ? -1 : 0;
      }
    }
  };

  console.log("JEM IPTV Smart Player Ready.");
})();
