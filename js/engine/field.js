// ===== フィールド探索エンジン =====
// Ver.0.1 FINAL: 追加マップ素材を実際の探索画面に接続。
// 背景画像の上に当たり判定・目的地マーカーを重ね、田辺をグリッド移動させる。

const MAPS = {
  home: {
    name: "田辺の家",
    bg: "assets/maps/field_home.png",
    bgm: "bgm_field",
    w: 5, h: 5,
    exits: [{ x: 2, y: 0, to: "field", tx: 4, ty: 0, label: "フィールド" }],
    encounter: null,
  },
  field: {
    name: "田辺の町・郊外",
    bg: "assets/maps/field_route.png",
    bgm: "bgm_field",
    w: 9, h: 9,
    exits: [
      { x: 4, y: 0, to: "home", tx: 2, ty: 1, label: "自宅" },
      { x: 4, y: 8, to: "town", tx: 3, ty: 6, label: "町" },
      { x: 5, y: 0, to: "practice", tx: 0, ty: 3, label: "練習場" },
      { x: 7, y: 6, to: "dungeon", tx: 5, ty: 7, label: "洞窟" },
    ],
    encounter: { table: "field", rate: 0.14 },
  },
  town: {
    name: "町",
    bg: "assets/maps/town_map.png",
    bgm: "bgm_town",
    w: 7, h: 7,
    exits: [{ x: 3, y: 6, to: "field", tx: 4, ty: 8, label: "郊外" }],
    buildings: [
      { x: 3, y: 1, id: "jobcenter", name: "職安" },
      { x: 1, y: 2, id: "weaponshop", name: "武器屋" },
      { x: 5, y: 2, id: "itemshop", name: "道具屋" },
      { x: 1, y: 4, id: "tavern", name: "酒場" },
      { x: 5, y: 4, id: "inn", name: "宿屋" },
    ],
    encounter: null,
  },
  practice: {
    name: "サッカー練習場",
    bg: "assets/backgrounds/field.png",
    bgm: "bgm_field",
    w: 5, h: 5,
    exits: [{ x: 0, y: 3, to: "field", tx: 5, ty: 1, label: "戻る" }],
    encounter: null,
    isPracticeGround: true,
  },
  dungeon: {
    name: "序章ダンジョン",
    bg: "assets/maps/dungeon_map.png",
    bgm: "bgm_dungeon",
    w: 9, h: 9,
    exits: [{ x: 4, y: 8, to: "field", tx: 7, ty: 5, label: "出口" }],
    encounter: { table: "dungeon", rate: 0.18 },
    boss: { x: 4, y: 6, id: "seitaishi", label: "整体師" },
    hiddenNpc: { x: 4, y: 0, id: "oldman_mat", label: "老人" },
  },
};

// 元の1マスを縦横2分割＝4倍の細かさのマス目にして、そのマス単位でコマ送りに動かす
// （なめらかな補間はせず、瞬間的にパッパッと切り替えることでレトロな歩きにする）。
const FIELD_SUBDIV = 2;
const FIELD_STEP_MS = 150; // 細かいマス1つを移動するのにかかる時間

class FieldController {
  constructor(canvas, state, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.cb = callbacks;
    this.active = false;
    this.keyDownHandler = this.handleKeyDown.bind(this);
    this.keyUpHandler = this.handleKeyUp.bind(this);
    this.loopHandler = this.loop.bind(this);
    // 見た目上の座標（元のマス単位の小数）。state.position は常にこれを丸めた整数値を保つ。
    this.visX = state.position.x;
    this.visY = state.position.y;
    this.keys = { up: false, down: false, left: false, right: false };
    this._lastT = null;
    this._loopId = null;
    this._stepTimer = 0;
  }

