// Número con código de país, sin + ni espacios. Ejemplo: "5491112345678"
const WHATSAPP_PHONE = "+543814013282";
const WHATSAPP_TEXT = "Acepto los ñoquis del domingo 29. Ahí voy.";

const COOLDOWN_MS = 420;
const BOUNCE_MS = 680;
const OVERSHOOT_PX = 28;
const WHEEL_THRESHOLD = 50;
const SWIPE_THRESHOLD = 48;
const EDGE_MARGIN = 12;
const ACCEPT_GAP = 16;
const HUD_GAP = 8;

const stage = document.querySelector("#stage");
const track = document.querySelector("#track");
const slides = [...track.querySelectorAll(".slide")];
const prev = document.querySelector("#prev");
const next = document.querySelector("#next");
const accept = document.querySelector("#accept");
const decline = document.querySelector("#decline");
const finale = document.querySelector("#finale");
const status = document.querySelector("#status");
const confetti = document.querySelector("#confetti");
const whatsapp = document.querySelector("#whatsapp");

const lastIndex = slides.length - 1;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let index = 0;
let locked = false;
let animating = false;
let finaleOpen = false;
let movedByUser = false;
let declineVisible = false;
let declineChased = false;
let accum = 0;
let motionToken = 0;
let cooldownTimer = 0;
let runTimer = 0;
let escapes = 0;
let touch = null;

const heartSvg = `<svg viewBox="0 0 80 74" aria-hidden="true"><path d="M40 66C16 50 8 36 8 24 8 14 16 8 26 8c6 0 11 3 14 8 3-5 8-8 14-8 10 0 18 6 18 16 0 12-8 26-32 42z" fill="#ff4d3a" stroke="#1c1c1c" stroke-width="4" stroke-linejoin="round"/></svg>`;
const gnocchiSvg = `<svg viewBox="0 0 240 150" aria-hidden="true"><ellipse cx="120" cy="84" rx="96" ry="48" fill="#fff6dc" stroke="#1c1c1c" stroke-width="4"/><path d="M70 58c8 16 8 36 0 52M120 48c10 18 10 48 0 66M170 58c8 16 8 36 0 52" fill="none" stroke="#1c1c1c" stroke-width="4" stroke-linecap="round"/><circle cx="104" cy="78" r="6" fill="#1c1c1c"/><circle cx="146" cy="78" r="6" fill="#1c1c1c"/></svg>`;

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function readSafe(name) {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : 0;
}

function sectionHeight() {
  return stage.clientHeight;
}

function bounds() {
  const rect = stage.getBoundingClientRect();
  const view = window.visualViewport;
  const width = view ? view.width : window.innerWidth;
  const height = view ? view.height : window.innerHeight;
  const leftInset = rect.left < 8 ? Math.max(EDGE_MARGIN, readSafe("--sal")) : EDGE_MARGIN;
  const topInset = rect.top < 8 ? Math.max(EDGE_MARGIN, readSafe("--sat")) : EDGE_MARGIN;
  const rightInset = width - rect.right < 8 ? Math.max(EDGE_MARGIN, readSafe("--sar")) : EDGE_MARGIN;
  const bottomInset = height - rect.bottom < 8 ? Math.max(EDGE_MARGIN, readSafe("--sab")) : EDGE_MARGIN;
  return {
    left: rect.left + leftInset,
    top: rect.top + topInset,
    right: rect.right - rightInset,
    bottom: rect.bottom - bottomInset,
  };
}

function overlaps(x, y, width, height, rect, gap) {
  return x < rect.right + gap
    && x + width > rect.left - gap
    && y < rect.bottom + gap
    && y + height > rect.top - gap;
}

function obstacleRects() {
  const obstacles = [{ rect: accept.getBoundingClientRect(), gap: ACCEPT_GAP }];
  const heading = slides[lastIndex].querySelector("h2");
  if (heading) obstacles.push({ rect: heading.getBoundingClientRect(), gap: 12 });
  for (const button of [prev, next]) {
    obstacles.push({ rect: button.getBoundingClientRect(), gap: HUD_GAP });
  }
  return obstacles;
}

function stillHits(x, y, width, height, obstacles) {
  return obstacles.some((obstacle) => overlaps(x, y, width, height, obstacle.rect, obstacle.gap));
}

