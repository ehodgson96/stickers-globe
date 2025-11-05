export function createUI(stickerData, container, camera, orbit) {
  // Loading overlay
  const loadingOverlay = document.getElementById('loading-overlay');
  const loading = {
    show: () => loadingOverlay && (loadingOverlay.style.display = 'flex'),
    hide: () => loadingOverlay && (loadingOverlay.style.display = 'none')
  };

  // Sidebar
  const stickerList = document.getElementById('sticker-list');
  const stickerCount = document.getElementById('sticker-count');
  stickerCount.textContent = `${stickerData.length} stickers found`;

  let onSidebarClick = () => { };

  stickerData.forEach((sticker, index) => {
    const item = document.createElement('div');
    item.className = 'sticker-item';
    item.innerHTML = `
      <div class="sticker-row">
        <div class="sticker-title">${sticker.title}</div>
      </div>
      <div class="sticker-row">
        <div class="sticker-date">${sticker.date}</div>
      </div>
      <div class="sticker-coords">${sticker.lat.toFixed(4)}°, ${sticker.lng.toFixed(4)}°</div>
    `;
    item.addEventListener('click', () => onSidebarClick(index));
    stickerList.appendChild(item);
  });

  const sidebar = {
    setActive: (index) => {
      document.querySelectorAll('.sticker-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
      });
    },
    scrollTo: (index) => {
      const items = document.querySelectorAll('.sticker-item');
      items[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    onClick: (callback) => onSidebarClick = callback
  };

  // Popout
  const popout = document.getElementById('sticker-popout');
  const popoutImage = document.getElementById('popout-image');
  const popoutTitle = document.getElementById('popout-title');
  const popoutDate = document.getElementById('popout-date');
  const popoutLikes = document.getElementById('popout-likes');
  const popoutCoords = document.getElementById('popout-coords');
  const popoutLink = document.getElementById('popout-link');
  let currentIndex = null;

  popout.querySelector('.popout-close').addEventListener('click', () => {
    popoutUI.hide();
    orbit.lockedMarker = null;
  });

  const popoutUI = {
    show: (index) => {
      const s = stickerData[index];
      if (!s) return;

      popoutTitle.textContent = s.title || 'Sticker';
      popoutDate.textContent = s.date || '';
      popoutLikes.textContent = s.likeCount ? `${s.likeCount} likes` : '';
      popoutCoords.textContent = `${Number(s.lat).toFixed(4)}°, ${Number(s.lng).toFixed(4)}°`;
      popoutLink.href = s.link || '#';
      popoutImage.src = './assets/stickers/' + (s.imageUrl || '');
      popoutImage.alt = s.title || 'Sticker photo';

      popout.classList.remove('hidden');
      requestAnimationFrame(() => popout.classList.add('open'));
      currentIndex = index;
      popoutUI.updatePosition();
    },
    hide: () => {
      popout.classList.remove('open');
      setTimeout(() => {
        if (!popout.classList.contains('open')) {
          popout.classList.add('hidden');
        }
      }, 350);
      currentIndex = null;
    },
    updatePosition: () => {
      if (currentIndex == null || !orbit.lockedMarker) return;

      const rect = container.getBoundingClientRect();
      const world = new THREE.Vector3();
      orbit.lockedMarker.getWorldPosition(world);
      world.project(camera);

      const x = (world.x * 0.5 + 0.5) * rect.width;
      const y = (-world.y * 0.5 + 0.5) * rect.height;

      let left = x + 180;
      let top = y - 200;

      const w = popout.offsetWidth || 320;
      const h = popout.offsetHeight || 220;
      left = Math.max(10, Math.min(rect.width - w - 10, left));
      top = Math.max(10, Math.min(rect.height - h - 10, top));

      popout.style.left = `${left}px`;
      popout.style.top = `${top}px`;
    }
  };

  // Mobile UI hint
  if ('ontouchstart' in window) {
    const controls = document.querySelector('.controls');
    controls.innerHTML = `<p>👆 Drag to orbit</p><p>🤏 Pinch to zoom</p><p>📍 Tap a marker to open</p>`;
  }

  const controls = document.getElementById('controls') || document.querySelector('.controls');
  const toggleBtn = document.getElementById('controls-toggle');

  if (!controls || !toggleBtn) return;

  controls.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    e.stopPropagation();
    controls.classList.add('minimised');
    toggleBtn.setAttribute('aria-expanded', 'false');
  });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    controls.classList.remove('minimised');
    toggleBtn.setAttribute('aria-expanded', 'true');
  });

  return { loading, sidebar, popout: popoutUI };
}