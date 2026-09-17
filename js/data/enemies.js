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

  // 第2章：少林寺の修行ボス3体（いっしー→詐欺師田中→ケイゾウの順で挑む）。
  // いっしー・ケイゾウは酒場の仲間候補と同一人物だが、戦闘データとしては別定義
  // （既存の仲間候補用スプライトをそのまま流用）。
  issy: { name: "いっしー", hp: 40, atk: 8, def: 3, exp: 30, gold: 50, sprite: "assets/characters/nakama_05.png", boss: true },
  tanaka: { name: "詐欺師田中", hp: 55, atk: 10, def: 4, exp: 45, gold: 80, sprite: "assets/enemies/tanaka.png", boss: true },
  keizo_boss: { name: "ケイゾウ", hp: 90, atk: 13, def: 6, exp: 70, gold: 120, sprite: "assets/characters/nakama_03.jpg", boss: true },

  // 第2章：神社奥のボス。CHAPTER2.godBossの数値をそのまま使う（調整はchapter2.js側で行う）
  god: Object.assign({ sprite: "assets/bosses/god.png" }, CHAPTER2.godBoss),
};

const ENCOUNTER_TABLES = {
  field: ["slime", "dog", "ballmon"],
  dungeon: ["dungeon1", "dungeon2"],
};
