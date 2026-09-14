// ===== セーブ/ロード管理 =====
const SAVE_KEY = "tanabeckham_save_v1";
const SAVE_VERSION = 1;

function defaultSaveData() {
  return {
    version: SAVE_VERSION, chapter: 0, day: 1, remainingSec: CHAPTER0.startTimerSeconds,
    player: { name:"田辺",level:1,exp:0,hp:30,maxHp:30,stamina:100,maxStamina:100,atk:4,def:2,luck:3,gold:300,
      equip:{weapon:null,shield:null,armor:null},inventory:[],soccerSkills:{shoot:1,pass:1,dribble:1,defense:1,run:3},learnedSkills:[],seitaiPoint:0 },
    party: [], flags: JSON.parse(JSON.stringify(CHAPTER0.storyFlags)), hiddenEvents:{}, matchRecords:{}, position:{map:"home",x:2,y:1}
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
  return merged;
}
function saveGame(state){try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));return true;}catch(e){console.error("セーブ失敗:",e);return false;}}
function loadGame(){try{const raw=localStorage.getItem(SAVE_KEY);if(!raw)return null;return normalizeSaveData(JSON.parse(raw));}catch(e){console.error("ロード失敗:",e);return null;}}
function deleteSave(){localStorage.removeItem(SAVE_KEY);}
