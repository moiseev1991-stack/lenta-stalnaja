(function () {
  var VIDEO_POOL = [
    '/vid/IMG_1826.MOV',
    '/vid/IMG_1828.MOV',
    '/vid/IMG_1830.MOV',
    '/vid/IMG_1832.MOV',
    '/vid/IMG_2090.MOV',
    '/vid/IMG_2093.MOV',
    '/vid/IMG_2095.MOV',
    '/vid/IMG_2100.MOV',
    '/vid/video_2026-04-14_21-06-12.mp4',
    '/vid/video_2026-04-14_21-07-08.mp4',
  ];

  var FADE_MS         = 400;
  var CELL_STAGGER_MS = 900;
  var LOAD_TIMEOUT_MS = 9000;  // skip if canplay never fires
  var STALL_EXTRA_MS  = 3000;  // extra wait after stall before skipping

  function getRandom(arr, exclude) {
    var pool = arr.filter(function (v) { return v !== exclude; });
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    if (arr.length)  return arr[Math.floor(Math.random() * arr.length)];
    return null;
  }

  function fadeOut(el, cb) {
    if (!el) { if (cb) cb(); return; }
    el.style.opacity = '0';
    setTimeout(function () { if (cb) cb(); }, FADE_MS);
  }
  function fadeIn(el) { if (el) el.style.opacity = '1'; }

  function makeVideo(src) {
    var v = document.createElement('video');
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    v.load();
    return v;
  }

  function initCell(cell, startDelay) {
    setTimeout(function () {
      playVideo(cell, getRandom(VIDEO_POOL, null), null);
    }, startDelay);

    function playVideo(cell, src, preloaded) {
      if (!src) return;

      // Re-use preloaded element if it's healthy; otherwise create fresh
      var video = (preloaded && !preloaded.error) ? preloaded : makeVideo(src);
      video.style.cssText += ';opacity:0;transition:opacity ' + FADE_MS + 'ms ease;';

      cell.innerHTML = '';
      cell.appendChild(video);

      var finished = false;
      var nextSrc  = null;
      var nextVid  = null;

      function goNext() {
        if (finished) return;
        finished = true;
        clearTimeout(loadTimer);
        cell.innerHTML = '';
        playVideo(cell, nextSrc || getRandom(VIDEO_POOL, src), nextVid);
      }

      // Watchdog: skip if canplay never fires
      var loadTimer = setTimeout(goNext, LOAD_TIMEOUT_MS);

      function onReady() {
        clearTimeout(loadTimer);
        fadeIn(video);
        video.play().catch(goNext);

        // Preload next video NOW so it's ready when this one ends
        nextSrc = getRandom(VIDEO_POOL, src);
        nextVid = makeVideo(nextSrc);
      }

      // Already buffered (reused preloaded element)?
      if (video.readyState >= 3) {
        onReady();
      } else {
        video.addEventListener('canplay',    onReady, { once: true });
        video.addEventListener('loadeddata', onReady, { once: true });
      }

      video.addEventListener('error', goNext);

      video.addEventListener('stalled', function () {
        clearTimeout(loadTimer);
        loadTimer = setTimeout(goNext, STALL_EXTRA_MS);
      });

      video.addEventListener('ended', function () {
        if (finished) return;
        finished = true;
        clearTimeout(loadTimer);
        video.pause();

        // If next video already buffered → swap instantly
        if (nextVid && nextVid.readyState >= 3) {
          fadeOut(video, function () {
            cell.innerHTML = '';
            playVideo(cell, nextSrc, nextVid);
          });
          return;
        }

        // Otherwise: fade out, show subtle loading state, wait for next
        fadeOut(video, function () {
          cell.innerHTML = '';
          // nextVid is loading in background; start it as soon as canplay fires
          if (nextVid) {
            var waited = false;
            var waitTimer = setTimeout(function () {
              // Fallback: canplay never came — create fresh and try anyway
              if (waited) return;
              waited = true;
              playVideo(cell, nextSrc, null);
            }, 5000);

            nextVid.addEventListener('canplay', function () {
              if (waited) return;
              waited = true;
              clearTimeout(waitTimer);
              playVideo(cell, nextSrc, nextVid);
            }, { once: true });
          } else {
            playVideo(cell, getRandom(VIDEO_POOL, src), null);
          }
        });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.hero-collage__cell').forEach(function (cell, i) {
      initCell(cell, i * CELL_STAGGER_MS);
    });
  });
})();
