// ===== BGM再生管理 =====
// assets/audio/配下のファイルを差し替えるだけで曲を変更できる。
// ブラウザの自動再生制限により、ページ読み込み直後の再生はブロックされる場合がある
// （その場合は最初のタップ操作後から再生される）。

const BGM = { current: null, el: null };

function playBGM(key, opts) {
  opts = opts || {};
  const loop = opts.loop !== false;
  if (BGM.current === key) return; // 同じ曲は再生し直さない
  if (BGM.el) { BGM.el.pause(); BGM.el = null; }
  const el = new Audio(`assets/audio/${key}.mp3`);
  el.loop = loop;
  el.volume = opts.volume != null ? opts.volume : 0.55;
  el.play().catch(() => {}); // 自動再生ブロック時は静かに諦める
  BGM.el = el;
  BGM.current = key;
}

function stopBGM() {
  if (BGM.el) { BGM.el.pause(); BGM.el = null; }
  BGM.current = null;
}
