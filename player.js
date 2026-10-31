/* =====================================
   JEM IPTV PRO - SMART VIDEO PLAYER
   Ultra-Smooth Buffer Optimized
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

  const MAX_RETRIES = 10;

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
      hls.destroy();
      hls = null;
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

    const delay = Math.min(1500 * Math.pow(1.5, retryCount - 1), 15000);

    showStatus(
      reason + " Reconnecting (" + retryCount + "/" + MAX_RETRIES + ")...",
      true
    );

    retryTimer = setTimeout(() => {
      retryTimer = null;
      startStream(true);
    }, delay);
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
          lowLatencyMode: false, // ለስላሳ ንባብ እንዲኖር (Smooth playback) ተደረገ
          backBufferLength: 120,
          maxBufferLength: 60,   // ባፈር የሚይዘውን መጠን ከፍ አድርገናል
          maxMaxBufferLength: 120,
          maxBufferSize: 100 * 1000 * 1000, // 100MB ፕሌይሊስት ባፈር
          maxBufferHole: 0.5,
          highBufferWatchdogPeriod: 3,
          manifestLoadingTimeOut: 30000,
          levelLoadingTimeOut: 30000,
          fragLoadingTimeOut: 45000,
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 6
        });

        hls.attachMedia(video);

        hls.on(Hls.Events.MEDIA_ATTACHED, function () {
          if (hls) hls.loadSource(currentUrl);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          if (!manuallyStopped) {
            video.play().catch(handlePlayError);
          }
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
          if (!data.fatal) return;

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn("Network error encountered, trying to recover...");
            hls.startLoad(); // ሰርቨሩ ላይ ድንገተኛ መቆራረጥ ሲኖር እንደገና ለመጫን ይሞክራል
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            if (hls) {
              hls.recoverMediaError();
            }
          } else {
            destroyHls();
            scheduleRetry("Player error.");
          }
        });

      } else {
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
      clearRetry();

      setTimeout(function () {
        startStream(true);
      }, 1000);
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
      startStream();
    }
  };
})();