  enable() {
    document.removeEventListener("keydown", this.keyDownHandler);
    document.removeEventListener("keyup", this.keyUpHandler);
    document.addEventListener("keydown", this.keyDownHandler);
    document.addEventListener("keyup", this.keyUpHandler);
    this.active = true;
    this._lastT = null;
    this._stepTimer = 0;
    if (this._loopId) cancelAnimationFrame(this._loopId);
    this._loopId = requestAnimationFrame(this.loopHandler);
  }
  disable() {
    document.removeEventListener("keydown", this.keyDownHandler);
    document.removeEventListener("keyup", this.keyUpHandler);
    this.active = false;
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this._stepTimer = 0;
    if (this._loopId) { cancelAnimationFrame(this._loopId); this._loopId = null; }
  }
  currentMap() { return MAPS[this.state.position.map] || MAPS.home; }

  // 横は画面幅いっぱいに合わせ、縦はプレイヤー追従のスクロールにする。
  // 画像が縦長(720x1280想定)でも横長(1024x576)でも、横は絶対に見切れない。
  layout(map) {
    const cw = this.canvas.width, ch = this.canvas.height;
    const bgImg = getImage(map.bg);
    const tw = cw / map.w;
    if (!bgImg) return { tw, th: ch / map.h, worldH: ch, cameraY: 0, bgImg: null };
    const scale = cw / bgImg.width;
    const worldH = bgImg.height * scale;
    const th = worldH / map.h;
    const playerCenterY = (this.visY + 0.5) * th;
    const maxCam = Math.max(0, worldH - ch);
    const cameraY = Math.min(maxCam, Math.max(0, playerCenterY - ch / 2));
    return { tw, th, worldH, cameraY, bgImg, scale };
  }

  handleKeyDown(e) {
    const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[e.key];
    if (!dir) return;
    e.preventDefault();
    this.keys[dir] = true;
  }
  handleKeyUp(e) {
    const dir = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[e.key];
    if (dir) this.keys[dir] = false;
  }
  // タッチD-padからも同じ経路で押しっぱなし移動させる
  setKey(dir, val) { this.keys[dir] = val; }

  // キーを押している間、一定間隔ごとに1コマ分だけパッと移動させるループ（レトロな歩き）
  loop(t) {
    if (!this.active) return;
    if (this._lastT == null) this._lastT = t;
    const dt = Math.min(0.1, (t - this._lastT) / 1000); // タブ切替等での大ジャンプを防ぐ
    this._lastT = t;
    this.update(dt);
    if (!this.active) return; // update中にイベントが発生しdisable()された場合はここで止める
    this.render();
    this._loopId = requestAnimationFrame(this.loopHandler);
  }

  update(dt) {
    let dx = 0, dy = 0;
    if (this.keys.left) dx = -1;
    else if (this.keys.right) dx = 1;
    if (dx === 0) {
      if (this.keys.up) dy = -1;
      else if (this.keys.down) dy = 1;
    }
    if (dx === 0 && dy === 0) { this._stepTimer = 0; return; }

    this._stepTimer += dt * 1000;
    if (this._stepTimer < FIELD_STEP_MS) return;
    this._stepTimer = 0;
    this.step(dx, dy);
  }

  // 元のマスの1/4サイズ（縦横1/2ずつ）を1コマとして、瞬時に1コマ分だけ移動する
  step(dx, dy) {
    const map = this.currentMap();
    const unit = 1 / FIELD_SUBDIV;
    let nx = this.visX + dx * unit;
    let ny = this.visY + dy * unit;
    nx = Math.max(0, Math.min(map.w - 1, nx));
    ny = Math.max(0, Math.min(map.h - 1, ny));
    // 浮動小数の誤差を1/FIELD_SUBDIV刻みに丸め直す
    nx = Math.round(nx * FIELD_SUBDIV) / FIELD_SUBDIV;
    ny = Math.round(ny * FIELD_SUBDIV) / FIELD_SUBDIV;
    this.visX = nx;
    this.visY = ny;
    this.state.position.x = Math.round(nx);
    this.state.position.y = Math.round(ny);

    // 元のマス目にぴったり乗った時だけ、出口／建物／ボス等のイベント判定を行う
    if (Number.isInteger(nx) && Number.isInteger(ny)) {
      this.onEnterTile(nx, ny, map);
    }
  }

