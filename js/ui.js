import * as THREE from 'three';

export function createUI(stickerData, container, camera, orbit, sceneSetup) {
  // Loading overlay
  const loadingOverlay = document.getElementById('loading-overlay');
  const loading = {
    show: () => loadingOverlay && (loadingOverlay.style.display = 'flex'),
    hide: () => loadingOverlay && (loadingOverlay.style.display = 'none')
  };

  // Sidebar
  const stickerList = document.getElementById('sticker-list');
  const stickerCount = document.getElementById('sticker-count');
  if (stickerCount) {
    stickerCount.textContent = `${stickerData.length} stickers found`;
  }

  let onSidebarClick = () => {};

  if (stickerList) {
    stickerData.forEach((sticker, index) => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      const coords = (sticker.lat != null && sticker.lng != null)
        ? `${sticker.lat.toFixed(4)}°, ${sticker.lng.toFixed(4)}°`
        : 'Location classified';
      item.innerHTML = `
        <div class="sticker-row">
          <div class="sticker-title">${sticker.title}</div>
        </div>
        <div class="sticker-row">
          <div class="sticker-date">${sticker.date}</div>
        </div>
        <div class="sticker-coords">${coords}</div>
      `;
      item.addEventListener('click', () => onSidebarClick(index));
      stickerList.appendChild(item);
    });
  }

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
    onClick: (callback) => {
      onSidebarClick = callback;
    }
  };

  // Sticker popout
  const popout = document.getElementById('sticker-popout');
  const popoutImage = document.getElementById('popout-image');
  const popoutTitle = document.getElementById('popout-title');
  const popoutDate = document.getElementById('popout-date');
  const popoutLikes = document.getElementById('popout-likes');
  const popoutCoords = document.getElementById('popout-coords');
  const popoutLink = document.getElementById('popout-link');
  let currentIndex = null;

  const popoutUI = {
    show: (index) => {
      if (!popout) return;

      const s = stickerData[index];
      if (!s) return;

      if (popoutTitle) popoutTitle.textContent = s.title || 'Sticker';
      if (popoutDate) popoutDate.textContent = s.date || '';
      if (popoutLikes) popoutLikes.textContent = s.likeCount ? `${s.likeCount} likes` : '';
      if (popoutCoords) {
        popoutCoords.textContent = (s.lat != null && s.lng != null)
          ? `${Number(s.lat).toFixed(4)}°, ${Number(s.lng).toFixed(4)}°`
          : 'Location classified';
      }
      if (popoutLink) popoutLink.href = s.link || '#';
      if (popoutImage) {
        popoutImage.src = './assets/stickers/' + (s.imageUrl || '');
        popoutImage.alt = s.title || 'Sticker photo';
      }

      popout.classList.remove('hidden');
      requestAnimationFrame(() => popout.classList.add('open'));
      currentIndex = index;
      popoutUI.updatePosition();
    },
    hide: () => {
      if (!popout) return;
      popout.classList.remove('open');
      setTimeout(() => {
        if (!popout.classList.contains('open')) {
          popout.classList.add('hidden');
        }
      }, 350);
      currentIndex = null;
    },
    updatePosition: () => {
      if (!popout || currentIndex == null || !orbit.lockedMarker) return;

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

  popout?.querySelector('.popout-close')?.addEventListener('click', () => {
    popoutUI.hide();
    orbit.lockedMarker = null;
  });

  // Secret settings panel
  const settingsCog = document.getElementById('settings-cog');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsClose = document.getElementById('settings-close');
  const settingsEffects = document.getElementById('settings-effects');
  const fpsCounter = document.getElementById('fps-counter');
  let settingsOpen = false;

  function setSettingsOpen(isOpen) {
    settingsOpen = Boolean(isOpen);
    if (!settingsPanel || !settingsCog) return;
    settingsPanel.classList.toggle('open', settingsOpen);
    settingsPanel.setAttribute('aria-hidden', settingsOpen ? 'false' : 'true');
    settingsCog.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
  }

  function formatValue(value, step) {
    if (step >= 1) return `${Math.round(value)}`;
    const decimals = `${step}`.includes('.') ? `${step}`.split('.')[1].length : 2;
    return `${Number(value).toFixed(Math.min(decimals, 3))}`;
  }

  function buildSettingsControls() {
    if (!settingsEffects || !sceneSetup?.postProcessing?.effects) return;
    settingsEffects.innerHTML = '';

    sceneSetup.postProcessing.effects.forEach((effect) => {
      const effectCard = document.createElement('section');
      effectCard.className = 'effect-card';

      const effectHead = document.createElement('div');
      effectHead.className = 'effect-head';
      effectHead.innerHTML = `<span>${effect.label}</span>`;

      const enabledWrap = document.createElement('label');
      const enabledToggle = document.createElement('input');
      enabledToggle.type = 'checkbox';
      enabledToggle.checked = effect.getEnabled();
      enabledToggle.addEventListener('change', () => effect.setEnabled(enabledToggle.checked));
      enabledWrap.append(enabledToggle, document.createTextNode('ON'));
      effectHead.appendChild(enabledWrap);
      effectCard.appendChild(effectHead);

      const controlList = document.createElement('div');
      controlList.className = 'effect-controls';

      effect.controls.forEach((control) => {
        const row = document.createElement('div');
        row.className = 'effect-control';

        if (control.type === 'boolean') {
          const label = document.createElement('span');
          label.textContent = control.label;
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = Boolean(control.get());
          checkbox.addEventListener('change', () => control.set(checkbox.checked));
          row.append(label, checkbox);
        } else {
          const label = document.createElement('span');
          label.textContent = control.label;
          const value = document.createElement('span');
          value.className = 'effect-control-value';

          const input = document.createElement('input');
          input.type = 'range';
          input.min = `${control.min}`;
          input.max = `${control.max}`;
          input.step = `${control.step}`;
          input.value = `${control.get()}`;

          const updateValue = () => {
            const next = Number(input.value);
            control.set(next);
            value.textContent = formatValue(next, control.step);
          };

          value.textContent = formatValue(Number(input.value), control.step);
          input.addEventListener('input', updateValue);
          row.append(label, value, input);
        }

        controlList.appendChild(row);
      });

      effectCard.appendChild(controlList);
      settingsEffects.appendChild(effectCard);
    });
  }

  if (settingsCog && settingsPanel) {
    buildSettingsControls();

    settingsCog.addEventListener('click', (event) => {
      event.stopPropagation();
      setSettingsOpen(!settingsOpen);
    });

    settingsClose?.addEventListener('click', (event) => {
      event.stopPropagation();
      setSettingsOpen(false);
    });

    settingsPanel.addEventListener('click', (event) => {
      event.stopPropagation();
    });

    document.addEventListener('click', (event) => {
      if (!settingsOpen) return;
      const target = event.target;
      if (target && !target.closest('#settings-panel') && !target.closest('#settings-cog')) {
        setSettingsOpen(false);
      }
    });
  }

  const settings = {
    setFps: (fps) => {
      if (!fpsCounter) return;
      fpsCounter.textContent = `${Math.max(0, Math.round(fps))}`;
    },
    isOpen: () => settingsOpen
  };

  // Mobile UI hint
  if ('ontouchstart' in window) {
    const controlsHint = document.querySelector('.controls');
    if (controlsHint) {
      controlsHint.innerHTML = '<p>Drag to orbit</p><p>Pinch to zoom</p><p>Tap a marker to open</p>';
    }
  }

  const controls = document.getElementById('controls') || document.querySelector('.controls');
  const toggleBtn = document.getElementById('controls-toggle');

  if (controls && toggleBtn) {
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
  }

  // Sidebar toggle
  const sidebarToggleBtn = document.getElementById('sidebar-toggle');
  const sidebarEl = document.querySelector('.sidebar');
  if (sidebarToggleBtn && sidebarEl) {
    sidebarToggleBtn.addEventListener('click', () => {
      const collapsed = sidebarEl.classList.toggle('collapsed');
      sidebarToggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }

  return { loading, sidebar, popout: popoutUI, settings };
}
