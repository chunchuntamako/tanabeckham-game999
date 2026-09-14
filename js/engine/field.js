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

class FieldController {
  constructor(canvas, state, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.cb = callbacks;
    this.active = false;
    this.keyHandler = this.handleKey.bind(this);
  }

  enable() {
    document.removeEventListener("keydown", this.keyHandler);
    document.addEventListener("keydown", this.keyHandler);
    this.active = true;
  }
  disable() { document.removeEventListener("keydown", this.keyHandler); this.active = false; }
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
    const playerCenterY = (this.state.position.y + 0.5) * th;
    const maxCam = Math.max(0, worldH - ch);
    const cameraY = Math.min(maxCam, Math.max(0, playerCenterY - ch / 2));
    return { tw, th, worldH, cameraY, bgImg, scale };
  }

  handleKey(e) {
    let dx = 0, dy = 0;
    if (e.key === "ArrowUp") dy = -1;
    else if (e.key === "ArrowDown") dy = 1;
    else if (e.key === "ArrowLeft") dx = -1;
    else if (e.key === "ArrowRight") dx = 1;
    else return;
    e.preventDefault();
    this.move(dx, dy);
  }

  move(dx, dy) {
    if (!this.active) return;
    const map = this.currentMap();
    const nx = this.state.position.x + dx;
    const ny = this.state.position.y + dy;
    if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) { this.render(); return; }
    this.state.position.x = nx;
    this.state.position.y = ny;

    const exit = (map.exits || []).find(ex => ex.x === nx && ex.y === ny);
    if (exit) {
      this.state.position.map = exit.to;
      this.state.position.x = exit.tx;
      this.state.position.y = exit.ty;
      saveGame(this.state);
      this.render();
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
    this.render();
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
    const px = this.state.position.x * tw, py = this.state.position.y * th - cameraY;
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
