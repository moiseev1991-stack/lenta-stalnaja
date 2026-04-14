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

  const POSTER_PAUSE = 4000;
  const FADE_MS = 400;
  const CELL_STAGGER_MS = 900;

  function getRandom(arr, exclude) {
    const pool = arr.filter(function (v) {
      return v !== exclude;
    });
    if (pool.length) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    if (arr.length) {
      return arr[Math.floor(Math.random() * arr.length)];
    }
    return null;
  }

  function fadeOut(el, cb) {
    if (!el) {
      if (typeof cb === 'function') cb();
      return;
    }
    el.style.opacity = '0';
    setTimeout(function () {
      if (typeof cb === 'function') cb();
    }, FADE_MS);
  }

  function fadeIn(el) {
    if (el) el.style.opacity = '1';
  }

  function capturePosterFrame(video) {
    try {
      var w = video.videoWidth;
      var h = video.videoHeight;
      if (!w || !h) return null;
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) {
      return null;
    }
  }

  function initCell(cell, startDelay) {
    var firstSrc = getRandom(VIDEO_POOL, null);
    setTimeout(function () {
      playVideo(cell, firstSrc);
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

      var played = false;
      function onCanPlay() {
        if (played) return;
        played = true;
        fadeIn(video);
        video.play().catch(function () {});
      }
      video.addEventListener('canplay', onCanPlay, { once: true });
      video.addEventListener('loadeddata', onCanPlay, { once: true });

      video.addEventListener('ended', function () {
        fadeOut(video, function () {
          video.pause();
          var posterDataUrl = capturePosterFrame(video);

          if (!posterDataUrl) {
            var nextA = getRandom(VIDEO_POOL, src);
            playVideo(cell, nextA);
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
            requestAnimationFrame(function () {
              img.style.opacity = '1';
            });
          });

          setTimeout(function () {
            var nextSrc = getRandom(VIDEO_POOL, src);
            fadeOut(img, function () {
              playVideo(cell, nextSrc);
            });
          }, POSTER_PAUSE);
        });
      });

      video.addEventListener('error', function () {
        var nextSrc = getRandom(VIDEO_POOL, src);
        cell.innerHTML = '';
        playVideo(cell, nextSrc);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cells = document.querySelectorAll('.hero-collage__cell');
    cells.forEach(function (cell, i) {
      initCell(cell, i * CELL_STAGGER_MS);
    });
  });
})();
