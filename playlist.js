
(function () {
  function parse(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let current = null;

    for (const line of lines) {
      const value = line.trim();

      if (value.startsWith("#EXTINF")) {
        const name = value.split(",").pop().trim();

        const groupMatch = value.match(/group-title="([^"]*)"/);
        const logoMatch = value.match(/tvg-logo="([^"]*)"/);

        current = {
          name: name || "Unknown Channel",
          group: groupMatch ? groupMatch[1] : "Live TV",
          logo: logoMatch ? logoMatch[1] : ""
        };
      } else if (
        value &&
        !value.startsWith("#") &&
        current
      ) {
        channels.push({
          ...current,
          url: value
        });

        current = null;
      }
    }

    return channels;
  }

  async function loadFromUrl(url) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Playlist could not be loaded");
    }

    const content = await response.text();
    return parse(content);
  }

  window.JemPlaylist = {
    parse,
    loadFromUrl
  };
})();
