// ===== メイン制御 =====
// 画面遷移・UIオーバーレイ・全体フローの管理。

let STATE = null;
let TIMER = null;
let CH2TIMER = null;
let FIELD = null;
let MATCH = null;
let CHASE = null;
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
  ["assets/characters/tanabe.png?v=2","assets/characters/soccer_teammate.png","assets/characters/soccer_enemy.png",
    CHAPTER2.masseurBoss.sprite, "assets/maps/police_chase_map.jpg?v=1"]
    .concat(CHAPTER2.policeChase.copSprites)
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
    <img src="assets/title/title_main.jpg?v=${ART_ASSET_VERSION}" onerror="this.style.display='none'">
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

// タイマーが切れた瞬間の合図。ここではまだ試合を始めない
// （スタジアムの建物へ実際に入るまで保留にする。onEnterBuilding側のenterStadium参照）。
function onChapter2MatchDue() {
  if (CH2TIMER) CH2TIMER.pause();
  const c2 = STATE.chapter2;
  c2.shaolinShotUsedThisMatch = false;
  // J2降格後は「今日は公式戦の日のはずが、ベンチ入りすらしていない」を一度だけ見せて
  // 無所属イベントへ進む。以降、通常の公式戦サイクルはこの章では再開しない
  // （スタジアムへ向かう前提自体が崩れているため、プレイヤーの位置に関わらず発生させる）。
  if (c2.j2Mode && !c2.j2OpeningShown) {
    FIELD && FIELD.disable();
    c2.j2OpeningShown = true;
    saveGame(STATE);
    showJ2OpeningEvent();
    return;
  }
  c2.matchDuePending = true;
  saveGame(STATE);
  if (FIELD) FIELD.render();
}

// スタジアムの建物に入った時に呼ばれる。公式戦の時間でなければ何も起きない。
function enterStadium() {
  FIELD.disable();
  if (!STATE.chapter2.matchDuePending) {
    showChoices("スタジアム：まだ次の試合まで時間がありそうだ。", [
      { label: "戻る", onClick: backToField },
    ]);
    return;
  }
  STATE.chapter2.matchDuePending = false;
  saveGame(STATE);
  startMatchDueFlow();
}

function startMatchDueFlow() {
  const c2 = STATE.chapter2;
  // 佐々木SVの4択を終えた（promotionReady成立後の）次の公式戦は、必ず昇格決定戦になる
  if (c2.higuchibitchJoined && !c2.promoted && c2.promotionReady) {
    c2.promotionDeciderPending = true;
    saveGame(STATE);
    showPromotionDeciderAnnounce();
    return;
  }
  // ヒグチビッチ加入後の初戦は、アピールしても絶対に途中出場できない（完全ベンチ確定）
  if (c2.benchMode && !c2.higuchiDebutDone) {
    showChoices(`公式戦の時間だ。第${c2.matchCount + 1}戦。

ヒグチビッチがトップ下で先発。田辺はベンチスタートだ。`, [
      { label: "試合に出る", onClick: startHiguchiDebutBenchMatch },
    ]);
    return;
  }
  // ベンチ入り中は、まずアップエリアで監督にアピールしてから試合に入る
  if (c2.benchMode && c2.managerAppeal < CHAPTER2.managerAppealThreshold) {
    enterWarmupMenu();
    return;
  }
  // 天罰下（misfortuneMode）の何試合目かで、通常試合／金縛り試合／ダイジェストを切り替える
  const curseMatchesSoFar = (c2.misfortuneMode && !c2.hiroshiDismissed) ? (c2.matchCount - c2.matchCountAtPunishment) : -1;
  if (curseMatchesSoFar === 0) {
    // 天罰直後、最初の1試合だけは完全に身体が動かない（確定敗北）
    showChoices(`公式戦の時間だ。第${c2.matchCount + 1}戦。`, [
      { label: "試合に出る", onClick: startParalyzedMatch },
    ]);
  } else if (curseMatchesSoFar >= 1) {
    // 2〜5試合目は1試合ずつ待たされず、残り全部をまとめて消化する（いずれも敗北）
    showChoices(`公式戦の時間だ。第${c2.matchCount + 1}戦。`, [
      { label: "試合に出る", onClick: showDigestMatchBundle },
    ]);
  } else if (c2.j1Mode && !c2.j1OpeningAnnounced) {
    // J1初戦は告知を一度だけ挟む。通常のリアルタイム試合で、結果によって本編は分岐しない。
    c2.j1OpeningAnnounced = true;
    saveGame(STATE);
    showJ1OpeningAnnounce();
  } else {
    showChoices(`公式戦の時間だ。第${c2.matchCount + 1}戦。`, [
      { label: "試合に出る", onClick: startChapter2Match },
    ]);
  }
}

function showJ1OpeningAnnounce() {
  showOverlay(`<div class="dialog"><p><b>J1リーグ開幕</b></p>
    <div class="choices"><button id="j1OpenOk">試合に出る</button></div></div>`);
  document.getElementById("j1OpenOk").onclick = startChapter2Match;
}

// J2降格後の開幕。もう公式戦サイクルには戻らず、無所属イベントへ進む。
function showJ2OpeningEvent() {
  showOverlay(`<div class="dialog"><p>翌シーズン――

FC山陽TIGAKU・J2

今日は公式戦の日。
しかし――</p>
    <div class="choices"><button id="j2Open1">……</button></div></div>`);
  document.getElementById("j2Open1").onclick = () => {
    showOverlay(`<div class="dialog"><p><b>タナベッカムは、ベンチ入りすらしていなかった。</b></p>
      <div class="choices"><button id="j2Open2">……</button></div></div>`);
    document.getElementById("j2Open2").onclick = () => {
      STATE.position = { map: "home", x: 4, y: 14 };
      STATE.chapter2.objective = "アルバイトを探そう";
      STATE.chapter2.massageJobUnlocked = true;
      saveGame(STATE);
      showOverlay(`<div class="dialog"><p>田辺：「……今日、試合なんだけどな。」
「このままじゃ生活できない……。」
「アルバイトでもするか。」</p>
        <div class="choices"><button id="j2Open3">……</button></div></div>`);
      document.getElementById("j2Open3").onclick = () => {
        hideOverlay();
        enterField();
      };
    };
  };
}

// 試合中に使える必殺技系ボタンの表示・非表示をまとめて扱う（複数の試合入口で共用）。
function updateSoccerSkillButtons() {
  document.getElementById("btn-skill").style.display = STATE.player.learnedSkills.includes(CHAPTER0.skillOjiisanGoroshi.id) ? "inline-block" : "none";
  document.getElementById("btn-skill2").style.display = STATE.player.learnedSkills.includes(CHAPTER2.skillShaolinShoot.id) ? "inline-block" : "none";
  document.getElementById("btn-skill3").style.display = STATE.player.learnedSkills.includes(CHAPTER2.skillDepressionDribble.id) ? "inline-block" : "none";
}
function hideSoccerSkillButtons() {
  document.getElementById("btn-skill").style.display = "none";
  document.getElementById("btn-skill2").style.display = "none";
  document.getElementById("btn-skill3").style.display = "none";
}

// 序盤数試合は不遇補正なし（企画仕様どおり）。SoccerMatchをそのまま流用する。
function startChapter2Match() {
  // ベンチ組が途中出場のチャンスを使って出た試合。アピール値は使い切る。
  if (STATE.chapter2.benchMode) STATE.chapter2.managerAppeal = 0;
  hideOverlay();
  playBGM("bgm_match");
  canvas.style.display = "block";
  document.getElementById("soccerControls").style.display = "flex";
  updateSoccerSkillButtons();
  const match = new SoccerMatch(canvas, STATE, CHAPTER2.matchDurationSec, (evalResult) => {
    document.getElementById("soccerControls").style.display = "none";
    hideSoccerSkillButtons();
    MATCH = null;
    if (evalResult.promotionDeciderForcedSub) {
      finishPromotionDeciderMatch(evalResult);
    } else {
      finishChapter2Match(evalResult);
    }
  }, true);
  MATCH = match;
  match.enable();
}

// 天罰直後の1試合限定：完全に身体が動かない金縛り状態。操作は一切効かず確定敗北になる
function startParalyzedMatch() {
  hideOverlay();
  playBGM("bgm_match");
  canvas.style.display = "block";
  document.getElementById("soccerControls").style.display = "flex";
  document.getElementById("btn-skill").style.display = "none";
  STATE.chapter2.paralyzedMatch = true;
  const match = new SoccerMatch(canvas, STATE, CHAPTER2.matchDurationSec, (evalResult) => {
    document.getElementById("soccerControls").style.display = "none";
    MATCH = null;
    STATE.chapter2.paralyzedMatch = false;
    finishChapter2Match(evalResult);
  });
  MATCH = match;
  match.enable();
}

