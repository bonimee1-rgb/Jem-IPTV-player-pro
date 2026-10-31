/* ===================================
   JEM IPTV PLAYER PRO
   Auto Reconnect + Smart HLS Player
=================================== */

(function () {
  const video = document.getElementById("videoPlayer");

  if (!video) {
    console.error("Jem IPTV: videoPlayer not found");
    return;
  }

  const parent = video.parentElement;
  parent.style.position = "relative";

  let hls = null;
  let currentUrl = "";
  let currentName = "";
  let retryCount = 0;
  let retryTimer = null;
  let manuallyStopped = false;
  let hlsReady = false;

  const MAX_RETRIES = 8;

  // Status overlay
  const status = document.createElement("div");
  status.className = "jem-player-status";
  status.hidden = true;
  parent.appendChild(status);

  function showStatus(message, loading = false) {
    status.replaceChildren();

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

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function destroyHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  function loadHlsLibrary() {
    if (window.Hls) {
      hlsReady = true;
      return Promise.resolve();
    }

    if (window.jemHlsLoading) {
      return window.jemHlsLoading;
    }

    window.jemHlsLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js";
      script.onload = () => {
        hlsReady = true;
        resolve();
      };
      script.onerror = () => reject(new Error("HLS library failed to load"));
      document.head.appendChild(script);
    });

    return window.jemHlsLoading;
  }

  function scheduleRetry(message) {
    if (manuallyStopped || !currentUrl || retryTimer) return;

    if (!navigator.onLine) {
      showStatus("Internet disconnected. Waiting for connection...", true);
      return;
    }

    if (retryCount >= MAX_RETRIES) {
      showStatus("Connection failed. Check your internet and tap Retry.");
      return;
    }

    retryCount++;

    const delay = Math.min(
      2000 * Math.pow(2, retryCount - 1),
      20000
    );

    showStatus(
      message + " Reconnecting " + retryCount + "/" + MAX_RETRIES,
      true
    );

    retryTimer = setTimeout(() => {
      retryTimer = null;
      startStream(true);
    }, delay);
  }

  async function startStream(isRetry = false) {
    if (!currentUrl || manuallyStopped) return;

    if (!navigator.onLine) {
      showStatus("No internet connection. Waiting...", true);
      return;
    }

    clearRetry();
    destroyHls();

    video.pause();
    video.removeAttribute("src");
    video.load();

    showStatus(
      isRetry ? "Reconnecting to " + currentName : "Loading " + currentName,
      true
    );

    const url = currentUrl;
    const isHls = /\.m3u8($|\?)/i.test(url);

    try {
      if (
        isHls &&
        !video.canPlayType("application/vnd.apple.mpegurl")
      ) {
        await loadHlsLibrary();

        if (manuallyStopped || currentUrl !== url) return;

        if (window.Hls && Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            manifestLoadingTimeOut: 20000,
            levelLoadingTimeOut: 20000,
            fragLoadingTimeOut: 30000
          });

          hls.attachMedia(video);

          hls.on(Hls.Events.MEDIA_ATTACHED, function () {
            if (hls && currentUrl === url) {
              hls.loadSource(url);
            }
          });

          hls.on(Hls.Events.MANIFEST_PARSED, function () {
            if (!manuallyStopped && currentUrl === url) {
              video.play().catch(handlePlayError);
            }
          });

          hls.on(Hls.Events.ERROR, function (event, data) {
            if (!data.fatal) return;

            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              if (hls) hls.recoverMediaError();
            } else {
              destroyHls();
              scheduleRetry("Stream connection error.");
            }
          });

          return;
        }
      }

      video.src = url;
      video.load();

      video.addEventListener("loadedmetadata", function () {
        if (!manuallyStopped && currentUrl === url) {
          video.play().catch(handlePlayError);
        }
      }, { once: true });

    } catch (error) {
      console.error("Jem Player:", error);
      scheduleRetry("Unable to load channel.");
    }
  }

  function handlePlayError(error) {
    console.warn("Playback error:", error);

    if (error && error.name === "NotAllowedError") {
      showStatus("Tap Play to start this channel.");
      return;
    }

    scheduleRetry("Playback interrupted.");
  }

  function stop() {
    manuallyStopped = true;
    clearRetry();
    destroyHls();

    currentUrl = "";
    retryCount = 0;

    video.pause();
    video.removeAttribute("src");
    video.load();

    hideStatus();
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
      scheduleRetry("Stream stalled.");
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

  // Network events
  window.addEventListener("offline", function () {
    if (currentUrl && !manuallyStopped) {
      clearRetry();
      showStatus("Internet disconnected. Waiting for network...", true);
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

  // Public API
  window.JemPlayer = {
    play: function (url, name) {
      if (!url) return;

      manuallyStopped = false;
      currentUrl = url;
      currentName = name || "Live TV";
      retryCount = 0;

      startStream();
    },

    stop: stop,

    retry: function () {
      if (!currentUrl) return;

      manuallyStopped = false;
      retryCount = 0;
      startStream(true);
    },

    toggleFullscreen: function () {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else if (parent.requestFullscreen) {
        parent.requestFullscreen().catch(() => {});
      } else if (video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen();
      }
    }
  };
})();
