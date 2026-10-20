/*
 * Site settings. Edit these once the owner confirms the real subdomains.
 * Everything about the night's programming lives in /schedule.json instead.
 */
window.BROADCAST_CONFIG = {
  // Where Owncast is served. The player and chat are embedded from here.
  liveOrigin: "https://live.yourdomain.com",

  // Owncast's HLS playlist (confirm the exact path on the server).
  hlsPath: "/hls/stream.m3u8",

  // Owncast's /api/status, passed through on this site's own domain by Caddy
  // so the browser doesn't need cross-origin access.
  statusUrl: "/status",

  scheduleUrl: "schedule.json",

  // Label shown next to times in the broadcast's home time zone.
  homeZoneLabel: "MT",

  statusPollMs: 30 * 1000,
  schedulePollMs: 5 * 60 * 1000,

  // When the stream goes from online to offline, re-check after this long
  // before showing "Please stand by", so a one-poll blip doesn't kill the player.
  offlineConfirmMs: 10 * 1000
};