// 2〜5試合目相当：実際のミニゲームは起動せず、いずれも敗北扱い。1試合ずつ
// リアルタイムで待たされず、監督更迭までの残り試合を一気に消化してまとめて見せる。
function showDigestMatchBundle() {
  hideOverlay();
  const c2 = STATE.chapter2;
  const lines = [];
  while ((c2.matchCount - c2.matchCountAtPunishment) < CHAPTER2.matchesBeforeDismissal) {
    c2.matchCount += 1;
    const conceded = 1 + Math.floor(Math.random() * 3);
    const evalResult = { goals: 0, conceded, pass: 0, shoot: 0, defense: 0, distance: 0,
      flavor: "この試合も、身体が思うように動かないまま終わった。" };
    STATE.matchRecords["ch2_" + c2.matchCount] = evalResult;
    lines.push(`第${c2.matchCount}戦　田辺 0 - ${conceded} 相手`);
  }
  c2.nextMatchTimerSec = CHAPTER2.matchIntervalSec;
  saveGame(STATE);
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}
    <p><b>敗北が続いた……</b>
${lines.join("\n")}
この試合も、身体が思うように動かないまま終わった。</p>
    <div class="choices"><button id="digestBundleOk">……</button></div></div>`);
  document.getElementById("digestBundleOk").onclick = () => {
    hideOverlay();
    showManagerDismissalEvent();
  };
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
  const managerNote = (!evalResult.flavor && evalResult.defense === 0) ? "\n\n監督：「守備もちゃんとやれ」" : "";
  const flavorNote = evalResult.flavor ? "\n" + evalResult.flavor : "";
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}
    <p><b>${resultText}</b>
田辺 ${evalResult.goals} - ${evalResult.conceded} 相手
第${STATE.chapter2.matchCount}戦 終了${paymentNote}${sideBackNote}${flavorNote}${managerNote}</p>
    <div class="choices"><button id="ch2MatchOk">OK</button></div></div>`);
  document.getElementById("ch2MatchOk").onclick = () => {
    hideOverlay();
    const dismiss = STATE.chapter2.misfortuneMode && !STATE.chapter2.hiroshiDismissed &&
      (STATE.chapter2.matchCount - STATE.chapter2.matchCountAtPunishment) >= CHAPTER2.matchesBeforeDismissal;
    if (dismiss) { showManagerDismissalEvent(); return; }
    if (STATE.chapter2.benchMode && STATE.chapter2.higuchiDebutDone && !STATE.chapter2.shaolinIdeaShown) { showShaolinIdeaEvent(); return; }
    if (checkJ1StruggleDigestTrigger()) return;
    if (STATE.chapter2.sidebackFarewellMatchPending) {
      STATE.chapter2.sidebackFarewellMatchPending = false;
      saveGame(STATE);
      showJ2RelegationEvent();
      return;
    }
    if (STATE.chapter2.j1Mode && STATE.chapter2.exorcismJankenDone && !STATE.chapter2.sidebackDecisionShown) {
      showSidebackDecisionEvent();
      return;
    }
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
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/mom_errand.jpg")}<p>母：「昨日は大活躍だったわね、すごいじゃない！」
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
  showOverlay(`<div class="dialog"><p>新監督：「今日からこのチームを指揮する。」
「それと、新しい選手を紹介する。」</p>
    <div class="choices"><button id="higuchiOk0">……</button></div></div>`);
  document.getElementById("higuchiOk0").onclick = () => {
    showOverlay(`<div class="dialog">${cutinTag("assets/cutins/higuchi_join.jpg")}<p>ヒグチビッチ：「よろしく。」

颯爽と現れたヒグチビッチは、シュート・ドリブル・パスすべてが田辺を圧倒していた。</p>
    <div class="choices"><button id="higuchiOk1">……</button></div></div>`);
  document.getElementById("higuchiOk1").onclick = () => {
    showOverlay(`<div class="dialog">${cutinTag("assets/cutins/higuchi_join.jpg")}<p>田辺：「これで昇格できますね！」</p>
      <div class="choices"><button id="higuchiOk2">……</button></div></div>`);
    document.getElementById("higuchiOk2").onclick = () => {
      showOverlay(`<div class="dialog"><p>新監督：「次の試合、ヒグチビッチはトップ下。」</p>
        <div class="choices"><button id="higuchiOk3">……</button></div></div>`);
      document.getElementById("higuchiOk3").onclick = () => {
        showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_surprised.png")}<p>田辺：「え？」</p>
          <div class="choices"><button id="higuchiOk4">……</button></div></div>`);
        document.getElementById("higuchiOk4").onclick = () => {
          STATE.chapter2.higuchibitchJoined = true;
          STATE.chapter2.benchMode = true;
          STATE.chapter2.misfortuneMode = false; // ヒグチビッチの活躍でチームは勝ち始める
          STATE.chapter2.managerAppeal = 0;
          STATE.chapter2.matchCountAtHiguchiJoin = STATE.chapter2.matchCount;
          STATE.chapter2.objective = "次の公式戦に備えよう";
          saveGame(STATE);
          hideOverlay();
          FIELD && FIELD.enable();
          if (CH2TIMER) CH2TIMER.resume();
        };
      };
    };
  };
  };
}

// ---------- 第2章：少林寺修行（3ボス＋佐々木SVの4択）・昇格・ヒグチビッチ移籍・J1 ----------
// 少林寺のボスは runBattle をそのまま流用。撃破で該当フラグを立てるだけで、
// field.js側の requires が自動的に次のボスを解放する。
function onShaolinBoss(boss) {
  runBattle(boss.enemy, (result) => {
    if (result === "dead") { respawnAtCheckpoint(); return; }
    if (result === "win") {
      STATE.chapter2[boss.flag] = true;
      saveGame(STATE);
    }
    backToField();
  });
}

// 3ボス撃破後にのみ出現する佐々木SV。4択のうち④だけが正解。
// 不正解でも再挑戦はできない（詰みにはせず、技を覚えないまま話が進む）。
function onShaolinSensei(id) {
  if (id !== "sasaki_sv") return;
  FIELD.disable();
  showOverlay(`<div class="dialog"><p>佐々木SV：「シュートを撃つ前に、一番大事なことはなんだ？」</p>
    <div class="choices">
      <button data-i="0">①狙いを定めること</button>
      <button data-i="1">②力を抜くこと</button>
      <button data-i="2">③助走をつけること</button>
      <button data-i="3">④燃やすこと</button>
    </div></div>`);
  [0, 1, 2, 3].forEach(i => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => resolveShaolinQuiz(i === 3);
  });
}

function resolveShaolinQuiz(correct) {
  STATE.chapter2.shaolinQuizDone = true;
  STATE.chapter2.promotionReady = true;
  if (correct && !STATE.player.learnedSkills.includes(CHAPTER2.skillShaolinShoot.id)) {
    STATE.player.learnedSkills.push(CHAPTER2.skillShaolinShoot.id);
  }
  saveGame(STATE);
  showOverlay(correct
    ? `<div class="dialog">${cutinTag("assets/cutins/shaolin_shot_learned.jpg")}<p>佐々木SV：「……正解だ。」
「お前には炎が見えている。」</p>
      <div class="choices"><button id="shaolinQuizOk">🔥 少林シュートを習得した！</button></div></div>`
    : `<div class="dialog"><p>佐々木SV：「……そうか。」

田辺は結局、何も習得できなかった。</p>
      <div class="choices"><button id="shaolinQuizOk">……</button></div></div>`);
  document.getElementById("shaolinQuizOk").onclick = () => {
    showOverlay(`<div class="dialog"><p>${correct ? "田辺：「これでヒグチビッチにも負けない！」" : "田辺：「……まあ、なんとかなるだろう。」"}</p>
      <div class="choices"><button id="shaolinReturnOk">……</button></div></div>`);
    document.getElementById("shaolinReturnOk").onclick = () => {
      STATE.position = { map: "home", x: 4, y: 14 };
      STATE.chapter2.objective = "次の公式戦に備えよう";
      saveGame(STATE);
      enterField();
    };
  };
}

// ---------- 第2章：昇格決定戦 ----------
// スタメン発表でベンチを告げられる導入会話。少林寺での成果はまだ監督に伝わっていない
// （アップエリアで少林シュートを見せつけて初めて伝わる、という理不尽な構成）。
function showPromotionDeciderAnnounce() {
  showOverlay(`<div class="dialog"><p>新監督：「今日は昇格決定戦だ。」

スタメン発表。田辺の名前は――なかった。</p>
    <div class="choices"><button id="pdAnnounce1">……</button></div></div>`);
  document.getElementById("pdAnnounce1").onclick = () => {
    showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_surprised.png")}<p>田辺：「え？」</p>
      <div class="choices"><button id="pdAnnounce2">……</button></div></div>`);
    document.getElementById("pdAnnounce2").onclick = () => {
      showOverlay(`<div class="dialog"><p>新監督：「お前、最近練習来てないだろ。」</p>
        <div class="choices"><button id="pdAnnounce3">……</button></div></div>`);
      document.getElementById("pdAnnounce3").onclick = () => {
        showOverlay(`<div class="dialog"><p>田辺：「少林寺で修行してました！」</p>
          <div class="choices"><button id="pdAnnounce4">……</button></div></div>`);
        document.getElementById("pdAnnounce4").onclick = () => {
          showOverlay(`<div class="dialog"><p>新監督：「知らん。」</p>
            <div class="choices"><button id="pdAnnounce5">……</button></div></div>`);
          document.getElementById("pdAnnounce5").onclick = () => {
            hideOverlay();
            enterWarmupMenu();
          };
        };
      };
    };
  };
}

// アップエリアで少林シュートを見せつけて監督にアピールする特別な選択肢。
// 試合中の使用と同じshaolinShotUsedThisMatchを消費するため、ここで使うと
// その試合ではもう少林シュートは撃てなくなる（回数を分けるような救済はしない）。
function playShaolinAppealCutscene() {
  STATE.chapter2.shaolinShotUsedThisMatch = true;
  saveGame(STATE);
  hideOverlay();
  showCutsceneChain([
    { cutin: "assets/cutins/tanabe_serious.png", text: "田辺の目つきが変わった。" },
    { text: "田辺：「見ていてください……少林シュート！！」" },
  ], () => {
    showOverlay(`<div class="dialog"><p>新監督：「…………。」
「田辺、後半から行け。」</p>
      <div class="choices"><button id="pdAppealOk">……</button></div></div>`);
    document.getElementById("pdAppealOk").onclick = () => {
      showOverlay(`<div class="dialog"><p>田辺：「はい！」</p>
        <div class="choices"><button id="pdAppealOk2">……</button></div></div>`);
      document.getElementById("pdAppealOk2").onclick = () => {
        STATE.chapter2.managerAppeal = CHAPTER2.managerAppealThreshold;
        saveGame(STATE);
        hideOverlay();
        offerSubInEntry();
      };
    };
  });
}

// 昇格決定戦・途中出場あり：金縛りが再発して強制交代させられた後、ヒグチビッチが
// 決勝ゴールを決めて昇格が決まる（田辺自身のシュートは決まらない）
function finishPromotionDeciderMatch(evalResult) {
  STATE.chapter2.matchCount += 1;
  STATE.chapter2.nextMatchTimerSec = CHAPTER2.matchIntervalSec;
  STATE.matchRecords["ch2_" + STATE.chapter2.matchCount] = evalResult;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>新監督：「田辺！どうした！」
「……動けないのか？」
「交代！」</p>
    <div class="choices"><button id="pdMatch1">……</button></div></div>`);
  document.getElementById("pdMatch1").onclick = () => {
    showOverlay(`<div class="dialog">${cutinTag("assets/cutins/higuchi_join.jpg")}<p>ピッチに戻ったヒグチビッチが、独りでゴールへ向かって走り出す。
一人、また一人とかわし、最後は迷いなく蹴り込んだ。</p>
      <div class="choices"><button id="pdMatch2">……</button></div></div>`);
    document.getElementById("pdMatch2").onclick = () => {
      showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_messi2.png")}<p>サポーター：「ヒグチビッチ！！ヒグチビッチ！！」

歓声の中、ベンチの田辺がぽつりとつぶやいた。
田辺：「……俺も少林シュート打ったんだけどな。」</p>
        <div class="choices"><button id="pdMatch3">……</button></div></div>`);
      document.getElementById("pdMatch3").onclick = () => {
        STATE.chapter2.promoted = true;
        STATE.chapter2.promotionDeciderPending = false;
        saveGame(STATE);
        showPromotionCelebration();
      };
    };
  };
}

