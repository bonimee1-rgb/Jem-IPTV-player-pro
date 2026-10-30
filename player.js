/* Jem IPTV Pro — HLS / native video playback */
(function () {
  "use strict";

  class JemPlayer {
    constructor(videoElement, callbacks = {}) {
      this.video = videoElement;
      this.hls = null;
      this.callbacks = callbacks;
    }

    async play(channel) {
      if (!channel || !channel.url) throw new Error("This channel has no stream URL.");
      this.stop();
      const url = channel.url;
      const isHls = /\.m3u8(?:$|[?#])/i.test(url);
      const nativeHls = this.video.canPlayType("application/vnd.apple.mpegurl");

      if (isHls && !nativeHls && window.Hls && window.Hls.isSupported()) {
        this.hls = new window.Hls({
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 20,
          maxMaxBufferLength: 45
        });
        this.hls.loadSource(url);
        this.hls.attachMedia(this.video);
        this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
          this.video.play().catch(() => this.callbacks.onNotice?.("Press Play to start this stream."));
        });
        this.hls.on(window.Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) this.callbacks.onError?.("Stream playback failed. The stream may be offline or unsupported.");
        });
      } else {
        this.video.src = url;
        try {
          await this.video.play();
        } catch (_error) {
          this.callbacks.onNotice?.("Press Play to start, or the stream may be blocked by your browser.");
        }
      }
    }

    stop() {
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }

    async fullscreen() {
      const target = this.video.parentElement;
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      } else if (this.video.webkitEnterFullscreen) {
        this.video.webkitEnterFullscreen();
      }
    }
  }

  window.JemPlayer = JemPlayer;
})();
