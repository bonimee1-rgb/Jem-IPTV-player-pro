/* =====================================================
   JEM IPTV PLAYER PRO
   SMART AUTO QUALITY PLAYER
   Adaptive Bitrate + Smart Buffering
   Auto Reconnect + Playback Recovery
   Wi-Fi + Mobile Data
===================================================== */

(function () {
  "use strict";

  const video = document.getElementById("videoPlayer");

  if (!video) {
    console.error("JEM IPTV: videoPlayer element not found.");
    return;
  }

  /* SETTINGS */

  const CONFIG = {
    maxRetries: 12,
    retryBaseDelay: 2000,
    retryMaxDelay: 30000,

    // Buffer configuration
    maxBufferLength: 45,
    maxMaxBufferLength: 90,
    backBufferLength: 30,

    // Playback recovery
    recoveryInterval: 5000,
    maxStallTime: 12000,

    // Automatic quality
    autoQuality: true
  };

  /* PLAYER STATE */

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

  /* PLAYER CONTAINER */

  const container = video.parentElement || video;

  if (container !== video) {
    container.style.position = "relative";
  }

  /* STATUS OVERLAY */

  const status = document.createElement("div");

  status.className = "jem-player-status";
  status.hidden = true;

  if (container !== video) {
    container.appendChild(status);
  }

  function showStatus(message, loading = false) {
    if (!status) return;

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

  /* CLEANUP */

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
        console.warn("HLS cleanup:", error);
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

    while (video.firstChild) {
      video.removeChild(video.firstChild);
    }

    video.load();
  }

  /* LOAD HLS.JS AUTOMATICALLY */

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
          reject(new Error("HLS.js unavailable"));
        }
      };

      script.onerror = () => {
        hlsLoadingPromise = null;
        reject(new Error("Could not load HLS.js"));
      };

      document.head.appendChild(script);
    });

    return hlsLoadingPromise;
  }

  /* NETWORK CHECK */

  function isOnline() {
    return navigator.onLine !== false;
  }

  function waitForNetwork() {
    return new Promise((resolve) => {
      if (isOnline()) {
        resolve();
        return;
      }

      showStatus(
        "Internet disconnected. Waiting for network...",
        true
      );

      const onOnline = () => {
        window.removeEventListener("online", onOnline);
        resolve();
      };

      window.addEventListener("online", onOnline, {
        once: true
      });
    });
  }

  /* BUFFER CONFIGURATION */

  function configureVideo() {
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";

    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("controls", "");
  }

  configureVideo();

  /* PLAY VIDEO */

  async function startStream(isRetry = false, expectedSession = sessionId) {
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
          ? "Reconnecting to " + currentName + "..."
          : "Loading " + currentName + "...",
        true
      );

      video.pause();
      video.removeAttribute("src");
      video.load();

      const isHlsStream =
        /\.m3u8($|[?#])/i.test(streamUrl);

      /*
       * SAFARI NATIVE HLS
       */

      const nativeHlsSupported =
        video.canPlayType("application/vnd.apple.mpegurl");

      if (isHlsStream && nativeHlsSupported) {
        video.src = streamUrl;
        video.load();

        video.play().catch(handlePlayError);

        return;
      }

      /*
       * HLS.JS ADAPTIVE BITRATE
       */

      if (isHlsStream) {
        const HlsLibrary = await loadHlsLibrary();

        if (
          manuallyStopped ||
          expectedSession !== sessionId
        ) {
          return;
        }

        if (HlsLibrary.isSupported()) {
          const config = {
            enableWorker: true,

            // Smart buffering
            maxBufferLength: CONFIG.maxBufferLength,
            maxMaxBufferLength: CONFIG.maxMaxBufferLength,
            backBufferLength: CONFIG.backBufferLength,

            // Live stream latency
            lowLatencyMode: false,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 10,

            // Automatic quality selection
            startLevel: -1,
            capLevelToPlayerSize: true,

            // Network timeout
            manifestLoadingTimeOut: 20000,
            levelLoadingTimeOut: 20000,
            fragLoadingTimeOut: 30000,

            manifestLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 3,
            fragLoadingMaxRetry: 4
          };

          hls = new HlsLibrary(config);

          const activeHls = hls;

          activeHls.attachMedia(video);

          activeHls.on(
            HlsLibrary.Events.MEDIA_ATTACHED,
            function () {
              if (hls !== activeHls) return;

              activeHls.loadSource(streamUrl);
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

              // -1 means automatic quality selection
              if (CONFIG.autoQuality) {
                activeHls.currentLevel = -1;
              }

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
                destroyHls();

                scheduleReconnect(
                  "Stream network error.",
                  expectedSession
                );

              } else if (
                data.type ===
                HlsLibrary.ErrorTypes.MEDIA_ERROR
              ) {
                activeHls.recoverMediaError();

              } else {
                destroyHls();

                scheduleReconnect(
                  "Stream playback error.",
                  expectedSession
                );
              }
            }
          );

          return;
        }
      }

      /*
       * DIRECT VIDEO STREAM
       */

      video.src = streamUrl;
      video.load();

      video.play().catch(handlePlayError);

    } catch (error) {
      console.error("JEM IPTV Player:", error);

      scheduleReconnect(
        "Unable to load stream.",
        expectedSession
      );

    } finally {
      isStarting = false;
    }
  }

  /* AUTO RECONNECT */

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
      showStatus(
        "No internet connection. Waiting...",
        true
      );
      return;
    }

    if (retryCount >= CONFIG.maxRetries) {
      showStatus(
        "Connection failed. Please tap Retry."
      );
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

  /* PLAYBACK RECOVERY */

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

      const currentPosition = video.currentTime;

      if (
        currentPosition > lastPosition + 0.1
      ) {
        lastPosition = currentPosition;
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

          scheduleReconnect(
            "Playback stalled."
          );
        }
      }
    }, CONFIG.recoveryInterval);
  }

  /* PLAYBACK EVENTS */

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

  video.addEventListener("waiting", function () {
    if (!manuallyStopped) {
      showStatus("Buffering video...", true);
    }
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

  /* NETWORK EVENTS */

  window.addEventListener("offline", function () {
    if (currentUrl && !manuallyStopped) {
      clearRetry();

      showStatus(
        "Internet disconnected. Waiting for Wi-Fi or Mobile Data...",
        true
      );
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

  /* STOP PLAYER */

  function stop() {
    manuallyStopped = true;
    sessionId++;

    retryCount = 0;

    cleanupStream();
    hideStatus();
  }

  /* PUBLIC API */

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
        hls.currentLevel = enabled ? -1 : hls.currentLevel;
      }
    }
  };

  console.log("JEM IPTV Smart Player initialized.");
})();