// 昇格決定戦・途中出場なし：田辺は最後まで出番がなかったが、ヒグチビッチの独壇場で
// 結果的に昇格は成立する（正誤や出場の有無に関わらず、昇格は必ず起きる）
function finishPromotionDeciderBenchOnly() {
  showOverlay(`<div class="dialog"><p>田辺は最後まで出番がなかった。
ヒグチビッチが一人で試合をひっくり返し、チームは勝利を掴んだ。</p>
    <div class="choices"><button id="pdBenchOk">……</button></div></div>`);
  document.getElementById("pdBenchOk").onclick = () => {
    STATE.chapter2.promoted = true;
    STATE.chapter2.promotionDeciderPending = false;
    saveGame(STATE);
    showPromotionCelebration();
  };
}

// 昇格直後：選手たちがヒグチビッチを胴上げする。タナベッカムは参加しない。
function showPromotionCelebration() {
  showOverlay(`<div class="dialog"><p><b>FC山陽TIGAKU J1昇格決定！！</b></p>
    <div class="choices"><button id="celebOk1">……</button></div></div>`);
  document.getElementById("celebOk1").onclick = () => {
    showOverlay(`<div class="dialog">${cutinTag("assets/cutins/higuchi_captain.png")}<p>選手たちがヒグチビッチのもとへ駆け寄り、宙へ何度も放り投げる。

タナベッカムは、ベンチから胴上げを見つめていた。</p>
      <div class="choices"><button id="celebOk2">……</button></div></div>`);
    document.getElementById("celebOk2").onclick = () => {
      hideOverlay();
      showHiguchiTransferEvent();
    };
  };
}

function showHiguchiTransferEvent() {
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/higuchi_london_transfer.jpg")}<p>昇格の熱が冷めやらぬ中、ヒグチビッチは颯爽とアーセナルへ移籍していった。
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

// ---------- 第2章：J1苦戦ダイジェスト・お祓いじゃんけん・💩システム ----------
// J1初戦の結果画面の直後、勝敗に関わらず一度だけ流れる苦戦ダイジェスト。
// 本質は「呪いだけが原因ではなく、田辺自身がJ1レベルについていけていないこと」だが、
// ダイジェスト中に金縛りが再発し、これが「まだ呪われている」という噂の発端になる。
function checkJ1StruggleDigestTrigger() {
  const c2 = STATE.chapter2;
  if (c2.j1Mode && !c2.j1StruggleDigestShown) {
    showJ1StruggleDigest();
    return true;
  }
  return false;
}

function showJ1StruggleDigest() {
  STATE.chapter2.j1StruggleDigestShown = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p><b>J1では、タナベッカムは勝てなかった……。</b></p>
    <div class="choices"><button id="j1DigestOk1">……</button></div></div>`);
  document.getElementById("j1DigestOk1").onclick = () => {
    showOverlay(`<div class="dialog"><p>ボールを奪われる。
ドリブルで抜かれる。
相手についていけない。
少林シュートを撃った後は、足が動かなくなる。

チームはただ、負けを重ねていった。</p>
      <div class="choices"><button id="j1DigestOk2">……</button></div></div>`);
    document.getElementById("j1DigestOk2").onclick = () => {
      showOverlay(`<div class="dialog"><p><b>タナベッカムは金縛りで動けない！</b></p>
        <div class="choices"><button id="j1DigestOk3">……</button></div></div>`);
      document.getElementById("j1DigestOk3").onclick = () => {
        STATE.chapter2.curseSuspicionRaised = true;
        saveGame(STATE);
        showExorcismMomSuggestion();
      };
    };
  };
}

// 翌朝、母から「まだ呪われてるんじゃないの？お祓いしてきなさい」と言われる。
// 田辺自身は「J1が強いだけ」と思っているが、母には押し切られる。
function showExorcismMomSuggestion() {
  STATE.chapter2.exorcismMomShown = true;
  STATE.chapter2.objective = "神社でお祓いを受けよう";
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>母：「あんた、また試合中に動かなくなったんだって？」
「前に神社で何かしたんじゃないの？」
「一回、お祓いでもしてきなさい。」</p>
    <div class="choices"><button id="exMomOk1">……</button></div></div>`);
  document.getElementById("exMomOk1").onclick = () => {
    showOverlay(`<div class="dialog"><p>田辺：「J1が強いだけだと思うけど……。」</p>
      <div class="choices"><button id="exMomOk2">……</button></div></div>`);
    document.getElementById("exMomOk2").onclick = () => {
      showOverlay(`<div class="dialog"><p>母：「いいから行ってきなさい。」</p>
        <div class="choices"><button id="exMomOk3">……</button></div></div>`);
      document.getElementById("exMomOk3").onclick = () => {
        hideOverlay();
        FIELD && FIELD.enable();
        if (CH2TIMER) CH2TIMER.resume();
      };
    };
  };
}

function onAltar(id) {
  if (id !== "exorcism_altar") return;
  FIELD.disable();
  if (CH2TIMER) CH2TIMER.pause();
  if (STATE.chapter2.exorcismJankenDone) {
    showChoices("神主：「お祓いは、もう先日済ませましたよ。」", [
      { label: "戻る", onClick: () => { hideOverlay(); FIELD.enable(); if (CH2TIMER) CH2TIMER.resume(); } },
    ]);
    return;
  }
  showExorcismJankenIntro();
}

// 通常のお祓いではなく「お祓いじゃんけん」。全3本勝負で、負けるたびに💩が1つ増える
// （勝ち・あいこでは増減なし）。じゃんけんが終わっても💩は消えない。3個で「うんこまん」。
function showExorcismJankenIntro() {
  showOverlay(`<div class="dialog"><p>神主：「では、お祓いじゃんけんを始めましょう。」

全3本勝負。負けるたびに、悪いものが降り積もります。</p>
    <div class="choices"><button id="jankenIntroOk">……</button></div></div>`);
  document.getElementById("jankenIntroOk").onclick = () => playJankenRound(1);
}

