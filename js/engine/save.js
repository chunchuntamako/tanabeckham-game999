// ===== セーブ/ロード管理 =====
// v2: 第2章後半（J1〜J2〜整体バトル〜人生分岐〜警察逃走〜スペイン編）の新規state
// 追加に伴いバージョンを更新。defaultSaveData()のchapter2はCHAPTER2.storyFlagsDefault
// を丸ごと展開しているため、新規フラグはここを個別に触らなくても自動的に載る。
// normalizeSaveData()のmergeObjectが新旧差分を吸収するので、将来セーブを再度有効化
// した際も既存セーブとの互換マイグレーションは追加コード不要で成立する。
const SAVE_KEY = "tanabeckham_save_v1";
const SAVE_VERSION = 2;

function defaultSaveData() {
  return {
    version: SAVE_VERSION, chapter: 0, day: 1, remainingSec: CHAPTER0.startTimerSeconds,
    player: { name:"田辺",level:1,exp:0,hp:30,maxHp:30,stamina:100,maxStamina:100,atk:4,def:2,luck:3,gold:300,
      equip:{weapon:null,shield:null,armor:null},inventory:[],soccerSkills:{shoot:1,pass:1,dribble:1,defense:1,run:3},learnedSkills:[],seitaiPoint:0,seitaiSkill:0,salesSkill:0,titles:[] },
    party: [], flags: JSON.parse(JSON.stringify(CHAPTER0.storyFlags)), hiddenEvents:{}, matchRecords:{}, position:{map:"home",x:4,y:14},
    chapter2: JSON.parse(JSON.stringify(CHAPTER2.storyFlagsDefault))
  };
}
function mergeObject(base, incoming) {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return base;
  const out = { ...base, ...incoming };
  Object.keys(base).forEach(k => {
    if (base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) out[k] = mergeObject(base[k], incoming[k]);
  });
  return out;
}
function normalizeSaveData(data) {
  const merged = mergeObject(defaultSaveData(), data || {});
  merged.version = SAVE_VERSION;
  merged.party = Array.isArray(data && data.party) ? data.party : [];
  merged.player.inventory = Array.isArray(merged.player.inventory) ? merged.player.inventory : [];
  merged.player.learnedSkills = Array.isArray(merged.player.learnedSkills) ? merged.player.learnedSkills : [];
  merged.player.titles = Array.isArray(merged.player.titles) ? merged.player.titles : [];
  return merged;
}
// セーブ機能はいったん無効化中（要望により）。呼び出し箇所はそのまま残し、ここで何もしないようにしている。
function saveGame(state){return false;}
function loadGame(){return null;}
function deleteSave(){try{localStorage.removeItem(SAVE_KEY);}catch(e){}}
