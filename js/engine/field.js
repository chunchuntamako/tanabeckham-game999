// ===== フィールド探索エンジン =====
// Ver.0.1 FINAL: 追加マップ素材を実際の探索画面に接続。
// 背景画像の上に当たり判定・目的地マーカーを重ね、田辺をグリッド移動させる。

const MAPS = {
  home: {
    name: "田辺の家",
    bg: "assets/maps/field_home.png?v=2",
    bgm: "bgm_field",
    w: 9, h: 16, // 画像と同じ9:16の縦長グリッド
    exits: [{ x: 4, y: 15, to: "field", tx: 2, ty: 7, label: "フィールド" }],
    buildings: [{ x: 4, y: 4, id: "house_interior", name: "家の中" }],
    encounter: null,
  },
  // 2026-09-17：全体マップの正式採用画像（01_共通フィールド_正式採用.png）を
  // 受領。グリッド解析で読み取った実際のラベル位置に座標を再較正した。
  field: {
    name: "田辺の町・郊外",
    bg: "assets/maps/field_overworld.png?v=2",
    bgm: "bgm_field",
    w: 9, h: 16, // 画像と同じ9:16の縦長グリッド
    // エリア判定だと入口がわかりづらいとのことで、扉（1マス）での移動に戻した。
    exits: [
      { x: 2, y: 7, to: "home", tx: 4, ty: 15, label: "自宅" },
      { x: 5, y: 7, to: "town", tx: 4, ty: 15, label: "町" },
      { x: 4, y: 1, to: "dungeon", tx: 4, ty: 15, label: "洞窟" },
      { x: 3, y: 10, to: "practice", tx: 4, ty: 13, label: "練習場" },
      // 第2章：母のお使いイベント（1試合目終了後）で解放されるまで入口自体が出ない
      { x: 2, y: 4, to: "shrine", tx: 4, ty: 15, label: "神社",
        requires: (state) => !!(state.chapter2 && state.chapter2.shrineUnlocked) },
      // 第2章：ヒグチビッチとの実力差を痛感して少林寺行きを思い立った後に解放される
      { x: 6, y: 3, to: "shaolin", tx: 4, ty: 15, label: "少林寺",
        requires: (state) => !!(state.chapter2 && state.chapter2.shaolinUnlocked) },
      // 整体院は町とは別の独立した建物としてフィールド上に直接配置する。常時見える
      // 出入口だが、中の受付（seitai_clinic_desk）に条件を満たすまでは何も起きない。
      { x: 7, y: 7, to: "seitai_clinic", tx: 4, ty: 13, label: "整体院" },
    ],
    buildings: [
      { x: 6, y: 11, id: "stadium", name: "スタジアム" },
    ],
    encounter: { table: "field", rate: 0.14 },
  },
  town: {
    name: "町",
    bg: "assets/maps/town_map.png?v=2",
    bgm: "bgm_town",
    w: 9, h: 16, // 画像と同じ9:16の縦長グリッド
    exits: [
      { x: 4, y: 15, to: "field", tx: 5, ty: 7, label: "郊外" },
      // 第2章：整体院の先輩から紹介されるまでは出現しない
      { x: 4, y: 9, to: "sebastian_clinic", tx: 4, ty: 13, label: "セバスチャン診療所",
        requires: (state) => !!(state.chapter2 && state.chapter2.sebastianUnlocked) },
    ],
    // 新しいイラストの各建物の扉の実際の位置に合わせて配置
    buildings: [
      { x: 4, y: 2, id: "jobcenter", name: "職安" },
      { x: 2, y: 6, id: "weaponshop", name: "武器屋" },
      { x: 6, y: 6, id: "itemshop", name: "道具屋" },
      { x: 2, y: 9, id: "tavern", name: "酒場" },
      { x: 6, y: 9, id: "inn", name: "宿屋" },
    ],
    encounter: null,
  },
  practice: {
    name: "サッカー練習場",
    bg: "assets/maps/practice_map.png?v=1",
    bgm: "bgm_field",
    w: 9, h: 16, // 画像と同じ9:16の縦長グリッド
    // 新しいイラストの入口ゲート（下部中央）の実際の位置に合わせて配置
    exits: [{ x: 4, y: 13, to: "field", tx: 3, ty: 10, label: "戻る" }],
    encounter: null,
    isPracticeGround: true,
  },
  dungeon: {
    name: "序章ダンジョン",
    bg: "assets/maps/dungeon_map.png?v=2",
    bgm: "bgm_dungeon",
    w: 9, h: 16, // 画像と同じ9:16の縦長グリッド
    exits: [{ x: 4, y: 15, to: "field", tx: 4, ty: 1, label: "出口" }],
    encounter: { table: "dungeon", rate: 0.18 },
    // 新しいイラストの骨の円形広場（ボス）と、最奥の宝箱（隠しNPC）の位置に合わせて配置
    boss: { x: 4, y: 9, id: "seitaishi", label: "整体師" },
    hiddenNpc: { x: 4, y: 1, id: "oldman_mat", label: "老人" },
  },
  // 第2章：昇格祈願の神社。入口(下)から宝箱→お守り売り場→本殿(上)の順に並ぶ。
  // 本殿で祈ると宝箱の有無に関係なく「神」が出現する（宝箱は任意のお賽銭窃盗イベント）。
  // 2026-09-17：実画像（09_神社.png）を受領。画像内の明示ラベル位置に合わせて
  // 宝箱・お守り売り場・本殿の座標を再較正した。
  shrine: {
    name: "神社",
    bg: "assets/maps/shrine_map.png?v=2",
    bgm: "bgm_field",
    w: 9, h: 16,
    exits: [{ x: 4, y: 15, to: "field", tx: 2, ty: 4, label: "戻る" }],
    chest: { x: 1, y: 5, id: "shrine_offering", label: "賽銭箱" },
    charmShop: { x: 7, y: 5, id: "shrine_charm_shop", label: "お守り売り場" },
    mainHall: { x: 4, y: 2, id: "shrine_main_hall", label: "本殿" },
    // 第2次神社クエスト「お祓い」。curseSuspicionRaisedになるまでは出現しない。
    // 画像には描かれていない架空のポイントなので、他と重ならない位置に据え置く。
    altar: { x: 6, y: 8, id: "exorcism_altar", label: "お祓い" },
    encounter: null,
  },
  // 第2章：少林寺。3人のボスを順番に倒し（前段クリアが次のボス出現の条件）、
  // 全員撃破後に佐々木SVの4択に挑む、雑魚のいないボスラッシュの修行の場。
  shaolin: {
    name: "少林寺",
    bg: "assets/maps/shaolin_map.png?v=2",
    bgm: "bgm_dungeon",
    w: 9, h: 16,
    exits: [{ x: 4, y: 15, to: "field", tx: 6, ty: 3, label: "戻る" }],
    encounter: null,
    bosses: [
      { x: 4, y: 11, id: "shaolin_issy", enemy: "issy", label: "いっしー", flag: "shaolinIssyDefeated",
        requires: (state) => true },
      { x: 4, y: 7, id: "shaolin_tanaka", enemy: "tanaka", label: "詐欺師田中", flag: "shaolinTanakaDefeated",
        requires: (state) => !!(state.chapter2 && state.chapter2.shaolinIssyDefeated) },
      { x: 4, y: 3, id: "shaolin_keizo", enemy: "keizo_boss", label: "ケイゾウ", flag: "shaolinKeizoDefeated",
        requires: (state) => !!(state.chapter2 && state.chapter2.shaolinTanakaDefeated) },
    ],
    sensei: { x: 4, y: 1, id: "sasaki_sv", label: "佐々木SV",
      requires: (state) => !!(state.chapter2 && state.chapter2.shaolinKeizoDefeated && !state.chapter2.shaolinQuizDone) },
  },
  // 2026-09-17：田辺整体院・セバスチャン診療室の内観画像を受け取ったのを機に、
  // ダイアログのポップアップではなく独立して歩き回れるマップに変更。
  // 実画像（受付／施術ベッドの位置が確認できる）に合わせて内部座標を較正済み。
  seitai_clinic: {
    name: "田辺整体院",
    bg: "assets/maps/seitai_clinic_interior.png?v=2",
    bgm: "bgm_field",
    w: 9, h: 16,
    exits: [{ x: 4, y: 13, to: "field", tx: 7, ty: 7, label: "戻る" }],
    mainHall: { x: 3, y: 10, id: "seitai_clinic_desk", label: "受付" },
    encounter: null,
  },
  sebastian_clinic: {
    name: "セバスチャン診療室",
    bg: "assets/maps/sebastian_clinic_interior.png?v=2",
    bgm: "bgm_field",
    w: 9, h: 16,
    exits: [{ x: 4, y: 14, to: "town", tx: 4, ty: 9, label: "戻る" }],
    mainHall: { x: 5, y: 7, id: "sebastian_clinic_desk", label: "診察" },
    encounter: null,
  },
};

