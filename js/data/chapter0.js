// ===== 序章 データ定義 =====
// ここを変更するだけで序章の数値・文言を調整できます。

const CHAPTER0 = {
  chapterId: 0,
  startTimerSeconds: 10 * 60, // 【残り時間】初期値（10分）
  innCost: { time: 30, money: 0, label: "宿屋" },
  seitaiCost: { time: 120, money: 0, label: "整体研修" },
  practiceCost: { time: 25, stamina: 20, label: "サッカー練習" },
  seitaiReward: { money: 100, seitaiPoint: 1 },

  weapons: [
    { id: "stick", name: "木の棒", price: 50, atk: 2 },
    { id: "wsword", name: "木の剣", price: 120, atk: 4 },
    { id: "csword", name: "銅の剣", price: 300, atk: 7 },
    { id: "isword", name: "鉄の剣", price: 600, atk: 11 },
  ],
  shields: [
    { id: "wshield", name: "木の盾", price: 100, def: 2 },
    { id: "lshield", name: "革の盾", price: 250, def: 5 },
  ],
  armors: [
    { id: "larmor", name: "革の服", price: 180, def: 4 },
    { id: "carmor", name: "鎖の服", price: 500, def: 8 },
  ],
  items: [
    { id: "potion", name: "回復薬", price: 30, effect: { hp: 30 } },
    { id: "antidote", name: "毒消し", price: 20, effect: { cureStatus: "poison" } },
    { id: "escape", name: "脱出アイテム", price: 80, effect: { escapeDungeon: true } },
  ],

  jobs: [
    { id: "factory", name: "工場", result: "fail" },
    { id: "sales", name: "営業", result: "fail" },
    { id: "restaurant", name: "飲食店", result: "fail" },
    { id: "seitai", name: "整体師見習い", result: "seitai" }, // 唯一不採用にならない
  ],
  jobFailReward: { luck: 1, message: "不遇に耐えた！【運+1】" },

  companions: [
    { id: "higuchi", name: "ヒグチビッチ", rank: 1, appearRate: 0.03, sprite: "assets/characters/nakama_01.png", joinCutin: "assets/cutins/higuchi_join.png" },
    { id: "yasuda", name: "安田", rank: 2, appearRate: 0.08, sprite: "assets/characters/nakama_02.png", joinCutin: "assets/cutins/yasuda_join.png" },
    { id: "keizo", name: "ケイゾウ", rank: 3, appearRate: 0.12, sprite: "assets/characters/nakama_03.png", joinCutin: "assets/cutins/keizo_join.png" },
    { id: "mackey", name: "マッキー", rank: 4, appearRate: 0.18, sprite: "assets/characters/nakama_04.png" },
    { id: "issy", name: "イッシー", rank: 5, appearRate: 0.25, sprite: "assets/characters/nakama_05.png" },
    { id: "hiroshi", name: "ヒロシ君", rank: 6, appearRate: 0.35, sprite: "assets/characters/nakama_06.png", joinCutin: "assets/cutins/hiroshi_join.png" },
  ],

  hiddenEventMat: {
    price: 500000,
    choices: [
      { id: 1, text: "絶対オススメです！", result: "learnSkill" },
      { id: 2, text: "ちょっと高すぎませんか？", result: "nothing" },
      { id: 3, text: "そんなもの買わない方がいいですよ", result: "nothing" },
      { id: 4, text: "むしろ2枚買った方がいいですよ！", result: "gameOver" },
    ],
  },

  skillOjiisanGoroshi: {
    id: "ojiisan_goroshi",
    name: "お年寄り殺し！",
    debuff: 0.3, // 対象能力を30%低下
    durationSec: 30,
    luckCost: 2,
    staminaCost: 20,
  },

  storyFlags: {
    momTalkDone: false,
    joinedFC: false,
    prologueClear: false,
  },
};
