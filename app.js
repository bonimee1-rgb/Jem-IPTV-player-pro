
const channelGrid = document.getElementById("channelGrid");
const searchInput = document.getElementById("searchInput");
const addPlaylistBtn = document.getElementById("addPlaylistBtn");
const playlistModal = document.getElementById("playlistModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const playlistUrl = document.getElementById("playlistUrl");
const playlistFile = document.getElementById("playlistFile");
const importPlaylistBtn = document.getElementById("importPlaylistBtn");

const SAVED_URL_KEY = "jem_saved_playlist_url";
const FAVORITES_KEY = "jemFavorites";

let channels = [];
let favorites = new Set();
let currentFilter = "all";

function renderChannels() {
  if (!channelGrid) return;

  const search = searchInput?.value.toLowerCase() || "";

  const filtered = channels.filter(channel => {
    const matchesSearch =
      channel.name.toLowerCase().includes(search);

    const matchesFavorite =
      currentFilter !== "favorites" ||
      favorites.has(channel.url);

    return matchesSearch && matchesFavorite;
  });

  channelGrid.innerHTML = "";

  if (filtered.length === 0) {
    channelGrid.innerHTML =
      '<div class="empty-state">No channels found. Add your IPTV playlist.</div>';
    return;
  }

  filtered.forEach(channel => {
    const card = document.createElement("div");
    card.className = "channel-card";

    const logo = document.createElement("div");
    logo.className = "channel-logo";
    logo.textContent = channel.name.slice(0, 2).toUpperCase();

    const favoriteButton = document.createElement("button");
    const isFavorite = favorites.has(channel.url);

    favoriteButton.className =
      "favorite-btn" + (isFavorite ? " active" : "");

    favoriteButton.textContent = isFavorite ? "★" : "☆";

    favoriteButton.addEventListener("click", event => {
      event.stopPropagation();
      toggleFavorite(channel.url);
    });

    const name = document.createElement("div");
    name.className = "channel-name";
    name.textContent = channel.name;

    const category = document.createElement("div");
    category.className = "channel-category";
    category.textContent = channel.group || "Live TV";

    card.append(favoriteButton, logo, name, category);

    card.addEventListener("click", () => {
      window.JemPlayer?.play(channel.url, channel.name);
    });

    channelGrid.appendChild(card);
  });
}

function toggleFavorite(url) {
  if (favorites.has(url)) {
    favorites.delete(url);
  } else {
    favorites.add(url);
  }

  localStorage.setItem(
    FAVORITES_KEY,
    JSON.stringify([...favorites])
  );

  renderChannels();
}

function loadFavorites() {
  try {
    favorites = new Set(
      JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]")
    );
  } catch {
    favorites = new Set();
  }
}

function addChannels(newChannels) {
  const existing = new Set(channels.map(channel => channel.url));

  newChannels.forEach(channel => {
    if (
      channel.url &&
      channel.name &&
      !existing.has(channel.url)
    ) {
      channels.push(channel);
      existing.add(channel.url);
    }
  });

  renderChannels();
}

function showModal() {
  if (playlistUrl) {
    playlistUrl.value =
      localStorage.getItem(SAVED_URL_KEY) || "";
  }

  playlistModal?.classList.add("show");
}

function hideModal() {
  playlistModal?.classList.remove("show");
}

async function importPlaylist() {
  const url = playlistUrl?.value.trim();

  try {
    let imported = [];

    if (playlistFile?.files?.length) {
      const file = playlistFile.files[0];
      const content = await file.text();

      imported = window.JemPlaylist.parse(content);

      if (!imported.length) {
        throw new Error("No channels found in file");
      }

      // File playlists are not saved as a URL.
      localStorage.removeItem(SAVED_URL_KEY);

    } else {
      if (!url) {
        alert("Please enter an IPTV playlist URL.");
        return;
      }

      imported = await window.JemPlaylist.loadFromUrl(url);

      if (!imported.length) {
        throw new Error("No channels found");
      }

      // Save URL only after successful import.
      localStorage.setItem(SAVED_URL_KEY, url);
    }

    addChannels(imported);
    hideModal();

    alert("Playlist loaded successfully!");

  } catch (error) {
    console.error("Playlist import error:", error);

    alert(
      "Playlist could not be loaded. Check the URL, internet connection, and CORS access."
    );
  }
}

async function loadSavedPlaylist() {
  const savedUrl = localStorage.getItem(SAVED_URL_KEY);

  if (!savedUrl) {
    renderChannels();
    return;
  }

  if (channelGrid) {
    channelGrid.innerHTML =
      '<div class="empty-state">Loading your saved IPTV playlist...</div>';
  }

  try {
    const imported =
      await window.JemPlaylist.loadFromUrl(savedUrl);

    addChannels(imported);

  } catch (error) {
    console.error("Saved playlist could not load:", error);

    if (channelGrid) {
      channelGrid.innerHTML =
        '<div class="empty-state">Saved playlist could not load. Check your internet or playlist link.</div>';
    }
  }
}

searchInput?.addEventListener("input", renderChannels);
addPlaylistBtn?.addEventListener("click", showModal);
closeModalBtn?.addEventListener("click", hideModal);
importPlaylistBtn?.addEventListener("click", importPlaylist);

document.querySelectorAll("[data-filter]").forEach(button => {
  button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;

    document.querySelectorAll("[data-filter]").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");
    renderChannels();
  });
});

loadFavorites();
loadSavedPlaylist();