function playJankenRound(round) {
  showOverlay(`<div class="dialog"><p>お祓いじゃんけん（${round}本目/3本）</p>
    <div class="choices">
      <button data-h="gu">グー</button>
      <button data-h="choki">チョキ</button>
      <button data-h="pa">パー</button>
    </div></div>`);
  ["gu", "choki", "pa"].forEach(h => {
    overlay.querySelector(`[data-h="${h}"]`).onclick = () => resolveJankenRound(round, h);
  });
}

function resolveJankenRound(round, hand) {
  const hands = ["gu", "choki", "pa"];
  const cpu = hands[Math.floor(Math.random() * 3)];
  const beats = { gu: "choki", choki: "pa", pa: "gu" };
  const handLabel = { gu: "グー", choki: "チョキ", pa: "パー" };
  let msg = `田辺：${handLabel[hand]}\n神主：${handLabel[cpu]}\n\n`;
  if (hand === cpu) {
    msg += "あいこ。";
  } else if (beats[hand] === cpu) {
    msg += "田辺の勝ち！";
  } else {
    STATE.chapter2.curseLevel = Math.min(CHAPTER2.curseMax, STATE.chapter2.curseLevel + 1);
    msg += "田辺の負け……💩が1つ増えた。";
    if (STATE.chapter2.curseLevel >= CHAPTER2.curseMax && !STATE.player.titles.includes(CHAPTER2.titles.poop)) {
      STATE.player.titles.push(CHAPTER2.titles.poop);
    }
  }
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>${msg}</p><div class="choices"><button id="jankenRoundOk">……</button></div></div>`);
  document.getElementById("jankenRoundOk").onclick = () => {
    if (round < 3) playJankenRound(round + 1);
    else finishExorcismJanken();
  };
}

function finishExorcismJanken() {
  STATE.chapter2.exorcismJankenDone = true;
  STATE.chapter2.exorcismCount += 1;
  STATE.chapter2.objective = "次の公式戦に備えよう";
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>神主：「お祓いは終了です。」</p>
    <div class="choices"><button id="jankenEndOk1">……</button></div></div>`);
  document.getElementById("jankenEndOk1").onclick = () => {
    showOverlay(`<div class="dialog"><p>田辺：「増えてるんですけど。」</p>
      <div class="choices"><button id="jankenEndOk2">……</button></div></div>`);
    document.getElementById("jankenEndOk2").onclick = () => {
      hideOverlay();
      FIELD.enable();
      FIELD.render();
      if (CH2TIMER) CH2TIMER.resume();
    };
  };
}

// 途中出場のチャンスが来た時の入り口（ヒグチビッチ加入後〜昇格決定戦のアピール用）。
function offerSubInEntry() {
  if (STATE.chapter2.promotionDeciderPending) STATE.chapter2.promotionDeciderMatch = true;
  showChoices("アピールが監督に届いた！\n今日は途中出場のチャンスだ。", [{ label: "試合へ", onClick: startChapter2Match }]);
}

// お祓いじゃんけんを終えた後のJ1試合が終わった直後、一度だけ発生。
// どちらを選んでも最終的にJ2降格は固定（①は経験値獲得用の1試合を追加でプレイする）。
function showSidebackDecisionEvent() {
  STATE.chapter2.sidebackDecisionShown = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>新監督：「田辺！お前、トップ下はもういい。」</p>
    <div class="choices"><button id="sbDecisionOk">……</button></div></div>`);
  document.getElementById("sbDecisionOk").onclick = () => {
    showOverlay(`<div class="dialog"><p>新監督：「サイドバックでもしておけ。」</p>
      <div class="choices">
        <button id="sbAccept">①「わかりました……」</button>
        <button id="sbRefuse">②「俺はトップ下です！」</button>
      </div></div>`);
    document.getElementById("sbAccept").onclick = () => {
      STATE.chapter2.sideBackOffered = true;
      STATE.chapter2.sideBackAccepted = true;
      STATE.chapter2.sidebackFarewellMatchPending = true;
      saveGame(STATE);
      startChapter2Match();
    };
    document.getElementById("sbRefuse").onclick = () => {
      STATE.chapter2.sideBackOffered = true;
      saveGame(STATE);
      showJ2RelegationEvent();
    };
  };
}

function showJ2RelegationEvent() {
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/j2_relegation.jpg")}<p><b>FC山陽TIGAKU J2降格決定</b></p>
    <div class="choices"><button id="j2RelOk1">……</button></div></div>`);
  document.getElementById("j2RelOk1").onclick = () => {
    showOverlay(`<div class="dialog"><p>新監督：「田辺。来年もサイドバックでもしておけ。」</p>
      <div class="choices"><button id="j2RelOk2">……</button></div></div>`);
    document.getElementById("j2RelOk2").onclick = () => {
      STATE.chapter2.j1Mode = false;
      STATE.chapter2.j2Mode = true;
      saveGame(STATE);
      hideOverlay();
      FIELD && FIELD.enable();
      // 次の公式戦タイマーが切れた時に「翌シーズン」の無所属イベントを見せる。
      // それ以降は公式戦サイクル自体を使わないため、タイマーの再開はここが最後。
      if (CH2TIMER) CH2TIMER.resume();
    };
  };
}

