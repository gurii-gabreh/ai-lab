/*
  js/cover.js(AIL-016、2026-11-15)
  index.htmlの表紙。Claude Designモックアップ(https://claude.ai/artifact/2ktTwDujNahY5CWo4jYePY)の
  スクロール連動の切り替え演出を、フレームワーク無しで再現する。

  仕組み(モックアップのDCLogicと同じ計算):
  - ステージ(#cover-stage)を「パネル枠5つ分 × 画面高さ × 1.5」の縦長にし、その中の画面(.cover__inner)を
    position: stickyでヘッダー直下に止める。5つ目は空の枠で、4枚目を見せ終えたあとに表紙を抜けるための余白。
  - ステージをどこまでスクロールしたか(0〜1)からパネル位置を求め、各パネルの透明度と縦方向のずれを決める。
  - 目標値へ毎フレーム14%ずつ近づけて、動きを滑らかにする。
  - 右下の点をクリックすると、そのパネルの位置までスクロールする。
  JSが動かない場合は.cover--jsが付かず、CSSの既定どおり4枚が縦に並んで表示される。
*/
(function () {
  "use strict";

  const stage = document.getElementById("cover-stage");
  if (!stage) return;
  const cover = stage.closest(".cover");
  const inner = stage.querySelector(".cover__inner");
  const panels = Array.from(stage.querySelectorAll(".cover__panel"));
  const dots = Array.from(stage.querySelectorAll(".cover__dot"));
  const counter = document.getElementById("cover-current");
  const header = document.getElementById("site-header");

  const PANEL_SLOTS = panels.length + 1;
  const SLOWNESS = 1.5;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let headerH = 0;
  let stickyH = 700;
  let target = 0;
  let progress = 0;
  let lastIndex = -1;

  cover.classList.add("cover--js");

  function syncLayout() {
    headerH = header ? header.offsetHeight : 0;
    stickyH = Math.max(420, window.innerHeight - headerH);
    inner.style.top = headerH + "px";
    inner.style.height = stickyH + "px";
    stage.style.height = PANEL_SLOTS * stickyH * SLOWNESS + "px";
  }

  function readScroll() {
    const rect = stage.getBoundingClientRect();
    const total = rect.height - stickyH;
    target = total > 0 ? Math.min(1, Math.max(0, (headerH - rect.top) / total)) : 0;
  }

  function render() {
    const travelSteps = PANEL_SLOTS - 1;
    const head = progress * travelSteps;
    const nearest = Math.min(travelSteps, Math.round(head));
    const labelIdx = Math.min(panels.length - 1, nearest);
    const travel = stickyH * 0.9;
    panels.forEach((panel, i) => {
      const offset = head - i;
      const opacity = Math.max(0, 1 - Math.abs(offset));
      panel.style.opacity = String(opacity);
      panel.style.transform = reduceMotion.matches ? "none" : "translateY(" + (-offset * travel).toFixed(1) + "px)";
      panel.style.pointerEvents = opacity > 0.6 ? "auto" : "none";
      panel.setAttribute("aria-hidden", opacity > 0.5 ? "false" : "true");
    });
    if (labelIdx !== lastIndex) {
      lastIndex = labelIdx;
      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === nearest);
        if (i === nearest) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
      if (counter) counter.textContent = String(labelIdx + 1).padStart(2, "0");
    }
  }

  function tick() {
    const diff = target - progress;
    if (Math.abs(diff) > 0.0004) {
      progress = reduceMotion.matches ? target : progress + diff * 0.14;
      render();
    }
    window.requestAnimationFrame(tick);
  }

  function scrollToPanel(i) {
    syncLayout();
    const total = stage.offsetHeight - stickyH;
    const top = stage.getBoundingClientRect().top + window.scrollY;
    // モックアップはtotal * (i / PANEL_SLOTS)で、点を押してもパネルの途中(80%の位置等)で止まっていたため、
    // パネルがちょうど正面に来る i / (PANEL_SLOTS - 1) に補正した(2026-11-15)。
    const y = top - headerH + total * (i / (PANEL_SLOTS - 1)) + 1;
    window.scrollTo({ top: y, behavior: reduceMotion.matches ? "auto" : "smooth" });
  }

  dots.forEach((dot, i) => dot.addEventListener("click", () => scrollToPanel(i)));
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", () => {
    syncLayout();
    readScroll();
  });

  syncLayout();
  readScroll();
  progress = target;
  render();
  window.requestAnimationFrame(tick);
})();
