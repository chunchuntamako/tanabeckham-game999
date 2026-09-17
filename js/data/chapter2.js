// ===== 第2章 データ定義 =====
// 詳しい仕様は docs/chapter2_spec.md を参照。ここを変更するだけで
// 第2章の数値・タイミングを調整できるようにする。

const CHAPTER2 = {
  chapterId: 2,

  matchIntervalSec: 5 * 60,  // 次回公式戦までの実プレイ秒数
  matchDurationSec: 40,      // 公式戦1試合の実プレイ秒数（前半20秒＋後半20秒）

  matchPayment: 50,          // 出場給（実際に出場した試合のみ）

  charmPrice: 30,            // 神社のお守り価格(G)
  curseMax: 3,               // お祓いじゃんけんの💩上限（3本勝負なので全敗でmax）

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

  // 天罰下で何敗したら即座に監督更迭イベントが起きるか（固定値。天罰下の試合は
  // 金縛り試合・ダイジェスト試合ともに必ず敗北するため、実質「5連敗」の固定トリガー）
  matchesBeforeDismissal: 5,

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


  // J1編の難易度補正（天罰とは別枠、呪いが解けても常時有効）。勝利不能にはしない。
  // 「呪いのせいで苦戦している」だけに見えないよう、田辺自身の守備の実力不足も
  // 軽く効かせておく（tryTackle成功率へのペナルティ）
  j1Modifier: {
    enemySpeedMultiplier: 1.15,    // J1の相手は動きが速い
    enemyShootRateBonus: 0.08,     // 相手の決定率が高い
    playerShotChancePenalty: 0.09, // 守備・GKが堅く、田辺のシュートが通りにくい
    tackleChancePenalty: 0.1,      // J1の相手には田辺のタックルが通用しにくい
    passInterceptBonus: 4,         // 相手のパスカット（ルーズボール回収半径）が広い
  },

  // 特に強く見せたい試合だけの追加補正（J1開幕戦・人生分岐「試合に行く」・
  // 解雇後の草サッカー）。他の補正（j1Modifier等）とは重ねがけしてよい。
  keyMatchBoost: {
    enemySpeedMultiplier: 1.2,
    enemyShootRateBonus: 0.1,
    playerShotChancePenalty: 0.07,
  },


  // 整体バトル設定（J2無所属〜のアルバイト編）。施術部位の一覧はここで一元管理する。
  massageBattle: {
    spots: { waist: "腰", leg: "脚", neck: "首", shoulder: "肩", back: "背中", knee: "膝" },
    rareRate: 0.08, // 「健康なおじいさん」が出現する確率
  },

  massageProducts: {
    mat: { name: "マット", price: 300 },
    pillow: { name: "枕", price: 150 },
  },

  // 患者6種。weakSpotsに施術すると大ダメージ、それ以外は軽微。
  // 「健康なおじいさん」（immune）はほぼ施術が効かない代わりに商品販売に弱い（レア）。
  patients: [
    { id: "waist_grandpa", name: "腰痛のおじいさん", hp: 60, atk: 8, reward: 40,
      weakSpots: ["waist", "leg"], attackLines: ["まだ痛いぞ！", "もっと優しくしてくれ！"] },
    { id: "shoulder_grandma", name: "肩こりのおばあさん", hp: 70, atk: 10, reward: 45,
      weakSpots: ["shoulder", "neck"], attackLines: ["前の先生の方が上手だった！", "下手くそ！"] },
    { id: "knee_grandpa", name: "膝痛のおじいさん", hp: 100, atk: 9, reward: 55,
      weakSpots: ["knee", "leg"], attackLines: ["そこじゃない！", "もっと真面目にやれ！"] },
    { id: "stiff_neck_lady", name: "寝違えのおばさん", hp: 55, atk: 14, reward: 40,
      weakSpots: ["neck", "shoulder"], attackLines: ["痛い痛い痛い！"] },
    { id: "stiff_all_uncle", name: "全身バキバキのおじさん", hp: 130, atk: 12, reward: 80,
      weakSpots: ["waist", "shoulder", "leg"], attackLines: ["全然効いてないぞ！"] },
    { id: "healthy_grandpa", name: "健康なおじいさん", hp: 30, atk: 5, reward: 100, rare: true,
      immune: true, weakSpots: [], sellBonus: true, attackLines: ["早く帰りたいんじゃが……"] },
  ],

  // 整体院の雇い主（悪徳整体師）。警察の聞き込みシーンでのみカットインする。
  masseurBoss: { name: "院長", sprite: "assets/characters/masseur_boss.png" },

  // セバスチャン先生の治療費（うつ病モード解除）。何度でも払って治療できる。
  sebastianTreatmentCost: 500,

  // 警察逃走アクションゲームの調整用定数（マップ・人数・速度）
  policeChase: {
    copCount: 3,
    copSpeed: 1.7,
    playerSpeed: 2.6,
  },

  // 第2章で新設する隠し称号
  titles: {
    god: "バロンドールタナベ",
    poop: "うんこまん",
    worldFirst: "世界初・整体師兼サッカー見習い",
  },

  // 少林寺で習得できる必殺技。1試合サイクルにつき1回しか使えない
  // （アップエリアでのアピール使用と、試合中の使用は同じフラグを共有する）
  skillShaolinShoot: {
    id: "shaolin_shoot",
    name: "少林シュート",
    successRate: 0.85,
  },

  // うつ病モード中の練習場で習得する必殺技。1試合最大2回。2回目の使用で
  // うつ病モードに再突入する（試合後も継続）。
  skillDepressionDribble: {
    id: "depression_dribble",
    name: "鬱病ドリブル",
    maxUsesPerMatch: 2,
  },

  // 整体・販売スキルの合計がこの値に達すると、クラブから連絡が来て人生分岐が発生する
  lifeForkSkillThreshold: 6,

  storyFlagsDefault: {
    // --- 基本進行 ---
    started: false,
    matchCount: 0,
    nextMatchTimerSec: 5 * 60,
    objective: "首位決戦に備えろ！", // 画面上部に常時表示する目的テキスト
    momErrandShown: false,    // 母のお使いイベント（お守り購入＋お参り）を見たか
    promoted: false,          // J昇格達成
    j1Mode: false,            // true の間、J1難易度補正が試合に常時かかる
    matchCountAtJ1Start: 0,   // J1開始時点のmatchCount（お祓い誘発までの試合数カウント用）
    curseSuspicionRaised: false, // 「まだ呪われてるんじゃない？」の空気が立った後trueに
    cleared: false,           // 第2章クリア
    matchDuePending: false,   // 公式戦の時間になったが、まだスタジアムへ入っていない

    // --- 神社①・神・天罰 ---
    shrineUnlocked: false,
    offeringTaken: false,
    trafficCharm: false,      // お守りを買ったか（母イベントの褒める/叱る分岐に使用）
    shrinePrayed: false,      // 本殿で祈った（＝神戦発生済み）か。一度きりのイベント制御用
    godDefeated: false,
    hiroshiSonSeen: false,
    divinePunishment: false,
    misfortuneMode: false,
    paralyzedMatch: false,    // 天罰直後の1試合だけtrue。田辺の操作を全て無効化する

    // --- 監督更迭・ヒグチビッチ ---
    hiroshiDismissed: false,
    higuchibitchJoined: false,
    higuchibitchTransferred: false,
    benchMode: false,              // true の間、公式戦はベンチ試合（アップエリア）扱いになる
    matchCountAtPunishment: 0,     // 天罰発生時点のmatchCount（更迭までの試合数カウント用）
    matchCountAtHiguchiJoin: 0,    // ヒグチビッチ加入時点のmatchCount（昇格までの試合数カウント用）
    higuchiDebutDone: false,       // ヒグチビッチ加入後の初戦（完全ベンチ確定）を消化したか
    higuchiDebutMomShown: false,   // 初戦後の母イベント（練習して出場のチャンスをつかもう）を見たか
    shaolinIdeaShown: false,       // 「少林寺に修行に行こう！」を思い立ったか
    shaolinUnlocked: false,        // fieldマップに少林寺への出口が出ているか
    shaolinIssyDefeated: false,    // 少林寺ボス1：いっしーを撃破したか
    shaolinTanakaDefeated: false,  // 少林寺ボス2：詐欺師田中を撃破したか
    shaolinKeizoDefeated: false,   // 少林寺ボス3：ケイゾウを撃破したか
    shaolinQuizDone: false,        // 佐々木SVの4択に回答済みか（正誤問わず一度きり、再挑戦不可）
    shaolinShotUsedThisMatch: false, // 少林シュートをこの試合サイクルで使用済みか（アピール使用と本番使用で共有）
    promotionDeciderPending: false, // 現在の試合サイクルが昇格決定戦かどうか
    promotionDeciderMatch: false,   // 昇格決定戦で田辺が実際にピッチに立っている間だけtrue
    promotionReady: false,         // trueになった次の試合終了でJ1昇格イベント（昇格決定戦）が発生する
    managerAppeal: 0,
    teamTrust: 50,
    defensiveContribution: 0,

    // --- J1編（昇格後） ---
    j1OpeningAnnounced: false,     // 「J1リーグ開幕」の告知を出したか（一度きり）
    j1StruggleDigestShown: false,  // J1苦戦ダイジェスト（初戦後・呪い疑惑のきっかけ）を見たか
    exorcismMomShown: false,       // 母から「お祓いしてきなさい」と言われたか
    exorcismJankenDone: false,     // お祓いじゃんけん（3本勝負）を消化済みか。再挑戦はさせない
    sidebackDecisionShown: false,  // 監督の「サイドバックでもしておけ」を見たか（一度きり）
    sidebackFarewellMatchPending: false, // サイドバック受諾時の最後の1試合（経験値獲得用）の最中か
    j2Mode: false,                 // J2降格後true。J1関連の演出は行わなくなる
    j2OpeningShown: false,         // 「翌シーズン――」でベンチ入りすらしていない演出を見たか

    // --- お祓い・呪い ---
    curseLevel: 0,
    exorcismCount: 0,

    // --- サイドバック・出場給・整体 ---
    sideBackOffered: false,
    sideBackAccepted: false,
    sideBackExperience: 0,
    massageJobUnlocked: false,
    massageWorkCount: 0,
    seitaiSkillSeeded: false,     // プロローグの整体ポイントを整体スキル初期値へボーナス反映済みか（一度きり）
    patientsDefeatedCount: 0,     // 整体バトルで「こらしめた」患者の人数（後の警察イベントの伏線）

    // --- 人生分岐・整体師END／解雇・うつ病 ---
    lifeForkShown: false,       // 「試合に行く/整体で稼ぐ」の人生分岐を見たか（一度きり）
    lifeForkMatchActive: false, // 人生分岐「①試合に行く」の試合中だけtrue（CPU強化の対象判定用）
    seitaiEndingReached: false, // 整体師中間エンディングに到達したか
    dismissedFromClub: false,   // FC山陽TIGAKUを解雇されたか（練習試合→草サッカーの呼称もこれで切り替え）
    depressionMode: false,      // true の間、通常シュート不発・少林シュート/鬱病ドリブル使用不可
    seniorEventShown: false,    // 整体院の先輩イベント（セバスチャン先生の紹介）を見たか
    sebastianUnlocked: false,   // セバスチャン診療所（町）が出現しているか
    sebastianFirstTreatmentDone: false, // 初回の治療を終え、草サッカーへの助言を見たか
    awaitingPoliceKusaSoccer: false,    // 次の草サッカー終了後に警察イベントを発生させるか

    // --- 逮捕・逃走 ---
    masseurArrested: false,
    policeDungeonCleared: false,
    stinkyRiceEndingReached: false, // 中間エンディング「臭い飯」に到達したか
  },
};
