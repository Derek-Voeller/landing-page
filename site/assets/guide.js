/* TV Guide page: one row per program, the live one highlighted, finished ones dimmed. */
(function () {
  "use strict";

  var B = window.Broadcast;
  var $ = function (id) { return document.getElementById(id); };
  var rowsKey = "";
  var rows = {};

  $("zone-toggle").addEventListener("click", function () {
    B.setLocal(!B.isLocal());
  });
  $("add-calendar").addEventListener("click", downloadCalendar);

  function build(info) {
    var list = $("rows");
    list.textContent = "";
    rows = {};
    var lastDay = "";
    info.programs.forEach(function (p) {
      var t = B.clockTime(info, p);
      var day = B.fmtDay(t);
      if (day !== lastDay) {
        list.appendChild(B.el("li", "day", day));
        lastDay = day;
      }
      var li = B.el("li", "row" + (p.type === "movie" ? "" : " row-station"));
      li.appendChild(B.el("div", "row-time", B.fmtTime(t)));
      var body = B.el("div", "row-body");
      var head = B.el("p", "row-head");
      head.appendChild(B.el("span", "row-title", p.title));
      if (p.year) head.appendChild(B.el("span", "row-year", "(" + p.year + ")"));
      head.appendChild(B.el("span", "row-runtime", B.fmtRuntime(p.length)));
      body.appendChild(head);
      if (p.blurb) body.appendChild(B.el("p", "row-blurb", p.blurb));
      li.appendChild(body);
      li.appendChild(B.el("span", "row-tag"));
      list.appendChild(li);
      rows[p.id] = li;
    });
  }

  function render() {
    var status = $("listings-status");
    if (!B.schedule()) {
      status.textContent = B.scheduleError() ? "Can't load the schedule. Retrying…" : "Loading the schedule…";
      return;
    }
    status.hidden = true;
    var info = B.compute();

    var key = info.start + "|" + B.isLocal() + "|" + JSON.stringify(info.programs);
    if (key !== rowsKey) {
      rowsKey = key;
      build(info);
      $("zone-note").textContent = B.isLocal()
        ? "Times in your time zone (" + B.zoneLabel(info.start) + ")"
        : "All times " + B.config.homeZoneLabel + " (Mountain Time)";
      $("zone-toggle").hidden = !B.canUseLocal();
      $("zone-toggle").textContent = B.isLocal() ? "Show " + B.config.homeZoneLabel : "Show my time";
      $("add-calendar").hidden = false;
    }

    var live = info.phase === "live" || info.phase === "standby";
    info.programs.forEach(function (p) {
      var li = rows[p.id];
      if (!li) return;
      var isNow = live && info.current === p;
      var isNext = !info.current && info.next === p && info.phase !== "offair";
      var done = p.start + p.length <= info.elapsed || info.phase === "offair";
      li.classList.toggle("is-now", isNow);
      li.classList.toggle("is-next", isNext);
      li.classList.toggle("is-done", done && !isNow);
      li.lastChild.textContent = isNow ? "On now" : isNext ? "Up next" : "";
    });
  }

  // ---- Add to calendar (.ics for the whole broadcast) ----------------------

  function icsDate(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function icsText(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  // Lines longer than 75 octets must be folded.
  function fold(line) {
    var out = [];
    while (line.length > 74) {
      out.push(line.slice(0, 74));
      line = " " + line.slice(74);
    }
    out.push(line);
    return out.join("\r\n");
  }

  function downloadCalendar() {
    var s = B.schedule();
    if (!s) return;
    var info = B.compute();
    var planned = info.planned;
    var lineup = info.programs
      .filter(function (p) { return p.type === "movie"; })
      .map(function (p) { return B.fmtTime(planned + p.start * 1000) + "  " + p.title + (p.year ? " (" + p.year + ")" : ""); })
      .join("\n");
    var url = location.origin + location.pathname.replace(/[^/]*$/, "");
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Halloween Broadcast//TV Guide//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:broadcast-" + icsDate(planned) + "@" + location.hostname,
      "DTSTAMP:" + icsDate(Date.now()),
      "DTSTART:" + icsDate(planned),
      "DTEND:" + icsDate(planned + info.total * 1000),
      "SUMMARY:" + icsText(s.channel + ": Halloween movie marathon"),
      "DESCRIPTION:" + icsText("Tune in at " + url + "\n\nLineup (" + B.zoneLabel(planned) + "):\n" + lineup),
      "URL:" + url,
      "BEGIN:VALARM",
      "TRIGGER:-PT15M",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + icsText(s.channel + " signs on in 15 minutes"),
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    var body = lines.map(fold).join("\r\n") + "\r\n";
    var blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "halloween-broadcast.ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  B.on(render);
})();
