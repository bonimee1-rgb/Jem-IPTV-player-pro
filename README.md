# Jem IPTV Player Pro

A lightweight, VLC-inspired IPTV web player. It supports importing M3U/M3U8 playlists, searching channels, categories, favorites, recent channels, and browser-based playback for compatible streams.

## Run locally

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Add an M3U/M3U8 playlist URL or import an `.m3u` / `.m3u8` file.

Some browsers restrict playlist URL requests because of CORS. If a URL cannot be imported directly, download the playlist file and import it from your device.

## Publish with GitHub Pages

1. Create a new GitHub repository.
2. Upload all files and folders from this ZIP to the repository's root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then save.
6. Wait for GitHub Pages to publish the site. The published URL will appear in the Pages settings.

## Notes

- The app does not include or guarantee any TV channels. Add playlists and streams that you own or are authorized to access.
- Public playlist availability, stream uptime, regional restrictions, and playback compatibility vary by provider.
- Some IPTV providers block browser-based requests (CORS). Importing a local M3U file may work when direct URL import does not.
- HLS playback uses the hls.js library from jsDelivr when needed. An internet connection is required for that library unless you host a local copy.
- Playlist entries and favorites are stored in the browser's local storage on the device. They are not synchronized between devices.
- This is a static web app; it does not include a backend, user accounts, or a channel hosting service.

## License

The application package is provided under the MIT License. Third-party playlists, logos, streams, and libraries remain subject to their own licenses and terms.
