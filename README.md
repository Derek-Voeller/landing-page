# landing-page

## Halloween broadcast website (`site/`)

The front door for the October 31, 2026 horror movie broadcast: **Watch** (player, chat,
Now Playing), **TV Guide** and **Watch on TV**. Plain static HTML, CSS and JavaScript,
no build step, no third-party requests, no analytics.

```
site/
  index.html          Watch page (home)
  guide.html          TV Guide
  tv.html             Watch on TV
  schedule.json       Channel name, sign-on time, every program (edit this, not the code)
  robots.txt          Blocks all crawlers
  assets/config.js    Owncast address, HLS path, status URL, poll intervals
  assets/broadcast.js Shared: clock, schedule, status polling, Now Playing, header
  assets/watch.js     Watch page states
  assets/guide.js     Guide rows, time-zone toggle, Add to calendar
  assets/tv.js        Direct stream link and copy button
  assets/styles.css
  assets/logo.svg     Placeholder logo (replace with the owner's, same name)
deploy/Caddyfile      Web server config for both subdomains
```

The earlier landing-page exercise (`index.html`, `styles.css` at the repo root) is untouched.

### Run it locally

```sh
cd site && python3 -m http.server 8000
```

Open http://localhost:8000. Without Owncast running, the status check fails and the page
falls back to the clock alone. Use the test switches below to see every state.

### Test switches

Add these to any page URL; nav links carry them over and a striped banner shows they're on.

| Switch | What it does |
| --- | --- |
| `?now=2026-10-31T17:59:50-06:00` | Fakes the clock (it keeps ticking from there) |
| `?online=1` / `?online=0` | Fakes Owncast's online status |

The five Watch page states:

| State | URL |
| --- | --- |
| Pre-show | `/?now=2026-10-31T11:30:00-06:00&online=0` |
| Live: movie | `/?now=2026-10-31T12:30:00-06:00&online=1` |
| Live: commercial break | `/?now=2026-10-31T17:55:00-06:00&online=1` |
| Technical difficulties | `/?now=2026-10-31T19:00:00-06:00&online=0` |
| Off air | `/?now=2026-11-01T01:50:00-06:00&online=0` |

### How Now Playing is worked out

1. Start time = `actualSignOn` if set, else Owncast's `lastConnectTime` while the stream is
   online, else `plannedSignOn`.
2. Elapsed = now − start − `delaySeconds`.
3. The program with `start ≤ elapsed < start + length` is on; no match means a commercial break.
4. Clock times in the guide are start + offset, formatted with the browser's built-in
   time-zone database (`Intl`), so they're right from any zone and across the DST change.

`schedule.json` is re-fetched every 5 minutes and Owncast's status every 30 seconds (and
right away when a phone brings the tab back). When the stream drops, the page re-checks
after 10 seconds before showing "Please stand by", and reloads the player by itself as soon
as the stream is back. The page also corrects a wrong phone clock using Owncast's
`serverTime`.

**If the stream drops and reconnects mid-broadcast**, `lastConnectTime` resets and Now
Playing goes wrong. Fix: set `"actualSignOn": "2026-10-31T11:46:10-06:00"` (the true
sign-on time) in `schedule.json`. Every open page corrects itself within 5 minutes.

### Deploy

1. **DNS**: two `A` records (and `AAAA` if the server has IPv6) pointing at the server:
   `tv.yourdomain.com` and `live.yourdomain.com`.
2. Copy `site/` to `/srv/tv-site` on the server.
3. In `site/assets/config.js`, set `liveOrigin` to the real Owncast address and confirm
   `hlsPath` (open `https://live.yourdomain.com/hls/stream.m3u8` while streaming).
4. Put `deploy/Caddyfile` at `/etc/caddy/Caddyfile` with the real names, then
   `sudo systemctl reload caddy`.
5. In Owncast's admin: turn **off** the public directory listing, and set the server URL
   to `https://live.yourdomain.com`.
6. Check `https://tv.yourdomain.com/status` returns Owncast's JSON. Owncast calls this an
   internal API; confirm `online`, `viewerCount`, `lastConnectTime` and `serverTime` exist
   on the installed version.

**Password (optional):** the Caddyfile has a commented-out `basic_auth` block for the site
pages only. Don't protect `live.yourdomain.com`: TVs fetch the stream directly and AirPlay /
Chromecast would fail. Test casting before relying on it.

### Still open (from the spec)

- Channel name and logo: edit `channel` in `schedule.json` and replace `assets/logo.svg`.
- Real subdomains: `config.js` and the Caddyfile.
- Movie blurbs are drafts for the owner to approve (in `schedule.json`).
- Announcing each movie in chat needs a small server-side script with Owncast's
  integration token; not built.
