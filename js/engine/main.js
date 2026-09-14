// ===== メイン制御 =====
// 画面遷移・UIオーバーレイ・全体フローの管理。

let STATE = null;
let TIMER = null;
let FIELD = null;
let MATCH = null;
let IN_BATTLE = false;
let PENDING_TIMEUP = false;

const canvas = document.getElementById("gameCanvas");
const overlay = document.getElementById("overlay");
const hud = document.getElementById("hud");

function fitCanvasToPhone() {
  const stage = document.getElementById("stage");
  if (!stage) return;
  // CSS上の実寸をCanvas内部解像度にも反映し、縦長スマホで引き伸ばしを減らす。
  const w = Math.max(320, Math.round(stage.clientWidth || 390));
  const h = Math.max(560, Math.round(stage.clientHeight || 720));
  canvas.width = w;
  canvas.height = h;
}

function init() {
  fitCanvasToPhone();
  // 画像の読み込みが遅れて反映される瞬間に、今の画面を再描画する
  setImageLoadListener(() => {
    if (FIELD && FIELD.active) FIELD.render();
    if (MATCH) MATCH.render();
  });
  // マップ画像を先読みしておき、切り替わった瞬間に絵が出ない状態を防ぐ
  ["assets/maps/field_home.png","assets/maps/field_route.png","assets/maps/town_map.png","assets/maps/dungeon_map.png","assets/characters/tanabe.png"]
    .forEach(p => getImage(p));
  showTitleScreen();
  // 5秒ごと＋画面を閉じる直前に現在位置/残り時間を保存
  setInterval(() => { if (STATE) saveGame(STATE); }, 5000);
  window.addEventListener("pagehide", () => { if (STATE) saveGame(STATE); });
  requestAnimationFrame(hudLoop);
}

// ---------- 全画面1枚絵（タイトル・オープニング共通） ----------
// 画面比率が絵(9:16)と違っても切れないよう、絵と同じ比率の枠を計算して中央に敷く。
const ART_ASPECT = 9 / 16; // 720x1280素材の横/縦比
function sizeArtFrames() {
  const stage = document.getElementById("stage");
  if (!stage) return;
  const cw = stage.clientWidth, ch = stage.clientHeight;
  let w = cw, h = w / ART_ASPECT;
  if (h > ch) { h = ch; w = h * ART_ASPECT; }
  overlay.querySelectorAll(".art-frame").forEach(el => {
    el.style.width = Math.round(w) + "px";
    el.style.height = Math.round(h) + "px";
  });
}
window.addEventListener("resize", sizeArtFrames);

// ---------- タイトル画面 ----------
// 差し替え時に古い画像がブラウザ/CDNにキャッシュされて反映されない事故を防ぐため、
// 素材を更新したらこの番号を上げる。
const ART_ASSET_VERSION = "2";
function showTitleScreen() {
  playBGM("bgm_title");
  const hasSave = !!loadGame();
  showOverlay(`<div class="full-screen-art"><div class="art-frame">
    <img src="assets/title/title_main.png?v=${ART_ASSET_VERSION}" onerror="this.style.display='none'">
    <button id="titleNew" class="art-hotspot" style="top:74.0%;height:4.3%;left:9%;width:43%;" aria-label="はじめから"></button>
    <button id="titleContinue" class="art-hotspot" style="top:79.5%;height:4.7%;left:9%;width:43%;" aria-label="つづきから" ${hasSave ? "" : "disabled"}></button>
    <button id="titleSettings" class="art-hotspot" style="top:85.3%;height:4.7%;left:9%;width:43%;" aria-label="設定"></button>
  </div></div>`);
  sizeArtFrames();
  document.getElementById("titleNew").onclick = () => {
    if (hasSave) {
      showChoices("既存のセーブを消して最初から始めますか？", [
        { label: "はい（消して始める）", onClick: () => { hideOverlay(); startNewGame(); } },
        { label: "やめる", onClick: showTitleScreen },
      ]);
    } else {
      startNewGame();
    }
  };
  if (hasSave) {
    document.getElementById("titleContinue").onclick = () => {
      STATE = loadGame();
      TIMER = new GameTimer(STATE, onTimeUp);
      if (STATE.flags.prologueClear) showClearedTitle();
      else { enterField(); TIMER.start(); }
    };
  }
  document.getElementById("titleSettings").onclick = () => {
    showChoices("設定\n（この項目は現在準備中です）", [{ label: "戻る", onClick: showTitleScreen }]);
  };
}

