// bjobsx.com home: the open-jobs coverflow (arrows, keys, drag, trackpad swipe), the job's details and button under
// it, and the faint cards behind the hero. Same motion as b0-x.com and bChatX's "Pick a room". Jobs: #jobs-data.
(() => {
  const jobs = JSON.parse(document.getElementById('jobs-data').textContent);
  const flow = document.querySelector('.flow');
  const info = document.querySelector('.info');
  if (!flow || !jobs.length) return;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ext = (h) => /^https?:/.test(h);

  const cards = jobs.map((j) => {
    const a = document.createElement('a');
    a.className = 'job';
    a.href = j.href;
    if (ext(j.href)) { a.target = '_blank'; a.rel = 'noopener'; }
    a.style.setProperty('--c', j.color);
    a.innerHTML = `<div class="job-art">${j.art ? `<img src="${esc(j.art)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<span class="job-ghost">${esc(j.ghost || '')}</span>`}</div>
      <div class="job-body"><span class="chip"><i></i>${esc(j.scope)} · ${esc(j.kind)}</span><h3>${esc(j.title)}</h3><p>${esc(j.line)}</p>
      <div class="job-foot"><b>${esc(j.pay)}</b><span>${esc(j.time)}</span></div></div>`;
    flow.appendChild(a);
    return a;
  });

  // The faint cards behind the hero: the same jobs, tilted.
  const ghosts = document.querySelector('.ghost-cards');
  if (ghosts) {
    const spots = [[4, 10, -6], [30, 2, 4], [56, 16, -3], [80, 4, 6], [14, 56, 3], [44, 60, -5], [70, 54, 2]];
    ghosts.innerHTML = spots.map(([x, y, r], k) => { const j = jobs[k % jobs.length]; return `<span style="left:${x}%;top:${y}%;--r:${r}deg"><i>${esc(j.scope)}</i><b>${esc(j.title)}</b></span>`; }).join('');
  }

  let cur = 0, drag = 0, cw = 300, wide = 1000, shown = -1;
  const N = cards.length;

  function measure() { wide = flow.clientWidth; cw = cards[0].offsetWidth || cw; place(); }

  function place() {
    const gap = cw * (wide < cw * 2.4 ? 0.42 : 0.5);
    cards.forEach((c, k) => {
      let o = k - cur - drag;
      o = N > 1 ? (((o % N) + N + N / 2) % N) - N / 2 : 0;
      const ab = Math.abs(o), s = Math.sign(o);
      const x = ab < 1 ? o * cw * 0.62 : s * (cw * 0.62 + (ab - 1) * gap);
      const ry = Math.max(-1, Math.min(1, o)) * -42;
      const z = -Math.min(ab, 1) * cw * 0.5 - Math.max(0, ab - 1) * 30;
      c.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${ry.toFixed(1)}deg)`;
      c.style.zIndex = 100 - Math.round(ab * 10);
      c.style.opacity = Math.max(0.25, 1 - ab * 0.16);
      c.style.filter = ab < 0.5 ? 'none' : `brightness(${Math.max(0.45, 1 - ab * 0.2).toFixed(2)})`;
      c.style.visibility = ab > 3.5 ? 'hidden' : '';
      c.classList.toggle('on', k === cur && !drag);
      c.classList.toggle('nodur', !!drag);
      c.toggleAttribute('aria-hidden', k !== cur);
      c.tabIndex = k === cur ? 0 : -1;
    });
    const near = (((Math.round(cur + drag) % N) + N) % N);
    if (near !== shown) show(near);
  }

  function show(k) {
    const j = jobs[k];
    shown = k;
    info.querySelector('.info-t').textContent = j.title;
    info.querySelector('.info-l').textContent = j.line;
    info.querySelector('.info-m').innerHTML = `<span class="pay">${esc(j.pay)}</span><span>${esc(j.time)}</span><span>${esc(j.scope)}</span><span>${esc(j.kind)}</span>`;
    const go = info.querySelector('.info-go');
    go.href = j.href;
    go.textContent = j.go;
    if (ext(j.href)) { go.target = '_blank'; go.rel = 'noopener'; } else { go.removeAttribute('target'); go.removeAttribute('rel'); }
    info.querySelector('[data-count]').textContent = `${k + 1} / ${N}`;
  }

  const go = (k) => { cur = ((k % N) + N) % N; drag = 0; place(); };
  flow.querySelector('.prev').onclick = () => go(cur - 1);
  flow.querySelector('.next').onclick = () => go(cur + 1);
  flow.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { go(cur - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(cur + 1); e.preventDefault(); }
  });
  // A side card brings itself to the middle; only the middle card follows its link. A drag is never a click.
  cards.forEach((c, k) => c.addEventListener('click', (e) => {
    if (st.moved || k !== cur) { e.preventDefault(); if (!st.moved) go(k); }
  }));

  const st = { down: false, moved: false, x: 0, y: 0 };
  flow.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.arrow')) return;
    Object.assign(st, { down: true, moved: false, x: e.clientX, y: e.clientY });
  });
  flow.addEventListener('pointermove', (e) => {
    if (!st.down) return;
    const dx = e.clientX - st.x;
    if (!st.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - st.y)) {
      st.moved = true;
      try { flow.setPointerCapture(e.pointerId); } catch {}
    }
    if (st.moved) { drag = -dx / (cw * 0.6); place(); }
  });
  const up = () => {
    if (!st.down) return;
    st.down = false;
    if (st.moved) { go(Math.round(cur + drag)); setTimeout(() => { st.moved = false; }, 0); }
  };
  flow.addEventListener('pointerup', up);
  flow.addEventListener('pointercancel', up);

  // Trackpad / Magic Mouse: horizontal scroll follows the finger, then snaps.
  let wheelEnd;
  document.querySelector('.jobs').addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    drag += e.deltaX / (cw * 0.6);
    place();
    clearTimeout(wheelEnd);
    wheelEnd = setTimeout(() => go(Math.round(cur + drag)), 120);
  }, { passive: false });

  addEventListener('resize', measure);
  measure();
})();
