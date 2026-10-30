
(function () {
  const video = document.getElementById("videoPlayer");
  let hls = null;

  function play(url, name = "Jem IPTV Player Pro") {
    if (!video || !url) {
      alert("የቪዲዮ ማጫወቻው ወይም Channel URL አልተገኘም።");
      return;
    }

    stop();

    const title = document.getElementById("nowPlaying");
    if (title) title.textContent = name;

    video.poster = "assets/player-poster.svg";

    // HLS playback
    if (url.includes(".m3u8") && window.Hls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        video.play().catch(error => {
          console.warn("Playback needs user interaction:", error);
        });
      });

      hls.on(Hls.Events.ERROR, function (event, data) {
        if (data.fatal) {
          console.error("HLS playback error:", data);
          stop();
          alert("Channel ማጫወት አልተቻለም። ሌላ Channel ይሞክሩ።");
        }
      });

      return;
    }

    // Native browser playback
    video.src = url;

    video.play().catch(error => {
      console.error("Playback error:", error);
      alert("ቪዲዮው መጫወት አልቻለም። URL ወይም የቪዲዮ ፎርማት ይፈትሹ።");
    });
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

  window.JemPlayer = {
    play,
    stop
  };
})();
