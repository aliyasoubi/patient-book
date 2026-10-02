/*
 * dentixo.ir front page behaviour. Plain script, no dependencies: the site's
 * CSP allows scripts from this origin only, and the page has to work — just
 * less animated — when this file never runs.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const animate = !reduceMotion;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  const faDigits = (value) => String(value).replace(/\d/g, (d) => PERSIAN_DIGITS[d]);

  /* ── Reveal on scroll ───────────────────────────────────────────────── */
  // Wired before the `js` class goes on, because that class is what hides
  // these elements: if anything up to here throws, the content stays visible.
  const revealables = $$('[data-reveal]');
  if ('IntersectionObserver' in window && animate) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );
    revealables.forEach((el) => observer.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-visible'));
  }
  root.classList.add('js');

  /* ── Scroll: nav state, progress bar, workflow rail ─────────────────── */
  const nav = $('[data-nav]');
  const progress = $('.progress');
  const steps = $('[data-steps]');
  const stepItems = steps ? $$('.step', steps) : [];

  function onScroll() {
    // Every read first, then every write: interleaving them would force a
    // fresh layout for each step on every frame.
    const y = scrollY;
    const max = root.scrollHeight - innerHeight;
    const line = innerHeight * 0.6;
    const rail = steps?.getBoundingClientRect();
    const tops = stepItems.map((step) => step.getBoundingClientRect().top);

    nav?.classList.toggle('is-scrolled', y > 24);
    progress?.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : '0');
    if (steps && rail) {
      steps.style.setProperty('--progress', clamp((line - rail.top) / rail.height).toFixed(4));
      stepItems.forEach((step, i) => step.classList.toggle('is-active', tops[i] < line));
    }
  }

  let ticking = false;
  const scheduleScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onScroll();
      ticking = false;
    });
  };
  addEventListener('scroll', scheduleScroll, { passive: true });
  addEventListener('resize', scheduleScroll, { passive: true });
  onScroll();

  /* ── Pause control (WCAG 2.2.2) ─────────────────────────────────────── */
  const motionToggle = $('[data-motion-toggle]');
  if (motionToggle && animate) {
    const KEY = 'dentixo-landing-motion';
    const setPaused = (paused) => {
      root.classList.toggle('motion-paused', paused);
      motionToggle.setAttribute('aria-pressed', String(paused));
      motionToggle.setAttribute('aria-label', paused ? 'Play animations' : 'Pause animations');
    };
    let saved = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      // Storage blocked: the control still works for this visit.
    }
    setPaused(saved === 'paused');
    motionToggle.hidden = false;
    motionToggle.addEventListener('click', () => {
      const paused = !root.classList.contains('motion-paused');
      setPaused(paused);
      try {
        localStorage.setItem(KEY, paused ? 'paused' : 'playing');
      } catch {
        // Not remembered; nothing else depends on it.
      }
    });
  }

  /* ── Pointer effects (desktop only) ─────────────────────────────────── */
  if (finePointer && animate) {
    // The hero glow follows the pointer, and the product drawing tilts toward it.
    const hero = $('[data-hero]');
    const stage = $('[data-tilt]');
    hero?.addEventListener('pointermove', (event) => {
      if (root.classList.contains('motion-paused')) return;
      const rect = hero.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // Offsets from the glow's resting place (50%, 30%), moved by transform only.
      hero.style.setProperty('--dx', `${(x - rect.width * 0.5).toFixed(1)}px`);
      hero.style.setProperty('--dy', `${(y - rect.height * 0.3).toFixed(1)}px`);
      if (stage) {
        stage.style.setProperty('--rx', `${((x / rect.width - 0.5) * 10).toFixed(2)}deg`);
        stage.style.setProperty('--ry', `${((0.5 - y / rect.height) * 6).toFixed(2)}deg`);
      }
    });
    hero?.addEventListener('pointerleave', () => {
      stage?.style.setProperty('--rx', '0deg');
      stage?.style.setProperty('--ry', '0deg');
    });

    // Feature cards light up where the pointer is.
    for (const card of $$('[data-spotlight]')) {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
      });
    }

    // Buttons lean a little toward the pointer.
    for (const button of $$('[data-magnetic]')) {
      button.addEventListener('pointermove', (event) => {
        const rect = button.getBoundingClientRect();
        const dx = event.clientX - (rect.left + rect.width / 2);
        const dy = event.clientY - (rect.top + rect.height / 2);
        button.style.setProperty('--mx', `${(dx * 0.18).toFixed(1)}px`);
        button.style.setProperty('--my', `${(dy * 0.28).toFixed(1)}px`);
      });
      button.addEventListener('pointerleave', () => {
        button.style.setProperty('--mx', '0px');
        button.style.setProperty('--my', '0px');
      });
    }
  }

  /* ── The drawing's date card: the real Shamsi today ─────────────────── */
  // Intl knows the Persian calendar, so the drawing shows this actual month.
  const jalaliParts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const monthName = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long' });
  const weekdayName = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });

  function jalali(date) {
    const parts = jalaliParts.formatToParts(date);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  // Noon, so no daylight-saving shift can push a date across midnight.
  const dayAt = (date, offset) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, 12);

  const clock = $('[data-mock-time]');
  const dateLine = $('[data-mock-date]');
  const grid = $('[data-mock-cal]');

  function renderCalendar(now, today) {
    if (dateLine) {
      dateLine.textContent = `${weekdayName.format(now)}، ${faDigits(today.day)} ${monthName.format(now)} ${faDigits(today.year)}`;
    }
    if (!grid) return;
    const first = dayAt(now, 1 - today.day);
    let length = 29;
    while (length < 31 && jalali(dayAt(first, length)).month === today.month) length++;

    const cells = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'].map(
      (name, i) => `<span class="is-head${i === 6 ? ' is-friday' : ''}">${name}</span>`,
    );
    const leading = (first.getDay() + 1) % 7;
    for (let i = 0; i < leading; i++) cells.push('<span></span>');
    for (let d = 1; d <= length; d++) {
      const weekday = (first.getDay() + d - 1) % 7;
      const classes = [d === today.day && 'is-today', weekday === 5 && 'is-friday'].filter(Boolean);
      cells.push(`<span class="${classes.join(' ')}">${faDigits(d)}</span>`);
    }
    grid.innerHTML = cells.join('');
  }

  // The clock changes every minute; the grid only when the day does, so
  // today's pulse isn't restarted by needless rebuilds.
  let renderedDay = '';
  function tick() {
    const now = new Date();
    const today = jalali(now);
    if (today.year) {
      if (clock) {
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        clock.textContent = faDigits(`${hh}:${mm}`);
      }
      const key = `${today.year}/${today.month}/${today.day}`;
      if (key !== renderedDay) {
        renderedDay = key;
        renderCalendar(now, today);
      }
    }
    setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
  }
  tick();

  /* ── The drawing's tiles count up once it has arrived ───────────────── */
  const formatCount = (n) => faDigits(n.toLocaleString('en-US')).replace(/,/g, '٬');
  const counters = $$('[data-count]');
  if (animate) {
    counters.forEach((el) => (el.textContent = formatCount(0)));
    setTimeout(() => {
      const start = performance.now();
      const duration = 1400;
      const step = (now) => {
        const t = clamp((now - start) / duration);
        const eased = 1 - (1 - t) ** 3;
        for (const el of counters) {
          el.textContent = formatCount(Math.round(Number(el.dataset.count) * eased));
        }
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, 1700);
  }

  /* ── Footer year ────────────────────────────────────────────────────── */
  const year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
