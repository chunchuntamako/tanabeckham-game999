// ===== 画像ローダー =====
// 指定パスにファイルがあれば読み込み、無ければ null を返す（呼び出し側はシルエット等でフォールバック）。
// assets/配下の該当ファイルをPNG等に差し替えるだけで、コード変更なしに反映される。

const IMAGE_CACHE = {};

// 画像の読み込みが完了した瞬間に呼ばれる関数を登録できる（再描画のトリガー用）
let ON_IMAGE_LOAD = null;
function setImageLoadListener(fn) { ON_IMAGE_LOAD = fn; }

function getImage(path) {
  if (!path) return null;
  if (IMAGE_CACHE[path] !== undefined) return IMAGE_CACHE[path].loaded ? IMAGE_CACHE[path].img : null;
  const img = new Image();
  IMAGE_CACHE[path] = { img, loaded: false };
  img.onload = () => { IMAGE_CACHE[path].loaded = true; if (ON_IMAGE_LOAD) ON_IMAGE_LOAD(path); };
  img.onerror = () => { IMAGE_CACHE[path].loaded = false; IMAGE_CACHE[path].failed = true; };
  img.src = path;
  return null; // 初回は未読込。読み込み完了後にON_IMAGE_LOAD経由で再描画される。
}
