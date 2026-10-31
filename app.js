
/* =========================================
   JEM IPTV PLAYER PRO
   WORLD + MY IPTV + AUTO CATEGORIES
========================================= */

(function () {
  "use strict";

  const WORLD_PLAYLIST =
    "https://iptv-org.github.io/iptv/index.m3u";

  const SAVED_URL_KEY = "jem_saved_playlist_url";
  const FAVORITES_KEY = "jem_favorite_channels";
  const PAGE_SIZE = 60;

  const grid = document.getElementById("channelGrid");
  const searchInput = document.getElementById("searchInput");

  const modal = document.getElementById("playlistModal");
  const addButton = document.getElementById("addPlaylistBtn");
  const closeButton = document.getElementById("closeModalBtn");
  const importButton = document.getElementById("importPlaylistBtn");

  const playlistUrl = document.getElementById("playlistUrl");
  const playlistFile = document.getElementById("playlistFile");

  if (!grid || !window.JemPlaylist) {
    console.error("Jem IPTV: Required elements not found.");
    return;
  }

  let worldChannels = [];
  let myChannels = [];
  let allChannels = [];

  let currentFilter = "all";
  let visibleCount = PAGE_SIZE;
  let worldLoadError = false;

  let favorites = [];

  try {
    favorites = JSON.parse(
      localStorage.getItem(FAVORITES_KEY) || "[]"
    );
  } catch (error) {
    favorites = [];
  }

  const typeCategories = [
    "Sports",
    "News",
    "Movies",
    "Music",
    "Kids",
    "Entertainment",
    "Other"
  ];

  const countryNames = {
    ET: "Ethiopia",
    US: "USA",
    GB: "UK",
    UK: "UK",
    FR: "France",
    DE: "Germany",
    IT: "Italy",
    ES: "Spain",
    PT: "Portugal",
    NL: "Netherlands",
    BE: "Belgium",
    CH: "Switzerland",
    AT: "Austria",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    PL: "Poland",
    UA: "Ukraine",
    RU: "Russia",
    TR: "Turkey",
    GR: "Greece",
    CY: "Cyprus",
    IL: "Israel",
    SA: "Saudi Arabia",
    AE: "UAE",
    QA: "Qatar",
    EG: "Egypt",
    ZA: "South Africa",
    NG: "Nigeria",
    GH: "Ghana",
    KE: "Kenya",
    UG: "Uganda",
    TZ: "Tanzania",
    SD: "Sudan",
    SO: "Somalia",
    MA: "Morocco",
    DZ: "Algeria",
    TN: "Tunisia",
    IN: "India",
    PK: "Pakistan",
    BD: "Bangladesh",
    LK: "Sri Lanka",
    NP: "Nepal",
    CN: "China",
    JP: "Japan",
    KR: "South Korea",
    TW: "Taiwan",
    HK: "Hong Kong",
    TH: "Thailand",
    VN: "Vietnam",
    ID: "Indonesia",
    MY: "Malaysia",
    SG: "Singapore",
    PH: "Philippines",
    AU: "Australia",
    NZ: "New Zealand",
    CA: "Canada",
    MX: "Mexico",
    BR: "Brazil",
    AR: "Argentina",
    CL: "Chile",
    CO: "Colombia",
    PE: "Peru",
    VE: "Venezuela",
    CU: "Cuba",
    JM: "Jamaica"
  };

  const countryFlags = {
    ET: "🇪🇹", US: "🇺🇸", GB: "🇬🇧", FR: "🇫🇷",
    DE: "🇩🇪", IT: "🇮🇹", ES: "🇪🇸", PT: "🇵🇹",
    NL: "🇳🇱", BE: "🇧🇪", CH: "🇨🇭", SE: "🇸🇪",
    NO: "🇳🇴", RU: "🇷🇺", TR: "🇹🇷", EG: "🇪🇬",
    ZA: "🇿🇦", NG: "🇳🇬", GH: "🇬🇭", KE: "🇰🇪",
    UG: "🇺🇬", TZ: "🇹🇿", IN: "🇮🇳", PK: "🇵🇰",
    CN: "🇨🇳", JP: "🇯🇵", KR: "🇰🇷", AU: "🇦🇺",
    NZ: "🇳🇿", CA: "🇨🇦", BR: "🇧🇷", MX: "🇲🇽"
  };

  /* =====================================
     HELPERS
  ===================================== */

  function escapeHTML(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function normalizeCountry(value) {
    if (!value) return "";

    const raw = String(value).trim();
    const upper = raw.toUpperCase();

    if (countryNames[upper]) return upper;

    const found = Object.keys(countryNames).find(code =>
      countryNames[code].toLowerCase() === raw.toLowerCase()
    );

    return found || upper;
  }

  function countryLabel(code) {
    const normalized = normalizeCountry(code);
    return countryNames[normalized] || normalized || "Other";
  }

  function getCountryFlag(code) {
    return countryFlags[normalizeCountry(code)] || "🌍";
  }

  function normalizeChannels(channels, source) {
    if (!Array.isArray(channels)) return [];

    return channels
      .filter(channel => channel && channel.url)
      .map(channel => {
        const name = channel.name || "Unknown Channel";
        const group = channel.group || "Live TV";

        return {
          name,
          group,
          logo: channel.logo || "",
          url: channel.url,
          country: normalizeCountry(channel.country || ""),
          category: channel.category ||
            window.JemPlaylist.getCategory(group, name),
          source
        };
      });
  }

  function uniqueChannels(channels) {
    const seen = new Set();

    return channels.filter(channel => {
      if (seen.has(channel.url)) return false;
      seen.add(channel.url);
      return true;
    });
  }

  function updateChannels() {
    allChannels = uniqueChannels([
      ...worldChannels,
      ...myChannels
    ]);

    buildCategoryMenu();
    renderChannels();
  }

  /* =====================================
     CATEGORY MENU
  ===================================== */

  const sidebar = document.querySelector(".sidebar");

  let categoryMenu = document.getElementById("jemCategories");

  if (sidebar && !categoryMenu) {
    categoryMenu = document.createElement("div");
    categoryMenu.id = "jemCategories";
    categoryMenu.className = "jem-categories";
    sidebar.appendChild(categoryMenu);
  }

  function createMenuButton(label, filter, icon) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "jem-filter-button";
    button.dataset.filter = filter;
    button.innerHTML =
      `<span>${icon}</span><span>${escapeHTML(label)}</span>`;

    button.addEventListener("click", () => setFilter(filter));

    return button;
  }

  function addMenuHeading(container, title) {
    const heading = document.createElement("div");
    heading.className = "jem-category-heading";
    heading.textContent = title;
    container.appendChild(heading);
  }

  function buildCategoryMenu() {
    if (!categoryMenu) return;

    categoryMenu.innerHTML = "";

    addMenuHeading(categoryMenu, "LIBRARY");

    categoryMenu.appendChild(
      createMenuButton("All Channels", "all", "📺")
    );

    categoryMenu.appendChild(
      createMenuButton("World Channels", "world", "🌍")
    );

    categoryMenu.appendChild(
      createMenuButton("My IPTV", "mine", "📡")
    );

    categoryMenu.appendChild(
      createMenuButton("Favorites", "favorites", "⭐")
    );

    addMenuHeading(categoryMenu, "CHANNEL TYPES");

    typeCategories.forEach(category => {
      const icons = {
        Sports: "⚽",
        News: "📰",
        Movies: "🎬",
        Music: "🎵",
        Kids: "🧒",
        Entertainment: "📺",
        Other: "🌐"
      };

      categoryMenu.appendChild(
        createMenuButton(
          category,
          "type:" + category,
          icons[category]
        )
      );
    });

    addMenuHeading(categoryMenu, "COUNTRIES");

    const countries = [
      ...new Set(
        allChannels
          .map(channel => channel.country)
          .filter(Boolean)
      )
    ].sort((a, b) =>
      countryLabel(a).localeCompare(countryLabel(b))
    );

    countries.forEach(code => {
      categoryMenu.appendChild(
        createMenuButton(
          countryLabel(code),
          "country:" + code,
          getCountryFlag(code)
        )
      );
    });

    categoryMenu.appendChild(
      createMenuButton("Other / Unknown", "country:unknown", "🌍")
    );

    updateActiveMenu();
  }

  function updateActiveMenu() {
    document.querySelectorAll(".jem-filter-button").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.filter === currentFilter
      );
    });

    document.querySelectorAll("[data-filter]").forEach(button => {
      if (button.classList.contains("jem-filter-button")) return;

      button.classList.toggle(
        "active",
        button.dataset.filter === currentFilter
      );
    });
  }

  function setFilter(filter) {
    currentFilter = filter;
    visibleCount = PAGE_SIZE;

    updateActiveMenu();
    renderChannels();
  }

  // Support older HTML sidebar filter buttons too
  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.filter);
    });
  });

  /* =====================================
     FILTER CHANNELS
  ===================================== */

  function getFilteredChannels() {
    let channels = allChannels;

    if (currentFilter === "world") {
      channels = worldChannels;
    } else if (currentFilter === "mine") {
      channels = myChannels;
    } else if (currentFilter === "favorites") {
      channels = allChannels.filter(channel =>
        favorites.includes(channel.url)
      );
    } else if (currentFilter.startsWith("type:")) {
      const type = currentFilter.substring(5);

      channels = allChannels.filter(channel =>
        channel.category === type
      );
    } else if (currentFilter.startsWith("country:")) {
      const country = currentFilter.substring(8);

      if (country === "unknown") {
        channels = allChannels.filter(channel =>
          !channel.country
        );
      } else {
        channels = allChannels.filter(channel =>
          channel.country === country
        );
      }
    }

    const query = searchInput
      ? searchInput.value.trim().toLowerCase()
      : "";

    if (query) {
      channels = channels.filter(channel =>
        channel.name.toLowerCase().includes(query) ||
        channel.group.toLowerCase().includes(query) ||
        channel.country.toLowerCase().includes(query) ||
        countryLabel(channel.country).toLowerCase().includes(query) ||
        channel.category.toLowerCase().includes(query)
      );
    }

    return channels;
  }

  function getFilterTitle() {
    if (currentFilter === "all") return "All Channels";
    if (currentFilter === "world") return "World Channels";
    if (currentFilter === "mine") return "My IPTV";
    if (currentFilter === "favorites") return "Favorites";

    if (currentFilter.startsWith("type:")) {
      return currentFilter.substring(5);
    }

    if (currentFilter.startsWith("country:")) {
      const code = currentFilter.substring(8);
      return code === "unknown"
        ? "Other / Unknown Countries"
        : countryLabel(code);
    }

    return "Channels";
  }

  /* =====================================
     RENDER CHANNELS
  ===================================== */

  function renderChannels() {
    const channels = getFilteredChannels();
    const visibleChannels = channels.slice(0, visibleCount);

    grid.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "jem-results-heading";
    heading.style.gridColumn = "1 / -1";
    heading.innerHTML =
      `<strong>${escapeHTML(getFilterTitle())}</strong>
       <span>${channels.length} channels</span>`;

    grid.appendChild(heading);

    if (channels.length === 0) {
      const message = document.createElement("div");
      message.className = "empty-state";
      message.style.gridColumn = "1 / -1";

      if (currentFilter === "mine") {
        message.textContent =
          "No personal playlist yet. Tap Add Playlist.";
      } else if (currentFilter === "favorites") {
        message.textContent =
          "You have not added any favorite channels yet.";
      } else if (currentFilter === "world" && worldLoadError) {
        message.textContent =
          "Unable to load World Channels. Check your internet connection and refresh.";
      } else {
        message.textContent =
          "No channels found in this category.";
      }

      grid.appendChild(message);
      return;
    }

    visibleChannels.forEach(channel => {
      const card = document.createElement("div");
      card.className = "channel-card";

      const isFavorite = favorites.includes(channel.url);

      const logo = channel.logo
        ? `<img src="${escapeHTML(channel.logo)}"
             alt=""
             loading="lazy"
             style="width:48px;height:48px;object-fit:contain;border-radius:8px"
             onerror="this.style.display='none'">`
        : `<div class="channel-logo">${escapeHTML(
            channel.name.substring(0, 2).toUpperCase()
          )}</div>`;

      card.innerHTML = `
        <button
          class="favorite-btn ${isFavorite ? "active" : ""}"
          type="button"
          aria-label="Favorite">
          ${isFavorite ? "★" : "☆"}
        </button>

        ${logo}

        <div class="channel-name">
          ${escapeHTML(channel.name)}
        </div>

        <div class="channel-category">
          ${escapeHTML(channel.category)}
        </div>

        <div class="channel-country">
          ${channel.country
            ? getCountryFlag(channel.country) + " " +
              escapeHTML(countryLabel(channel.country))
            : "🌍 Other"}
        </div>
      `;

      card.addEventListener("click", event => {
        if (event.target.closest(".favorite-btn")) return;

        if (window.JemPlayer) {
          window.JemPlayer.play(
            channel.url,
            channel.name
          );
        }
      });

      const favoriteButton =
        card.querySelector(".favorite-btn");

      favoriteButton.addEventListener("click", event => {
        event.stopPropagation();
        toggleFavorite(channel.url);
      });

      grid.appendChild(card);
    });

    if (channels.length > visibleCount) {
      const moreButton = document.createElement("button");

      moreButton.className = "primary-btn";
      moreButton.type = "button";
      moreButton.textContent =
        `Load More (${channels.length - visibleCount} remaining)`;

      moreButton.style.gridColumn = "1 / -1";
      moreButton.style.margin = "15px auto";
      moreButton.style.display = "block";

      moreButton.addEventListener("click", () => {
        visibleCount += PAGE_SIZE;
        renderChannels();
      });

      grid.appendChild(moreButton);
    }
  }

  /* =====================================
     FAVORITES
  ===================================== */

  function toggleFavorite(url) {
    if (favorites.includes(url)) {
      favorites = favorites.filter(item => item !== url);
    } else {
      favorites.push(url);
    }

    localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify(favorites)
    );

    renderChannels();
  }

  /* =====================================
     LOAD WORLD CHANNELS
  ===================================== */

  async function loadWorldChannels() {
    grid.innerHTML = `
      <div class="empty-state">
        🌍 Loading World Channels... Please wait.
      </div>
    `;

    try {
      const channels =
        await window.JemPlaylist.loadFromUrl(WORLD_PLAYLIST);

      worldChannels = uniqueChannels(
        normalizeChannels(channels, "World Channels")
      );

      worldLoadError = false;

      updateChannels();

      console.log("World channels loaded:", worldChannels.length);

    } catch (error) {
      worldLoadError = true;

      console.error("World playlist error:", error);

      updateChannels();
    }
  }

  /* =====================================
     LOAD SAVED PERSONAL PLAYLIST
  ===================================== */

  async function loadSavedPlaylist() {
    const savedUrl = localStorage.getItem(SAVED_URL_KEY);

    if (!savedUrl) return;

    try {
      const channels =
        await window.JemPlaylist.loadFromUrl(savedUrl);

      myChannels = uniqueChannels(
        normalizeChannels(channels, "My IPTV")
      );

      updateChannels();

      console.log(
        "Personal channels restored:",
        myChannels.length
      );

    } catch (error) {
      console.error("Saved playlist error:", error);
    }
  }

  /* =====================================
     PLAYLIST MODAL
  ===================================== */

  if (addButton && modal) {
    addButton.addEventListener("click", () => {
      modal.classList.add("show");
    });
  }

  if (closeButton && modal) {
    closeButton.addEventListener("click", () => {
      modal.classList.remove("show");
    });
  }

  if (modal) {
    modal.addEventListener("click", event => {
      if (event.target === modal) {
        modal.classList.remove("show");
      }
    });
  }

  /* =====================================
     IMPORT PERSONAL PLAYLIST
  ===================================== */

  if (importButton) {
    importButton.addEventListener("click", async () => {
      const url = playlistUrl
        ? playlistUrl.value.trim()
        : "";

      const file = playlistFile &&
        playlistFile.files[0];

      importButton.disabled = true;
      importButton.textContent = "Importing...";

      try {
        let channels = [];

        if (file) {
          const content = await file.text();
          channels = window.JemPlaylist.parse(content);

        } else if (url) {
          channels =
            await window.JemPlaylist.loadFromUrl(url);

        } else {
          alert("Please enter a playlist URL or select an M3U file.");
          return;
        }

        const parsed = uniqueChannels(
          normalizeChannels(channels, "My IPTV")
        );

        if (!parsed.length) {
          alert("No channels found in this playlist.");
          return;
        }

        myChannels = uniqueChannels([
          ...myChannels,
          ...parsed
        ]);

        if (url) {
          localStorage.setItem(SAVED_URL_KEY, url);
        }

        updateChannels();
        setFilter("mine");

        if (modal) {
          modal.classList.remove("show");
        }

        if (playlistUrl) playlistUrl.value = "";
        if (playlistFile) playlistFile.value = "";

        alert(
          "Successfully imported " +
          parsed.length +
          " channels!"
        );

      } catch (error) {
        console.error("Playlist import error:", error);

        alert(
          "Playlist could not be loaded. Check the URL, internet connection, or playlist format."
        );

      } finally {
        importButton.disabled = false;
        importButton.textContent = "Import Playlist";
      }
    });
  }

  /* =====================================
     SEARCH
  ===================================== */

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      visibleCount = PAGE_SIZE;
      renderChannels();
    });
  }

  /* =====================================
     START APP
  ===================================== */

  async function startApp() {
    buildCategoryMenu();

    setFilter("all");

    await Promise.allSettled([
      loadWorldChannels(),
      loadSavedPlaylist()
    ]);

    updateChannels();
  }

  startApp();

})();
