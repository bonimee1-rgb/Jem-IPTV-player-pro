
/* =====================================
   JEM IPTV PLAYER PRO
   WORLD CHANNELS + MY IPTV
===================================== */

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

  let currentFilter = "world";
  let visibleCount = PAGE_SIZE;

  let favorites = [];

  try {
    favorites = JSON.parse(
      localStorage.getItem(FAVORITES_KEY) || "[]"
    );
  } catch (error) {
    favorites = [];
  }

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

  function updateChannels() {
    allChannels = [
      ...worldChannels,
      ...myChannels
    ];

    renderChannels();
  }

  function normalizeChannels(channels, source) {
    if (!Array.isArray(channels)) return [];

    return channels
      .filter(channel => channel && channel.url)
      .map(channel => ({
        name: channel.name || "Unknown Channel",
        group: channel.group || source,
        logo: channel.logo || "",
        url: channel.url,
        source: source
      }));
  }

  function uniqueChannels(channels) {
    const seen = new Set();

    return channels.filter(channel => {
      if (seen.has(channel.url)) return false;

      seen.add(channel.url);
      return true;
    });
  }

  /* =====================================
     SIDEBAR FILTERS
  ===================================== */

  const sidebar = document.querySelector(".sidebar");

  if (sidebar) {
    const worldButton = document.createElement("button");
    worldButton.type = "button";
    worldButton.dataset.filter = "world";
    worldButton.textContent = "🌍 World Channels";

    const myButton = document.createElement("button");
    myButton.type = "button";
    myButton.dataset.filter = "mine";
    myButton.textContent = "📺 My IPTV";

    sidebar.insertBefore(worldButton, sidebar.firstChild);
    sidebar.insertBefore(myButton, worldButton.nextSibling);
  }

  function setFilter(filter) {
    currentFilter = filter;
    visibleCount = PAGE_SIZE;

    document.querySelectorAll("[data-filter]").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.filter === filter
      );
    });

    renderChannels();
  }

  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.filter);
    });
  });

  /* =====================================
     GET FILTERED CHANNELS
  ===================================== */

  function getFilteredChannels() {
    let channels = allChannels;

    if (currentFilter === "world") {
      channels = worldChannels;
    }

    if (currentFilter === "mine") {
      channels = myChannels;
    }

    if (currentFilter === "favorites") {
      channels = allChannels.filter(channel =>
        favorites.includes(channel.url)
      );
    }

    const query = searchInput
      ? searchInput.value.trim().toLowerCase()
      : "";

    if (query) {
      channels = channels.filter(channel =>
        channel.name.toLowerCase().includes(query) ||
        channel.group.toLowerCase().includes(query)
      );
    }

    return channels;
  }

  /* =====================================
     RENDER CHANNELS
  ===================================== */

  function renderChannels() {
    const channels = getFilteredChannels();

    const visibleChannels = channels.slice(0, visibleCount);

    grid.innerHTML = "";

    if (channels.length === 0) {
      const message = document.createElement("div");
      message.className = "empty-state";

      if (currentFilter === "mine") {
        message.textContent =
          "No personal playlist yet. Tap Add Playlist.";
      } else if (currentFilter === "favorites") {
        message.textContent =
          "You have not added any favorite channels yet.";
      } else {
        message.textContent =
          "No channels found. Please try again.";
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
          ${escapeHTML(channel.group)}
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

      const favoriteButton = card.querySelector(".favorite-btn");

      favoriteButton.addEventListener("click", event => {
        event.stopPropagation();

        toggleFavorite(channel.url);
      });

      grid.appendChild(card);
    });

    // Load more button
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

      updateChannels();

      console.log(
        "World channels loaded:",
        worldChannels.length
      );

    } catch (error) {
      console.error("World playlist error:", error);

      grid.innerHTML = `
        <div class="empty-state">
          Unable to load World Channels.
          Please check your internet connection and refresh.
        </div>
      `;
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
    await Promise.allSettled([
      loadWorldChannels(),
      loadSavedPlaylist()
    ]);

    setFilter("world");
  }

  startApp();

})();