// ---------- 第2章：整体院の先輩・セバスチャン先生 ----------
function showSeniorSebastianIntro() {
  STATE.chapter2.seniorEventShown = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>先輩：「田辺、最近元気ないな。」</p>
    <div class="choices"><button id="sen1">……</button></div></div>`);
  document.getElementById("sen1").onclick = () => {
    showOverlay(`<div class="dialog"><p>田辺：「……サッカー、クビになったんで。」</p>
      <div class="choices"><button id="sen2">……</button></div></div>`);
    document.getElementById("sen2").onclick = () => {
      showOverlay(`<div class="dialog"><p>先輩：「そうか……。」</p>
        <div class="choices"><button id="sen3">……</button></div></div>`);
      document.getElementById("sen3").onclick = () => {
        showOverlay(`<div class="dialog"><p>先輩：「いい先生知ってるぞ。」
「セバスチャン先生って人なんだけど、紹介してやろうか？」</p>
          <div class="choices"><button id="sen4">OK</button></div></div>`);
        document.getElementById("sen4").onclick = () => {
          STATE.chapter2.sebastianUnlocked = true;
          saveGame(STATE);
          enterMassageBattleJob();
        };
      };
    };
  };
}

function enterSebastianClinic() {
  FIELD.disable();
  if (!STATE.chapter2.depressionMode) {
    showChoices("セバスチャン先生：「今は特に問題なさそうだな。」", [
      { label: "戻る", onClick: backToField },
    ]);
    return;
  }
  showChoices(`セバスチャン先生の治療を受けますか？（G${CHAPTER2.sebastianTreatmentCost}を消費します）`, [
    { label: "治療を受ける", onClick: performSebastianTreatment },
    { label: "やめる", onClick: backToField },
  ]);
}

function performSebastianTreatment() {
  const cost = CHAPTER2.sebastianTreatmentCost;
  if (STATE.player.gold < cost) {
    showChoices("お金が足りない……", [{ label: "戻る", onClick: backToField }]);
    return;
  }
  STATE.player.gold -= cost;
  STATE.chapter2.depressionMode = false;
  saveGame(STATE);
  const learnedDribble = STATE.player.learnedSkills.includes(CHAPTER2.skillDepressionDribble.id);
  showOverlay(`<div class="dialog"><p>「セバスチャン先生の治療を受けた！」
「うつ病モードが解除された！」${learnedDribble ? "\n「鬱病ドリブルが使用可能になった！」" : ""}</p>
    <div class="choices"><button id="sebOk">……</button></div></div>`);
  document.getElementById("sebOk").onclick = () => {
    if (!STATE.chapter2.sebastianFirstTreatmentDone) {
      STATE.chapter2.sebastianFirstTreatmentDone = true;
      saveGame(STATE);
      showSebastianKusaSoccerAdvice();
    } else {
      hideOverlay();
      backToField();
    }
  };
}

function showSebastianKusaSoccerAdvice() {
  showOverlay(`<div class="dialog"><p>セバスチャン先生：「よし。もう大丈夫だ。」
「ただ、本当に戻ったかどうかはボールを蹴ってみないと分からない。」
「草サッカーでもして、調子を見てこい。」</p>
    <div class="choices"><button id="sebAdviceOk">……</button></div></div>`);
  document.getElementById("sebAdviceOk").onclick = () => {
    STATE.chapter2.objective = "草サッカーに参加する";
    STATE.chapter2.awaitingPoliceKusaSoccer = true;
    saveGame(STATE);
    hideOverlay();
    backToField();
  };
}

// ---------- 第2章：整体バトル ----------
// 通常フィールドのモンスターの代わりに「患者」が敵として出現する、通常RPG戦闘
// （BattleController）と同じ構造の専用バトル。患者を倒す表現は必ず「こらしめた」。
function enterMassageBattleJob() {
  // うつ病モード中に初めてアルバイトへ来ると、整体院の先輩からセバスチャン先生を
  // 紹介されるイベントが一度だけ挟まる
  if (STATE.chapter2.depressionMode && !STATE.chapter2.seniorEventShown) {
    showSeniorSebastianIntro();
    return;
  }
  // プロローグの整体ポイントがあれば、初回だけ整体スキルの初期値にボーナス反映する
  if (!STATE.chapter2.seitaiSkillSeeded) {
    STATE.player.seitaiSkill = (STATE.player.seitaiSkill || 0) + (STATE.player.seitaiPoint || 0);
    STATE.chapter2.seitaiSkillSeeded = true;
  }
  const list = CHAPTER2.patients;
  const normals = list.filter(p => !p.rare);
  const rare = list.find(p => p.rare);
  const patient = (rare && Math.random() < CHAPTER2.massageBattle.rareRate) ? rare : normals[Math.floor(Math.random() * normals.length)];
  const battle = new MassageBattle(STATE, patient, (result) => {
    MASSAGE = null;
    if (result === "won") {
      if (!STATE.chapter2.lifeForkShown &&
          (STATE.player.seitaiSkill + STATE.player.salesSkill) >= CHAPTER2.lifeForkSkillThreshold) {
        showLifeForkCall();
        return;
      }
      showChoices("次の患者を探しますか？", [
        { label: "続ける", onClick: enterMassageBattleJob },
        { label: "やめる", onClick: backToField },
      ]);
    } else {
      if (result === "lost") {
        STATE.player.hp = Math.max(1, Math.round(STATE.player.maxHp * 0.3));
        saveGame(STATE);
      }
      showChoices(result === "lost" ? "施術に失敗した……報酬はなし。" : "その場を離れた。", [
        { label: "もう一人施術する", onClick: enterMassageBattleJob },
        { label: "やめる", onClick: backToField },
      ]);
    }
  });
  MASSAGE = battle;
  renderMassageBattle(battle);
}

function renderMassageBattle(m) {
  const p = STATE.player;
  const spriteTag = m.patient.sprite
    ? `<div class="enemy-sprite-wrap"><img src="${m.patient.sprite}" class="enemy-sprite" onerror="this.style.display='none'" /></div>`
    : "";
  const html = `<div class="dialog battle">
    ${spriteTag}
    <p><b>${m.patient.name}</b> 症状の残り：${Math.max(0, m.patient.curHp)}/${m.patient.hp}</p>
    <p>タナベッカム HP:${p.hp}/${p.maxHp}</p>
    <div class="log">${m.log.map(l => `<div>${l.replace(/\n/g, "<br>")}</div>`).join("")}</div>
    <div class="choices">
      <button id="mb_treat">🤲 施術する</button>
      <button id="mb_sell">💰 商品をすすめる</button>
      <button id="mb_listen">👂 話を聞く</button>
      <button id="mb_flee">↩ 逃げる</button>
    </div></div>`;
  showOverlay(html);
  overlay.classList.add("overlay-battle");
  overlay.querySelector("#mb_treat").onclick = () => enterMassageTreatMenu(m);
  overlay.querySelector("#mb_sell").onclick = () => enterMassageSellMenu(m);
  overlay.querySelector("#mb_listen").onclick = () => { if (m.command("listen")) renderMassageBattleEnd(m); else renderMassageBattle(m); };
  overlay.querySelector("#mb_flee").onclick = () => { if (m.command("flee")) renderMassageBattleEnd(m); else renderMassageBattle(m); };
}

function enterMassageTreatMenu(m) {
  const spots = CHAPTER2.massageBattle.spots;
  const keys = Object.keys(spots);
  let html = `<div class="dialog"><p>どこを施術しますか？</p><ul>`;
  keys.forEach((s, i) => { html += `<li><button data-i="${i}">${spots[s]}を施術する</button></li>`; });
  html += `</ul><button id="mbTreatBack">戻る</button></div>`;
  showOverlay(html);
  keys.forEach((s, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => {
      if (m.command("treat", s)) renderMassageBattleEnd(m); else renderMassageBattle(m);
    };
  });
  overlay.querySelector("#mbTreatBack").onclick = () => renderMassageBattle(m);
}

function enterMassageSellMenu(m) {
  const html = `<div class="dialog"><p>何をすすめますか？</p><ul>
    <li><button id="mbSellMat">マットをすすめる</button></li>
    <li><button id="mbSellPillow">枕をすすめる</button></li>
    </ul><button id="mbSellBack">戻る</button></div>`;
  showOverlay(html);
  overlay.querySelector("#mbSellMat").onclick = () => { if (m.command("sell", "mat")) renderMassageBattleEnd(m); else renderMassageBattle(m); };
  overlay.querySelector("#mbSellPillow").onclick = () => { if (m.command("sell", "pillow")) renderMassageBattleEnd(m); else renderMassageBattle(m); };
  overlay.querySelector("#mbSellBack").onclick = () => renderMassageBattle(m);
}

function renderMassageBattleEnd(m) {
  showOverlay(`<div class="dialog"><p>${m.log.map(l => l.replace(/\n/g, "<br>")).join("<br>")}</p>
    <div class="choices"><button id="mbEndOk">OK</button></div></div>`);
  document.getElementById("mbEndOk").onclick = () => {
    hideOverlay();
    m.onEnd(m.result);
  };
}

// ---------- 第2章：人生分岐（試合に行く／整体で稼ぐ） ----------
function showLifeForkCall() {
  STATE.chapter2.lifeForkShown = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>監督：「田辺、今日ベンチに入れ。出番があるかもしれない。」</p>
    <div class="choices">
      <button id="lifeForkMatch">①試合に行く</button>
      <button id="lifeForkMassage">②整体で稼ぐ</button>
    </div></div>`);
  document.getElementById("lifeForkMatch").onclick = () => { hideOverlay(); startLifeForkMatchRoute(); };
  document.getElementById("lifeForkMassage").onclick = () => { hideOverlay(); startSeitaiEnding(); };
}

// 中間・通常エンディング共通のスタッフロール演出。onDoneで分岐直前などへ復帰させる。
function showEndingRoll(titleText, bodyHtml, onDone, bgImage) {
  playBGM("bgm_title");
  showOverlay(`<div class="credits-wrap"${shopBgStyle(bgImage)}>
    <div class="credits-scroll">
      <h2>${titleText}</h2>
      ${bodyHtml}
      <h3>CAST</h3>
      <p>田辺（タナベッカム）</p>
      <p>ヒグチビッチ</p>
      <p>ひろし君</p>
      <p>母</p>
      <h3>SPECIAL THANKS</h3>
      <p>ここまで遊んでくれたあなたに</p>
    </div>
    <button id="creditsSkip" class="credits-skip">スキップ</button>
  </div>`);
  // スキップ後もこのsetTimeoutが生き残ると、プレイヤーが既に先へ進んだ後
  // （例：警察逃走をリトライして遊んでいる最中）に16秒後onDoneが再度呼ばれ、
  // 進行中の画面を巻き込んで壊してしまう。doneフラグとclearTimeoutの両方で防ぐ。
  let done = false;
  const timeoutId = setTimeout(() => finish(), 16000);
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timeoutId);
    hideOverlay();
    onDone();
  };
  document.getElementById("creditsSkip").onclick = finish;
}

// 「整体で稼ぐ」を選んだ場合の中間エンディング。ゲームオーバー扱いではなく、
// エンディング後は分岐直前（整体アルバイトの続き）から再開できる。
function startSeitaiEnding() {
  STATE.chapter2.seitaiEndingReached = true;
  saveGame(STATE);
  showEndingRoll("ENDING「整体師タナベッカム」", `
    <p>田辺はサッカー選手としての道を離れ、整体師として生きることを選んだ。</p>
    <p>腕を磨き、自分の整体院を開業。多くの患者に慕われ、幸せな人生を送った。</p>
    <p><b>タナベッカムは整体師として、幸せな一生を終えた。</b></p>
  `, () => {
    showOverlay(`<div class="dialog"><p>中間エンディングを達成しました！</p>
      <div class="choices"><button id="seitaiEndBackOk">分岐直前に戻る</button></div></div>`);
    document.getElementById("seitaiEndBackOk").onclick = () => {
      hideOverlay();
      // 「分岐直前」＝人生分岐の選択画面そのものに戻す（そのまま整体バイトへ戻すと
      // 「①試合に行く」を選び直す手段が無くなってしまうため）
      showLifeForkCall();
    };
  }, "assets/endings/seitai_end.jpg");
}

// 「試合に行く」を選んだ場合。試合結果は自由（本編は分岐しない）で、終了後に解雇される。
// CPU強化の対象試合なので、試合中だけlifeForkMatchActiveを立てておく。
function startLifeForkMatchRoute() {
  STATE.chapter2.lifeForkMatchActive = true;
  saveGame(STATE);
  playBGM("bgm_match");
  canvas.style.display = "block";
  document.getElementById("soccerControls").style.display = "flex";
  updateSoccerSkillButtons();
  const match = new SoccerMatch(canvas, STATE, CHAPTER2.matchDurationSec, () => {
    document.getElementById("soccerControls").style.display = "none";
    hideSoccerSkillButtons();
    MATCH = null;
    STATE.chapter2.lifeForkMatchActive = false;
    saveGame(STATE);
    showDismissalEvent();
  }, true);
  MATCH = match;
  match.enable();
}

