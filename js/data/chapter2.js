// ===== 第2章 データ定義 =====
// 詳しい仕様は docs/chapter2_spec.md を参照。ここを変更するだけで
// 第2章の数値・タイミングを調整できるようにする。

const CHAPTER2 = {
  chapterId: 2,

  matchIntervalSec: 10 * 60, // 次回公式戦までの実プレイ秒数
  minMatchesShrine: 2,       // 昇格祈願クエスト解放に必要な最低試合数
  matchDurationSec: 90,      // 公式戦1試合の実プレイ秒数

  matchPayment: 50,          // 出場給（実際に出場した試合のみ）

  exorcismCost: { money: 200, time: 60 }, // お祓いに必要なG・時間(秒)
  curseMax: 3,
  // お祓いの結果しきい値。(乱数0-100 + 運)がこの値以上で各結果になる。
  // プレイヤーには運が関係していることを一切説明しない（隠しステータス扱い）。
  exorcismOutcomeThresholds: { full: 90, partial: 55 }, // 未満は「さらに呪われた」

  // ボス「神」。通常プレイではほぼ勝てないが、理論上は撃破可能な値にする。
  godBoss: { name: "神", hp: 999, atk: 60, def: 40, speed: 20, luck: 30, exp: 0, gold: 0, boss: true },

  // 天罰・不遇ルート中の試合への不利補正（すべて後から調整しやすいよう定数化）
  misfortuneModifier: {
    mateAiPenalty: 0.25,          // 味方AI判断の質を下げる係数
    matePassAccuracyPenalty: 0.2, // 味方パス精度の低下
    mateShootRatePenalty: 0.2,    // 味方シュート決定率の低下
    enemyShootRateBonus: 0.15,    // 相手の決定率上昇
    reboundToEnemyBonus: 0.15,    // こぼれ球が相手に渡りやすくなる
    postEventRate: 0.05,          // ポスト発生率
    unluckyConcedeRate: 0.05,     // 不運な失点イベントの発生率
    passToTanabeRatePenalty: 0.3, // 田辺へパスが来る頻度の低下
  },

  // RPG側への天罰影響（不遇ルート中に有効）
  misfortuneRpgModifier: {
    escapeRatePenalty: 0.2,     // 逃走成功率の低下
    encounterRateBonus: 0.15,   // 敵遭遇率の上昇
    treasureFailRateBonus: 0.2, // 宝箱ハズレ率の上昇
    enemyFirstStrikeBonus: 0.2, // 敵の先制率上昇
  },

  // 途中出場のためのアップエリア行動でmanagerAppealを増やす基準値
  managerAppealThreshold: 100,

  // 天罰下で何試合終えたら監督更迭イベントが起きるか
  matchesBeforeDismissal: 3,

  // ベンチ試合（ヒグチビッチ主体、田辺は観戦のみ）のTIGAKU勝率
  benchWinRate: 0.72,

  // アップエリアでの行動。appeal分だけmanagerAppealが増え、stamina分だけ体力を消費する
  warmupActions: {
    run: { label: "軽く走る", appeal: 12, stamina: 8 },
    stretch: { label: "ストレッチ", appeal: 8, stamina: 4 },
    passby: { label: "監督の前を通る", appeal: 20, stamina: 2 },
  },

  // 途中出場後、ヒグチビッチから田辺へパスが来にくい（意地悪ではなくAIの得点期待値判断）
  subInPassPenalty: 0.35,

  // ヒグチビッチ加入後、何試合こなすとJ昇格するか
  matchesForPromotion: 4,

  // J1編の難易度補正（天罰とは別枠、呪いが解けても常時有効）。勝利不能にはしない。
  j1Modifier: {
    enemySpeedMultiplier: 1.15,    // J1の相手は動きが速い
    enemyShootRateBonus: 0.08,     // 相手の決定率が高い
    playerShotChancePenalty: 0.06, // 守備が堅く、田辺のシュートが通りにくい
  },

  // J1で何試合苦戦したら「まだ呪われてるんじゃない？」の空気になるか
  matchesBeforeCurseSuspicion: 3,

  // 警察逃走ダンジョンの敵遭遇率（通常ダンジョンより高め）
  policeDungeonEncounterRate: 0.28,

  // 第2章で新設する隠し称号
  titles: {
    god: "バロンドールタナベ",
    poop: "うんこまん",
  },

  storyFlagsDefault: {
    // --- 基本進行 ---
    started: false,
    matchCount: 0,
    nextMatchTimerSec: 10 * 60,
    promoted: false,          // J昇格達成
    j1Mode: false,            // true の間、J1難易度補正が試合に常時かかる
    matchCountAtJ1Start: 0,   // J1開始時点のmatchCount（お祓い誘発までの試合数カウント用）
    curseSuspicionRaised: false, // 「まだ呪われてるんじゃない？」の空気が立った後trueに
    cleared: false,           // 第2章クリア

    // --- 神社①・神・天罰 ---
    shrineUnlocked: false,
    offeringTaken: false,
    godDefeated: false,
    hiroshiSonSeen: false,
    divinePunishment: false,
    misfortuneMode: false,

    // --- 監督更迭・ヒグチビッチ ---
    hiroshiDismissed: false,
    higuchibitchJoined: false,
    higuchibitchTransferred: false,
    benchMode: false,              // true の間、公式戦はベンチ試合（アップエリア）扱いになる
    matchCountAtPunishment: 0,     // 天罰発生時点のmatchCount（更迭までの試合数カウント用）
    matchCountAtHiguchiJoin: 0,    // ヒグチビッチ加入時点のmatchCount（昇格までの試合数カウント用）
    managerAppeal: 0,
    teamTrust: 50,
    defensiveContribution: 0,

    // --- お祓い・呪い ---
    curseLevel: 0,
    exorcismCount: 0,

    // --- サイドバック・出場給・整体 ---
    sideBackOffered: false,
    sideBackAccepted: false,
    sideBackExperience: 0,
    massageJobUnlocked: false,
    massageWorkCount: 0,

    // --- 逮捕・逃走 ---
    masseurArrested: false,
    policeDungeonCleared: false,
  },
};