function farthestClearSpot(width, height, box, obstacles, away) {
  const spots = [
    [box.left, box.top],
    [box.right - width, box.top],
    [box.left, box.bottom - height],
    [box.right - width, box.bottom - height],
    [(box.left + box.right - width) / 2, box.top],
    [(box.left + box.right - width) / 2, box.bottom - height],
    [box.left, (box.top + box.bottom - height) / 2],
    [box.right - width, (box.top + box.bottom - height) / 2],
  ];
  let best = null;
  let bestScore = -1;
  for (const [x, y] of spots) {
    if (stillHits(x, y, width, height, obstacles)) continue;
    const score = Math.hypot(x + width / 2 - away.x, y + height / 2 - away.y);
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

function placeWithoutOverlap(x, y, away) {
  const box = bounds();
  const width = decline.offsetWidth;
  const height = decline.offsetHeight;
  const obstacles = obstacleRects();
  const hitX = x < box.left || x > box.right - width;
  const hitY = y < box.top || y > box.bottom - height;
  x = clamp(x, box.left, box.right - width);
  y = clamp(y, box.top, box.bottom - height);

  if (hitX && hitY) {
    const roomLeft = x - box.left;
    const roomRight = box.right - width - x;
    const roomUp = y - box.top;
    const roomDown = box.bottom - height - y;
    if (Math.max(roomLeft, roomRight) > Math.max(roomUp, roomDown)) {
      x += (roomRight >= roomLeft ? 1 : -1) * Math.min(120, Math.max(roomLeft, roomRight));
    } else {
      y += (roomDown >= roomUp ? 1 : -1) * Math.min(120, Math.max(roomUp, roomDown));
    }
    x = clamp(x, box.left, box.right - width);
    y = clamp(y, box.top, box.bottom - height);
  } else if (hitX) {
    const mid = (box.top + box.bottom - height) / 2;
    y += Math.sign(mid - y || 1) * 80;
    y = clamp(y, box.top, box.bottom - height);
  } else if (hitY) {
    const mid = (box.left + box.right - width) / 2;
    x += Math.sign(mid - x || 1) * 80;
    x = clamp(x, box.left, box.right - width);
  }

  for (let step = 0; step < 12 && stillHits(x, y, width, height, obstacles); step += 1) {
    const hit = obstacles.find((obstacle) => overlaps(x, y, width, height, obstacle.rect, obstacle.gap));
    const rect = hit.rect;
    const gap = hit.gap;
    const overlapX = Math.min(x + width, rect.right + gap) - Math.max(x, rect.left - gap);
    const overlapY = Math.min(y + height, rect.bottom + gap) - Math.max(y, rect.top - gap);
    if (overlapX <= overlapY) {
      x += (x + width / 2 < (rect.left + rect.right) / 2 ? -1 : 1) * (overlapX + 2);
    } else {
      y += (y + height / 2 < (rect.top + rect.bottom) / 2 ? -1 : 1) * (overlapY + 2);
    }
    x = clamp(x, box.left, box.right - width);
    y = clamp(y, box.top, box.bottom - height);
  }

  if (stillHits(x, y, width, height, obstacles)) {
    return farthestClearSpot(width, height, box, obstacles, away) || { x, y };
  }
  return { x, y };
}

function setDecline(x, y, running) {
  const box = bounds();
  const width = decline.offsetWidth;
  const height = decline.offsetHeight;
  x = clamp(x, box.left, box.right - width);
  y = clamp(y, box.top, box.bottom - height);
  decline.style.translate = `${x}px ${y}px`;
  if (!running) return;
  declineChased = true;
  decline.classList.add("is-running");
  window.clearTimeout(runTimer);
  runTimer = window.setTimeout(() => decline.classList.remove("is-running"), 500);
}

function spotFits(x, y, width, height, box) {
  return x >= box.left && y >= box.top && x + width <= box.right && y + height <= box.bottom;
}

function initialDeclinePoint() {
  const acceptRect = accept.getBoundingClientRect();
  const width = decline.offsetWidth;
  const height = decline.offsetHeight;
  const box = bounds();
  const away = {
    x: acceptRect.left + acceptRect.width / 2,
    y: acceptRect.top + acceptRect.height / 2,
  };
  const candidates = [
    [acceptRect.right + 14, acceptRect.top + (acceptRect.height - height) / 2],
    [acceptRect.left - width - 14, acceptRect.top + (acceptRect.height - height) / 2],
    [acceptRect.left + (acceptRect.width - width) / 2, acceptRect.bottom + 14],
  ];
  for (const [x, y] of candidates) {
    if (!spotFits(x, y, width, height, box)) continue;
    const placed = placeWithoutOverlap(x, y, away);
    if (!stillHits(placed.x, placed.y, width, height, obstacleRects())) return placed;
  }
  return placeWithoutOverlap(candidates[2][0], candidates[2][1], away);
}

function showDecline() {
  declineVisible = true;
  declineChased = false;
  decline.inert = false;
  decline.style.visibility = "visible";
  const point = initialDeclinePoint();
  setDecline(point.x, point.y, false);
}

function hideDecline() {
  declineVisible = false;
  decline.inert = true;
  decline.style.visibility = "hidden";
  decline.classList.remove("is-running");
}

function triggerDistance() {
  return window.matchMedia("(pointer: coarse)").matches ? 150 : 120;
}

function jumpAway(fromX, fromY) {
  const width = decline.offsetWidth;
  const height = decline.offsetHeight;
  const spot = farthestClearSpot(width, height, bounds(), obstacleRects(), { x: fromX, y: fromY });
  if (spot) setDecline(spot.x, spot.y, true);
  escapes += 1;
  status.textContent = escapes === 1 ? "Declinar se escapó." : `Declinar se escapó. ${escapes}.`;
}

function fleeFrom(clientX, clientY) {
  if (!declineVisible || finaleOpen) return;
  const rect = decline.getBoundingClientRect();
  const dx = rect.left + rect.width / 2 - clientX;
  const dy = rect.top + rect.height / 2 - clientY;
  const distance = Math.hypot(dx, dy);
  const trigger = triggerDistance();
  if (distance === 0 || distance > trigger) return;
  const urgency = 1 - distance / trigger;
  const step = 90 + urgency * 90;
  const next = placeWithoutOverlap(
    rect.left + (dx / distance) * step,
    rect.top + (dy / distance) * step,
    { x: clientX, y: clientY },
  );
  setDecline(next.x, next.y, true);
}

function syncControls() {
  prev.disabled = index === 0;
  next.disabled = index === lastIndex;
  if (document.activeElement === prev && prev.disabled) next.focus();
  if (document.activeElement === next && next.disabled) prev.focus();
}

function layout() {
  const height = sectionHeight();
  for (const slide of slides) {
    slide.style.height = `${height}px`;
    slide.style.flexBasis = `${height}px`;
  }
  if (animating) return;
  track.style.translate = `0 ${-index * height}px`;
  if (!declineVisible) return;
  const rect = decline.getBoundingClientRect();
  const point = declineChased
    ? placeWithoutOverlap(rect.left, rect.top, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
    : initialDeclinePoint();
  setDecline(point.x, point.y, false);
}

function settle(height) {
  animating = false;
  track.style.translate = `0 ${-index * height}px`;
  stage.dataset.index = String(index);
  syncControls();
  if (index === lastIndex) showDecline();
  else hideDecline();
  if (movedByUser) status.textContent = `${index + 1} de ${slides.length}`;
  window.clearTimeout(cooldownTimer);
  cooldownTimer = window.setTimeout(() => {
    locked = false;
  }, COOLDOWN_MS);
}

function go(nextIndex) {
  if (locked || animating || finaleOpen) return;
  const target = clamp(nextIndex, 0, lastIndex);
  if (target === index) return;
  movedByUser = true;
  locked = true;
  const height = sectionHeight();
  const from = -index * height;
  const to = -target * height;
  index = target;
  stage.dataset.index = String(index);
  const token = ++motionToken;
  if (reduceMotion.matches) {
    settle(height);
    return;
  }
  animating = true;
  const direction = Math.sign(to - from) || 1;
  const animation = track.animate(
    [
      { translate: `0 ${from}px` },
      { translate: `0 ${to + direction * OVERSHOOT_PX}px`, offset: 0.72 },
      { translate: `0 ${to}px` },
    ],
    { duration: BOUNCE_MS, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)", fill: "forwards" },
  );
  animation.onfinish = () => {
    if (token !== motionToken) return;
    settle(height);
    animation.cancel();
  };
}

function canScroll(slide, delta) {
  if (slide.scrollHeight <= slide.clientHeight + 1) return false;
  if (delta > 0) return slide.scrollTop + slide.clientHeight < slide.scrollHeight - 1;
  if (delta < 0) return slide.scrollTop > 1;
  return false;
}

function wheelPixels(event) {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * sectionHeight();
  return event.deltaY;
}

function onWheel(event) {
  if (event.ctrlKey) return;
  event.preventDefault();
  if (locked || animating || finaleOpen) {
    accum = 0;
    return;
  }
  const delta = wheelPixels(event);
  const slide = slides[index];
  if (canScroll(slide, delta)) {
    slide.scrollTop += delta;
    accum = 0;
    return;
  }
  accum += delta;
  if (Math.abs(accum) < WHEEL_THRESHOLD) return;
  const direction = Math.sign(accum);
  accum = 0;
  go(index + direction);
}

function onTouchStart(event) {
  if (event.touches.length !== 1) return;
  const point = event.touches[0];
  touch = {
    x: point.clientX,
    y: point.clientY,
    scrollTop: slides[index].scrollTop,
    onDecline: Boolean(event.target.closest("#decline")),
  };
}

function onTouchMove(event) {
  if (finaleOpen) {
    event.preventDefault();
    return;
  }
  if (!touch) return;
  const point = event.touches[0];
  const delta = touch.y - point.clientY;
  if (canScroll(slides[index], delta)) return;
  event.preventDefault();
}

function onTouchEnd(event) {
  if (!touch) return;
  const point = event.changedTouches[0];
  const deltaY = touch.y - point.clientY;
  const deltaX = touch.x - point.clientX;
  const scrolled = Math.abs(slides[index].scrollTop - touch.scrollTop) > 2;
  const onDecline = touch.onDecline;
  touch = null;
  if (locked || animating || finaleOpen || scrolled || onDecline) return;
  if (Math.abs(deltaY) < SWIPE_THRESHOLD || Math.abs(deltaY) < Math.abs(deltaX)) return;
  go(index + Math.sign(deltaY));
}

function onKey(event) {
  if (event.altKey || event.metaKey || event.ctrlKey || finaleOpen) return;
  if (event.target.closest("button, a, input, textarea")) return;
  if (event.key === "ArrowDown" || event.key === "PageDown") {
    event.preventDefault();
    go(index + 1);
  } else if (event.key === "ArrowUp" || event.key === "PageUp") {
    event.preventDefault();
    go(index - 1);
  }
}

function onResize() {
  motionToken += 1;
  for (const animation of track.getAnimations()) animation.cancel();
  animating = false;
  locked = false;
  window.clearTimeout(cooldownTimer);
  layout();
}

function wireWhatsapp() {
  if (!WHATSAPP_PHONE) {
    whatsapp.setAttribute("aria-disabled", "true");
    whatsapp.addEventListener("click", (event) => event.preventDefault());
    return;
  }
  whatsapp.href = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(WHATSAPP_TEXT)}`;
  whatsapp.target = "_blank";
  whatsapp.rel = "noopener noreferrer";
  whatsapp.removeAttribute("aria-disabled");
}

function spawnConfetti() {
  confetti.replaceChildren();
  const height = sectionHeight();
  for (let piece = 0; piece < 18; piece += 1) {
    const bit = document.createElement("span");
    bit.className = "bit";
    bit.innerHTML = piece % 2 === 0 ? gnocchiSvg : heartSvg;
    const left = 6 + Math.random() * 82;
    bit.style.left = `${left}%`;
    if (reduceMotion.matches) {
      bit.style.top = `${18 + Math.random() * 62}%`;
      bit.style.rotate = `${Math.round(Math.random() * 36 - 18)}deg`;
    } else {
      bit.style.top = "-12%";
      const duration = 2200 + Math.random() * 700;
      const delay = Math.random() * 200;
      const spin = Math.round(Math.random() * 160 - 80);
      bit.animate(
        [
          { translate: "0 0", rotate: "0deg" },
          { translate: `0 ${height * 0.82}px`, rotate: `${spin}deg`, offset: 0.86 },
          { translate: `0 ${height * 0.74}px`, rotate: `${spin / 3}deg` },
        ],
        { duration, delay, easing: "cubic-bezier(0.2, 0.6, 0.2, 1)", fill: "forwards" },
      );
    }
    confetti.append(bit);
  }
}

function openFinale() {
  if (finaleOpen) return;
  finaleOpen = true;
  locked = true;
  animating = false;
  hideDecline();
  const reveal = () => {
    finale.hidden = false;
  };
  if (!reduceMotion.matches && typeof document.startViewTransition === "function") {
    try {
      document.startViewTransition({ update: reveal, types: ["forward"] });
    } catch {
      try {
        document.startViewTransition(reveal);
      } catch {
        reveal();
      }
    }
  } else {
    reveal();
  }
  spawnConfetti();
}

prev.addEventListener("click", () => go(index - 1));
next.addEventListener("click", () => go(index + 1));
accept.addEventListener("click", openFinale);
decline.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();
  jumpAway(event.clientX, event.clientY);
});
decline.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
});
decline.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const rect = decline.getBoundingClientRect();
  jumpAway(rect.left + rect.width / 2, rect.top + rect.height / 2);
});
window.addEventListener("pointermove", (event) => fleeFrom(event.clientX, event.clientY));
window.addEventListener("wheel", onWheel, { passive: false });
window.addEventListener("touchstart", onTouchStart, { passive: true });
window.addEventListener("touchmove", onTouchMove, { passive: false });
window.addEventListener("touchend", onTouchEnd, { passive: true });
window.addEventListener("keydown", onKey);
window.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("resize", onResize);
document.fonts?.ready.then(onResize);

wireWhatsapp();
hideDecline();
layout();
syncControls();