function showDismissalEvent() {
  showOverlay(`<div class="dialog"><p>監督：「田辺。」

「今日の試合のことじゃない。」
「最近のお前を見て決めた。」</p>
    <div class="choices"><button id="dismiss1">……</button></div></div>`);
  document.getElementById("dismiss1").onclick = () => {
    showOverlay(`<div class="dialog"><p><b>「契約はここまでだ。」</b></p>
      <div class="choices"><button id="dismiss2">……</button></div></div>`);
    document.getElementById("dismiss2").onclick = () => {
      showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_surprised.png")}<p>田辺：「え？」</p>
        <div class="choices"><button id="dismiss3">……</button></div></div>`);
      document.getElementById("dismiss3").onclick = () => {
        showOverlay(`<div class="dialog"><p>監督：「お前は窓ふきでもしてろ。」</p>
          <div class="choices"><button id="dismiss4">……</button></div></div>`);
        document.getElementById("dismiss4").onclick = () => {
          showOverlay(`<div class="dialog"><p><b>FC山陽TIGAKU 解雇</b></p>
            <div class="choices"><button id="dismiss5">……</button></div></div>`);
          document.getElementById("dismiss5").onclick = () => {
            STATE.chapter2.dismissedFromClub = true;
            saveGame(STATE);
            startDepressionMode();
          };
        };
      };
    };
  };
}

// ---------- 第2章：うつ病モード・鬱病ドリブル ----------
function startDepressionMode() {
  STATE.chapter2.depressionMode = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>解雇された田辺は、その場に立ち尽くした。</p>
    <div class="choices"><button id="depOk1">……</button></div></div>`);
  document.getElementById("depOk1").onclick = () => {
    showOverlay(`<div class="dialog"><p><b>うつ病モードに突入しました</b></p>
      <div class="choices"><button id="depOk2">……</button></div></div>`);
    document.getElementById("depOk2").onclick = () => {
      STATE.chapter2.objective = "……";
      STATE.position = { map: "home", x: 4, y: 14 };
      saveGame(STATE);
      hideOverlay();
      enterField();
    };
  };
}

function showDepressionDribbleLearnEvent() {
  FIELD && FIELD.disable();
  showOverlay(`<div class="dialog"><p>田辺：「…………。」</p>
    <div class="choices"><button id="ddOk1">……</button></div></div>`);
  document.getElementById("ddOk1").onclick = () => {
    showOverlay(`<div class="dialog"><p>「ピキーン！」</p>
      <div class="choices"><button id="ddOk2">……</button></div></div>`);
    document.getElementById("ddOk2").onclick = () => {
      showOverlay(`<div class="dialog"><p>田辺：「……これだ。」</p>
        <div class="choices"><button id="ddOk3">……</button></div></div>`);
      document.getElementById("ddOk3").onclick = () => {
        showOverlay(`<div class="dialog">${cutinTag("assets/cutins/depression_dribble.jpg")}<p><b>タナベッカムは『鬱病ドリブル』をひらめいた！</b></p>
          <div class="choices"><button id="ddOk4">OK</button></div></div>`);
        document.getElementById("ddOk4").onclick = () => {
          if (!STATE.player.learnedSkills.includes(CHAPTER2.skillDepressionDribble.id)) {
            STATE.player.learnedSkills.push(CHAPTER2.skillDepressionDribble.id);
          }
          saveGame(STATE);
          backToField();
        };
      };
    };
  };
}

// ---------- 第2章：練習試合／草サッカー ----------
function enterPracticeMatchIntro() {
  if (STATE.chapter2.dismissedFromClub) {
    const guests = ["近所のおじさん", "学生", "サラリーマン", "元プロ（自称）"];
    const guest = guests[Math.floor(Math.random() * guests.length)];
    showChoices(`草サッカーの参加者を探した。\n今日のメンバー：あなた、${guest}、その他モブ選手たち。`, [
      { label: "始める", onClick: startPracticeMatch },
      { label: "やめる", onClick: backToField },
    ]);
  } else {
    startPracticeMatch();
  }
}

function startPracticeMatch() {
  hideOverlay();
  const isKusa = STATE.chapter2.dismissedFromClub;
  playBGM("bgm_match");
  canvas.style.display = "block";
  document.getElementById("soccerControls").style.display = "flex";
  updateSoccerSkillButtons();
  const match = new SoccerMatch(canvas, STATE, CHAPTER2.matchDurationSec, (evalResult) => {
    document.getElementById("soccerControls").style.display = "none";
    hideSoccerSkillButtons();
    MATCH = null;
    // セバスチャン先生の助言で参加した草サッカーの直後だけ、警察の聞き込みへつながる
    if (STATE.chapter2.awaitingPoliceKusaSoccer) {
      STATE.chapter2.awaitingPoliceKusaSoccer = false;
      saveGame(STATE);
      showPoliceInterrogation();
      return;
    }
    showOverlay(`<div class="dialog"><p>${isKusa ? "草サッカー" : "練習試合"}が終わった。
田辺 ${evalResult.goals} - ${evalResult.conceded} 相手</p>
      <div class="choices"><button id="pmOk">OK</button></div></div>`);
    document.getElementById("pmOk").onclick = backToField;
  }, true);
  MATCH = match;
  match.enable();
}

// ---------- 第2章：悪徳整体師逮捕・警察逃走ダンジョン・エンディング ----------
// 草サッカー（セバスチャン先生の助言で参加した1試合）の直後、警察の聞き込みが入る。
function showPoliceInterrogation() {
  hideOverlay();
  showOverlay(`<div class="dialog">${cutinTag("assets/characters/police_detective.png")}<p>警察：「田辺さんですね？」</p>
    <div class="choices"><button id="pi1">……</button></div></div>`);
  document.getElementById("pi1").onclick = () => {
    showOverlay(`<div class="dialog"><p>田辺：「はい。」</p>
      <div class="choices"><button id="pi2">……</button></div></div>`);
    document.getElementById("pi2").onclick = () => {
      showOverlay(`<div class="dialog"><p>警察：「少しお話を聞かせてもらえますか。」
「あなたが働いている整体院についてです。」
「高額なマットや枕を販売していましたね？」</p>
        <div class="choices"><button id="pi3">……</button></div></div>`);
      document.getElementById("pi3").onclick = () => {
        showOverlay(`<div class="dialog"><p>田辺：「売ってました。」</p>
          <div class="choices"><button id="pi4">……</button></div></div>`);
        document.getElementById("pi4").onclick = () => {
          showOverlay(`<div class="dialog">${cutinTag(CHAPTER2.masseurBoss.sprite)}<p>警察：「整体院の${CHAPTER2.masseurBoss.name}にも、すでに手配がかかっている。」</p>
            <div class="choices"><button id="pi4b">……</button></div></div>`);
          document.getElementById("pi4b").onclick = () => {
          showOverlay(`<div class="dialog"><p>警察：「…………。」
「悪徳整体師の一味はお前か！」</p>
            <div class="choices"><button id="pi5">……</button></div></div>`);
          document.getElementById("pi5").onclick = () => {
            showOverlay(`<div class="dialog"><p><b>田辺：「違います！！」</b></p>
              <div class="choices"><button id="pi6">……</button></div></div>`);
            document.getElementById("pi6").onclick = () => {
              if (STATE.chapter2.patientsDefeatedCount > 0) {
                showOverlay(`<div class="dialog"><p>警察：「お前が何人ものお年寄りをこらしめていたことも分かっている！」</p>
                  <div class="choices"><button id="pi7">……</button></div></div>`);
                document.getElementById("pi7").onclick = () => {
                  showOverlay(`<div class="dialog"><p><b>田辺：「言い方がおかしい！！」</b></p>
                    <div class="choices"><button id="pi8">逃げる！</button></div></div>`);
                  document.getElementById("pi8").onclick = () => { hideOverlay(); startPoliceChase(); };
                };
              } else {
                showOverlay(`<div class="dialog"><p><b>🚨「警察から逃げろ！」</b></p>
                  <div class="choices"><button id="pi8b">逃げる！</button></div></div>`);
                document.getElementById("pi8b").onclick = () => { hideOverlay(); startPoliceChase(); };
              }
            };
          };
          };
        };
      };
    };
  };
}

// 専用の逃走アクションゲーム。通常RPG戦闘は使わない。警官に触れられたら逮捕、
// 出口に到達できれば逃走成功。マップ・人数・速度はCHAPTER2.policeChaseで調整可能。
class PoliceChase {
  constructor(canvas, state, onEnd) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.state = state; this.onEnd = onEnd;
    this.W = canvas.width; this.H = canvas.height;
    const cfg = CHAPTER2.policeChase;
    // 2026-09-17：実画像（05_警察逃走ステージ.png）は「スタート」が上端、
    // 「脱出」が下端に描かれているため、プレイヤー初期位置と出口を入れ替えた。
    this.player = { x: this.W / 2, y: 44, speed: cfg.playerSpeed };
    this.exit = { x: this.W / 2, y: this.H - 60, r: 32 };
    this.cops = [];
    for (let i = 0; i < cfg.copCount; i++) {
      this.cops.push({ x: 30 + i * (this.W - 60) / Math.max(1, cfg.copCount - 1), y: this.H * 0.4, speed: cfg.copSpeed,
        sprite: cfg.copSprites[i % cfg.copSprites.length] });
    }
    this.keys = {};
    this.keyDown = (e) => { this.keys[e.key] = true; };
    this.keyUp = (e) => { this.keys[e.key] = false; };
    this.ended = false;
  }
  enable() { document.addEventListener("keydown", this.keyDown); document.addEventListener("keyup", this.keyUp); this.interval = setInterval(() => this.tick(), 1000 / 30); }
  disable() { document.removeEventListener("keydown", this.keyDown); document.removeEventListener("keyup", this.keyUp); clearInterval(this.interval); }
  setKey(key, val) { this.keys[key] = val; }
  tick() {
    if (this.ended) return;
    let dx = 0, dy = 0;
    if (this.keys["ArrowLeft"]) dx--; if (this.keys["ArrowRight"]) dx++;
    if (this.keys["ArrowUp"]) dy--; if (this.keys["ArrowDown"]) dy++;
    if (dx || dy) {
      const n = Math.hypot(dx, dy) || 1;
      this.player.x = Math.max(10, Math.min(this.W - 10, this.player.x + dx / n * this.player.speed));
      this.player.y = Math.max(10, Math.min(this.H - 10, this.player.y + dy / n * this.player.speed));
    }
    this.cops.forEach((cop) => {
      const ang = Math.atan2(this.player.y - cop.y, this.player.x - cop.x);
      cop.x += Math.cos(ang) * cop.speed;
      cop.y += Math.sin(ang) * cop.speed;
      if (Math.hypot(cop.x - this.player.x, cop.y - this.player.y) < 16) this.finish(false);
    });
    if (!this.ended && Math.hypot(this.player.x - this.exit.x, this.player.y - this.exit.y) < this.exit.r) this.finish(true);
    this.render();
  }
  finish(escaped) {
    if (this.ended) return;
    this.ended = true;
    this.disable();
    this.onEnd(escaped);
  }
  render() {
    const c = this.ctx;
    c.fillStyle = "#1b1e24"; c.fillRect(0, 0, this.W, this.H);
    const bg = getImage("assets/maps/police_chase_map.jpg?v=1");
    if (bg) c.drawImage(bg, 0, 0, this.W, this.H);
    c.fillStyle = "rgba(80,200,120,.45)";
    c.beginPath(); c.arc(this.exit.x, this.exit.y, this.exit.r, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#ffe082"; c.font = "bold 13px sans-serif"; c.textAlign = "center";
    c.fillText("出口", this.exit.x, this.exit.y - this.exit.r - 8);
    c.fillStyle = "#42a5f5"; c.beginPath(); c.arc(this.player.x, this.player.y, 10, 0, Math.PI * 2); c.fill();
    this.cops.forEach((cop) => {
      const img = cop.sprite && getImage(cop.sprite);
      if (img) {
        c.drawImage(img, cop.x - 15, cop.y - 19, 30, 38);
      } else {
        c.fillStyle = "#e53935"; c.beginPath(); c.arc(cop.x, cop.y, 10, 0, Math.PI * 2); c.fill();
      }
    });
  }
}

function startPoliceChase() {
  playBGM("bgm_dungeon");
  canvas.style.display = "block";
  const chase = new PoliceChase(canvas, STATE, (escaped) => {
    canvas.style.display = "none";
    CHASE = null;
    if (escaped) onPoliceChaseEscape(); else onPoliceChaseCaught();
  });
  CHASE = chase;
  chase.enable();
}

// 捕まった場合：中間エンディング「臭い飯」
function onPoliceChaseCaught() {
  STATE.chapter2.masseurArrested = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p><b>タナベッカムは捕まった……。</b></p>
    <div class="choices"><button id="caughtOk">……</button></div></div>`);
  document.getElementById("caughtOk").onclick = () => {
    STATE.chapter2.stinkyRiceEndingReached = true;
    saveGame(STATE);
    showEndingRoll("ENDING「臭い飯」", `
      <p>――数年後。</p>
      <p>田辺：「今日も臭い飯か……。」</p>
    `, () => {
      showOverlay(`<div class="dialog"><p>中間エンディングを達成しました！</p>
        <div class="choices"><button id="stinkyRiceBackOk">逃走の直前に戻る</button></div></div>`);
      document.getElementById("stinkyRiceBackOk").onclick = () => {
        hideOverlay();
        startPoliceChase();
      };
    }, "assets/endings/stinky_rice_end.jpg");
  };
}

// 逃げ切った場合：スペインオファー→第2章クリアへ本編続行
function onPoliceChaseEscape() {
  STATE.chapter2.policeDungeonCleared = true;
  saveGame(STATE);
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}<p><b>タナベッカムは逃げ切った！</b></p><div class="choices"><button id="escapeOk">……</button></div></div>`);
  document.getElementById("escapeOk").onclick = () => { hideOverlay(); showSpainOfferEvent(); };
}

