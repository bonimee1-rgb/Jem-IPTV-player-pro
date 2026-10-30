/* Jem IPTV Pro — application state, UI, search, favorites, and playlist library */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE = {
    channels: "jem_pro_channels_v2",
    favorites: "jem_pro_favorites_v2",
    recent: "jem_pro_recent_v2",
    playlists: "jem_pro_playlists_v2"
  };
  const PAGE_SIZE = 72;
  let channels = loadJSON(STORAGE.channels, []);
  let favorites = new Set(loadJSON(STORAGE.favorites, []));
  let recent = loadJSON(STORAGE.recent, []);
  let playlists = loadJSON(STORAGE.playlists, []);
  let view = "all";
  let activePlaylist = "";
  let renderedLimit = PAGE_SIZE;
  let toastTimer;

  const player = new window.JemPlayer($("video"), {
    onNotice: showToast,
    onError: showToast
  });

  function loadJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function persist() {
    localStorage.setItem(STORAGE.channels, JSON.stringify(channels));
    localStorage.setItem(STORAGE.favorites, JSON.stringify([...favorites]));
    localStorage.setItem(STORAGE.recent, JSON.stringify(recent));
    localStorage.setItem(STORAGE.playlists, JSON.stringify(playlists));
  }

  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function openModal() {
    $("playlistModal").classList.add("open");
    $("playlistModal").setAttribute("aria-hidden", "false");
    $("formStatus").textContent = "";
  }

  function closeModal() {
    $("playlistModal").classList.remove("open");
    $("playlistModal").setAttribute("aria-hidden", "true");
  }

  function safeText(element, value) {
    element.textContent = value == null ? "" : String(value);
  }

  function mergeChannels(incoming, playlistName) {
    const existing = new Map(channels.map((channel) => [channel.key, channel]));
    let added = 0;
    incoming.forEach((channel) => {
      const item = { ...channel, source: playlistName || channel.source || "Playlist" };
      if (!existing.has(item.key)) added++;
      existing.set(item.key, item);
    });
    channels = [...existing.values()];
    if (!playlists.some((item) => item.name === playlistName)) {
      playlists.push({ name: playlistName, count: incoming.length, addedAt: Date.now() });
    } else {
      const list = playlists.find((item) => item.name === playlistName);
      list.count = incoming.length;
    }
    persist();
    render();
    showToast(`${incoming.length.toLocaleString()} channels imported · ${added.toLocaleString()} new`);
  }

  async function importPlaylist(event) {
    event.preventDefault();
    const file = $("playlistFile").files[0];
    const url = $("playlistUrl").value.trim();
    const name = $("playlistName").value.trim() || (file ? file.name.replace(/\.(m3u8?)$/i, "") : "My IPTV");
    const button = $("importButton");
    button.disabled = true;
    button.textContent = "Importing…";
    $("formStatus").textContent = "Reading playlist…";

    try {
      const incoming = await window.JemPlaylist.readPlaylist({ url, file, name });
      mergeChannels(incoming, name);
      $("playlistForm").reset();
      $("fileName").textContent = "Browse files on your device";
      closeModal();
    } catch (error) {
      $("formStatus").textContent = error.message + " If URL import is blocked by CORS, download the M3U file and import it.";
    } finally {
      button.disabled = false;
      button.innerHTML = 'Import playlist <span>→</span>';
    }
  }

  function getVisibleChannels() {
    const query = $("searchInput").value.trim().toLocaleLowerCase();
    const category = $("categorySelect").value;
    const sort = $("sortSelect").value;
    let list = [...channels];

    if (view === "favorites") list = list.filter((channel) => favorites.has(channel.key));
    if (view === "recent") list = recent.map((key) => channels.find((channel) => channel.key === key)).filter(Boolean);
    if (activePlaylist) list = list.filter((channel) => channel.source === activePlaylist);
    if (query) {
      list = list.filter((channel) =>
        `${channel.name} ${channel.category} ${channel.source} ${channel.tvgId}`.toLocaleLowerCase().includes(query)
      );
    }
    if (category) list = list.filter((channel) => channel.category === category);

    list.sort((a, b) => {
      if (sort === "name-desc") return b.name.localeCompare(a.name);
      if (sort === "category") return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return list;
  }

  function updateCategories() {
    const select = $("categorySelect");
    const previous = select.value;
    const categories = [...new Set(channels.map((channel) => channel.category || "Uncategorized"))].sort();
    select.innerHTML = '<option value="">All categories</option>';
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      select.append(option);
    });
    if (categories.includes(previous)) select.value = previous;
  }

  function makeChannelCard(channel) {
    const card = document.createElement("article");
    card.className = "channel-card";
    card.dataset.key = channel.key;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Play ${channel.name}`);

    const logo = document.createElement("div");
    logo.className = "channel-logo";
    if (channel.logo) {
      const image = document.createElement("img");
      image.src = channel.logo;
      image.alt = "";
      image.loading = "lazy";
      image.referrerPolicy = "no-referrer";
      image.onerror = () => { logo.textContent = (channel.name || "J").slice(0, 1).toUpperCase(); };
      logo.append(image);
    } else {
      logo.textContent = (channel.name || "J").slice(0, 1).toUpperCase();
    }

    const copy = document.createElement("div");
    copy.className = "channel-copy";
    const name = document.createElement("div");
    name.className = "channel-name";
    name.textContent = channel.name || "Unknown channel";
    const category = document.createElement("div");
    category.className = "channel-category";
    category.textContent = channel.category || "Uncategorized";
    copy.append(name, category);

    const favorite = document.createElement("button");
    favorite.className = `favorite-btn${favorites.has(channel.key) ? " active" : ""}`;
    favorite.type = "button";
    favorite.title = favorites.has(channel.key) ? "Remove from favorites" : "Add to favorites";
    favorite.setAttribute("aria-label", favorite.title);
    favorite.textContent = favorites.has(channel.key) ? "★" : "☆";
    favorite.addEventListener("click", (event) => {
      event.stopPropagation();
      if (favorites.has(channel.key)) favorites.delete(channel.key);
      else favorites.add(channel.key);
      persist();
      render();
    });

    const start = () => playChannel(channel);
    card.addEventListener("click", start);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); start(); }
    });
    card.append(logo, copy, favorite);
    return card;
  }

  async function playChannel(channel) {
    $("playerEmpty").classList.add("hidden");
    safeText($("playingTitle"), channel.name);
    safeText($("playingSubtitle"), `${channel.category || "Live TV"} · ${channel.source || "Playlist"}`);
    try {
      await player.play(channel);
      recent = [channel.key, ...recent.filter((key) => key !== channel.key)].slice(0, 40);
      persist();
      document.querySelectorAll(".channel-card").forEach((card) => card.classList.toggle("selected", card.dataset.key === channel.key));
    } catch (error) {
      showToast(error.message || "Unable to play this stream.");
    }
  }

  function renderPlaylistSidebar() {
    const container = $("playlistList");
    container.innerHTML = "";
    if (!playlists.length) {
      const empty = document.createElement("p");
      empty.className = "sidebar-empty";
      empty.textContent = "No playlists added yet.";
      container.append(empty);
      return;
    }
    playlists.forEach((playlist) => {
      const button = document.createElement("button");
      button.className = `nav-item${activePlaylist === playlist.name ? " active" : ""}`;
      button.innerHTML = "<span>▤</span>";
      const label = document.createElement("span");
      label.textContent = playlist.name;
      const count = document.createElement("b");
      count.textContent = channels.filter((channel) => channel.source === playlist.name).length;
      button.append(label, count);
      button.addEventListener("click", () => {
        activePlaylist = activePlaylist === playlist.name ? "" : playlist.name;
        view = "all";
        updateNav();
        render();
        $("sidebar").classList.remove("open");
      });
      container.append(button);
    });
  }

  function updateNav() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view && !activePlaylist);
    });
    $("allCount").textContent = channels.length.toLocaleString();
    $("favoriteCount").textContent = favorites.size.toLocaleString();
  }

  function render() {
    updateCategories();
    renderPlaylistSidebar();
    updateNav();
    const list = getVisibleChannels();
    const grid = $("channelGrid");
    grid.innerHTML = "";
    $("totalCount").textContent = channels.length.toLocaleString();
    $("resultCount").textContent = `${list.length.toLocaleString()} results`;
    $("pageTitle").textContent = activePlaylist || (view === "favorites" ? "Favorites" : view === "recent" ? "Recently Played" : "All Channels");
    $("sectionTitle").textContent = activePlaylist ? `Channels in ${activePlaylist}` : "Explore channels";

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = channels.length ? "No channels match your filters. Try another search or category." : "Your channel library is empty. Add an M3U/M3U8 playlist to get started.";
      grid.append(empty);
      $("loadMore").hidden = true;
      return;
    }

    const shown = list.slice(0, renderedLimit);
    const fragment = document.createDocumentFragment();
    shown.forEach((channel) => fragment.append(makeChannelCard(channel)));
    grid.append(fragment);
    $("loadMore").hidden = list.length <= renderedLimit;
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view;
      activePlaylist = "";
      renderedLimit = PAGE_SIZE;
      updateNav();
      render();
      $("sidebar").classList.remove("open");
    });
  });

  ["openPlaylistModal", "sidebarAdd"].forEach((id) => $(id).addEventListener("click", openModal));
  $("closePlaylistModal").addEventListener("click", closeModal);
  $("playlistModal").addEventListener("click", (event) => {
    if (event.target === $("playlistModal")) closeModal();
  });
  $("playlistForm").addEventListener("submit", importPlaylist);
  $("playlistFile").addEventListener("change", () => {
    $("fileName").textContent = $("playlistFile").files[0]?.name || "Browse files on your device";
  });
  $("searchInput").addEventListener("input", () => { renderedLimit = PAGE_SIZE; render(); });
  $("categorySelect").addEventListener("change", render);
  $("sortSelect").addEventListener("change", render);
  $("loadMore").addEventListener("click", () => { renderedLimit += PAGE_SIZE; render(); });
  $("fullscreenBtn").addEventListener("click", () => player.fullscreen().catch(() => showToast("Fullscreen is not available in this browser.")));
  $("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("searchInput").focus();
    }
    if (event.key === "Escape") closeModal();
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }

  render();
})();
