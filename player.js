
(function () {
  const video = document.getElementById("videoPlayer");
  let hls = null;

  async function enterFullscreen() {
    const target = video;

    try {
      if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (target.webkitEnterFullscreen) {
        target.webkitEnterFullscreen();
      }
    } catch (error) {
      console.log("Fullscreen requires user interaction:", error);
    }
  }

  function play(url, name = "Jem IPTV Player Pro") {
    if (!video || !url) return;

    stop();

    const title = document.getElementById("nowPlaying");
    if (title) title.textContent = name;

    const startPlayback = () => {
      video.play().then(() => {
        // Fullscreen is requested after playback starts.
        enterFullscreen();
      }).catch(error => {
        console.log("Playback needs user interaction:", error);
      });
    };

    if (url.includes(".m3u8") && window.Hls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error("HLS error:", data);
          stop();
          alert("Video could not be played.");
        }
      });

    } else {
      video.src = url;
      video.addEventListener("loadedmetadata", startPlayback, {
        once: true
      });
      video.load();
    }
  }

  function stop() {
    if (hls) {
      hls.destroy();
      hls = null;
    }

    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      enterFullscreen();
    }
  }

  window.JemPlayer = {
    play,
    stop,
    toggleFullscreen
  };
})();