function showSpainOfferEvent() {
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_surprised.png")}<p>外国人：「タナベッカム？」</p>
    <div class="choices"><button id="spain1">……</button></div></div>`);
  document.getElementById("spain1").onclick = () => {
    showOverlay(`<div class="dialog"><p>田辺：「はい。」</p>
      <div class="choices"><button id="spain2">……</button></div></div>`);
    document.getElementById("spain2").onclick = () => {
      showOverlay(`<div class="dialog"><p>外国人：「ベッカムの……？」</p>
        <div class="choices"><button id="spain3">……</button></div></div>`);
      document.getElementById("spain3").onclick = () => {
        showOverlay(`<div class="dialog"><p>田辺：「違います。」

外国人：「…………。」</p>
          <div class="choices"><button id="spain4">……</button></div></div>`);
        document.getElementById("spain4").onclick = () => {
          showOverlay(`<div class="dialog"><p>外国人：「でも、お前……よく走るな。」
「それに、人の身体も見られる。」
「スペインでサッカーをやらないか？」</p>
            <div class="choices"><button id="spain5">……</button></div></div>`);
          document.getElementById("spain5").onclick = () => {
            showOverlay(`<div class="dialog"><p>外国人：「お前は何ができる？」</p>
              <div class="choices"><button id="spain6">……</button></div></div>`);
            document.getElementById("spain6").onclick = () => {
              showOverlay(`<div class="dialog"><p><b>田辺：「走れます。」
「あと、人の身体を見ます。」</b></p>
                <div class="choices"><button id="spainOk">……</button></div></div>`);
              document.getElementById("spainOk").onclick = () => {
                STATE.chapter2.cleared = true;
                if (!STATE.player.titles.includes(CHAPTER2.titles.worldFirst)) {
                  STATE.player.titles.push(CHAPTER2.titles.worldFirst);
                }
                saveGame(STATE);
                showChapter2ClearedTitle();
              };
            };
          };
        };
      };
    };
  };
}

function showChapter2ClearedTitle() {
  const c2 = STATE.chapter2;
  const showMenu = () => {
    showOverlay(`<div class="dialog"><p><b>タナベッカムの不遇</b>
第2章 Ver.0.1

こうしてタナベッカムはスペインへ渡った。
世界初――「整体師兼サッカー見習い」が誕生した。

CHAPTER 2 CLEAR
第3章「スペイン編」へ続く……</p>
      <div class="choices"><button id="ch2ClearReview">記録を見る</button><button id="ch2NewGame">最初から遊ぶ</button></div></div>`);
    document.getElementById("ch2ClearReview").onclick = () => {
      showChoices(`第2章記録\n試合数:${c2.matchCount} 昇格:${c2.promoted ? "○" : "×"}\n称号:${STATE.player.titles.join("、") || "なし"}\n呪いレベル:${c2.curseLevel} お祓い回数:${c2.exorcismCount}\nサイドバック経験値:${c2.sideBackExperience}\n整体スキル:${STATE.player.seitaiSkill} 販売スキル:${STATE.player.salesSkill}\nこらしめた患者数:${c2.patientsDefeatedCount}`,
        [{ label: "戻る", onClick: showMenu }]);
    };
    document.getElementById("ch2NewGame").onclick = () => {
      showChoices("セーブを消して最初から遊びますか？", [
        { label: "はい（消して最初から）", onClick: () => { deleteSave(); STATE = null; location.reload(); } },
        { label: "やめる", onClick: showMenu },
      ]);
    };
  };
  showEndingRoll("ENDING「スペインへ」", `
    <p>こうしてタナベッカムはスペインへ渡った。</p>
    <p>世界初――「整体師兼サッカー見習い」が誕生した。</p>
    <p><b>第3章「スペイン編」へ続く……</b></p>
  `, showMenu, "assets/endings/spain_end.jpg");
}

// アップエリア：田辺はベンチ横で軽い行動のみ可能。managerAppealを貯めて途中出場を狙う。
function enterWarmupMenu() {
  const actions = CHAPTER2.warmupActions;
  const keys = Object.keys(actions);
  const canAppealShaolin = STATE.player.learnedSkills.includes(CHAPTER2.skillShaolinShoot.id) && !STATE.chapter2.shaolinShotUsedThisMatch;
  let html = `<div class="dialog"><p>公式戦の時間だ。田辺は今日もベンチスタート。
アップエリアで監督にアピールしよう。（アピール ${STATE.chapter2.managerAppeal}/${CHAPTER2.managerAppealThreshold}）</p><ul>`;
  keys.forEach((key, i) => { html += `<li><button data-i="${i}">${actions[key].label}</button></li>`; });
  if (canAppealShaolin) html += `<li><button id="warmupShaolinAppeal">🔥少林シュートでアピール</button></li>`;
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
  if (canAppealShaolin) document.getElementById("warmupShaolinAppeal").onclick = playShaolinAppealCutscene;
  document.getElementById("warmupGo").onclick = resolveBenchMatch;
}

// ヒグチビッチ加入後、最初の1試合だけは完全ベンチ確定（アピール不可）。
// 通常のベンチ試合解決(resolveBenchMatch)をそのまま流用する
function startHiguchiDebutBenchMatch() {
  hideOverlay();
  STATE.chapter2.higuchiDebutDone = true;
  saveGame(STATE);
  resolveBenchMatch();
}

// 完全ベンチ初戦の翌朝、母から「練習してチャンスをつかもう」の一言
function showHiguchiDebutMomEvent() {
  STATE.chapter2.higuchiDebutMomShown = true;
  STATE.chapter2.objective = "練習して出場のチャンスをつかもう";
  saveGame(STATE);
  showOverlay(`<div class="dialog"><p>母：「すごい選手が入ってきたんだってね。」
「田辺もちゃんと練習しないと、試合に出られないよ。」</p>
    <div class="choices"><button id="higuchiMomOk">OK</button></div></div>`);
  document.getElementById("higuchiMomOk").onclick = () => {
    hideOverlay();
    FIELD && FIELD.enable();
    if (CH2TIMER) CH2TIMER.resume();
  };
}

// ヒグチビッチとの実力差を痛感し、少林寺修行を思い立つきっかけイベント。
// ヒグチビッチ加入後、実際に途中出場した試合の直後に一度だけ発火する。
function showShaolinIdeaEvent() {
  showOverlay(`<div class="dialog">${cutinTag("assets/cutins/tanabe_serious.png")}<p>田辺：「……このままじゃダメだ！」</p>
    <div class="choices"><button id="shaolinIdeaOk1">……</button></div></div>`);
  document.getElementById("shaolinIdeaOk1").onclick = () => {
    showOverlay(`<div class="dialog"><p>田辺：「よし、少林寺に修行に行こう！」</p>
      <div class="choices"><button id="shaolinIdeaOk2">……</button></div></div>`);
    document.getElementById("shaolinIdeaOk2").onclick = () => {
      STATE.chapter2.shaolinIdeaShown = true;
      STATE.chapter2.shaolinUnlocked = true;
      STATE.chapter2.objective = "少林寺で修行しよう";
      saveGame(STATE);
      hideOverlay();
      FIELD && FIELD.enable();
      if (CH2TIMER) CH2TIMER.resume();
    };
  };
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
    if (STATE.chapter2.promotionDeciderPending) { finishPromotionDeciderBenchOnly(); return; }
    if (STATE.chapter2.higuchiDebutDone && !STATE.chapter2.higuchiDebutMomShown) { showHiguchiDebutMomEvent(); return; }
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
  if (id === "seitai_clinic_desk") { enterSeitaiClinicBuilding(); return; }
  if (id === "sebastian_clinic_desk") { enterSebastianClinic(); return; }
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

// 汎用カットシーンチェーン。steps: [{cutin?, text}]を1つずつ表示し、
// 最後にonDoneを呼ぶ（onDone呼び出し前にオーバーレイは閉じる）。
// soccer.jsの試合中カットシーン（少林シュート）等、モジュール外からも直接呼べる。
function showCutsceneChain(steps, onDone) {
  let i = 0;
  const next = () => {
    if (i >= steps.length) { hideOverlay(); onDone(); return; }
    const step = steps[i++];
    const cutin = step.cutin ? cutinTag(step.cutin) : "";
    showOverlay(`<div class="dialog">${cutin}<p>${step.text}</p>
      <div class="choices"><button id="cutsceneStepOk">……</button></div></div>`);
    document.getElementById("cutsceneStepOk").onclick = next;
  };
  next();
}

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
    <img src="assets/opening/opening_home.jpg?v=${ART_ASSET_VERSION}" onerror="this.style.display='none'">
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
    onShaolinBoss: (boss) => onShaolinBoss(boss),
    onShaolinSensei: (id) => onShaolinSensei(id),
  });
  FIELD.enable();
  FIELD.render();
}

function enterBuilding(building) {
  FIELD.disable();
  if (building.id === "weaponshop") openShop(["weapons", "shields", "armors"], "assets/shops/weaponshop.jpg");
  else if (building.id === "itemshop") openShop(["items"]);
  else if (building.id === "inn") openInn();
  else if (building.id === "tavern") openTavern();
  else if (building.id === "jobcenter") openJobCenter();
  else if (building.id === "house_interior") showHomeInterior();
  else if (building.id === "stadium") enterStadium();
}

// 田辺整体院マップの受付（mainHall）。整体バイトが解放済みならそのまま整体バトルへ。
function enterSeitaiClinicBuilding() {
  FIELD.disable();
  if (!STATE.chapter2.massageJobUnlocked) {
    showChoices("整体院：今は特に用事がなさそうだ。", [
      { label: "戻る", onClick: backToField },
    ]);
    return;
  }
  enterMassageBattleJob();
}

// 自宅の庭から「家の中へ」で、冒頭で母と話した室内の絵にいつでも戻れるようにする
function showHomeInterior() {
  showOverlay(`<div class="full-screen-art"><div class="art-frame">
    <img src="assets/opening/opening_home.jpg?v=${ART_ASSET_VERSION}" onerror="this.style.display='none'">
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
        STATE.party.forEach(m => { if (!m.dead) m.hp = m.maxHp; });
        // 自宅へ戻さず、宿屋のあるその場（町）からそのまま再開する
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
  ], "assets/shops/inn.jpg");
}

