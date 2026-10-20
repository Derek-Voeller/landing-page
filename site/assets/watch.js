/* Watch page: switches between pre-show, live, stand-by and off-air on its own. */
(function () {
  "use strict";

  var B = window.Broadcast;
  var $ = function (id) { return document.getElementById(id); };

  var cards = {
    loading: $("card-loading"),
    preshow: $("card-preshow"),
    standby: $("card-standby"),
    offair: $("card-offair")
  };
  var player = $("player");
  var playerWrap = $("player-wrap");
  var nowBar = $("now-bar");
  var lineupPanel = $("lineup-panel");
  var shownPhase = null;
  var lineupKey = "";

  // Chat stays up in every state so people can gather early and talk through outages.
  $("chat").src = B.liveUrl("/embed/chat/readwrite");

  function showPhase(phase) {
    document.body.setAttribute("data-phase", phase);
    Object.keys(cards).forEach(function (k) { cards[k].hidden = k !== phase; });
    playerWrap.hidden = phase !== "live";
    nowBar.hidden = phase !== "live";
    lineupPanel.hidden = phase !== "preshow" && phase !== "offair";

    // Entering live (first load or the stream coming back) loads a fresh player,
    // so nobody has to tap anything. Leaving live unloads it.
    if (phase === "live") player.src = B.liveUrl("/embed/video");
    else if (shownPhase === "live") player.removeAttribute("src");
    shownPhase = phase;
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function countdown(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var days = Math.floor(s / 86400);
    var hms = pad(Math.floor(s / 3600) % 24) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
    return days ? days + (days === 1 ? " day " : " days ") + hms : hms;
  }

  function at(info, program) {
    var t = B.clockTime(info, program);
    return B.fmtTime(t) + " " + B.zoneLabel(t);
  }

  function titleOf(p) {
    return p.year ? p.title + " (" + p.year + ")" : p.title;
  }

  function renderNowBar(info) {
    var c = info.current, next = info.next;
    var label, title, slot = "", from, to, nextText = "";

    if (c) {
      label = c.type === "movie" ? "Now playing" : "On now";
      title = titleOf(c);
      from = c.start;
      to = c.start + c.length;
      var startMs = B.clockTime(info, c);
      var endMs = startMs + c.length * 1000;
      slot = B.fmtTime(startMs) + " – " + B.fmtTime(endMs) + " " + B.zoneLabel(endMs);
    } else if (next && !info.prev) {
      label = "Starting soon";
      title = "Stand by for " + next.title;
      from = to = null;
    } else if (next) {
      label = "We'll be right back";
      title = "Commercial break";
      from = info.prev ? info.prev.start + info.prev.length : 0;
      to = next.start;
    } else {
      label = "Signed off";
      title = "That's all for tonight";
      from = to = null;
    }
    if (next) nextText = "Up next: " + next.title + " at " + at(info, next);

    $("now-label").textContent = label;
    $("now-title").textContent = title;
    $("now-slot").textContent = slot;
    $("now-next").textContent = nextText;

    var progress = $("now-progress");
    var left = $("now-left");
    if (from !== null && to > from) {
      var pct = Math.min(1, Math.max(0, (info.elapsed - from) / (to - from)));
      progress.style.transform = "scaleX(" + pct + ")";
      var mins = Math.max(1, Math.ceil((to - info.elapsed) / 60));
      left.textContent = mins + " min left";
    } else {
      progress.style.transform = "scaleX(0)";
      left.textContent = "";
    }
    nowBar.classList.toggle("is-break", !c);
  }

  function renderLineup(info) {
    var movies = info.programs.filter(function (p) { return p.type === "movie"; });
    var key = info.start + "|" + B.isLocal() + "|" + JSON.stringify(movies);
    if (key === lineupKey) return;
    lineupKey = key;
    var list = $("lineup");
    list.textContent = "";
    movies.forEach(function (p) {
      var li = B.el("li");
      li.appendChild(B.el("span", "lineup-time", B.fmtTime(B.clockTime(info, p))));
      li.appendChild(B.el("span", "lineup-title", p.title));
      li.appendChild(B.el("span", "lineup-year", p.year));
      list.appendChild(li);
    });
    $("lineup-title").textContent = "Tonight's lineup · " + B.zoneLabel(info.start);
  }

  function render() {
    if (!B.ready()) {
      if (B.scheduleError()) $("loading-text").textContent = "Can't load the schedule. Retrying…";
      return;
    }
    var info = B.compute();
    if (info.phase !== shownPhase) showPhase(info.phase);

    if (info.phase === "preshow") {
      $("countdown").textContent = countdown(info.planned - info.now);
      $("preshow-start").textContent = B.fmtDay(info.planned) + " at " +
        B.fmtTime(info.planned) + " " + B.zoneLabel(info.planned);
    } else if (info.phase === "live") {
      renderNowBar(info);
    } else if (info.phase === "standby") {
      $("standby-scheduled").textContent = info.current ? "Scheduled now: " + titleOf(info.current) : "";
    }
    if (info.phase === "preshow" || info.phase === "offair") renderLineup(info);
  }

  B.on(render);
})();
