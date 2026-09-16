// ===== 敵データ（数値は仮。ここで調整可能） =====

const ENEMIES = {
  // フィールド雑魚
  slime: { name: "スライム系", hp: 10, atk: 3, def: 1, exp: 4, gold: 5, sprite: "assets/enemies/slime.png" },
  dog: { name: "野犬系", hp: 14, atk: 4, def: 2, exp: 6, gold: 8, sprite: "assets/enemies/dog.png" },
  ballmon: { name: "ボール型の変なモンスター", hp: 12, atk: 5, def: 1, exp: 5, gold: 6, sprite: "assets/enemies/ball_monster.png" },

  // ダンジョン雑魚（フィールドより少し強い）
  dungeon1: { name: "ダンジョンの影", hp: 22, atk: 6, def: 3, exp: 10, gold: 15, sprite: "assets/enemies/dungeon_01.png" },
  dungeon2: { name: "彷徨う何か", hp: 26, atk: 7, def: 3, exp: 12, gold: 18, sprite: "assets/enemies/dungeon_02.png" },

  // 中ボス
  seitaishi: { name: "整体師", hp: 80, atk: 10, def: 5, exp: 50, gold: 200, sprite: "assets/bosses/seitaishi.png", boss: true },

  // 第2章：神社奥のボス。CHAPTER2.godBossの数値をそのまま使う（調整はchapter2.js側で行う）
  god: Object.assign({ sprite: "assets/bosses/god.png" }, CHAPTER2.godBoss),

  // 第2章：警察逃走ダンジョン。コミカル表現限定（死亡・重傷描写はしない）。金品は奪わない。
  police1: { name: "警察官A", hp: 16, atk: 5, def: 2, exp: 10, gold: 0, sprite: "assets/enemies/police1.png" },
  police2: { name: "警察官B", hp: 20, atk: 6, def: 3, exp: 12, gold: 0, sprite: "assets/enemies/police2.png" },
};

const ENCOUNTER_TABLES = {
  field: ["slime", "dog", "ballmon"],
  dungeon: ["dungeon1", "dungeon2"],
  police: ["police1", "police2"],
};
