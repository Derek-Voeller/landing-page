/* Watch on TV page: fills in the direct stream link and the copy button. */
(function () {
  "use strict";

  var B = window.Broadcast;
  var link = B.liveUrl(B.config.hlsPath);
  var input = document.getElementById("direct-link");
  var status = document.getElementById("copy-status");

  input.value = link;
  document.querySelectorAll(".direct-link-a").forEach(function (a) { a.href = link; });
  document.querySelectorAll(".site-address").forEach(function (el) {
    el.textContent = location.host + location.pathname.replace(/[^/]*$/, "");
  });

  function copied(ok) {
    status.textContent = ok ? "Copied. Paste it into VLC or your TV's browser." : "Press and hold the link to copy it.";
  }

  function fallbackCopy() {
    input.focus();
    input.select();
    input.setSelectionRange(0, link.length);
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* unsupported */ }
    copied(ok);
  }

  document.getElementById("copy-link").addEventListener("click", function () {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(function () { copied(true); }, fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  input.addEventListener("focus", function () { input.select(); });
})();
