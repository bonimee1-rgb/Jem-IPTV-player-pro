
(function () {
  "use strict";

  const video = document.getElementById("videoPlayer");

  if (!video) {
    console.error("Jem Player: video element not found");
    return;
  }

  let hls = null;
  let currentUrl = "";
  let loadingTimer = null;
  let retryCount = 0;

  const MAX_RETRIES = 2;

  // Create loading message
  const playerBox = video.parentElement;

  const loading = document.createElement("div");
  loading.id = "jemLoading";
  loading.textContent = "⏳ Connecting to channel...";

  Object.assign(loading.style, {
    display: "none",
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    zIndex: "10",
    padding: "12px 18px",
    borderRadius: "10px",
    background: "rgba(0,0,0,.8)",
    color: "#fff",
    fontSize: "14px",
    textAlign: "center",
    pointerEvents: "none"
  });

  if (playerBox) {
    playerBox.style.position = "relative";
    playerBox.appendChild(loading);
  }

  function showLoading(message) {
    loading.textContent = message;
    loading.style.display = "block";
  }

  function hideLoading() {
    loading.style.display = "none";
    clearTimeout(loadingTimer);
  }

  function setTitle(name) {
    const title = document.getElementById("nowPlaying");
    if (title) title.textContent = name;
  }

  function destroyHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  function stop() {
    clearTimeout(loadingTimer);
    destroyHls();
    hideLoading();

    video.pause();
    video.removeAttribute("src");
    video.load();

    currentUrl = "";
  }

  function playVideo() {
    const promise = video.play();

    if (promise && typeof promise.catch === "function") {
      promise.catch(error => {
        console.log("Playback requires user interaction:", error);
        hideLoading();
      });
    }
  }

  function isHls(url) {
    return /\.m3u8($|[?#])/i.test(url);
  }

  function play(url, name = "Jem IPTV Player Pro") {
    if (!url || typeof url !== "string") {
      alert("Invalid video URL");
      return;
    }

    stop();

    currentUrl = url;
    retryCount = 0;

    setTitle(name);
    showLoading("⏳ Connecting to " + name + "...");

    // Stop waiting after 25 seconds
    loadingTimer = setTimeout(() => {
      if (video.readyState < 3) {
        showLoading("⚠️ Channel is taking too long. Check the stream.");
      }
    }, 25000);

    // Native HLS: best choice for iPhone Safari
    if (isHls(url) && video.canPlayType("application/vnd.apple.mpegurl")) {
      playNative(url);
      return;
    }

    // HLS.js for supported browsers
    if (isHls(url) && window.Hls && Hls.isSupported()) {
      playWithHls(url);
      return;
    }

    // MP4 and other browser-supported formats
    playDirect(url);
  }

  function playNative(url) {
    video.src = url;
    video.load();

    video.addEventListener("canplay", function onReady() {
      video.removeEventListener("canplay", onReady);
      hideLoading();
      playVideo();
    });

    video.addEventListener("error", function onError() {
      hideLoading();
      console.error("Native stream error:", video.error);
    }, { once: true });
  }

  function playWithHls(url) {
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,

      maxBufferLength: 15,
      maxMaxBufferLength: 30,
      maxBufferSize: 30 * 1000 * 1000,

      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 6,

      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 2,
      manifestLoadingRetryDelay: 1000,

      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 2,
      fragLoadingRetryDelay: 1000
    });

    hls.attachMedia(video);

    hls.on(Hls.Events.MEDIA_ATTACHED, function () {
      hls.loadSource(url);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      hideLoading();
      playVideo();
    });

    hls.on(Hls.Events.ERROR, function (event, data) {
      console.error("HLS error:", data);

      if (!data.fatal) return;

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR &&
          retryCount < MAX_RETRIES) {

        retryCount++;
        showLoading("🔄 Reconnecting...");

        hls.startLoad();
        return;
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        showLoading("🔄 Recovering video...");

        hls.recoverMediaError();
        return;
      }

      showLoading("❌ Unable to play this channel.");
      destroyHls();
    });
  }

  function playDirect(url) {
    video.src = url;
    video.load();

    video.addEventListener("canplay", function onReady() {
      video.removeEventListener("canplay", onReady);
      hideLoading();
      playVideo();
    });

    video.addEventListener("error", function onError() {
      hideLoading();
      console.error("Video error:", video.error);
    }, { once: true });
  }

  // Hide loading when video starts
  video.addEventListener("playing", hideLoading);

  video.addEventListener("waiting", function () {
    if (currentUrl) {
      showLoading("⏳ Buffering video...");
    }
  });

  video.addEventListener("stalled", function () {
    if (currentUrl) {
      showLoading("⏳ Waiting for stream...");
    }
  });

  video.addEventListener("pause", function () {
    if (video.ended) hideLoading();
  });

  // Fullscreen
  async function toggleFullscreen() {
    try {
      const target = video;

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.webkitEnterFullscreen) {
        target.webkitEnterFullscreen();
      } else {
        console.log("Fullscreen is not supported here.");
      }
    } catch (error) {
      console.log("Fullscreen error:", error);
    }
  }

  window.JemPlayer = {
    play,
    stop,
    toggleFullscreen
  };

})();