function startNewGame() {
  deleteSave();
  STATE = defaultSaveData();
  TIMER = new GameTimer(STATE, onTimeUp);
  showMomDialogue();
}

function hudLoop() {
  if (STATE) {
    hud.innerHTML = `<b>Lv${STATE.player.level}</b>` +
      `<img class="hud-icon" src="assets/ui/icon_hp.png">${STATE.player.hp}/${STATE.player.maxHp}` +
      `<img class="hud-icon" src="assets/ui/icon_stamina.png">${Math.ceil(STATE.player.stamina)}/${STATE.player.maxStamina}` +
      ` G:${STATE.player.gold} <img class="hud-icon" src="assets/ui/icon_luck.png">${STATE.player.luck}` +
      ` | ${STATE.day}日目 ${TIMER ? TIMER.formatTime() : "--:--"}`;
  }
  requestAnimationFrame(hudLoop);
}

function showClearedTitle() {
  playBGM("bgm_title");
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_back.png")}
    <p><b>タナベッカムの不遇</b>
序章 Ver.0.1

PROLOGUE CLEAR「名前だけで、Jへ」
クリアデータは保存されています。</p>
    <div class="choices"><button id="clearReview">クリア記録を見る</button><button id="newGame">最初から遊ぶ</button></div></div>`);
  document.getElementById("clearReview").onclick = () => {
    const r = STATE.matchRecords.tryout || {};
    showChoices(`入団テスト記録\n得点:${r.goals||0} パス:${r.pass||0} シュート:${r.shoot||0}\n走行距離:${r.distance||0} スプリント:${r.sprintSec||0}秒\n必殺技:${r.special||0}回`, [{label:"戻る",onClick:showClearedTitle}]);
  };
  document.getElementById("newGame").onclick = () => {
    showChoices("セーブを消して最初から遊びますか？", [
      { label: "はい（消して最初から）", onClick: () => {
          deleteSave();
          STATE = null; // 自動セーブがリロード直前に古いデータを書き戻すのを防ぐ
          location.reload();
        } },
      { label: "やめる", onClick: showClearedTitle },
    ]);
  };
}

// 画像タグ生成（無ければ自動で非表示になるので、既存のcolored-boxフォールバックと併用可）
function cutinTag(path, cls) {
  return `<img src="${path}" class="${cls || "cutin"}" onerror="this.style.display='none'" />`;
}
function showOverlay(html) { overlay.classList.remove("overlay-battle"); overlay.innerHTML = html; overlay.style.display = "block"; }
function hideOverlay() { overlay.style.display = "none"; overlay.innerHTML = ""; overlay.classList.remove("overlay-battle"); }

function showChoices(text, choices) {
  // choices: [{label, onClick}]
  let html = `<div class="dialog"><p>${text}</p><div class="choices">`;
  choices.forEach((c, i) => { html += `<button data-i="${i}">${c.label}</button>`; });
  html += `</div></div>`;
  showOverlay(html);
  choices.forEach((c, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = c.onClick;
  });
}

// ---------- 冒頭：母との会話 ----------
function showMomDialogue() {
  FIELD && FIELD.disable();
  playBGM("bgm_opening");
  showOverlay(`<div class="full-screen-art"><div class="art-frame">
    <img src="assets/opening/opening_home.png?v=${ART_ASSET_VERSION}" onerror="this.style.display='none'">
    <button id="momOk" class="art-hotspot" style="top:66%;height:9%;left:10%;width:80%;" aria-label="次へ"></button>
  </div></div>`);
  sizeArtFrames();
  document.getElementById("momOk").onclick = () => {
    hideOverlay();
    STATE.flags.momTalkDone = true;
    saveGame(STATE);
    enterField();
    TIMER.start();
  };
}

// ---------- フィールド／街／ダンジョン探索 ----------
function enterField() {
  hideOverlay();
  FIELD = new FieldController(canvas, STATE, {
    onEncounter: (table) => startRandomBattle(table),
    onEnterBuilding: (b) => enterBuilding(b),
    onTalkNpc: (id) => talkNpc(id),
    onBoss: (id) => startBossBattle(id),
    onEnterPractice: () => enterPracticeMenu(),
  });
  FIELD.enable();
  FIELD.render();
}

function enterBuilding(building) {
  FIELD.disable();
  if (building.id === "weaponshop") openShop(["weapons", "shields", "armors"]);
  else if (building.id === "itemshop") openShop(["items"]);
  else if (building.id === "inn") openInn();
  else if (building.id === "tavern") openTavern();
  else if (building.id === "jobcenter") openJobCenter();
}

function backToField() { FIELD.enable(); hideOverlay(); FIELD.render(); }

// ---------- 武器屋・道具屋 ----------
function openShop(categories) {
  let items = [];
  if (categories.includes("weapons")) items = items.concat(CHAPTER0.weapons.map(w => ({ ...w, type: "weapon" })));
  if (categories.includes("shields")) items = items.concat(CHAPTER0.shields.map(s => ({ ...s, type: "shield" })));
  if (categories.includes("armors")) items = items.concat(CHAPTER0.armors.map(a => ({ ...a, type: "armor" })));
  if (categories.includes("items")) items = items.concat(CHAPTER0.items.map(it => ({ ...it, type: "item" })));

  let html = `<div class="dialog"><p>所持金: ${STATE.player.gold}G</p><ul class="shoplist">`;
  items.forEach((it, i) => { html += `<li><button data-i="${i}">${it.name} ${it.price}G</button></li>`; });
  html += `</ul><button id="closeShop">出る</button></div>`;
  showOverlay(html);
  items.forEach((it, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => {
      if (STATE.player.gold >= it.price) {
        STATE.player.gold -= it.price;
        if (it.type === "item") {
          const ex = STATE.player.inventory.find(x => x.id === it.id);
          if (ex) ex.qty += 1; else STATE.player.inventory.push({ id: it.id, qty: 1 });
        } else {
          STATE.player.equip[it.type] = it.id;
        }
        saveGame(STATE);
      }
      openShop(categories);
    };
  });
  overlay.querySelector("#closeShop").onclick = backToField;
}

// ---------- 宿屋 ----------
function openInn() {
  showChoices(`宿屋：${CHAPTER0.innCost.time}秒消費して宿泊しますか？`, [
    { label: "泊まる", onClick: () => {
        STATE.player.hp = STATE.player.maxHp;
        STATE.player.stamina = STATE.player.maxStamina;
        const timedOut = TIMER.consumeAndAdvanceDay(CHAPTER0.innCost.time);
        STATE.position = { map: "home", x: 4, y: 14 };
        saveGame(STATE);
        if (timedOut) onTimeUp(true);
        else enterField();
      } },
    { label: "やめる", onClick: backToField },
  ]);
}

// ---------- 酒場（NPC抽選） ----------
function openTavern() {
  const seed = STATE.day; // 日ごとに固定の抽選
  const rng = mulberry32(seed);
  let html = `<div class="dialog"><p>酒場のNPC（本日）</p><ul>`;
  const flavor = ["酔っぱらい", "旅人", "冒険者", "サッカー好き", "情報屋"];
  const npcCount = 2 + Math.floor(rng() * 2);
  let picked = [];
  for (let i = 0; i < npcCount; i++) {
    if (STATE.party.length + picked.length < 2 && rng() < 0.5) {
      const cand = weightedPickCompanion(rng, STATE.party.concat(picked));
      if (cand) { picked.push({ companion: cand }); continue; }
    }
    picked.push({ flavor: flavor[Math.floor(rng() * flavor.length)] });
  }
  picked.forEach((p, i) => {
    if (p.companion) html += `<li>${cutinTag(p.companion.sprite, "npc-portrait")}<br>${p.companion.name}（仲間候補） <button data-i="${i}">話す</button></li>`;
    else html += `<li>${p.flavor}のNPC</li>`;
  });
  html += `</ul><button id="closeTavern">出る</button></div>`;
  showOverlay(html);
  picked.forEach((p, i) => {
    const btn = overlay.querySelector(`[data-i="${i}"]`);
    if (btn) btn.onclick = () => {
      if (STATE.party.length < 2) {
        STATE.party.push({ ...p.companion, hp: 20 + p.companion.rank * 2, dead: false });
        saveGame(STATE);
      }
      openTavern();
    };
  });
  overlay.querySelector("#closeTavern").onclick = backToField;
}

function weightedPickCompanion(rng, exclude) {
  const pool = CHAPTER0.companions.filter(c => !exclude.find(e => e.id === c.id));
  for (const c of pool) { if (rng() < c.appearRate) return c; }
  return null;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 職業安定所 ----------
function openJobCenter() {
  let html = `<div class="dialog"><p>職業安定所：求人を選んでください</p><ul>`;
  CHAPTER0.jobs.forEach((j, i) => { html += `<li><button data-i="${i}">${j.name}</button></li>`; });
  html += `</ul><button id="closeJob">出る</button></div>`;
  showOverlay(html);
  CHAPTER0.jobs.forEach((j, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => applyJob(j);
  });
  overlay.querySelector("#closeJob").onclick = backToField;
}

function applyJob(job) {
  if (job.result === "fail") {
    STATE.player.luck += CHAPTER0.jobFailReward.luck;
    saveGame(STATE);
    showChoices(`${job.name}の面接：不採用。${CHAPTER0.jobFailReward.message}`, [
      { label: "OK", onClick: openJobCenter },
    ]);
  } else if (job.result === "seitai") {
    startSeitaiTraining();
  }
}

function startSeitaiTraining() {
  showChoices("整体師見習いとして研修を受けますか？", [
    { label: "受ける", onClick: () => {
        STATE.player.seitaiPoint += CHAPTER0.seitaiReward.seitaiPoint;
        STATE.player.gold += CHAPTER0.seitaiReward.money;
        const timedOut = TIMER.consumeAndAdvanceDay(CHAPTER0.seitaiCost.time);
        STATE.position = { map: "home", x: 4, y: 14 };
        saveGame(STATE);
        if (timedOut) {
          onTimeUp(true);
        } else {
          showChoices(`研修終了。整体ポイント+1、給料${CHAPTER0.seitaiReward.money}G。`, [
            { label: "OK", onClick: enterField },
          ]);
        }
      } },
    { label: "やめる", onClick: backToField },
  ]);
}

// ---------- サッカー練習場 ----------
function enterPracticeMenu() {
  FIELD.disable();
  const skills = ["shoot", "pass", "dribble", "defense", "run"];
  const labels = { shoot: "シュート", pass: "パス", dribble: "ドリブル", defense: "ディフェンス", run: "走り込み" };
  let html = `<div class="dialog"><p>体力: ${STATE.player.stamina}/${STATE.player.maxStamina}</p><ul>`;
  skills.forEach((s, i) => { html += `<li><button data-i="${i}">${labels[s]}練習</button></li>`; });
  html += `</ul><button id="closePractice">出る</button></div>`;
  showOverlay(html);
  skills.forEach((s, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => {
      const staminaCost = CHAPTER0.practiceCost.stamina;
      if (STATE.player.stamina >= staminaCost) {
        STATE.player.stamina -= staminaCost;
        const growth = s === "run" ? 2 : 1; // 走力系は成長しやすい
        STATE.player.soccerSkills[s] += growth;
        const timedOut = TIMER.consume(CHAPTER0.practiceCost.time);
        saveGame(STATE);
        if (timedOut) { onTimeUp(true); return; }
      }
      enterPracticeMenu();
    };
  });
  overlay.querySelector("#closePractice").onclick = backToField;
}

// ---------- RPG戦闘 ----------
function startRandomBattle(table) {
  const list = ENCOUNTER_TABLES[table];
  const enemyId = list[Math.floor(Math.random() * list.length)];
  runBattle(enemyId, (result) => {
    if (result === "dead") { respawnAtCheckpoint(); return; }
    backToField();
  });
}

function startBossBattle(id) {
  runBattle(id, (result) => {
    if (result === "dead") { respawnAtCheckpoint(); return; }
    if (result === "win") {
      STATE.flags.seitaiDefeated = true;
      saveGame(STATE);
    }
    backToField();
  });
}

function runBattle(enemyId, onEnd) {
  FIELD.disable();
  IN_BATTLE = true;
  playBGM(ENEMIES[enemyId] && ENEMIES[enemyId].boss ? "bgm_boss" : "bgm_battle");
  const battle = new BattleController(STATE, enemyId, (result) => {
    IN_BATTLE = false;
    if (result === "win") playBGM("bgm_victory", { loop: false });
    renderBattleEnd(result, battle, onEnd);
  });
  renderBattle(battle);
}

function renderBattle(battle) {
  const p = STATE.player;
  const enemyImgTag = battle.enemy.sprite ? `<div class="enemy-sprite-wrap"><img src="${battle.enemy.sprite}" class="enemy-sprite" onerror="this.style.display='none'" /></div>` : "";
  const partyHtml = (STATE.party || []).map(m => `<div class="party-card ${m.dead?'dead':''}">${m.sprite?`<img src="${m.sprite}">`:''}<span>${m.name}<br>HP ${Math.max(0,m.hp||0)}${m.dead?' / 離脱':''}</span></div>`).join("");
  let html = `<div class="dialog battle">
    ${enemyImgTag}
    <p><b>${battle.enemy.name}</b> HP:${Math.max(0, battle.enemy.curHp)}/${battle.enemy.hp}</p>
    <p>田辺 HP:${p.hp}/${p.maxHp}</p>
    ${partyHtml ? `<div class="party-row">${partyHtml}</div>` : ''}
    <div class="log">${battle.log.map(l => `<div>${l}</div>`).join("")}</div>
    <div class="choices">
      <button id="b_fight">⚔ たたかう</button>
      <button id="b_neg">💬 交渉</button>
      <button id="b_item">🧪 どうぐ</button>
      <button id="b_flee">↩ にげる</button>
    </div></div>`;
  showOverlay(html);
  overlay.classList.add("overlay-battle");
  overlay.querySelector("#b_fight").onclick = () => { if (!battle.command("fight")) renderBattle(battle); };
  overlay.querySelector("#b_neg").onclick = () => { if (!battle.command("negotiate")) renderBattle(battle); };
  overlay.querySelector("#b_item").onclick = () => { if (!battle.command("item")) renderBattle(battle); };
  overlay.querySelector("#b_flee").onclick = () => { if (!battle.command("flee")) renderBattle(battle); };
}

function renderBattleEnd(result, battle, onEnd) {
  const msg = result === "win" ? "勝利した！" : result === "flee" ? "戦闘を離脱した。" : "田辺は倒れた……";
  const effect = battle.leveledUp ? cutinTag("assets/effects/level_up.png", "enemy-sprite") : "";
  showOverlay(`<div class="dialog">${effect}<p>${msg}${battle.leveledUp?"\nレベルアップ！":""}</p><div class="choices"><button id="battleEndOk">OK</button></div></div>`);
  document.getElementById("battleEndOk").onclick = () => {
    hideOverlay();
    onEnd(result);
    if (PENDING_TIMEUP && result !== "dead") { PENDING_TIMEUP = false; setTimeout(() => onTimeUp(true), 0); }
  };
}

function respawnAtCheckpoint() {
  STATE.player.hp = STATE.player.maxHp;
  STATE.position = { map: "home", x: 4, y: 14 };
  saveGame(STATE);
  showChoices("夢オチ……気づくと自宅にいた。運は0になってしまった。", [
    { label: "OK", onClick: enterField },
  ]);
}

// ---------- 隠しNPC：50万円のマット ----------
function talkNpc(id) {
  if (id === "oldman_mat") {
    FIELD.disable();
    const ev = CHAPTER0.hiddenEventMat;
    let html = `<div class="dialog">${cutinTag("assets/characters/oldman.png", "npc-portrait")}<p>お年寄り：「このマット、整体師から${ev.price.toLocaleString()}円で勧められてるんだが、どうかのう？」</p><div class="choices">`;
    ev.choices.forEach((c, i) => { html += `<button data-i="${i}">${c.text}</button>`; });
    html += `</div></div>`;
    showOverlay(html);
    ev.choices.forEach((c, i) => {
      overlay.querySelector(`[data-i="${i}"]`).onclick = () => resolveMatEvent(c);
    });
  }
}

function resolveMatEvent(choice) {
  STATE.hiddenEvents.mat = choice.id;
  if (choice.result === "learnSkill") {
    if (!STATE.player.learnedSkills.includes(CHAPTER0.skillOjiisanGoroshi.id)) STATE.player.learnedSkills.push(CHAPTER0.skillOjiisanGoroshi.id);
    saveGame(STATE);
    showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_oldman_killer.png")}
      <p>お年寄りがマットを購入した。必殺技「お年寄り殺し！」を習得した！</p>
      <div class="choices"><button id="matOk">OK</button></div></div>`);
    document.getElementById("matOk").onclick = backToField;
  } else if (choice.result === "gameOver") {
    showChoices('GAME OVER\n罪状：お年寄り殺しすぎ', [
      { label: "チェックポイントへ", onClick: () => {
          STATE.position = { map: "field", x: 7, y: 3 };
          saveGame(STATE);
          enterField();
        } },
    ]);
  } else {
    showChoices("特に何も起こらなかった。", [{ label: "OK", onClick: backToField }]);
  }
}

