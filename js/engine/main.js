// ===== メイン制御 =====
// 画面遷移・UIオーバーレイ・全体フローの管理。

let STATE = null;
let TIMER = null;
let CH2TIMER = null;
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
  // マップ画像を先読みしておき、切り替わった瞬間に絵が出ない状態を防ぐ。
  // 背景パスはfield.jsのMAPSを単一の情報源にし、バージョンクエリのズレで
  // プリロードが効かなくなる事故を防ぐ（MAPSにマップを足せば自動的に先読みされる）。
  ["assets/characters/tanabe.png?v=2","assets/characters/soccer_teammate.png","assets/characters/soccer_enemy.png"]
    .concat(Object.values(MAPS).map(m => m.bg))
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
  </div>
  <button id="titleCh2Dev" style="position:absolute;bottom:1.5%;right:3%;padding:6px 10px;font-size:11px;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:6px;">第2章から始める（テスト用）</button>
  </div>`);
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
  document.getElementById("titleCh2Dev").onclick = () => {
    showChoices("テスト用：序章をスキップして第2章から始めますか？", [
      { label: "はい", onClick: startNewGameChapter2 },
      { label: "やめる", onClick: showTitleScreen },
    ]);
  };
}

function startNewGame() {
  deleteSave();
  STATE = defaultSaveData();
  TIMER = new GameTimer(STATE, onTimeUp);
  showMomDialogue();
}

// テスト用：序章をスキップし、序章クリア相当の状態から第2章を直接開始する
function startNewGameChapter2() {
  deleteSave();
  STATE = defaultSaveData();
  STATE.flags.prologueClear = true;
  STATE.flags.joinedFC = true;
  STATE.flags.timeUpDone = true;
  STATE.remainingSec = 0;
  TIMER = new GameTimer(STATE, onTimeUp);
  hideOverlay();
  startChapter2();
}

function hudLoop() {
  if (STATE) {
    const inCh2 = STATE.chapter2 && STATE.chapter2.started && !STATE.chapter2.cleared;
    const timePart = inCh2
      ? `次の公式戦まで ${CH2TIMER ? CH2TIMER.formatTime() : "--:--"}`
      : `${STATE.day}日目 ${TIMER ? TIMER.formatTime() : "--:--"}`;
    const misfortunePart = inCh2 && STATE.chapter2.misfortuneMode ? ` <span style="color:#ff8a80">不遇</span>` : "";
    const poopPart = STATE.chapter2 && STATE.chapter2.curseLevel >= 1 ? " " + "💩".repeat(STATE.chapter2.curseLevel) : "";
    hud.innerHTML = `<b>Lv${STATE.player.level}</b>` +
      `<img class="hud-icon" src="assets/ui/icon_hp.png">${STATE.player.hp}/${STATE.player.maxHp}` +
      `<img class="hud-icon" src="assets/ui/icon_stamina.png">${Math.ceil(STATE.player.stamina)}/${STATE.player.maxStamina}` +
      ` G:${STATE.player.gold} <img class="hud-icon" src="assets/ui/icon_luck.png">${STATE.player.luck}` +
      ` | ${timePart}${misfortunePart}${poopPart}`;
    const objEl = document.getElementById("ch2Objective");
    if (objEl) {
      if (inCh2 && STATE.chapter2.objective) {
        objEl.textContent = "目標：" + STATE.chapter2.objective;
        objEl.style.display = (MATCH || IN_BATTLE) ? "none" : "block";
      } else {
        objEl.style.display = "none";
      }
    }
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
    <div class="choices"><button id="ch2Start">第2章へ進む</button><button id="clearReview">クリア記録を見る</button><button id="newGame">最初から遊ぶ</button></div></div>`);
  document.getElementById("ch2Start").onclick = () => {
    if (STATE.chapter2 && STATE.chapter2.started) resumeChapter2();
    else startChapter2();
  };
  document.getElementById("clearReview").onclick = () => {
    const r = STATE.matchRecords.tryout || {};
    showChoices(`入団テスト記録\n得点:${r.goals||0} パス:${r.pass||0} シュート:${r.shoot||0}\n走行距離:${r.distance||0}\n必殺技:${r.special||0}回`, [{label:"戻る",onClick:showClearedTitle}]);
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

// ---------- 第2章：開始〜自由行動 ----------
// 詳しい仕様は docs/chapter2_spec.md を参照。フェーズ1では土台のみ：
// 町・洞窟・練習場など既存マップを流用した自由行動と、公式戦までの
// カウントアップタイマーを用意する（試合本体は次フェーズ以降で実装）。
function startChapter2() {
  hideOverlay();
  STATE.chapter2.started = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}
    <p>入団から数週間。田辺はFC山陽TIGAKUの練習に加わる日々を送っていた。
ヒロシ君：「今、うちは2位だ。今日の試合に勝てば、単独首位に立てる。」
ヒロシ君：「首位決戦のつもりで臨んでくれ。まずは町や練習場を見て回って、調子を整えてくれ。」</p>
    <div class="choices"><button id="ch2Go">歩き出す</button></div></div>`);
  document.getElementById("ch2Go").onclick = () => { hideOverlay(); resumeChapter2(); };
}

function resumeChapter2() {
  enterField();
  if (!CH2TIMER) { CH2TIMER = new Chapter2Timer(STATE, onChapter2MatchDue); CH2TIMER.start(); }
  else CH2TIMER.resume();
}

function onChapter2MatchDue() {
  if (CH2TIMER) CH2TIMER.pause();
  FIELD && FIELD.disable();
  // ベンチ入り中は、まずアップエリアで監督にアピールしてから試合に入る
  if (STATE.chapter2.benchMode && STATE.chapter2.managerAppeal < CHAPTER2.managerAppealThreshold) {
    enterWarmupMenu();
  } else {
    showChoices(`公式戦の時間だ。第${STATE.chapter2.matchCount + 1}戦。`, [
      { label: "試合に出る", onClick: startChapter2Match },
    ]);
  }
}

// 序盤数試合は不遇補正なし（企画仕様どおり）。SoccerMatchをそのまま流用する。
function startChapter2Match() {
  // ベンチ組が途中出場のチャンスを使って出た試合。アピール値は使い切る。
  if (STATE.chapter2.benchMode) STATE.chapter2.managerAppeal = 0;
  hideOverlay();
  playBGM("bgm_match");
  canvas.style.display = "block";
  document.getElementById("soccerControls").style.display = "flex";
  const skillBtn = document.getElementById("btn-skill");
  skillBtn.style.display = STATE.player.learnedSkills.includes(CHAPTER0.skillOjiisanGoroshi.id) ? "inline-block" : "none";
  const match = new SoccerMatch(canvas, STATE, CHAPTER2.matchDurationSec, (evalResult) => {
    document.getElementById("soccerControls").style.display = "none";
    document.getElementById("btn-skill").style.display = "none";
    MATCH = null;
    finishChapter2Match(evalResult);
  });
  MATCH = match;
  match.enable();
}

function finishChapter2Match(evalResult) {
  STATE.chapter2.matchCount += 1;
  STATE.chapter2.nextMatchTimerSec = CHAPTER2.matchIntervalSec;
  STATE.matchRecords["ch2_" + STATE.chapter2.matchCount] = evalResult;
  const result = evalResult.goals > evalResult.conceded ? "win" : evalResult.goals < evalResult.conceded ? "lose" : "draw";

  // 第2章後半（J1）から出場給を導入。実際に出場した試合（このfinishChapter2Match自体）のみ加算。
  let paymentNote = "";
  if (STATE.chapter2.j1Mode) {
    STATE.player.gold += CHAPTER2.matchPayment;
    paymentNote = `\n出場給+${CHAPTER2.matchPayment}G`;
  }

  // サイドバックで出場した試合は、育成状況を反映した活躍度をsideBackExperienceに加算する
  let sideBackNote = "";
  if (STATE.chapter2.sideBackAccepted) {
    const sk = STATE.player.soccerSkills;
    const gain = Math.max(1, Math.round((evalResult.distance || 0) / 80 + evalResult.pass + evalResult.defense * 2 + sk.run * 0.3 + sk.defense * 0.3 + sk.dribble * 0.2));
    STATE.chapter2.sideBackExperience += gain;
    sideBackNote = `\nサイドバック経験値+${gain}`;
    STATE.chapter2.sideBackAccepted = false;
  }

  saveGame(STATE);
  const resultText = result === "win" ? "勝利！" : result === "lose" ? "敗北……" : "引き分け";
  const managerNote = evalResult.defense === 0 ? "\n\n監督：「守備もちゃんとやれ」" : "";
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}
    <p><b>${resultText}</b>
田辺 ${evalResult.goals} - ${evalResult.conceded} 相手
第${STATE.chapter2.matchCount}戦 終了${paymentNote}${sideBackNote}${managerNote}</p>
    <div class="choices"><button id="ch2MatchOk">OK</button></div></div>`);
  document.getElementById("ch2MatchOk").onclick = () => {
    hideOverlay();
    const dismiss = STATE.chapter2.misfortuneMode && !STATE.chapter2.hiroshiDismissed &&
      (STATE.chapter2.matchCount - STATE.chapter2.matchCountAtPunishment) >= CHAPTER2.matchesBeforeDismissal;
    if (dismiss) { showManagerDismissalEvent(); return; }
    if (checkPromotionTrigger()) return;
    if (checkCurseSuspicionTrigger()) return;
    if (checkJ1BenchTrigger()) return;
    if (STATE.chapter2.matchCount === 1 && !STATE.chapter2.momErrandShown) { showMomErrandEvent(); return; }
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// 1試合目終了後、勝敗に関わらず母からの一言＋お使い（お守り購入＋お参り）イベント。
// ここで神社の入口を解放する（以前の「試合数で自動解放」は廃止し、ストーリー駆動にする）。
function showMomErrandEvent() {
  STATE.chapter2.momErrandShown = true;
  STATE.chapter2.shrineUnlocked = true;
  STATE.chapter2.objective = "神社でお守りを買おう";
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>母：「昨日は大活躍だったわね、すごいじゃない！」
母：「今日も頑張ってね。それと、交通安全のお守りを買ってきてくれない？神社でお参りもしてきてね。」</p>
    <div class="choices"><button id="momErrandOk">わかった</button></div></div>`);
  document.getElementById("momErrandOk").onclick = () => {
    hideOverlay();
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// ---------- 第2章：監督更迭・ヒグチビッチ加入・ベンチ試合 ----------
function showManagerDismissalEvent() {
  showOverlay(`<div class="dialog"><p>「天罰のタナベッカム」――サポーターの声はやがてひろし君自身にも向けられた。
連敗の責任を問われ、ひろし君は監督を解任された。</p>
    <div class="choices"><button id="dismissOk">……</button></div></div>`);
  document.getElementById("dismissOk").onclick = () => {
    STATE.chapter2.hiroshiDismissed = true;
    saveGame(STATE);
    showHiguchiArrivalEvent();
  };
}

function showHiguchiArrivalEvent() {
  showOverlay(`<div class="dialog">${cutinTag("assets/characters/higuchibitch.png")}<p>新監督：「今日から、ヒグチビッチをレギュラーにする。」

颯爽と現れたヒグチビッチは、シュート・ドリブル・パスすべてが田辺を圧倒していた。
田辺はベンチスタートになった。</p>
    <div class="choices"><button id="higuchiOk">……</button></div></div>`);
  document.getElementById("higuchiOk").onclick = () => {
    STATE.chapter2.higuchibitchJoined = true;
    STATE.chapter2.benchMode = true;
    STATE.chapter2.misfortuneMode = false; // ヒグチビッチの活躍でチームは勝ち始める
    STATE.chapter2.managerAppeal = 0;
    STATE.chapter2.matchCountAtHiguchiJoin = STATE.chapter2.matchCount;
    saveGame(STATE);
    hideOverlay();
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// ---------- 第2章：昇格・ヒグチビッチ移籍・J1 ----------
// ヒグチビッチ加入後、一定試合数をこなすとJ昇格→即アーセナル移籍の流れになる
function checkPromotionTrigger() {
  const c2 = STATE.chapter2;
  if (c2.higuchibitchJoined && !c2.promoted &&
      (c2.matchCount - c2.matchCountAtHiguchiJoin) >= CHAPTER2.matchesForPromotion) {
    showPromotionEvent();
    return true;
  }
  return false;
}

function showPromotionEvent() {
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_messi2.png")}<p>ヒグチビッチの活躍でFC山陽TIGAKUは勝ち星を重ね、ついにJ1昇格を決めた！</p>
    <div class="choices"><button id="promoOk">……</button></div></div>`);
  document.getElementById("promoOk").onclick = () => {
    STATE.chapter2.promoted = true;
    saveGame(STATE);
    showHiguchiTransferEvent();
  };
}

