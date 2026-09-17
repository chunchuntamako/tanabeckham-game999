// ===== RPG戦闘 =====
// 田辺を直接操作し、仲間は自動戦闘。仲間HP0は章内で永久離脱。

class BattleController {
  constructor(state, enemyId, onEnd) {
    this.state = state;
    this.enemyId = enemyId;
    this.enemy = JSON.parse(JSON.stringify(ENEMIES[enemyId]));
    this.enemy.curHp = this.enemy.hp;
    this.onEnd = onEnd;
    this.log = [`${this.enemy.name}があらわれた！`];
    this.ended = false;
    this.leveledUp = false;
  }

  playerAtk() {
    const p = this.state.player;
    const w = p.equip.weapon ? CHAPTER0.weapons.find(x => x.id === p.equip.weapon) : null;
    return p.atk + (w ? w.atk : 0);
  }
  playerDef() {
    const p = this.state.player;
    const s = p.equip.shield ? CHAPTER0.shields.find(x => x.id === p.equip.shield) : null;
    const a = p.equip.armor ? CHAPTER0.armors.find(x => x.id === p.equip.armor) : null;
    return p.def + (s ? s.def : 0) + (a ? a.def : 0);
  }
  livingParty() { return (this.state.party || []).filter(m => !m.dead && m.hp > 0); }
  addLog(msg) { this.log.push(msg); if (this.log.length > 8) this.log.shift(); }

  finishWin() {
    const p = this.state.player;
    this.addLog(`${this.enemy.name}を倒した！ EXP+${this.enemy.exp} G+${this.enemy.gold}`);
    p.exp += this.enemy.exp;
    p.gold += this.enemy.gold;
    this.checkLevelUp();
    this.ended = true;
    saveGame(this.state);
    this.onEnd("win");
    return true;
  }

  companionTurn() {
    for (const mate of this.livingParty()) {
      // rank 1が最強。強い仲間ほど高火力。時々回復も行う。
      if (this.state.player.hp <= Math.max(8, this.state.player.maxHp * 0.35) && Math.random() < 0.22) {
        const heal = 5 + Math.max(1, 7 - mate.rank);
        this.state.player.hp = Math.min(this.state.player.maxHp, this.state.player.hp + heal);
        this.addLog(`${mate.name}が田辺を助けた！ HP+${heal}`);
      } else {
        const power = Math.max(2, 10 - mate.rank);
        const dmg = Math.max(1, power - Math.floor(this.enemy.def / 2) + Math.floor(Math.random() * 3));
        this.enemy.curHp -= dmg;
        this.addLog(`${mate.name}の自動攻撃！ ${dmg}ダメージ。`);
        if (this.enemy.curHp <= 0) return true;
      }
    }
    return false;
  }

  enemyTurn() {
    const p = this.state.player;
    const mates = this.livingParty();
    // 25%で仲間を狙う。仲間死亡は章内永久。
    if (mates.length && Math.random() < 0.25) {
      const target = mates[Math.floor(Math.random() * mates.length)];
      const dmg = Math.max(1, this.enemy.atk - Math.floor(target.rank / 2) + Math.floor(Math.random() * 3));
      target.hp -= dmg;
      this.addLog(`${this.enemy.name}の攻撃！ ${target.name}に${dmg}ダメージ。`);
      if (target.hp <= 0) {
        target.hp = 0; target.dead = true;
        this.addLog(`${target.name}は倒れた……この章では戻ってこない。`);
      }
      return false;
    }

    const edmg = Math.max(1, this.enemy.atk - this.playerDef() + Math.floor(Math.random() * 2));
    p.hp -= edmg;
    this.addLog(`${this.enemy.name}の攻撃！ 田辺は${edmg}のダメージ。`);
    if (p.hp <= 0) {
      p.hp = 0;
      this.addLog("田辺は倒れた……");
      p.luck = 0;
      saveGame(this.state);
      this.ended = true;
      this.onEnd("dead");
      return true;
    }
    return false;
  }

  command(cmd) {
    const p = this.state.player;
    if (this.ended || p.hp <= 0) return this.ended;
    this.log = []; // 過去ターンのログは表示せず、このターンのメッセージだけにする
    let consumesTurn = true;

    if (cmd === "fight") {
      const dmg = Math.max(1, this.playerAtk() - this.enemy.def + Math.floor(Math.random() * 3));
      this.enemy.curHp -= dmg;
      this.addLog(`田辺の攻撃！ ${this.enemy.name}に${dmg}のダメージ！`);
    } else if (cmd === "negotiate") {
      const chance = Math.min(0.5, 0.05 + p.luck * 0.03);
      if (Math.random() < chance) {
        this.addLog(`交渉成功！ ${this.enemy.name}は去っていった。`);
        this.ended = true; saveGame(this.state); this.onEnd("flee"); return true;
      }
      this.addLog("交渉は失敗した……さすが田辺だ！");
    } else if (cmd === "item") {
      const potion = p.inventory.find(i => i.id === "potion" && i.qty > 0);
      if (potion) {
        p.hp = Math.min(p.maxHp, p.hp + 30);
        potion.qty -= 1;
        p.inventory = p.inventory.filter(i => i.qty > 0);
        this.addLog("回復薬を使った！ HPが30回復。");
      } else {
        this.addLog("使えるどうぐがない！");
        consumesTurn = false;
      }
    } else if (cmd === "flee") {
      const misfortune = this.state.chapter2 && this.state.chapter2.misfortuneMode;
      const fleeChance = 0.6 - (misfortune ? CHAPTER2.misfortuneRpgModifier.escapeRatePenalty : 0);
      if (!this.enemy.boss && Math.random() < fleeChance) {
        this.addLog("うまく逃げ切った！");
        this.ended = true; saveGame(this.state); this.onEnd("flee"); return true;
      }
      this.addLog(this.enemy.boss ? "ボス戦からは逃げられない！" : "逃げられなかった！");
    }

    if (this.enemy.curHp <= 0) return this.finishWin();
    if (!consumesTurn) return false;
    if (this.companionTurn() && this.enemy.curHp <= 0) return this.finishWin();
    if (this.enemyTurn()) return true;
    saveGame(this.state);
    return false;
  }