// ---------- 時間切れ →ストーリー ----------
function onTimeUp(forced) {
  if (STATE.flags.prologueClear || STATE.flags.timeUpDone) return;
  if (IN_BATTLE && !forced) { PENDING_TIMEUP = true; return; }
  STATE.flags.timeUpDone = true;
  FIELD && FIELD.disable();
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_surprised.png")}
    <p>画面暗転……
田辺は18歳。仕事が決まらず、サッカーだけは続けていた。
そこへ突然、FC山陽TIGAKUから連絡が入る。
昔ベッカムと撮影した写真と「田辺」という名前から、クラブ側がベッカムの関係者ではないかと勘違いしていた。
その流れで田辺はJレベルの入団テストへ呼ばれる。</p>
    <div class="choices"><button id="tryoutGo">入団テストへ</button></div></div>`);
  document.getElementById("tryoutGo").onclick = startTryout;
}

// ---------- 入団テスト（サッカー） ----------
function startTryout() {
  hideOverlay();
  playBGM("bgm_match");
  canvas.style.display = "block";
  document.getElementById("soccerControls").style.display = "flex";
  const skillBtn = document.getElementById("btn-skill");
  skillBtn.style.display = STATE.player.learnedSkills.includes(CHAPTER0.skillOjiisanGoroshi.id) ? "inline-block" : "none";
  const match = new SoccerMatch(canvas, STATE, 60, (evalResult) => {
    document.getElementById("soccerControls").style.display = "none";
    document.getElementById("btn-skill").style.display = "none";
    MATCH = null;
    STATE.matchRecords.tryout = evalResult;
    STATE.flags.joinedFC = true;
    saveGame(STATE);
    showTryoutResult(evalResult);
  });
  MATCH = match;
  match.enable();
}

function showTryoutResult(ev) {
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}
    <p>ヒロシ君：「……おまえ、走れるな。」
走行距離:${ev.distance} スプリント:${ev.sprintSec}秒 シュート:${ev.shoot} パス:${ev.pass}
得点:${ev.goals} 必殺技:${ev.special||0}回
田辺の登録が決定した。</p>
    <div class="choices"><button id="pressGo">記者会見へ</button></div></div>`);
  document.getElementById("pressGo").onclick = showEnding;
}

