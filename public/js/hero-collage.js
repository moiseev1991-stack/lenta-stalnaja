(function () {
  const VIDEO_POOL = [
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

  const POSTER_PAUSE    = 4000;
  const FADE_MS         = 400;
  const CELL_STAGGER_MS = 900;
  const LOAD_TIMEOUT_MS = 8000;  // skip if canplay never fires
  const STALL_EXTRA_MS  = 3000;  // extra wait after stall before skipping

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

  function capturePosterFrame(video) {
    try {
      var w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return null;
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) { return null; }
  }

  function initCell(cell, startDelay) {
    setTimeout(function () {
      playVideo(cell, getRandom(VIDEO_POOL, null));
    }, startDelay);

    function playVideo(cell, src) {
      if (!src) return;

      var video = document.createElement('video');
      video.src = src;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.preload = 'auto';
      video.style.opacity = '0';
      video.style.transition = 'opacity ' + FADE_MS + 'ms ease';

      cell.innerHTML = '';
      cell.appendChild(video);

      // Single-use guard: once skip() is called, nothing else can fire
      var finished = false;
      function skip() {
        if (finished) return;
        finished = true;
        clearTimeout(loadTimer);
        cell.innerHTML = '';
        playVideo(cell, getRandom(VIDEO_POOL, src));
      }

      // Watchdog: skip if video never becomes playable
      var loadTimer = setTimeout(skip, LOAD_TIMEOUT_MS);

      function onCanPlay() {
        clearTimeout(loadTimer);
        fadeIn(video);
        video.play().catch(skip);
      }
      video.addEventListener('canplay',     onCanPlay, { once: true });
      video.addEventListener('loadeddata',  onCanPlay, { once: true });

      // Skip if the browser reports an unrecoverable load error
      video.addEventListener('error', skip);

      // On stall, give a short extra window then skip
      video.addEventListener('stalled', function () {
        clearTimeout(loadTimer);
        loadTimer = setTimeout(skip, STALL_EXTRA_MS);
      });

      // Normal end: show poster frame briefly, then next video
      video.addEventListener('ended', function () {
        if (finished) return;
        finished = true;
        clearTimeout(loadTimer);

        fadeOut(video, function () {
          video.pause();
          var posterDataUrl = capturePosterFrame(video);

          if (!posterDataUrl) {
            cell.innerHTML = '';
            playVideo(cell, getRandom(VIDEO_POOL, src));
            return;
          }

          var img = document.createElement('img');
          img.alt = '';
          img.src = posterDataUrl;
          img.style.opacity = '0';
          img.style.transition = 'opacity ' + FADE_MS + 'ms ease';
          cell.innerHTML = '';
          cell.appendChild(img);

          requestAnimationFrame(function () {
            requestAnimationFrame(function () { img.style.opacity = '1'; });
          });

          setTimeout(function () {
            fadeOut(img, function () {
              cell.innerHTML = '';
              playVideo(cell, getRandom(VIDEO_POOL, src));
            });
          }, POSTER_PAUSE);
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
