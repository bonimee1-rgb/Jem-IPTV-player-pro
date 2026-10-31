/* =====================================
   JEM IPTV PRO - SMART VIDEO PLAYER
   Network-Resilient + Smooth Playback
===================================== */

(function () {
  const video = document.getElementById("videoPlayer");

  if (!video) {
    console.error("Jem Player: videoPlayer element not found");
    return;
  }

  let hls = null;
  let currentUrl = "";
  let currentName = "";
  let retryCount = 0;
  let retryTimer = null;
  let manuallyStopped = false;
  let isStarting = false;
  let mediaErrorRecoveryCount = 0;
  let lastMediaErrorTime = 0;
  let stallCheckTimer = null;

  const MAX_RETRIES = 12;
  const MAX_MEDIA_ERROR_RECOVERIES = 4;

  // Create player status overlay
  const container = video.parentElement;
  container.style.position = "relative";

  const status = document.createElement("div");
  status.className = "jem-player-status";
  status.hidden = true;
  container.appendChild(status);

  function showStatus(message, loading = false) {
    status.innerHTML = "";

    if (loading) {
      const spinner = document.createElement("div");
      spinner.className = "jem-spinner";
      status.appendChild(spinner);
    }

    const text = document.createElement("div");
    text.textContent = message;
    status.appendChild(text);

    status.hidden = false;
  }

  function hideStatus() {
    status.hidden = true;
  }

  function destroyHls() {
    if (hls) {
      try {
        hls.destroy();
      } catch (e) {}
      hls = null;
    }
    if (stallCheckTimer) {
      clearInterval(stallCheckTimer);
      stallCheckTimer = null;
    }
  }

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function stop() {
    manuallyStopped = true;
    clearRetry();
    destroyHls();

    video.pause();
    video.removeAttribute("src");
    video.load();

    currentUrl = "";
    retryCount = 0;
    mediaErrorRecoveryCount = 0;
    hideStatus();
  }

  function scheduleRetry(reason) {
    if (manuallyStopped || !currentUrl || retryTimer) return;

    if (retryCount >= MAX_RETRIES) {
      showStatus(
        "Connection failed. Please check your internet and try again."
      );
      return;
    }

    retryCount++;

    // Exponential backoff with jitter (better for unstable networks)
    const baseDelay = Math.min(1200 * Math.pow(1.45, retryCount - 1), 18000);
    const jitter = Math.random() * 800;
    const delay = baseDelay + jitter;

    showStatus(
      reason + " Reconnecting (" + retryCount + "/" + MAX_RETRIES + ")...",
      true
    );

    retryTimer = setTimeout(() => {
      retryTimer = null;
      startStream(true);
    }, delay);
  }

  function startStallWatcher() {
    if (stallCheckTimer) clearInterval(stallCheckTimer);

    let lastTime = 0;
    let stuckCount = 0;

    stallCheckTimer = setInterval(() => {
      if (manuallyStopped || !hls || video.paused) return;

      const currentTime = video.currentTime;

      // Detect if playback is stuck (time not advancing while not paused)
      if (Math.abs(currentTime - lastTime) < 0.1 && !video.paused && video.readyState >= 2) {
        stuckCount++;

        if (stuckCount >= 4) { // ~8 seconds stuck
          console.warn("Jem Player: Stall detected, attempting recovery...");
          stuckCount = 0;

          if (hls) {
            try {
              // Try soft recovery first
              hls.startLoad();
              showStatus("Recovering from stall...", true);
            } catch (e) {
              scheduleRetry("Stream stalled.");
            }
          }
        }
      } else {
        stuckCount = 0;
      }

      lastTime = currentTime;
    }, 2000);
  }

  async function startStream(isRetry = false) {
    if (!currentUrl || manuallyStopped || isStarting) return;

    if (!navigator.onLine) {
      showStatus("No internet connection. Waiting for network...", true);
      return;
    }

    isStarting = true;
    clearRetry();

    if (!isRetry) {
      retryCount = 0;
      mediaErrorRecoveryCount = 0;
    }

    destroyHls();

    video.pause();
    video.removeAttribute("src");
    video.load();

    showStatus(
      isRetry ? "Reconnecting to channel..." : "Loading channel...",
      true
    );

    const isHls = /\.m3u8($|\?)/i.test(currentUrl);

    try {
      if (
        isHls &&
        window.Hls &&
        window.Hls.isSupported() &&
        !video.canPlayType("application/vnd.apple.mpegurl")
      ) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false, // Smooth playback priority (not ultra-low latency)

          // ===== BUFFER SETTINGS (Network Resilience) =====
          backBufferLength: 90,          // Keep some history
          maxBufferLength: 45,           // Target forward buffer (seconds)
          maxMaxBufferLength: 90,        // Hard ceiling
          maxBufferSize: 80 * 1000 * 1000, // 80MB
          maxBufferHole: 0.8,            // Tolerate larger gaps on bad networks
          highBufferWatchdogPeriod: 2,

          // ===== LIVE SYNC (Stability over latency) =====
          liveSyncDurationCount: 4,      // Stay ~4 segments behind live edge
          liveMaxLatencyDurationCount: 12,
          maxLiveSyncPlaybackRate: 1.08, // Gentle catch-up speed
          liveSyncOnStallIncrease: 1,

          // ===== LOADING TIMEOUTS & RETRIES (Unstable networks) =====
          manifestLoadingTimeOut: 25000,
          manifestLoadingMaxRetry: 5,
          manifestLoadingRetryDelay: 1200,

          levelLoadingTimeOut: 25000,
          levelLoadingMaxRetry: 5,
          levelLoadingRetryDelay: 1200,

          fragLoadingTimeOut: 35000,
          fragLoadingMaxRetry: 8,
          fragLoadingRetryDelay: 1000,

          // ===== ABR (Conservative quality switching) =====
          abrEwmaDefaultEstimate: 800000, // Start assuming ~800kbps
          abrBandWidthFactor: 0.75,       // More conservative bandwidth estimate
          abrBandWidthUpFactor: 0.55,     // Slow quality upgrades (prevents drop)
          abrMaxWithRealBitrate: true,
          maxStarvationDelay: 6,
          maxLoadingDelay: 6,

          // Other useful settings
          startLevel: -1,                // Auto start level
          capLevelToPlayerSize: true,    // Don't load higher than display size
          testBandwidth: true,
          progressive: false
        });

        hls.attachMedia(video);

        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
          if (hls && !manuallyStopped) {
            hls.loadSource(currentUrl);
          }
        });

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (!manuallyStopped) {
            video.play().catch(handlePlayError);
            startStallWatcher();
          }
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
          if (!data.fatal) {
            // Non-fatal: just log some important ones
            if (data.details === "bufferStalledError" || data.details === "bufferNudgeOnStall") {
              console.warn("Jem Player: Non-fatal stall:", data.details);
            }
            return;
          }

          console.warn("Jem Player fatal error:", data.type, data.details);

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Network issues → try startLoad first, then full retry
            console.warn("Network error — attempting recovery...");
            try {
              hls.startLoad();
              showStatus("Network issue, recovering...", true);

              // If still failing after a short time, schedule full retry
              setTimeout(() => {
                if (hls && !manuallyStopped && video.readyState < 3) {
                  scheduleRetry("Network problem.");
                }
              }, 4000);
            } catch (e) {
              scheduleRetry("Network error.");
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            const now = Date.now();

            // Reset recovery counter if last error was long ago
            if (now - lastMediaErrorTime > 12000) {
              mediaErrorRecoveryCount = 0;
            }
            lastMediaErrorTime = now;

            if (mediaErrorRecoveryCount < MAX_MEDIA_ERROR_RECOVERIES) {
              mediaErrorRecoveryCount++;
              console.warn("Media error — recovering (" + mediaErrorRecoveryCount + ")");

              try {
                if (mediaErrorRecoveryCount >= 2) {
                  // Second+ attempt: try codec swap then recover
                  hls.swapAudioCodec();
                }
                hls.recoverMediaError();
                showStatus("Recovering playback...", true);
              } catch (e) {
                scheduleRetry("Playback error.");
              }
            } else {
              // Too many media recoveries → full restart
              destroyHls();
              scheduleRetry("Player error.");
            }
          } else {
            // Other fatal errors
            destroyHls();
            scheduleRetry("Player error.");
          }
        });

        // Level switched (quality change)
        hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
          console.log("Quality switched to level:", data.level);
        });

      } else {
        // Native HLS (Safari / iOS) or non-HLS
        video.src = currentUrl;
        video.load();

        video.addEventListener(
          "loadedmetadata",
          function onLoaded() {
            video.removeEventListener("loadedmetadata", onLoaded);
            if (!manuallyStopped) {
              video.play().catch(handlePlayError);
            }
          },
          { once: true }
        );
      }
    } catch (error) {
      console.error("Jem Player error:", error);
      scheduleRetry("Unable to start stream.");
    } finally {
      isStarting = false;
    }
  }

  function handlePlayError(error) {
    console.warn("Playback:", error);

    if (error && error.name === "NotAllowedError") {
      showStatus("Tap the Play button to start this channel.");
      return;
    }

    scheduleRetry("Playback interrupted.");
  }

  // Video events
  video.addEventListener("playing", function () {
    retryCount = 0;
    mediaErrorRecoveryCount = 0;
    clearRetry();
    hideStatus();
  });

  video.addEventListener("waiting", function () {
    if (!manuallyStopped) {
      showStatus("Buffering...", true);
    }
  });

  video.addEventListener("stalled", function () {
    if (!manuallyStopped) {
      console.warn("Stream stalled, waiting for data...");
    }
  });

  video.addEventListener("error", function () {
    if (!manuallyStopped && currentUrl) {
      scheduleRetry("Video connection lost.");
    }
  });

  video.addEventListener("ended", function () {
    if (!manuallyStopped && currentUrl) {
      scheduleRetry("Stream ended.");
    }
  });

  // Internet connection events
  window.addEventListener("offline", function () {
    if (currentUrl && !manuallyStopped) {
      clearRetry();
      showStatus("Internet disconnected. Waiting for connection...", true);
    }
  });

  window.addEventListener("online", function () {
    if (currentUrl && !manuallyStopped) {
      retryCount = 0;
      mediaErrorRecoveryCount = 0;
      clearRetry();

      setTimeout(function () {
        startStream(true);
      }, 1200);
    }
  });

  // Public player API
  window.JemPlayer = {
    play: function (url, name) {
      if (!url) return;

      manuallyStopped = false;
      currentUrl = url;
      currentName = name || "Live TV";
      retryCount = 0;
      mediaErrorRecoveryCount = 0;

      console.log("Playing:", currentName);
      startStream();
    },

    stop: stop,

    toggleFullscreen: function () {
      const target = container;

      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else if (target.requestFullscreen) {
        target.requestFullscreen().catch(function () {});
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    },

    retry: function () {
      if (!currentUrl) return;
      manuallyStopped = false;
      retryCount = 0;
      mediaErrorRecoveryCount = 0;
      startStream();
    },

    // Optional: expose current quality info
    getLevels: function () {
      return hls ? hls.levels : [];
    },

    setLevel: function (level) {
      if (hls) hls.currentLevel = level;
    }
  };
})();