  // 元のマス目に入った瞬間に一度だけ呼ばれる（出口／建物／ボス／隠しNPC／エンカウント判定）
  onEnterTile(nx, ny, map) {
    const exit = (map.exits || []).find(ex => ex.x === nx && ex.y === ny);
    if (exit) {
      this.state.position.map = exit.to;
      this.state.position.x = exit.tx;
      this.state.position.y = exit.ty;
      this.visX = exit.tx;
      this.visY = exit.ty;
      saveGame(this.state);
      if (exit.to === "practice" && this.cb.onEnterPractice) this.cb.onEnterPractice();
      return;
    }
    const building = (map.buildings || []).find(b => b.x === nx && b.y === ny);
    if (building) { this.cb.onEnterBuilding(building); return; }
    if (map.boss && map.boss.x === nx && map.boss.y === ny && !this.state.flags.seitaiDefeated) {
      this.cb.onBoss(map.boss.id); return;
    }
    if (map.hiddenNpc && this.state.flags.seitaiDefeated && map.hiddenNpc.x === nx && map.hiddenNpc.y === ny && !this.state.hiddenEvents.mat) {
      this.cb.onTalkNpc(map.hiddenNpc.id); return;
    }
    if (map.encounter && Math.random() < map.encounter.rate) {
      this.cb.onEncounter(map.encounter.table);
      return;
    }
    saveGame(this.state);
  }

  marker(x, y, tw, th, cameraY, label, color) {
    const ctx = this.ctx;
    const cx = x * tw + tw / 2;
    const cy = y * th + th / 2 - cameraY;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(7, Math.min(tw, th) * 0.18), 0, Math.PI * 2);
    ctx.fill();
    if (label) {
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,.75)";
      ctx.strokeText(label, cx, cy - 14);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, cx, cy - 14);
    }
    ctx.restore();
  }

  render() {
    const map = this.currentMap();
    if (map.bgm) playBGM(map.bgm);
    const ctx = this.ctx;
    const cw = this.canvas.width, ch = this.canvas.height;
    const { tw, th, worldH, cameraY, bgImg } = this.layout(map);
    ctx.clearRect(0, 0, cw, ch);
    if (bgImg) {
      // 横幅は必ず画面いっぱい（見切れなし）。縦はプレイヤー追従でスクロール。
      ctx.drawImage(bgImg, 0, -cameraY, cw, worldH);
    } else {
      ctx.fillStyle = "#315b32"; ctx.fillRect(0, 0, cw, ch);
    }

    // 画面上部にマップ名を表示
    ctx.fillStyle = "rgba(0,0,0,.56)";
    ctx.fillRect(8, 10, Math.min(180,cw-16), 28);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(map.name, 16, 29);

    (map.exits || []).forEach(ex => this.marker(ex.x, ex.y, tw, th, cameraY, ex.label || "移動", "rgba(54,162,235,.88)"));
    (map.buildings || []).forEach(b => this.marker(b.x, b.y, tw, th, cameraY, b.name, "rgba(240,170,40,.90)"));
    if (map.boss && !this.state.flags.seitaiDefeated) this.marker(map.boss.x, map.boss.y, tw, th, cameraY, "整体師", "rgba(210,55,45,.92)");
    if (map.hiddenNpc && this.state.flags.seitaiDefeated && !this.state.hiddenEvents.mat) this.marker(map.hiddenNpc.x, map.hiddenNpc.y, tw, th, cameraY, "老人", "rgba(135,70,190,.92)");

    // プレイヤー。全身画像は縦長なので、足元基準で小さく描画。
    const playerImg = getImage("assets/characters/tanabe.png");
    const px = this.visX * tw, py = this.visY * th - cameraY;
    const pH = Math.min(76, Math.max(52, Math.min(tw * 1.55, th * 0.95)));
    const pW = pH * 0.72;
    if (playerImg) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 4;
      ctx.drawImage(playerImg, px + (tw - pW) / 2, py + th - pH, pW, pH);
      ctx.restore();
    } else {
      ctx.fillStyle = "#ffcc66";
      ctx.fillRect(px + tw * 0.28, py + th * 0.18, tw * 0.44, th * 0.72);
    }
  }
}
