/*
 * Shared by every page: the clock, schedule.json, Owncast status polling,
 * the Now Playing calculation, time formatting and the header.
 *
 * Test switches (append to any page URL):
 *   ?now=2026-10-31T17:59:50-06:00   fake the clock (it keeps ticking from there)
 *   ?online=1  or  ?online=0         fake Owncast's online status
 */
(function () {
  "use strict";

  var cfg = window.BROADCAST_CONFIG;
  var params = new URLSearchParams(window.location.search);

  // ---- Clock ---------------------------------------------------------------

  var clockOffset = 0;
  var fakeClock = false;
  if (params.has("now")) {
    // A "+" in a query string decodes as a space; put it back.
    var fake = Date.parse(params.get("now").replace(" ", "+"));
    if (!isNaN(fake)) {
      clockOffset = fake - Date.now();
      fakeClock = true;
    }
  }
  var fakeOnline = params.has("online") ? params.get("online") === "1" : null;

  function now() {
    return Date.now() + clockOffset;
  }

  // ---- State and listeners -------------------------------------------------

  var schedule = null;
  var scheduleError = false;
  var status = null; // { online, viewerCount, lastConnectTime } or null if unknown
  var statusChecked = false;
  var lastLiveStart = null;
  var listeners = [];

  function on(fn) {
    listeners.push(fn);
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) listeners[i]();
  }

  // ---- schedule.json -------------------------------------------------------

  var scheduleTimer = null;

  function loadSchedule() {
    clearTimeout(scheduleTimer);
    var url = cfg.scheduleUrl + (cfg.scheduleUrl.indexOf("?") < 0 ? "?" : "&") + "_=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("schedule " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.programs) || !data.programs.length || isNaN(Date.parse(data.plannedSignOn))) {
          throw new Error("schedule.json is missing programs or plannedSignOn");
        }
        data.programs.sort(function (a, b) { return a.start - b.start; });
        schedule = data;
        scheduleError = false;
        scheduleTimer = setTimeout(loadSchedule, cfg.schedulePollMs);
        emit();
      })
      .catch(function (err) {
        console.warn(err);
        // Keep the last good copy if there is one; retry sooner if there isn't.
        scheduleError = !schedule;
        scheduleTimer = setTimeout(loadSchedule, schedule ? cfg.schedulePollMs : 15000);
        emit();
      });
  }

  // ---- Owncast status ------------------------------------------------------

  var statusTimer = null;
  var confirmingOffline = false;

  function nextStatusPoll(ms) {
    clearTimeout(statusTimer);
    statusTimer = setTimeout(fetchStatus, ms);
  }

  function fetchStatus() {
    if (fakeOnline !== null) {
      status = { online: fakeOnline, viewerCount: fakeOnline ? 13 : 0, lastConnectTime: null };
      statusChecked = true;
      nextStatusPoll(cfg.statusPollMs);
      emit();
      return;
    }
    fetch(cfg.statusUrl, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("status " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!fakeClock && data.serverTime) {
          // Phones with a wrong clock would show the wrong program; trust the server.
          var server = Date.parse(data.serverTime);
          if (!isNaN(server)) clockOffset = server - Date.now();
        }
        var online = !!data.online;
        if (status && status.online && !online && !confirmingOffline) {
          // Just dropped. Check again shortly before tearing the player down.
          confirmingOffline = true;
          nextStatusPoll(cfg.offlineConfirmMs);
          return;
        }
        confirmingOffline = false;
        status = {
          online: online,
          viewerCount: typeof data.viewerCount === "number" ? data.viewerCount : null,
          lastConnectTime: data.lastConnectTime || null
        };
        statusChecked = true;
        nextStatusPoll(cfg.statusPollMs);
        emit();
      })
      .catch(function (err) {
        console.warn(err);
        confirmingOffline = false;
        status = null;
        statusChecked = true;
        nextStatusPoll(cfg.statusPollMs);
        emit();
      });
  }

  // ---- Now Playing ---------------------------------------------------------

  function parseTime(value) {
    var t = value ? Date.parse(value) : NaN;
    return isNaN(t) ? null : t;
  }

  /*
   * Works out where the broadcast is at time t.
   * phase is one of: "preshow", "live", "standby" (technical difficulties), "offair".
   */
  function compute(t) {
    if (!schedule) return null;
    if (t === undefined) t = now();

    var programs = schedule.programs;
    var planned = Date.parse(schedule.plannedSignOn);
    var online = status ? status.online : null;

    // 1. Broadcast start: actualSignOn, else Owncast's lastConnectTime while live, else planned.
    var start = parseTime(schedule.actualSignOn);
    if (start === null && online) start = parseTime(status.lastConnectTime);
    if (start === null && !online) start = lastLiveStart;
    if (start === null) start = planned;
    if (online) lastLiveStart = start;

    // 2. Elapsed seconds, allowing for the stream running behind real time.
    var elapsed = (t - start) / 1000 - (schedule.delaySeconds || 0);

    // 3. The program whose window contains elapsed; anything else is a commercial break.
    var current = null, next = null, prev = null;
    for (var i = 0; i < programs.length; i++) {
      var p = programs[i];
      if (p.start <= elapsed && elapsed < p.start + p.length) current = p;
      else if (p.start > elapsed && !next) next = p;
      else if (p.start + p.length <= elapsed) prev = p;
    }
    var last = programs[programs.length - 1];
    var total = last.start + last.length;

    var phase;
    if (online === true) phase = "live";
    else if (t < planned && elapsed < 0) phase = "preshow";
    else if (online === false) phase = elapsed >= last.start ? "offair" : "standby";
    // Status unknown (pass-through down?): trust the clock and let the embed cope.
    else phase = elapsed >= total ? "offair" : "live";

    return {
      now: t,
      phase: phase,
      online: online,
      viewerCount: status ? status.viewerCount : null,
      planned: planned,
      start: start,
      elapsed: elapsed,
      current: current,
      next: next,
      prev: prev,
      programs: programs,
      total: total
    };
  }

  // 4. A program's offset back to a clock time.
  function clockTime(info, program) {
    return info.start + program.start * 1000;
  }

  // ---- Time formatting -----------------------------------------------------

  var LOCAL_KEY = "broadcast-local-time";
  var useLocal = false;
  try { useLocal = localStorage.getItem(LOCAL_KEY) === "1"; } catch (e) { /* storage blocked */ }

  function viewerZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return null; }
  }

  // Only offer the toggle to viewers who are actually somewhere else.
  function canUseLocal() {
    if (!schedule) return false;
    var zone = viewerZone();
    return !!zone && zone !== schedule.timezone;
  }

  function isLocal() {
    return useLocal && canUseLocal();
  }

  function setLocal(value) {
    useLocal = !!value;
    try { localStorage.setItem(LOCAL_KEY, useLocal ? "1" : "0"); } catch (e) { /* ignore */ }
    emit();
  }

  function zone() {
    return isLocal() ? undefined : schedule.timezone;
  }

  var formatters = {};
  function formatter(kind, opts) {
    var key = kind + "|" + (zone() || "local");
    if (!formatters[key]) {
      opts.timeZone = zone();
      formatters[key] = new Intl.DateTimeFormat("en-US", opts);
    }
    return formatters[key];
  }

  function fmtTime(ms) {
    return formatter("time", { hour: "numeric", minute: "2-digit" }).format(ms);
  }

  function fmtDay(ms) {
    return formatter("day", { weekday: "long", month: "long", day: "numeric" }).format(ms);
  }

  function zoneLabel(ms) {
    if (!isLocal()) return cfg.homeZoneLabel;
    var parts = formatter("zone", { timeZoneName: "short" }).formatToParts(ms);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "timeZoneName") return parts[i].value;
    }
    return "";
  }

  function fmtRuntime(seconds) {
    var mins = Math.round(seconds / 60);
    if (mins < 60) return mins + " min";
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + " hr" + (m ? " " + m + " min" : "");
  }

  // ---- Shared page helpers -------------------------------------------------

  function liveUrl(path) {
    return cfg.liveOrigin.replace(/\/$/, "") + path;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function renderHeader() {
    if (schedule) {
      var names = document.querySelectorAll("[data-channel]");
      for (var i = 0; i < names.length; i++) names[i].textContent = schedule.channel;
      var page = document.body.getAttribute("data-page-title");
      document.title = (page ? page + " · " : "") + schedule.channel;
    }
    var onAir = document.getElementById("on-air");
    var viewers = document.getElementById("viewers");
    var live = !!(status && status.online);
    if (onAir) {
      onAir.classList.toggle("is-live", live);
      onAir.setAttribute("aria-label", live ? "On air" : "Off air");
    }
    if (viewers) {
      var count = status && status.online ? status.viewerCount : null;
      viewers.textContent = count === null ? "" : count + " watching";
      viewers.hidden = count === null;
    }
  }

  // Carry the test switches across the nav links.
  function keepTestParams() {
    var keep = new URLSearchParams();
    ["now", "online"].forEach(function (k) {
      if (params.has(k)) keep.set(k, params.get(k));
    });
    var qs = keep.toString();
    if (!qs) return;
    var links = document.querySelectorAll("a[data-nav]");
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute("href", links[i].getAttribute("href").split("?")[0] + "?" + qs);
    }
    var banner = el("div", "test-banner", "Test mode: " + decodeURIComponent(qs).replace(/&/g, " · "));
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // ---- Start ---------------------------------------------------------------

  function start() {
    keepTestParams();
    on(renderHeader);
    loadSchedule();
    fetchStatus();
    // Pages re-render every second for countdowns and progress bars.
    setInterval(emit, 1000);
    // Phones freeze timers in the background; catch up as soon as the page is back.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        fetchStatus();
        loadSchedule();
      }
    });
  }

  window.Broadcast = {
    config: cfg,
    now: now,
    on: on,
    compute: compute,
    clockTime: clockTime,
    ready: function () { return !!schedule && statusChecked; },
    scheduleError: function () { return scheduleError; },
    schedule: function () { return schedule; },
    fmtTime: fmtTime,
    fmtDay: fmtDay,
    fmtRuntime: fmtRuntime,
    zoneLabel: zoneLabel,
    canUseLocal: canUseLocal,
    isLocal: isLocal,
    setLocal: setLocal,
    liveUrl: liveUrl,
    el: el
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
