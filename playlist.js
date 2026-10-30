/* Jem IPTV Pro — M3U playlist parsing and import helpers */
(function () {
  "use strict";

  function parseM3U(text, sourceName) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
    const channels = [];
    let metadata = null;
    const attr = (line, name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = line.match(new RegExp(escaped + '="([^"]*)"', "i"));
      return match ? match[1].trim() : "";
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      if (line.startsWith("#EXTINF")) {
        const comma = line.indexOf(",");
        const name = comma >= 0 ? line.slice(comma + 1).trim() : "Unknown channel";
        metadata = {
          name: name || "Unknown channel",
          logo: attr(line, "tvg-logo"),
          category: attr(line, "group-title") || "Uncategorized",
          tvgId: attr(line, "tvg-id"),
          source: sourceName || "Imported playlist"
        };
      } else if (!line.startsWith("#") && /^https?:\/\//i.test(line)) {
        const details = metadata || {
          name: line,
          logo: "",
          category: "Uncategorized",
          tvgId: "",
          source: sourceName || "Imported playlist"
        };
        channels.push({
          ...details,
          url: line,
          key: `${line}::${details.name}`
        });
        metadata = null;
      }
    }
    return channels;
  }

  async function readPlaylist({ url, file, name }) {
    let content;
    if (file) {
      content = await file.text();
    } else if (url) {
      const response = await fetch(url, { mode: "cors", cache: "no-store" });
      if (!response.ok) throw new Error(`Playlist request failed (${response.status}).`);
      content = await response.text();
    } else {
      throw new Error("Add a playlist URL or choose an M3U file.");
    }

    const channels = parseM3U(content, name);
    if (!channels.length) {
      throw new Error("No HTTP/HTTPS channel entries were found in this M3U playlist.");
    }
    return channels;
  }

  window.JemPlaylist = { parseM3U, readPlaylist };
})();