  checkLevelUp() {
    const p = this.state.player;
    let needed = p.level * 10;
    while (p.exp >= needed) {
      p.exp -= needed;
      p.level += 1;
      p.maxHp += 5; p.hp = p.maxHp;
      p.atk += 1; p.def += 1; p.luck += 1;
      this.leveledUp = true;
      this.addLog(`レベルアップ！ Lv${p.level}になった。運も1上がった！`);
      needed = p.level * 10;
    }
  }
}

// ===== 整体バトル（第2章後半：J2無所属〜） =====
// BattleControllerと同じ構造の専用バトル。敵は「患者」、勝利表現は必ず「こらしめた」。
class MassageBattle {
  constructor(state, patientData, onEnd) {
    this.state = state;
    this.onEnd = onEnd;
    this.patient = JSON.parse(JSON.stringify(patientData));
    this.patient.curHp = this.patient.hp;
    this.log = [`${this.patient.name}があらわれた！`];
    this.ended = false;
    this.result = null;
    this.angerBoost = 0; // 商品販売に失敗すると一時的に患者の攻撃力が上がる
  }

  addLog(msg) { this.log.push(msg); if (this.log.length > 8) this.log.shift(); }

  seitaiDamage(spot) {
    const p = this.state.player;
    const base = 6 + (p.seitaiSkill || 0) * 1.5 + Math.random() * 4;
    if (this.patient.immune) return Math.max(1, Math.round(base * 0.15));
    const effective = this.patient.weakSpots.includes(spot);
    return Math.max(1, Math.round(base * (effective ? 1.8 : 0.5)));
  }

  treat(spot) {
    const dmg = this.seitaiDamage(spot);
    this.patient.curHp -= dmg;
    const spotLabel = CHAPTER2.massageBattle.spots[spot];
    if (this.patient.immune) {
      this.addLog(`${spotLabel}を施術した。しかし、もともと悪くない！ ${dmg}ダメージ。`);
    } else if (this.patient.weakSpots.includes(spot)) {
      this.addLog(`効果はばつぐんだ！ ${this.patient.name}に${dmg}のダメージ！`);
    } else {
      this.addLog(`${spotLabel}を施術した。いまいち効果がなかった…… ${dmg}ダメージ。`);
    }
  }

  listen() {
    if (this.patient.weakSpots.length) {
      const hint = this.patient.weakSpots.map(s => CHAPTER2.massageBattle.spots[s]).join("・");
      this.addLog(`話を聞いた。「${hint}」が効きそうだ……。`);
    } else {
      this.addLog("話を聞いた。「どこも悪くないんじゃがなあ……」");
    }
  }

  sell(item) {
    const p = this.state.player;
    const trust = 1 - Math.max(0, this.patient.curHp) / this.patient.hp;
    let chance = 0.3 + (p.salesSkill || 0) * 0.03 + trust * 0.3;
    if (this.patient.sellBonus) chance += 0.3;
    chance = Math.min(0.9, chance);
    const product = CHAPTER2.massageProducts[item];
    if (Math.random() < chance) {
      const price = this.patient.sellBonus ? product.price * 2 : product.price;
      p.gold += price;
      p.salesSkill = (p.salesSkill || 0) + 1;
      this.addLog(`${this.patient.name}は${product.name}を購入した！ G+${price}`);
    } else {
      this.angerBoost += 4;
      this.addLog(`${this.patient.name}は${product.name}を断った。怒っている……`);
    }
  }

  patientTurn() {
    const p = this.state.player;
    const line = this.patient.attackLines[Math.floor(Math.random() * this.patient.attackLines.length)];
    const dmg = Math.max(1, Math.round(this.patient.atk + this.angerBoost + (Math.random() * 4 - 2)));
    p.hp -= dmg;
    this.addLog(`${this.patient.name}：「${line}」\nタナベッカムに${dmg}のダメージ！`);
  }

  finishWin() {
    const p = this.state.player;
    p.seitaiSkill = (p.seitaiSkill || 0) + 1;
    p.gold += this.patient.reward;
    this.state.chapter2.massageWorkCount += 1;
    this.state.chapter2.patientsDefeatedCount = (this.state.chapter2.patientsDefeatedCount || 0) + 1;
    this.addLog(`${this.patient.name}を こらしめた！ G+${this.patient.reward}`);
    this.ended = true;
    this.result = "won";
    saveGame(this.state);
    return true;
  }

  command(cmd, arg) {
    if (this.ended || this.state.player.hp <= 0) return this.ended;
    this.log = [];
    if (cmd === "treat") this.treat(arg);
    else if (cmd === "sell") this.sell(arg);
    else if (cmd === "listen") this.listen();
    else if (cmd === "flee") {
      if (Math.random() < 0.6) {
        this.addLog("その場を離れた。");
        this.ended = true;
        this.result = "fled";
        saveGame(this.state);
        return true;
      }
      this.addLog("逃げられなかった！");
    }
    if (this.patient.curHp <= 0) return this.finishWin();
    this.patientTurn();
    if (this.state.player.hp <= 0) {
      this.state.player.hp = 0;
      this.ended = true;
      this.result = "lost";
      saveGame(this.state);
      return true;
    }
    saveGame(this.state);
    return false;
  }
}