// ---------- 酒場（NPC抽選） ----------
function openTavern() {
  const inCh2 = STATE.chapter2 && STATE.chapter2.started;
  // 第2章は日数が進まないため、公式戦の回数を日替わり相当のシードにする
  const seed = inCh2 ? STATE.chapter2.matchCount : STATE.day;
  const rng = mulberry32(seed);
  let html = `<div class="dialog shop-bg"${shopBgStyle("assets/shops/tavern.jpg")}><p>酒場のNPC（本日）</p><ul>`;
  const flavor = ["酔っぱらい", "旅人", "冒険者", "サッカー好き", "情報屋"];
  const npcCount = 2 + Math.floor(rng() * 2);
  let picked = [];
  // 死亡（離脱）した仲間は枠を空けるので、生存人数だけで空き枠を数える
  const aliveCount = STATE.party.filter(m => !m.dead).length;
  for (let i = 0; i < npcCount; i++) {
    if (aliveCount + picked.length < CHAPTER0.maxPartySize && rng() < 0.5) {
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
      if (STATE.party.filter(m => !m.dead).length < CHAPTER0.maxPartySize) {
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
  STATE.party.push({ ...companion, hp: 20 + companion.rank * 2, maxHp: 20 + companion.rank * 2, dead: false });
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
// 整体師のアルバイトは、フィールド上の独立した「整体院」の建物から直接始める
// （enterSeitaiClinicBuilding）ため、職業安定所には出さない。
function openJobCenter() {
  let html = `<div class="dialog shop-bg"${shopBgStyle("assets/shops/jobcenter.jpg")}><p>職業安定所：求人を選んでください</p><ul>`;
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
  const showMatchEntry = STATE.chapter2 && STATE.chapter2.started;
  let html = `<div class="dialog"><p>体力: ${STATE.player.stamina}/${STATE.player.maxStamina}</p><ul>`;
  skills.forEach((s, i) => { html += `<li><button data-i="${i}">${labels[s]}練習</button></li>`; });
  if (showMatchEntry) html += `<li><button id="practiceMatchGo">${STATE.chapter2.dismissedFromClub ? "草サッカー" : "練習試合"}</button></li>`;
  html += `</ul><button id="closePractice">出る</button></div>`;
  showOverlay(html);
  skills.forEach((s, i) => {
    overlay.querySelector(`[data-i="${i}"]`).onclick = () => {
      // うつ病モード中、未習得なら「ドリブル練習」が専用の習得イベントに差し替わる
      if (s === "dribble" && STATE.chapter2 && STATE.chapter2.depressionMode &&
          !STATE.player.learnedSkills.includes(CHAPTER2.skillDepressionDribble.id)) {
        showDepressionDribbleLearnEvent();
        return;
      }
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
  if (showMatchEntry) document.getElementById("practiceMatchGo").onclick = enterPracticeMatchIntro;
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
        else if (CHASE) CHASE.setKey(dirKey[dir], true);
        else if (FIELD) FIELD.setKey(dir, true);
      },
      () => {
        if (MATCH) MATCH.setKey(dirKey[dir], false);
        else if (CHASE) CHASE.setKey(dirKey[dir], false);
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
  bind("btn-skill2", () => MATCH && MATCH.setKey("v", true), () => MATCH && MATCH.setKey("v", false));
  bind("btn-skill3", () => MATCH && MATCH.setKey("b", true), () => MATCH && MATCH.setKey("b", false));
}
