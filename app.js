
const channelGrid = document.getElementById("channelGrid");
const searchInput = document.getElementById("searchInput");
const addPlaylistBtn = document.getElementById("addPlaylistBtn");
const playlistModal = document.getElementById("playlistModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const playlistUrl = document.getElementById("playlistUrl");
const playlistFile = document.getElementById("playlistFile");
const importPlaylistBtn = document.getElementById("importPlaylistBtn");

let channels = [];
let favorites = new Set();
let currentFilter = "all";

function renderChannels() {
  if (!channelGrid) return;

  const search = searchInput?.value.toLowerCase() || "";

  const filtered = channels.filter(channel => {
    const matchesSearch = channel.name.toLowerCase().includes(search);
    const matchesFavorite =
      currentFilter !== "favorites" || favorites.has(channel.url);

    return matchesSearch && matchesFavorite;
  });

  channelGrid.innerHTML = "";

  if (filtered.length === 0) {
    channelGrid.innerHTML =
      '<div class="empty-state">ምንም Channel አልተገኘም</div>';
    return;
  }

  filtered.forEach(channel => {
    const card = document.createElement("div");
    card.className = "channel-card";

    const isFavorite = favorites.has(channel.url);

    const logo = document.createElement("div");
    logo.className = "channel-logo";
    logo.textContent = channel.name.slice(0, 2).toUpperCase();

    const favoriteButton = document.createElement("button");
    favoriteButton.className = "favorite-btn" + (isFavorite ? " active" : "");
    favoriteButton.textContent = isFavorite ? "★" : "☆";
    favoriteButton.setAttribute("aria-label", "Favorite");

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
      if (window.JemPlayer) {
        window.JemPlayer.play(channel.url, channel.name);
      }
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

  localStorage.setItem("jemFavorites", JSON.stringify([...favorites]));
  renderChannels();
}

function loadFavorites() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("jemFavorites") || "[]"
    );
    favorites = new Set(saved);
  } catch {
    favorites = new Set();
  }
}

function addChannels(newChannels) {
  const existing = new Set(channels.map(channel => channel.url));

  newChannels.forEach(channel => {
    if (channel.url && channel.name && !existing.has(channel.url)) {
      channels.push(channel);
      existing.add(channel.url);
    }
  });

  renderChannels();
}

function showModal() {
  playlistModal?.classList.add("show");
}

function hideModal() {
  playlistModal?.classList.remove("show");
}

async function importPlaylist() {
  if (playlistFile?.files?.length) {
    const file = playlistFile.files[0];
    const text = await file.text();

    if (window.JemPlaylist) {
      const parsed = window.JemPlaylist.parse(text);
      addChannels(parsed);
    }

    hideModal();
    return;
  }

  const url = playlistUrl?.value.trim();

  if (!url) {
    alert("እባክዎ Playlist URL ያስገቡ ወይም M3U ፋይል ይምረጡ።");
    return;
  }

  try {
    if (!window.JemPlaylist) {
      throw new Error("Playlist module not loaded");
    }

    const imported = await window.JemPlaylist.loadFromUrl(url);
    addChannels(imported);
    hideModal();
  } catch (error) {
    alert(
      "Playlist መጫን አልተቻለም። URL ወይም CORS ችግር ሊሆን ይችላል።"
    );
    console.error(error);
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
renderChannels();
