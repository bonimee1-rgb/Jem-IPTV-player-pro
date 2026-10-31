
(function () {
  "use strict";

  function getAttribute(line, attribute) {
    const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = line.match(new RegExp(escaped + '="([^"]*)"', "i"));
    return match ? match[1].trim() : "";
  }

  function getCountry(line) {
    return getAttribute(line, "tvg-country") ||
           getAttribute(line, "country") ||
           "";
  }

  function getCategory(group, name) {
    const value = (group + " " + name).toLowerCase();

    if (/sport|football|soccer|basketball|cricket|tennis|fifa|nba|nfl|racing/.test(value)) {
      return "Sports";
    }

    if (/news|bbc|cnn|al.?jazeera|breaking|politic/.test(value)) {
      return "News";
    }

    if (/movie|cinema|film|drama|hollywood/.test(value)) {
      return "Movies";
    }

    if (/music|radio|mtv|vh1|concert/.test(value)) {
      return "Music";
    }

    if (/kids|children|cartoon|animation|disney|nickelodeon/.test(value)) {
      return "Kids";
    }

    if (/entertainment|reality|comedy|lifestyle|show|series/.test(value)) {
      return "Entertainment";
    }

    return "Other";
  }

  function parse(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let current = null;

    for (const line of lines) {
      const value = line.trim();

      if (value.startsWith("#EXTINF")) {
        const comma = value.lastIndexOf(",");
        const name = comma >= 0
          ? value.substring(comma + 1).trim()
          : "Unknown Channel";

        const group = getAttribute(value, "group-title") || "Live TV";
        const logo = getAttribute(value, "tvg-logo");
        const country = getCountry(value);
        const tvgId = getAttribute(value, "tvg-id");

        current = {
          name: name || "Unknown Channel",
          group,
          logo,
          country,
          tvgId,
          category: getCategory(group, name)
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
    loadFromUrl,
    getCategory
  };
})();
