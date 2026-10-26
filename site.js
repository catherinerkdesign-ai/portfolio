// Display settings: theme (system / light / dark) and contrast (standard / high).
// High contrast is independent of theme, so it can apply on top of light or dark.
(function () {
  var root = document.documentElement;
  var KEY_THEME = "crk-theme";
  var KEY_CONTRAST = "crk-contrast";

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* storage unavailable: settings last for this page view only */ }
  }

  var mqDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var mqMore = window.matchMedia ? window.matchMedia("(prefers-contrast: more)") : null;

  function applyTheme(value) {
    if (value === "light" || value === "dark") root.setAttribute("data-theme", value);
    else root.removeAttribute("data-theme");
  }
  function applyContrast(value) {
    if (value === "more" || value === "standard") root.setAttribute("data-contrast", value);
    else root.removeAttribute("data-contrast");
  }

  // Apply stored choices before paint as far as possible.
  var storedTheme = read(KEY_THEME);
  var storedContrast = read(KEY_CONTRAST);
  if (storedTheme) applyTheme(storedTheme);
  if (storedContrast) applyContrast(storedContrast);

  function hexToRgb(str) {
    var m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(",").map(function (s) { return parseFloat(s); });
    return p.slice(0, 3);
  }
  function luminance(rgb) {
    var c = rgb.map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) {
    var l1 = luminance(a), l2 = luminance(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function modeName() {
    var cs = getComputedStyle(root).colorScheme || "";
    var dark = cs.indexOf("dark") !== -1;
    var contrast = root.getAttribute("data-contrast");
    var more = contrast === "more" || (contrast !== "standard" && mqMore && mqMore.matches);
    return (more ? "high contrast " : "") + (dark ? "dark" : "light");
  }

  function updateReadout() {
    var out = document.querySelectorAll("[data-readout]");
    if (!out.length) return;
    var s = getComputedStyle(document.body);
    var fg = hexToRgb(s.color), bg = hexToRgb(s.backgroundColor);
    if (!fg || !bg) return;
    var r = ratio(fg, bg);
    var label = (Math.floor(r * 10) / 10).toFixed(1) + ":1";
    out.forEach(function (el) {
      var num = el.querySelector("[data-ratio]");
      var mode = el.querySelector("[data-mode]");
      if (num) num.textContent = label;
      if (mode) mode.textContent = modeName();
    });
  }

  function syncControls() {
    var t = read(KEY_THEME) || "system";
    var c = root.getAttribute("data-contrast");
    var cValue = c === "more" || c === "standard" ? c : (mqMore && mqMore.matches ? "more" : "standard");
    document.querySelectorAll('input[name="theme"]').forEach(function (i) { i.checked = i.value === t; });
    document.querySelectorAll('input[name="contrast"]').forEach(function (i) { i.checked = i.value === cValue; });
  }

  document.addEventListener("DOMContentLoaded", function () {
    syncControls();
    updateReadout();

    document.querySelectorAll('input[name="theme"]').forEach(function (input) {
      input.addEventListener("change", function () {
        var v = input.value === "system" ? null : input.value;
        write(KEY_THEME, v);
        applyTheme(v);
        updateReadout();
      });
    });
    document.querySelectorAll('input[name="contrast"]').forEach(function (input) {
      input.addEventListener("change", function () {
        write(KEY_CONTRAST, input.value);
        applyContrast(input.value);
        updateReadout();
      });
    });

    if (mqDark && mqDark.addEventListener) mqDark.addEventListener("change", updateReadout);
    if (mqMore && mqMore.addEventListener) mqMore.addEventListener("change", function () { syncControls(); updateReadout(); });

    // A host page (such as a preview viewer) may set data-theme itself.
    new MutationObserver(updateReadout).observe(root, { attributes: true, attributeFilter: ["data-theme", "data-contrast"] });

    // Display menu: close on Escape or a click outside.
    var menu = document.querySelector("details.display");
    if (menu) {
      document.addEventListener("click", function (e) {
        if (menu.open && !menu.contains(e.target)) menu.open = false;
      });
      menu.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && menu.open) {
          menu.open = false;
          menu.querySelector("summary").focus();
        }
      });
    }

    // Typing animation for the homepage greeting. The full sentence is always
    // in the page for screen readers; only the visible copy animates, and it
    // stays still for people who prefer reduced motion.
    var typed = document.querySelector("[data-type]");
    var caret = document.querySelector(".caret");
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typed && !still) {
      var full = typed.textContent;
      typed.textContent = "";
      if (caret) caret.hidden = false;
      var i = 0;
      setTimeout(function step() {
        i += 1;
        typed.textContent = full.slice(0, i);
        if (i < full.length) setTimeout(step, full.charAt(i - 1) === "," ? 260 : 55);
        else if (caret) setTimeout(function () { caret.hidden = true; }, 2600);
      }, 500);
    }

    // Photo carousel: arrow buttons step one photo at a time; the track also
    // scrolls with touch, trackpad and the keyboard arrow keys.
    document.querySelectorAll(".carousel").forEach(function (carousel) {
      var section = carousel.parentElement;
      var track = carousel.querySelector(".carousel-track");
      var slides = Array.prototype.slice.call(track.querySelectorAll(".slide"));
      var prev = section.querySelector('.carousel-btn[data-dir="-1"]');
      var next = section.querySelector('.carousel-btn[data-dir="1"]');
      var current = section.querySelector("[data-current]");
      if (!track || !slides.length) return;

      function index() {
        var left = track.scrollLeft;
        var best = 0;
        slides.forEach(function (s, i) {
          if (Math.abs(s.offsetLeft - track.offsetLeft - left) < Math.abs(slides[best].offsetLeft - track.offsetLeft - left)) best = i;
        });
        return best;
      }
      function update() {
        var i = index();
        var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
        if (current) current.textContent = atEnd ? slides.length : i + 1;
        if (prev) prev.disabled = track.scrollLeft <= 2;
        if (next) next.disabled = atEnd;
      }
      function go(dir) {
        var i = Math.max(0, Math.min(slides.length - 1, index() + dir));
        track.scrollTo({ left: slides[i].offsetLeft - track.offsetLeft });
      }
      if (prev) prev.addEventListener("click", function () { go(-1); });
      if (next) next.addEventListener("click", function () { go(1); });
      var t;
      track.addEventListener("scroll", function () { clearTimeout(t); t = setTimeout(update, 60); });
      window.addEventListener("resize", update);
      update();
    });

    // Respect reduced motion: don't autoplay looping demo videos.
    if (still) document.querySelectorAll("video[autoplay]").forEach(function (v) { v.pause(); v.removeAttribute("autoplay"); });

    // Lightbox: click (or Enter/Space) on a case study image to see it larger.
    var zoomables = document.querySelectorAll(".case-body .figure img:not([style*=\"mask\"]):not(.ia-scroll img)");
    if (zoomables.length && window.HTMLDialogElement) {
      var dlg = document.createElement("dialog");
      dlg.className = "lightbox";
      dlg.setAttribute("aria-label", "Enlarged image");
      dlg.innerHTML = '<button type="button" class="lightbox-close" aria-label="Close enlarged image">' +
        '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>' +
        '<img alt=""><p class="lightbox-caption"></p>';
      document.body.appendChild(dlg);
      var big = dlg.querySelector("img");
      var cap = dlg.querySelector(".lightbox-caption");
      var opener = null;
      function openBox(img) {
        opener = img;
        big.src = img.currentSrc || img.src;
        big.alt = img.alt;
        var fig = img.closest("figure");
        var fc = fig && fig.querySelector("figcaption");
        cap.textContent = fc ? fc.textContent.trim() : "";
        cap.hidden = !cap.textContent;
        dlg.showModal();
      }
      dlg.addEventListener("click", function (e) {
        if (e.target === dlg || e.target.closest(".lightbox-close")) dlg.close();
      });
      dlg.addEventListener("close", function () { if (opener) opener.focus(); });
      zoomables.forEach(function (img) {
        img.classList.add("zoomable");
        img.setAttribute("tabindex", "0");
        img.setAttribute("role", "button");
        img.setAttribute("aria-label", "Enlarge image: " + img.alt);
        img.addEventListener("click", function () { openBox(img); });
        img.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBox(img); }
        });
      });
    }

    document.querySelectorAll("button.copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-copy"));
        if (!target) return;
        var text = target.textContent.trim();
        function selectIt() {
          var range = document.createRange();
          range.selectNodeContents(target);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          btn.textContent = "Selected";
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { btn.textContent = "Copied"; }, selectIt);
        } else {
          selectIt();
        }
      });
    });
  });
})();