function showHiguchiTransferEvent() {
  showOverlay(`<div class="dialog"><p>昇格の熱が冷めやらぬ中、ヒグチビッチは颯爽とアーセナルへ移籍していった。
長い別れの言葉はなかった。

チームの視線は、再び田辺に集まることになる。</p>
    <div class="choices"><button id="transferOk">……</button></div></div>`);
  document.getElementById("transferOk").onclick = () => {
    STATE.chapter2.higuchibitchTransferred = true;
    STATE.chapter2.benchMode = false;
    STATE.chapter2.j1Mode = true;
    STATE.chapter2.matchCountAtJ1Start = STATE.chapter2.matchCount;
    saveGame(STATE);
    hideOverlay();
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// ---------- 第2章：お祓い・呪い・💩システム ----------
function checkCurseSuspicionTrigger() {
  const c2 = STATE.chapter2;
  if (c2.j1Mode && !c2.curseSuspicionRaised &&
      (c2.matchCount - c2.matchCountAtJ1Start) >= CHAPTER2.matchesBeforeCurseSuspicion) {
    showCurseSuspicionEvent();
    return true;
  }
  return false;
}

function showCurseSuspicionEvent() {
  showOverlay(`<div class="dialog"><p>J1の壁は厚く、田辺は苦戦を続けていた。
ひろし君の息子が再び動き出す――「まだ呪われてるんじゃない？」
サポーターの声が田辺に届く。「お祓いしてこい！」</p>
    <div class="choices"><button id="curseSuspicionOk">神社へ向かう</button></div></div>`);
  document.getElementById("curseSuspicionOk").onclick = () => {
    STATE.chapter2.curseSuspicionRaised = true;
    saveGame(STATE);
    hideOverlay();
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

function onAltar(id) {
  if (id !== "exorcism_altar") return;
  FIELD.disable();
  if (CH2TIMER) CH2TIMER.pause();
  showChoices(`お祓いを受けますか？（G${CHAPTER2.exorcismCost.money}を消費します）`, [
    { label: "受ける", onClick: performExorcism },
    { label: "やめる", onClick: () => { hideOverlay(); FIELD.enable(); if (CH2TIMER) CH2TIMER.resume(); } },
  ]);
}

// お祓いの結果は既存の「運」パラメータで決まるが、プレイヤーには一切明示しない
function performExorcism() {
  if (STATE.player.gold < CHAPTER2.exorcismCost.money) {
    showChoices("お金が足りない……", [
      { label: "戻る", onClick: () => { hideOverlay(); FIELD.enable(); if (CH2TIMER) CH2TIMER.resume(); } },
    ]);
    return;
  }
  STATE.player.gold -= CHAPTER2.exorcismCost.money;
  STATE.chapter2.nextMatchTimerSec = Math.max(0, STATE.chapter2.nextMatchTimerSec - CHAPTER2.exorcismCost.time);
  STATE.chapter2.exorcismCount += 1;

  const score = Math.random() * 100 + STATE.player.luck;
  const th = CHAPTER2.exorcismOutcomeThresholds;
  let msg;
  if (score >= th.full) {
    STATE.chapter2.curseLevel = 0;
    msg = "タナベッカムの呪いは完全に解けた！";
  } else if (score >= th.partial) {
    STATE.chapter2.curseLevel = Math.max(0, STATE.chapter2.curseLevel - 1);
    msg = "タナベッカムの呪いは少しだけ解けた！";
  } else {
    STATE.chapter2.curseLevel = Math.min(CHAPTER2.curseMax, STATE.chapter2.curseLevel + 1);
    msg = "なんと！タナベッカムはさらに呪われた！";
    if (STATE.chapter2.curseLevel >= CHAPTER2.curseMax && !STATE.player.titles.includes(CHAPTER2.titles.poop)) {
      STATE.player.titles.push(CHAPTER2.titles.poop);
    }
  }
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>${msg}</p><div class="choices"><button id="exorcismOk">OK</button></div></div>`);
  document.getElementById("exorcismOk").onclick = () => {
    hideOverlay();
    FIELD.enable();
    FIELD.render();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// ---------- 第2章：サイドバック・出場機会減少 ----------
function checkJ1BenchTrigger() {
  const c2 = STATE.chapter2;
  if (c2.j1Mode && !c2.benchMode &&
      (c2.matchCount - c2.matchCountAtJ1Start) >= CHAPTER2.matchesBeforeJ1Bench) {
    showJ1BenchEvent();
    return true;
  }
  return false;
}

function showJ1BenchEvent() {
  showOverlay(`<div class="dialog"><p>J1のレベルについていけず、田辺の出場機会は徐々に減っていった。
「プロなのに、試合に出られない」――そんな現実が田辺を待っていた。
出場給が減り、生活は苦しくなっていく。</p>
    <div class="choices"><button id="j1BenchOk">……</button></div></div>`);
  document.getElementById("j1BenchOk").onclick = () => {
    STATE.chapter2.benchMode = true;
    STATE.chapter2.managerAppeal = 0;
    STATE.chapter2.massageJobUnlocked = true;
    saveGame(STATE);
    hideOverlay();
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// 途中出場のチャンスが来た時の入り口。ヒグチビッチ移籍後（サイドバック編）は
// 出場ポジションの選択を挟む。
function offerSubInEntry() {
  if (STATE.chapter2.higuchibitchTransferred) {
    STATE.chapter2.sideBackOffered = true;
    showChoices('監督：「今日はサイドバックでもしておけ。」', [
      { label: "サイドバックで出る", onClick: () => { STATE.chapter2.sideBackAccepted = true; startChapter2Match(); } },
      { label: "俺はトップ下です", onClick: () => { STATE.chapter2.sideBackAccepted = false; startChapter2Match(); } },
    ]);
  } else {
    showChoices("アピールが監督に届いた！\n今日は途中出場のチャンスだ。", [{ label: "試合へ", onClick: startChapter2Match }]);
  }
}

// ---------- 第2章：整体師アルバイト ----------
function enterMassageJob() {
  const job = CHAPTER2.massageJob;
  const patient = job.patients[Math.floor(Math.random() * job.patients.length)];
  const spotKeys = Object.keys(job.spots);
  const hint = STATE.player.seitaiPoint >= job.hintThreshold;
  let html = `<div class="dialog"><p>${patient.symptom}
施術箇所を選んでください。${hint ? "（身体ケアの経験から、なんとなく見当がつく……）" : ""}</p><ul>`;
  spotKeys.forEach((k, i) => { html += `<li><button data-i="${i}">${job.spots[k]}</button></li>`; });
  html += `</ul><button id="closeMassage">やめる</button></div>`;
  showOverlay(html);
  spotKeys.forEach((k, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => resolveMassage(k === patient.correct);
  });
  overlay.querySelector("#closeMassage").onclick = backToField;
}

function resolveMassage(correct) {
  const job = CHAPTER2.massageJob;
  STATE.chapter2.massageWorkCount += 1;
  let msg;
  if (correct) {
    STATE.player.gold += job.reward;
    STATE.player.seitaiPoint += job.seitaiPointGain;
    msg = `施術成功！ G+${job.reward}、身体ケアポイント+${job.seitaiPointGain}`;
  } else {
    msg = "施術は空振りだった……報酬はなし。";
  }
  saveGame(STATE);
  if (checkMasseurArrestTrigger()) return;
  showChoices(msg, [
    { label: "もう一人施術する", onClick: enterMassageJob },
    { label: "やめる", onClick: backToField },
  ]);
}

// ---------- 第2章：悪徳整体師逮捕・警察逃走ダンジョン・エンディング ----------
function checkMasseurArrestTrigger() {
  if (!STATE.chapter2.masseurArrested && STATE.chapter2.massageWorkCount >= CHAPTER2.massageWorkCountForArrest) {
    showMasseurArrestEvent();
    return true;
  }
  return false;
}

function showMasseurArrestEvent() {
  hideOverlay();
  showOverlay(`<div class="dialog"><p>ある日、整体院に警察が踏み込んできた。
「この整体師、無資格営業と悪質な高額商法の疑いです！」
世話になっていた整体師は、そのまま連行されていった。
突然の出来事に、田辺はパニックになって走り出した――。</p>
    <div class="choices"><button id="arrestOk">逃げる！</button></div></div>`);
  document.getElementById("arrestOk").onclick = () => {
    STATE.chapter2.masseurArrested = true;
    saveGame(STATE);
    hideOverlay();
    enterPoliceDungeon();
  };
}

function enterPoliceDungeon() {
  if (CH2TIMER) CH2TIMER.pause();
  playBGM("bgm_dungeon");
  STATE.position = { map: "policeDungeon", x: 4, y: 14 };
  saveGame(STATE);
  enterField();
}

function onPoliceEscape() {
  FIELD.disable();
  STATE.chapter2.policeDungeonCleared = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}<p><b>タナベッカムは逃げ切った！</b></p><div class="choices"><button id="escapeOk">……</button></div></div>`);
  document.getElementById("escapeOk").onclick = () => { hideOverlay(); showSpainOfferEvent(); };
}

function showSpainOfferEvent() {
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_surprised.png")}<p>田辺は一人になった。
サッカーでも居場所はなく、頼っていた整体師も逮捕され、どん底の状態だった。

そこへ一本の電話が鳴る。
「もしもし……こちら、スペイン2部リーグのクラブです。」</p>
    <div class="choices"><button id="spainOk">……</button></div></div>`);
  document.getElementById("spainOk").onclick = () => {
    STATE.chapter2.cleared = true;
    saveGame(STATE);
    showChapter2ClearedTitle();
  };
}

function showChapter2ClearedTitle() {
  playBGM("bgm_title");
  const c2 = STATE.chapter2;
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_back.png")}
    <p><b>タナベッカムの不遇</b>
第2章 Ver.0.1

CHAPTER 2 CLEAR「天罰、ベンチ、そしてスペインへ」
第3章「スペイン編」へ続く……</p>
    <div class="choices"><button id="ch2ClearReview">記録を見る</button><button id="ch2NewGame">最初から遊ぶ</button></div></div>`);
  document.getElementById("ch2ClearReview").onclick = () => {
    showChoices(`第2章記録\n試合数:${c2.matchCount} 昇格:${c2.promoted ? "○" : "×"}\n称号:${STATE.player.titles.join("、") || "なし"}\n呪いレベル:${c2.curseLevel} お祓い回数:${c2.exorcismCount}\nサイドバック経験値:${c2.sideBackExperience} 整体バイト回数:${c2.massageWorkCount}`,
      [{ label: "戻る", onClick: showChapter2ClearedTitle }]);
  };
  document.getElementById("ch2NewGame").onclick = () => {
    showChoices("セーブを消して最初から遊びますか？", [
      { label: "はい（消して最初から）", onClick: () => { deleteSave(); STATE = null; location.reload(); } },
      { label: "やめる", onClick: showChapter2ClearedTitle },
    ]);
  };
}

// アップエリア：田辺はベンチ横で軽い行動のみ可能。managerAppealを貯めて途中出場を狙う。
function enterWarmupMenu() {
  const actions = CHAPTER2.warmupActions;
  const keys = Object.keys(actions);
  let html = `<div class="dialog"><p>公式戦の時間だ。田辺は今日もベンチスタート。
アップエリアで監督にアピールしよう。（アピール ${STATE.chapter2.managerAppeal}/${CHAPTER2.managerAppealThreshold}）</p><ul>`;
  keys.forEach((key, i) => { html += `<li><button data-i="${i}">${actions[key].label}</button></li>`; });
  html += `</ul><button id="warmupGo">試合を見る（ベンチへ）</button></div>`;
  showOverlay(html);
  keys.forEach((key, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => {
      const a = actions[key];
      if (STATE.player.stamina >= a.stamina) {
        STATE.player.stamina -= a.stamina;
        STATE.chapter2.managerAppeal = Math.min(CHAPTER2.managerAppealThreshold, STATE.chapter2.managerAppeal + a.appeal);
      }
      saveGame(STATE);
      if (STATE.chapter2.managerAppeal >= CHAPTER2.managerAppealThreshold) {
        offerSubInEntry();
      } else {
        enterWarmupMenu();
      }
    };
  });
  document.getElementById("warmupGo").onclick = resolveBenchMatch;
}

// ベンチのままの試合はヒグチビッチ主体で自動決着する（田辺は操作不可のため）
function resolveBenchMatch() {
  hideOverlay();
  STATE.chapter2.matchCount += 1;
  STATE.chapter2.nextMatchTimerSec = CHAPTER2.matchIntervalSec;
  const win = Math.random() < CHAPTER2.benchWinRate;
  const draw = !win && Math.random() < 0.3;
  const scoreP = win ? 1 + Math.floor(Math.random() * 3) : (draw ? 1 : Math.floor(Math.random() * 2));
  const scoreC = win ? Math.floor(Math.random() * 2) : (draw ? scoreP : 1 + Math.floor(Math.random() * 2));
  STATE.matchRecords["ch2_" + STATE.chapter2.matchCount] = { bench: true, goals: scoreP, conceded: scoreC };
  saveGame(STATE);
  const resultText = scoreP > scoreC ? "勝利！" : scoreP < scoreC ? "敗北……" : "引き分け";
  showOverlay(`<div class="dialog"><p><b>${resultText}</b>
ヒグチビッチが躍動する試合だった。
TIGAKU ${scoreP} - ${scoreC} 相手
田辺はベンチから見ていた。
第${STATE.chapter2.matchCount}戦 終了</p>
    <div class="choices"><button id="benchMatchOk">OK</button></div></div>`);
  document.getElementById("benchMatchOk").onclick = () => {
    hideOverlay();
    if (checkPromotionTrigger()) return;
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// ---------- 第2章：神社①・賽銭・お守り・本殿・神戦・天罰 ----------
// 宝箱（任意のお賽銭窃盗）と本殿での神戦は独立したイベント。
// プレイヤーに選択肢は出さない（企画仕様どおり、盗む/盗まないの分岐は作らない）
function onChest(id) {
  if (id !== "shrine_offering") return;
  FIELD.disable();
  if (CH2TIMER) CH2TIMER.pause();
  STATE.chapter2.offeringTaken = true;
  STATE.chapter2.hiroshiSonSeen = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>宝箱を開けた。
お賽銭を手に入れた！

（画面の端に、ひろし君の息子がこちらをじっと見ている気配がした……）</p>
    <div class="choices"><button id="chestOk">……</button></div></div>`);
  document.getElementById("chestOk").onclick = () => {
    hideOverlay();
    FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

function onCharmShop(id) {
  if (id !== "shrine_charm_shop") return;
  FIELD.disable();
  if (CH2TIMER) CH2TIMER.pause();
  const backToField = () => { hideOverlay(); FIELD.enable(); if (CH2TIMER) CH2TIMER.resume(); };
  if (STATE.chapter2.trafficCharm) {
    showChoices("すでにお守りは買ってある。", [{ label: "戻る", onClick: backToField }]);
    return;
  }
  showChoices(`お守り売り場だ。交通安全のお守りを買いますか？（G${CHAPTER2.charmPrice}）`, [
    { label: "買う", onClick: () => {
        if (STATE.player.gold < CHAPTER2.charmPrice) {
          showChoices("お金が足りない……", [{ label: "戻る", onClick: backToField }]);
          return;
        }
        STATE.player.gold -= CHAPTER2.charmPrice;
        STATE.chapter2.trafficCharm = true;
        saveGame(STATE);
        showChoices("交通安全のお守りを買った。", [{ label: "OK", onClick: backToField }]);
      } },
    { label: "やめる", onClick: backToField },
  ]);
}

// 本殿で祈ると、宝箱の有無に関係なく無条件で「神」が出現する。一度きりのイベント。
function onMainHall(id) {
  if (id !== "shrine_main_hall") return;
  if (STATE.chapter2.shrinePrayed) return;
  FIELD.disable();
  if (CH2TIMER) CH2TIMER.pause();
  STATE.chapter2.shrinePrayed = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>本殿の前で手を合わせた。

（……何かが、こちらを見ている）</p>
    <div class="choices"><button id="prayOk">……</button></div></div>`);
  document.getElementById("prayOk").onclick = () => { hideOverlay(); startGodBattle(); };
}

function startGodBattle() {
  FIELD.disable();
  IN_BATTLE = true;
  playBGM("bgm_boss");
  const battle = new BattleController(STATE, "god", (result) => {
    IN_BATTLE = false;
    if (result === "win") playBGM("bgm_victory", { loop: false });
    renderGodBattleEnd(result, battle);
  });
  renderBattle(battle);
}

// 神戦は勝っても負けても天罰が発生する（祈ったこと自体への天罰。賽銭の有無は無関係）
function renderGodBattleEnd(result, battle) {
  if (result === "win") {
    if (!STATE.player.titles.includes(CHAPTER2.titles.god)) STATE.player.titles.push(CHAPTER2.titles.god);
    STATE.chapter2.godDefeated = true;
  }
  STATE.chapter2.divinePunishment = true;
  STATE.chapter2.misfortuneMode = true;
  STATE.chapter2.matchCountAtPunishment = STATE.chapter2.matchCount;
  STATE.player.hp = STATE.player.maxHp;
  const msg = result === "win"
    ? `神を撃破した！\n隠し称号「${CHAPTER2.titles.god}」を獲得した。\n気づけば、いつの間にか自宅の前に立っていた……`
    : "神の力の前に、田辺は膝をついた……\n気づけば、いつの間にか自宅の前に立っていた……";
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_surprised.png")}<p>${msg}</p><div class="choices"><button id="godBattleOk">OK</button></div></div>`);
  document.getElementById("godBattleOk").onclick = () => {
    hideOverlay();
    STATE.position = { map: "home", x: 4, y: 15 }; // 神戦後は強制的に自宅へ戻す
    saveGame(STATE);
    showMomShrineReactionEvent();
  };
}

// 神社から強制帰宅した直後の母イベント。お守りを買ってきたかどうかで反応が変わる
function showMomShrineReactionEvent() {
  const gotCharm = !!STATE.chapter2.trafficCharm;
  STATE.chapter2.objective = "次の公式戦に備えよう";
  saveGame(STATE);
  const line = gotCharm
    ? "母：「お守り、ちゃんと買ってきてくれたのね。ありがとう。」"
    : "母：「あら……お守りは？お参りだけしてきたの？もう、しっかりしてよね。」";
  showOverlay(`<div class="dialog"><p>${line}</p>
    <div class="choices"><button id="momShrineOk">OK</button></div></div>`);
  document.getElementById("momShrineOk").onclick = () => {
    hideOverlay();
    FIELD.enable();
    FIELD.render();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// 画像タグ生成（無ければ自動で非表示になるので、既存のcolored-boxフォールバックと併用可）
function cutinTag(path, cls) {
  return `<img src="${path}" class="${cls || "cutin"}" onerror="this.style.display='none'" />`;
}
function showOverlay(html) { overlay.classList.remove("overlay-battle"); overlay.innerHTML = html; overlay.style.display = "block"; }
function hideOverlay() { overlay.style.display = "none"; overlay.innerHTML = ""; overlay.classList.remove("overlay-battle"); }

// 店舗系メニューの背景イラスト用インラインstyle。両レイヤーにcover/no-repeatを
// 明示しないと、グラデーション側がauto+repeatになり画面下側が真っ暗に潰れるので注意。
function shopBgStyle(bgImage) {
  if (!bgImage) return "";
  return ` style="background-image:linear-gradient(rgba(10,8,4,.62),rgba(10,8,4,.82)),url('${bgImage}');background-size:cover,cover;background-position:center,center;background-repeat:no-repeat,no-repeat;"`;
}

function showChoices(text, choices, bgImage) {
  // choices: [{label, onClick}]
  const bgStyle = shopBgStyle(bgImage);
  let html = `<div class="dialog${bgImage ? " shop-bg" : ""}"${bgStyle}><p>${text}</p><div class="choices">`;
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
    onChest: (id) => onChest(id),
    onAltar: (id) => onAltar(id),
    onCharmShop: (id) => onCharmShop(id),
    onMainHall: (id) => onMainHall(id),
    onPoliceEscape: () => onPoliceEscape(),
  });
  FIELD.enable();
  FIELD.render();
}

function enterBuilding(building) {
  FIELD.disable();
  if (building.id === "weaponshop") openShop(["weapons", "shields", "armors"], "assets/shops/weaponshop.png");
  else if (building.id === "itemshop") openShop(["items"]);
  else if (building.id === "inn") openInn();
  else if (building.id === "tavern") openTavern();
  else if (building.id === "jobcenter") openJobCenter();
  else if (building.id === "house_interior") showHomeInterior();
}

// 自宅の庭から「家の中へ」で、冒頭で母と話した室内の絵にいつでも戻れるようにする
function showHomeInterior() {
  showOverlay(`<div class="full-screen-art"><div class="art-frame">
    <img src="assets/opening/opening_home.png?v=${ART_ASSET_VERSION}" onerror="this.style.display='none'">
    <button id="homeInteriorBack" class="art-hotspot" style="top:88%;height:9%;left:10%;width:80%;" aria-label="戻る"></button>
  </div></div>`);
  sizeArtFrames();
  document.getElementById("homeInteriorBack").onclick = backToField;
}

function backToField() { FIELD.enable(); hideOverlay(); FIELD.render(); }

// ---------- 武器屋・道具屋 ----------
function openShop(categories, bgImage) {
  let items = [];
  if (categories.includes("weapons")) items = items.concat(CHAPTER0.weapons.map(w => ({ ...w, type: "weapon" })));
  if (categories.includes("shields")) items = items.concat(CHAPTER0.shields.map(s => ({ ...s, type: "shield" })));
  if (categories.includes("armors")) items = items.concat(CHAPTER0.armors.map(a => ({ ...a, type: "armor" })));
  if (categories.includes("items")) items = items.concat(CHAPTER0.items.map(it => ({ ...it, type: "item" })));

  const bgStyle = shopBgStyle(bgImage);
  let html = `<div class="dialog shop-bg"${bgStyle}><p>所持金: ${STATE.player.gold}G</p><ul class="shoplist">`;
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
      openShop(categories, bgImage);
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
        STATE.position = { map: "home", x: 4, y: 14 };
        // 第2章では序章の残り時間(TIMER)がとっくに0で止まっているため、
        // 日数経過の判定は使わず、代わりに次の公式戦までの時間を2分進める。
        if (STATE.chapter2 && STATE.chapter2.started) {
          STATE.chapter2.nextMatchTimerSec = Math.max(0, STATE.chapter2.nextMatchTimerSec - 120);
          saveGame(STATE);
          enterField();
        } else {
          const timedOut = TIMER.consumeAndAdvanceDay(CHAPTER0.innCost.time);
          saveGame(STATE);
          if (timedOut) onTimeUp(true);
          else enterField();
        }
      } },
    { label: "やめる", onClick: backToField },
  ], "assets/shops/inn.png");
}