function showEnding() {
  STATE.flags.prologueClear = true;
  saveGame(STATE);
  playBGM("bgm_epilogue");
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_messi2.png")}
    <p>記者：「目標は？」
田辺：「メッシ二世になります。」

PROLOGUE CLEAR
「名前だけで、Jへ」</p>
    <div class="choices"><button id="titleGo">タイトルへ</button></div></div>`);
  document.getElementById("titleGo").onclick = showClearedTitle;
}

window.addEventListener("load", init);
window.addEventListener("load", setupTouchControls);

function setupTouchControls() {
  const bind = (id, onDown, onUp) => {
    const el = document.getElementById(id);
    el.addEventListener("touchstart", (e) => { e.preventDefault(); onDown(); }, { passive: false });
    el.addEventListener("mousedown", (e) => { e.preventDefault(); onDown(); });
    if (onUp) {
      el.addEventListener("touchend", (e) => { e.preventDefault(); onUp(); });
      el.addEventListener("mouseup", (e) => { e.preventDefault(); onUp(); });
      el.addEventListener("touchcancel", (e) => { onUp(); });
    }
  };

  // フィールド・サッカーとも、押している間だけ動き続ける
  const dirKey = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
  ["up", "down", "left", "right"].forEach((dir) => {
    bind(`btn-${dir}`,
      () => {
        if (MATCH) MATCH.setKey(dirKey[dir], true);
        else if (FIELD) FIELD.setKey(dir, true);
      },
      () => {
        if (MATCH) MATCH.setKey(dirKey[dir], false);
        else if (FIELD) FIELD.setKey(dir, false);
      }
    );
  });

  // サッカー：押している間だけ有効（キーボードのkeydown/keyupと同じ挙動）
  bind("btn-dash", () => MATCH && MATCH.setKey("Shift", true), () => MATCH && MATCH.setKey("Shift", false));
  bind("btn-pass", () => MATCH && MATCH.setKey("x", true), () => MATCH && MATCH.setKey("x", false));
  bind("btn-shoot", () => MATCH && MATCH.setKey(" ", true), () => MATCH && MATCH.setKey(" ", false));
  bind("btn-skill", () => MATCH && MATCH.setKey("z", true), () => MATCH && MATCH.setKey("z", false));
}