// 元の1マスを縦横2分割＝4倍の細かさのマス目にして、そのマス単位で移動する。
// 瞬間ワープに見えないよう、コマとコマの間は一定速度でスッと滑らせる（昔のRPG風の歩き方）。
const FIELD_SUBDIV = 2;
const FIELD_STEP_MS = 150; // 細かいマス1つ分を滑らせるのにかかる時間

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
    // 現在アニメ中の1コマ（開始位置→目的位置）の進行管理
    this.stepping = false;
    this.stepFromX = this.visX;
    this.stepFromY = this.visY;
    this.stepToX = this.visX;
    this.stepToY = this.visY;
    this.stepElapsed = 0;
  }

  enable() {
    document.removeEventListener("keydown", this.keyDownHandler);
    document.removeEventListener("keyup", this.keyUpHandler);
    document.addEventListener("keydown", this.keyDownHandler);
    document.addEventListener("keyup", this.keyUpHandler);
    this.active = true;
    this._lastT = null;
    this.stepping = false;
    if (this._loopId) cancelAnimationFrame(this._loopId);
    this._loopId = requestAnimationFrame(this.loopHandler);
  }
  disable() {
    document.removeEventListener("keydown", this.keyDownHandler);
    document.removeEventListener("keyup", this.keyUpHandler);
    this.active = false;
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this.stepping = false;
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

  // キーを押している間、1コマずつ・コマの間はスライドさせながら動かし続けるループ
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
    if (this.stepping) {
      this.stepElapsed += dt * 1000;
      const t = Math.min(1, this.stepElapsed / FIELD_STEP_MS);
      this.visX = this.stepFromX + (this.stepToX - this.stepFromX) * t;
      this.visY = this.stepFromY + (this.stepToY - this.stepFromY) * t;
      if (t >= 1) {
        this.visX = this.stepToX;
        this.visY = this.stepToY;
        this.stepping = false;
        this.state.position.x = Math.round(this.visX);
        this.state.position.y = Math.round(this.visY);
        // 元のマス目にぴったり乗った時だけ、出口／建物／ボス等のイベント判定を行う
        if (Number.isInteger(this.visX) && Number.isInteger(this.visY)) {
          this.onEnterTile(this.visX, this.visY, this.currentMap());
        }
      }
      return;
    }

    let dx = 0, dy = 0;
    if (this.keys.left) dx = -1;
    else if (this.keys.right) dx = 1;
    if (dx === 0) {
      if (this.keys.up) dy = -1;
      else if (this.keys.down) dy = 1;
    }
    if (dx === 0 && dy === 0) return;
    this.startStep(dx, dy);
  }

  // 元のマスの1/4サイズ（縦横1/2ずつ）を1コマとして、次の1コマ分の移動アニメを開始する
  startStep(dx, dy) {
    const map = this.currentMap();
    const unit = 1 / FIELD_SUBDIV;
    let nx = this.visX + dx * unit;
    let ny = this.visY + dy * unit;
    nx = Math.max(0, Math.min(map.w - 1, nx));
    ny = Math.max(0, Math.min(map.h - 1, ny));
    // 浮動小数の誤差を1/FIELD_SUBDIV刻みに丸め直す
    nx = Math.round(nx * FIELD_SUBDIV) / FIELD_SUBDIV;
    ny = Math.round(ny * FIELD_SUBDIV) / FIELD_SUBDIV;
    if (nx === this.visX && ny === this.visY) return; // マップの端で動けない

    this.stepFromX = this.visX;
    this.stepFromY = this.visY;
    this.stepToX = nx;
    this.stepToY = ny;
    this.stepElapsed = 0;
    this.stepping = true;
  }

  // 元のマス目に入った瞬間に一度だけ呼ばれる（出口／建物／ボス／隠しNPC／エンカウント判定）
  onEnterTile(nx, ny, map) {
    const exit = (map.exits || []).find(ex => ex.x === nx && ex.y === ny && (!ex.requires || ex.requires(this.state)));
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
    const building = (map.buildings || []).find(b => b.x === nx && b.y === ny && (!b.requires || b.requires(this.state)));
    if (building) { this.cb.onEnterBuilding(building); return; }
    if (map.boss && map.boss.x === nx && map.boss.y === ny && !this.state.flags.seitaiDefeated) {
      this.cb.onBoss(map.boss.id); return;
    }
    if (map.hiddenNpc && this.state.flags.seitaiDefeated && map.hiddenNpc.x === nx && map.hiddenNpc.y === ny && !this.state.hiddenEvents.mat) {
      this.cb.onTalkNpc(map.hiddenNpc.id); return;
    }
    if (map.chest && this.state.chapter2 && !this.state.chapter2.offeringTaken && map.chest.x === nx && map.chest.y === ny) {
      if (this.cb.onChest) this.cb.onChest(map.chest.id);
      return;
    }
    if (map.altar && this.state.chapter2 && this.state.chapter2.curseSuspicionRaised && map.altar.x === nx && map.altar.y === ny) {
      if (this.cb.onAltar) this.cb.onAltar(map.altar.id);
      return;
    }
    if (map.charmShop && this.state.chapter2 && map.charmShop.x === nx && map.charmShop.y === ny) {
      if (this.cb.onCharmShop) this.cb.onCharmShop(map.charmShop.id);
      return;
    }
    if (map.mainHall && this.state.chapter2 && map.mainHall.x === nx && map.mainHall.y === ny) {
      if (this.cb.onMainHall) this.cb.onMainHall(map.mainHall.id);
      return;
    }
    if (map.bosses && this.state.chapter2) {
      const boss = map.bosses.find(b => b.x === nx && b.y === ny &&
        !this.state.chapter2[b.flag] && (!b.requires || b.requires(this.state)));
      if (boss) { if (this.cb.onShaolinBoss) this.cb.onShaolinBoss(boss); return; }
    }
    if (map.sensei && this.state.chapter2 && map.sensei.x === nx && map.sensei.y === ny &&
        (!map.sensei.requires || map.sensei.requires(this.state))) {
      if (this.cb.onShaolinSensei) this.cb.onShaolinSensei(map.sensei.id);
      return;
    }
    if (map.encounter) {
      // 第2章・天罰の不遇ルート中は敵の遭遇率が上がる
      const misfortune = this.state.chapter2 && this.state.chapter2.misfortuneMode;
      const rate = map.encounter.rate + (misfortune ? CHAPTER2.misfortuneRpgModifier.encounterRateBonus : 0);
      if (Math.random() < rate) { this.cb.onEncounter(map.encounter.table); return; }
    }
    saveGame(this.state);
  }

  marker(x, y, tw, th, cameraY, label, color) {
    const ctx = this.ctx;
    const cx = x * tw + tw / 2;
    const cy = y * th + th / 2 - cameraY;
    const r = Math.max(11, Math.min(tw, th) * 0.26);
    ctx.save();
    // 背景から浮かせるための白フチ＋影
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.stroke();
    if (label) {
      ctx.font = "bold 15px sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,.85)";
      ctx.strokeText(label, cx, cy - r - 6);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, cx, cy - r - 6);
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

    (map.exits || []).filter(ex => !ex.requires || ex.requires(this.state)).forEach(ex => this.marker(ex.x, ex.y, tw, th, cameraY, ex.label || "移動", "rgba(54,162,235,.88)"));
    (map.buildings || []).filter(b => !b.requires || b.requires(this.state)).forEach(b => {
      // スタジアムは公式戦の時間になると目印を変えて知らせる
      const pending = b.id === "stadium" && this.state.chapter2 && this.state.chapter2.matchDuePending;
      this.marker(b.x, b.y, tw, th, cameraY, pending ? b.name + " ❗" : b.name, pending ? "rgba(210,55,45,.92)" : "rgba(240,170,40,.90)");
    });
    if (map.boss && !this.state.flags.seitaiDefeated) this.marker(map.boss.x, map.boss.y, tw, th, cameraY, "整体師", "rgba(210,55,45,.92)");
    if (map.hiddenNpc && this.state.flags.seitaiDefeated && !this.state.hiddenEvents.mat) this.marker(map.hiddenNpc.x, map.hiddenNpc.y, tw, th, cameraY, "老人", "rgba(135,70,190,.92)");
    if (map.chest && this.state.chapter2 && !this.state.chapter2.offeringTaken) this.marker(map.chest.x, map.chest.y, tw, th, cameraY, map.chest.label || "宝箱", "rgba(230,200,60,.92)");
    if (map.altar && this.state.chapter2 && this.state.chapter2.curseSuspicionRaised) this.marker(map.altar.x, map.altar.y, tw, th, cameraY, map.altar.label || "お祓い", "rgba(150,80,200,.92)");
    if (map.charmShop && this.state.chapter2) this.marker(map.charmShop.x, map.charmShop.y, tw, th, cameraY, map.charmShop.label || "お守り", "rgba(240,170,40,.90)");
    if (map.mainHall && this.state.chapter2) this.marker(map.mainHall.x, map.mainHall.y, tw, th, cameraY, map.mainHall.label || "本殿", "rgba(210,55,45,.92)");
    if (map.bosses && this.state.chapter2) {
      map.bosses.forEach(b => {
        if (!this.state.chapter2[b.flag] && (!b.requires || b.requires(this.state))) {
          this.marker(b.x, b.y, tw, th, cameraY, b.label || "???", "rgba(210,55,45,.92)");
        }
      });
    }
    if (map.sensei && this.state.chapter2 && (!map.sensei.requires || map.sensei.requires(this.state))) {
      this.marker(map.sensei.x, map.sensei.y, tw, th, cameraY, map.sensei.label || "???", "rgba(135,70,190,.92)");
    }

    // プレイヤー。顔がわかる大きさまで拡大し、足元基準で描画（複数マスにまたがってOK）。
    const playerImg = getImage("assets/characters/tanabe.png?v=2");
    const px = this.visX * tw, py = this.visY * th - cameraY;
    const pH = Math.min(150, Math.max(96, th * 2.3));
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

    // 呪いレベル分の💩を頭上に常時表示（curseLevelが1以上の間）
    if (this.state.chapter2 && this.state.chapter2.curseLevel >= 1) {
      const n = this.state.chapter2.curseLevel;
      ctx.save();
      ctx.font = `${Math.round(pH * 0.26)}px 'Noto Color Emoji',sans-serif`;
      ctx.textAlign = "center";
      for (let i = 0; i < n; i++) ctx.fillText("💩", px + tw / 2 + (i - (n - 1) / 2) * pH * 0.24, py + th - pH - 6);
      ctx.restore();
    }
  }
}