// ---------- 酒場（NPC抽選） ----------
function openTavern() {
  const inCh2 = STATE.chapter2 && STATE.chapter2.started;
  // 第2章は日数が進まないため、公式戦の回数を日替わり相当のシードにする
  const seed = inCh2 ? STATE.chapter2.matchCount : STATE.day;
  const rng = mulberry32(seed);
  let html = `<div class="dialog shop-bg"${shopBgStyle("assets/shops/tavern.png")}><p>酒場のNPC（本日）</p><ul>`;
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
        joinCompanion(p.companion);
      } else {
        openTavern();
      }
    };
  });
  overlay.querySelector("#closeTavern").onclick = backToField;
}

// 仲間が加わった瞬間の演出。カットイン素材があれば一言メッセージと共に表示し、
// 無ければ従来通り即座に加入する（キャラごとに順次カットインを用意できる想定）。
function joinCompanion(companion) {
  STATE.party.push({ ...companion, hp: 20 + companion.rank * 2, dead: false });
  saveGame(STATE);
  if (companion.joinCutin) {
    showOverlay(`<div class="dialog">${cutinTag(companion.joinCutin)}<p><b>${companion.name}</b>が仲間になった！</p><div class="choices"><button id="joinOk">OK</button></div></div>`);
    document.getElementById("joinOk").onclick = openTavern;
  } else {
    openTavern();
  }
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
  const massageAvailable = STATE.chapter2 && STATE.chapter2.massageJobUnlocked;
  let html = `<div class="dialog shop-bg"${shopBgStyle("assets/shops/jobcenter.png")}><p>職業安定所：求人を選んでください</p><ul>`;
  CHAPTER0.jobs.forEach((j, i) => { html += `<li><button data-i="${i}">${j.name}</button></li>`; });
  if (massageAvailable) html += `<li><button id="jobMassage">整体師のアルバイト</button></li>`;
  html += `</ul><button id="closeJob">出る</button></div>`;
  showOverlay(html);
  CHAPTER0.jobs.forEach((j, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => applyJob(j);
  });
  if (massageAvailable) document.getElementById("jobMassage").onclick = enterMassageJob;
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
        STATE.position = { map: "home", x: 4, y: 14 };
        // 第2章では序章の残り時間(TIMER)がとっくに0で止まっているため、
        // 日数経過の判定は使わずそのまま研修終了画面へ進む。
        if (STATE.chapter2 && STATE.chapter2.started) {
          saveGame(STATE);
          showChoices(`研修終了。整体ポイント+1、給料${CHAPTER0.seitaiReward.money}G。`, [
            { label: "OK", onClick: enterField },
          ]);
        } else {
          const timedOut = TIMER.consumeAndAdvanceDay(CHAPTER0.seitaiCost.time);
          saveGame(STATE);
          if (timedOut) {
            onTimeUp(true);
          } else {
            showChoices(`研修終了。整体ポイント+1、給料${CHAPTER0.seitaiReward.money}G。`, [
              { label: "OK", onClick: enterField },
            ]);
          }
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
        // 第2章では序章の残り時間(TIMER)がとっくに0で止まっているため、時間経過判定はスキップする。
        if (STATE.chapter2 && STATE.chapter2.started) {
          saveGame(STATE);
        } else {
          const timedOut = TIMER.consume(CHAPTER0.practiceCost.time);
          saveGame(STATE);
          if (timedOut) { onTimeUp(true); return; }
        }
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
走行距離:${ev.distance} シュート:${ev.shoot} パス:${ev.pass}
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
  bind("btn-passreq", () => MATCH && MATCH.setKey("r", true), () => MATCH && MATCH.setKey("r", false));
  bind("btn-pass", () => MATCH && MATCH.setKey("x", true), () => MATCH && MATCH.setKey("x", false));
  bind("btn-shoot", () => MATCH && MATCH.setKey(" ", true), () => MATCH && MATCH.setKey(" ", false));
  bind("btn-tackle", () => MATCH && MATCH.setKey("c", true), () => MATCH && MATCH.setKey("c", false));
  bind("btn-skill", () => MATCH && MATCH.setKey("z", true), () => MATCH && MATCH.setKey("z", false));
}
