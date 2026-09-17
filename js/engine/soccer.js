// ===== サッカーパート =====
// 入団テスト用5対5。田辺のみ操作、他はAI。
// パス・シュート・タックルに加え、習得済みなら「お年寄り殺し！」を実戦使用できる。

class SoccerMatch {
  constructor(canvas, state, durationSec, onEnd) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.state = state; this.duration = durationSec; this.elapsed = 0; this.onEnd = onEnd;
    this.W = canvas.width; this.H = canvas.height;
    this.stats = { distance: 0, sprints: 0, pass: 0, shoot: 0, defense: 0, lateActive: 0, special: 0 };
    this.score = { player: 0, cpu: 0 };
    this.ball = { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0, owner: null };
    this.tanabe = { x: this.W / 2, y: this.H - 45, speed: 2.45, team: "player" };
    const lane=(i,n)=>this.W*(i+1)/(n+1);
    this.teammates = [0,1,2,3].map(i => { const x=lane(i,4), y=this.H-180-(i%2)*75; return { x, y, homeX:x, homeY:y, team:"player", ai:true }; });
    this.enemies = [0,1,2,3,4].map(i => { const x=lane(i,5), y=150+(i%2)*80; return { x, y, homeX:x, homeY:y, team:"cpu", ai:true, holdSec:0 }; });
    this.keys = {}; this.mateHoldSec = 0; this.specialUntil = 0; this.bannerUntil = 0; this.mateNoPickupUntil = 0;
    this.pendingGoal = null; this.ballTrail = []; this.tanabeNoPickupUntil = 0;
    this.actionLatch = { shoot:false, pass:false, skill:false, skill2:false, tackle:false, passReq:false };
    // 昇格決定戦：途中出場中のみ使う、金縛り再発〜強制交代の一度きりのスクリプトイベント用
    this.promotionDeciderTriggered = false; this.promotionDeciderForceEndAt = null;
    this.keyDown = e => { this.keys[e.key] = true; };
    this.keyUp = e => { this.keys[e.key] = false; };
    if (state.chapter2 && state.chapter2.paralyzedMatch) { this.bannerText = "身体が、まったく動かない……"; this.bannerUntil = 3.5; }
  }
  enable() { document.addEventListener("keydown", this.keyDown); document.addEventListener("keyup", this.keyUp); this.interval = setInterval(() => this.tick(), 1000/30); }
  disable() { document.removeEventListener("keydown", this.keyDown); document.removeEventListener("keyup", this.keyUp); clearInterval(this.interval); }
  setKey(key,val) { this.keys[key] = val; }
  distTo(a,b) { return Math.hypot(a.x-b.x,a.y-b.y); }
  pressed(key, name) { const now=!!this.keys[key]; const fire=now&&!this.actionLatch[name]; this.actionLatch[name]=now; return fire; }

  trySpecial() {
    const sk = CHAPTER0.skillOjiisanGoroshi;
    if (!this.state.player.learnedSkills.includes(sk.id)) { this.banner("必殺技を覚えていない！"); return; }
    if (this.state.player.luck < sk.luckCost) { this.banner("運が足りない……田辺らしい！"); return; }
    if (this.state.player.stamina < sk.staminaCost) { this.banner("体力が足りない！"); return; }
    this.state.player.stamina -= sk.staminaCost;
    this.specialUntil = this.elapsed + sk.durationSec;
    this.stats.special += 1;
    this.banner("必殺技 お年寄り殺し！ 相手能力30%DOWN");
  }
  banner(text) { this.bannerText=text; this.bannerUntil=this.elapsed+2.2; }

  // 少林寺で習得した必殺技。1試合サイクルにつき1回しか使えない
  // （アップエリアでのアピール使用と試合中の使用は shaolinShotUsedThisMatch を共有する）。
  // 一度使うと、以後は何度ボタンを押しても「ガッツがたりない！」のバナーが出るだけになる。
  // これは仕様どおりの理不尽さであり、使用回数を分ける・自動修正するなどの救済はしない。
  // 昇格決定戦の実試合中は、未使用であっても絶対に決まらない（アピールで使わずに
  // 温存していても、本番では通用しない、という今回の指示書のギャグそのものであり、
  // ここを「せっかく覚えたから撃たせる」ように変更しない）。
  trySpecialShaolin() {
    const sk = CHAPTER2.skillShaolinShoot;
    if (!this.state.player.learnedSkills.includes(sk.id)) return;
    const c2 = this.state.chapter2;
    if (c2 && c2.promotionDeciderMatch) {
      c2.shaolinShotUsedThisMatch = true;
      this.banner("ガッツがたりない！");
      return;
    }
    if (c2 && c2.shaolinShotUsedThisMatch) { this.banner("ガッツがたりない！"); return; }
    if (c2) c2.shaolinShotUsedThisMatch = true;
    this.disable();
    showCutsceneChain([
      { cutin: "assets/cutins/tanabe_serious.png", text: "田辺の目つきが変わった。" },
      { text: "田辺：「くらえ！少林シュート！！」" },
    ], () => {
      const success = Math.random() < sk.successRate;
      if (success) {
        this.score.player++;
        this.banner("少林シュート、決まった！！");
        this.resetBall("cpu");
      } else {
        this.banner("少林シュート……ブロックされた！");
        this.resetBall();
      }
      this.enable();
    });
  }

  // 相手がボールを持っている時に近づいて奪う。成功率はディフェンス練習の熟練度で上がる。
  tryTackle() {
    const target = this.enemies.find(en => this.ball.owner===en && this.distTo(en,this.tanabe)<24);
    if (!target) return;
    // スタミナが低いと守備の成功率も落ちる
    const staminaFactor = Math.min(1, this.state.player.stamina / 50);
    let chance = Math.min(.85, (.3 + this.state.player.soccerSkills.defense*.05) * staminaFactor);
    // J1編は呪いとは別に、田辺自身の守備の実力不足で通用しにくい
    if (this.state.chapter2 && this.state.chapter2.j1Mode) chance = Math.max(.08, chance - CHAPTER2.j1Modifier.tackleChancePenalty);
    if (Math.random()<chance) {
      this.ball.owner=this.tanabe; this.stats.defense++;
      this.state.chapter2.defensiveContribution += 1;
      this.banner("タックル成功！ボールを奪った！");
    } else this.banner("タックル失敗……");
  }

  // 味方がボールを持っている時に、待たずにすぐ田辺へパスさせる。
  // 短い間隔で連打すると「しつこい」とteamTrustが下がり、以後パスが来にくくなる
  requestPass() {
    const mate = this.ball.owner;
    if (!mate || mate.team!=="player" || !mate.ai) return;
    const c2 = this.state.chapter2;
    const spam = (this.elapsed - (this.lastPassReqAt||-999)) < 1.2;
    this.lastPassReqAt = this.elapsed;
    if (c2 && spam) {
      c2.teamTrust = Math.max(0, c2.teamTrust - 8);
      this.banner("しつこい！");
      return;
    }
    const trust = (c2 && c2.teamTrust != null) ? c2.teamTrust : 50;
    if (Math.random() < Math.max(0, (50 - trust) / 150)) {
      this.banner("パスが来ない……");
      return;
    }
    const ang=Math.atan2(this.tanabe.y-mate.y,this.tanabe.x-mate.x);
    this.ball.owner=null; this.ball.vx=Math.cos(ang)*5.5; this.ball.vy=Math.sin(ang)*5.5; this.mateHoldSec=0;
    this.mateNoPickupUntil=this.elapsed+.4;
    this.banner(Math.random() < 0.5 ? "ヘイ！" : "こっち！");
  }

  tick() {
    this.elapsed += 1/30;
    if (this.elapsed >= this.duration) { this.finish(); return; }
    // 昇格決定戦：途中出場している間だけ、試合の半分を過ぎた頃に金縛りが再発し、
    // 数秒後に強制交代で試合が終わる（プレイヤー操作で回避・解除はできない仕様）
    if (this.state.chapter2 && this.state.chapter2.promotionDeciderMatch) {
      if (!this.promotionDeciderTriggered && this.elapsed >= this.duration * 0.55) {
        this.promotionDeciderTriggered = true;
        this.state.chapter2.paralyzedMatch = true;
        this.promotionDeciderForceEndAt = this.elapsed + 3;
        this.banner("タナベッカムは金縛りになった！");
      }
      if (this.promotionDeciderForceEndAt !== null && this.elapsed >= this.promotionDeciderForceEndAt) {
        this.finish();
        return;
      }
    }
    // 完全金縛り試合：田辺の移動・パス・シュート・ドリブル・守備・パス要求を全て無効化する
    const paralyzed = !!(this.state.chapter2 && this.state.chapter2.paralyzedMatch);
    if (!paralyzed) {
      if (this.pressed("z","skill")) this.trySpecial();
      if (this.pressed("v","skill2")) this.trySpecialShaolin();
      if (this.pressed("c","tackle")) this.tryTackle();
      if (this.pressed("r","passReq")) this.requestPass();
    }

    // 第2章・天罰の不遇ルート中は、各所の判定にMISFORTUNE_MODIFIERを反映する
    const misfortune = this.state.chapter2 && this.state.chapter2.misfortuneMode;
    const mm = CHAPTER2.misfortuneModifier;
    // ヒグチビッチ加入後、途中出場した試合ではなかなかパスが来ない（天罰とは別枠）
    const subIn = this.state.chapter2 && this.state.chapter2.benchMode && !misfortune;
    // J1編は天罰とは別に、相手が常に一段強い（呪いが解けても解除されない）
    const j1 = this.state.chapter2 && this.state.chapter2.j1Mode;
    const jm = CHAPTER2.j1Modifier;

    const sk = this.state.player.soccerSkills;
    let dx=0,dy=0;
    if (!paralyzed) {
      if(this.keys["ArrowLeft"])dx--; if(this.keys["ArrowRight"])dx++;
      if(this.keys["ArrowUp"])dy--; if(this.keys["ArrowDown"])dy++;
    }
    // 走り込み練習は基礎速度、ドリブル練習はボール保持中の速度に効く
    const runBonus=1+sk.run*.02;
    const dribbleBonus=(this.ball.owner===this.tanabe)?1+sk.dribble*.03:1;
    const spd=this.tanabe.speed*runBonus*dribbleBonus;
    if(dx||dy){const n=Math.hypot(dx,dy)||1;this.tanabe.x=Math.max(12,Math.min(this.W-12,this.tanabe.x+dx/n*spd));this.tanabe.y=Math.max(15,Math.min(this.H-15,this.tanabe.y+dy/n*spd));this.stats.distance+=spd;if(this.elapsed>this.duration*.7)this.stats.lateActive+=1/30;}

    if(!paralyzed&&!this.ball.owner&&!this.pendingGoal&&this.elapsed>=this.tanabeNoPickupUntil&&this.distTo(this.ball,this.tanabe)<17)this.ball.owner=this.tanabe;
    if(this.ball.owner===this.tanabe){
      this.ball.x=this.tanabe.x;this.ball.y=this.tanabe.y-13;
      if(this.pressed(" ","shoot")){
        this.stats.shoot++; this.ball.owner=null; this.ball.vy=-9; this.ball.vx=(Math.random()-.5)*3;
        // ゴール正面（横のズレが小さい）かつ相手陣内に近いほど成功率が上がる
        const distX=Math.abs(this.tanabe.x-this.W/2);
        const alignFactor=Math.max(0,1-distX/130);
        const rangeFactor=this.tanabe.y<this.H*.3?1:(this.tanabe.y<this.H*.5?.55:.2);
        let shotChance=Math.min(.88,.14+sk.shoot*.035+alignFactor*.3*rangeFactor);
        if(misfortune)shotChance-=mm.mateShootRatePenalty;
        if(j1)shotChance-=jm.playerShotChancePenalty;
        shotChance=Math.max(.05,shotChance);
        if(Math.random()<shotChance){
          // 天罰中はポストに嫌われることがある（得点にはせず、こぼれ球にする）
          if(misfortune&&Math.random()<mm.postEventRate){this.banner("ポストに嫌われた……");this.ball.owner=null;this.ball.vx=(Math.random()-.5)*3;this.ball.vy=-3;}
          else this.pendingGoal={concedeTeam:"cpu",scorer:"player",targetX:this.W/2+(Math.random()-.5)*60,targetY:8};
        }
      } else if(this.pressed("x","pass")){
        this.stats.pass++;
        const passSpeed=5.5+sk.pass*.25;
        if(dx||dy){
          // パス練習が身についていると、狙った方向へそのまま強く速いパスが出る
          const n=Math.hypot(dx,dy)||1;
          this.ball.owner=null; this.ball.vx=dx/n*passSpeed; this.ball.vy=dy/n*passSpeed;
        } else {
          const mate=this.teammates[Math.floor(Math.random()*this.teammates.length)];
          const ang=Math.atan2(mate.y-this.tanabe.y,mate.x-this.tanabe.x); this.ball.owner=null; this.ball.vx=Math.cos(ang)*passSpeed;this.ball.vy=Math.sin(ang)*passSpeed;
        }
        // 出したばかりの自分のパスを、その場に立ったまま即座に拾い直さないようにする
        this.tanabeNoPickupUntil=this.elapsed+.35;
      }
    } else if(this.ball.owner&&this.ball.owner.team==="player"&&this.ball.owner.ai){
      const mate=this.ball.owner;this.ball.x=mate.x;this.ball.y=mate.y-10;this.mateHoldSec+=1/30;
      if(this.mateHoldSec>=.55){
        // 天罰中・ヒグチビッチからの途中出場中は田辺へのパス頻度が下がる
        // （パス要求ボタンで呼び込む前提）。0にはしない。
        let passToTanabeChance=1;
        if(misfortune)passToTanabeChance=Math.max(.15,1-mm.passToTanabeRatePenalty-mm.matePassAccuracyPenalty);
        else if(subIn){
          const trust=(this.state.chapter2&&this.state.chapter2.teamTrust!=null)?this.state.chapter2.teamTrust:50;
          passToTanabeChance=Math.max(.15,1-CHAPTER2.subInPassPenalty-Math.max(0,50-trust)*0.004);
        }
        if(Math.random()<passToTanabeChance){
          const ang=Math.atan2(this.tanabe.y-mate.y,this.tanabe.x-mate.x);this.ball.owner=null;this.ball.vx=Math.cos(ang)*5.5;this.ball.vy=Math.sin(ang)*5.5;this.mateHoldSec=0;this.mateNoPickupUntil=this.elapsed+.4;
        } else { this.mateHoldSec=.3; }
      }
    } else if(this.pendingGoal){
      // シュートが決まった判定はすぐ出さず、ボールを実際にゴールまで一定速度で飛ばしてから得点・リセットする
      // （通常の浮き球のような減速はさせない＝遠くからのシュートでも必ずゴールへ届く）
      const pg=this.pendingGoal;
      const dgx=pg.targetX-this.ball.x, dgy=pg.targetY-this.ball.y, dg=Math.hypot(dgx,dgy)||1;
      const shotSpeed=8;
      if(dg<=shotSpeed){
        this.ball.x=pg.targetX; this.ball.y=pg.targetY;
        if(pg.scorer==="player"){this.score.player++;this.banner("GOAL！");}
        else{this.score.cpu++;this.banner("失点……");}
        this.resetBall(pg.concedeTeam);
        this.pendingGoal=null;
      } else {
        this.ball.x+=dgx/dg*shotSpeed; this.ball.y+=dgy/dg*shotSpeed;
      }
    } else if(!this.ball.owner){this.ball.x+=this.ball.vx;this.ball.y+=this.ball.vy;this.ball.vx*=.985;this.ball.vy*=.985;}

    // ボールの軌道を残像で見せる（シュート・パスが一瞬でワープしたように見えないように）
    this.ballTrail.push({x:this.ball.x,y:this.ball.y});
    if(this.ballTrail.length>7)this.ballTrail.shift();

    // 味方も棒立ちにせず、ボールへの反応や攻め上がりで動かす。ただし田辺のすぐ近くのボールは
    // 横取りせず、田辺自身が取れるように優先させる（そこだけ支援位置で待つ）。
    const ballLoose=!this.ball.owner;
    const cpuHasBall=this.ball.owner&&this.ball.owner.team==="cpu";
    const playerHasBall=this.ball.owner===this.tanabe||(this.ball.owner&&this.ball.owner.team==="player"&&this.ball.owner.ai);
    const ballNearTanabe=this.distTo(this.ball,this.tanabe)<40;
    let nearestMate=null,nearestMateDist=Infinity;
    this.teammates.forEach(m=>{ if(m===this.ball.owner) return; const d=this.distTo(m,this.ball); if(d<nearestMateDist){nearestMateDist=d;nearestMate=m;} });
    // 天罰中は味方の反応が鈍る（AI判断力低下）
    const mateSpeed=misfortune?1.25*(1-mm.mateAiPenalty):1.25;
    const pickupRadius=misfortune?13-mm.reboundToEnemyBonus*20:13;
    this.teammates.forEach(m=>{
      if(m===this.ball.owner) return;
      let tx,ty;
      if((ballLoose||cpuHasBall)&&!ballNearTanabe){
        if(m===nearestMate){tx=this.ball.x;ty=this.ball.y;}
        else{tx=m.homeX*.8+this.ball.x*.2;ty=m.homeY*.8+this.ball.y*.2;}
      } else if(playerHasBall){tx=m.homeX;ty=Math.max(20,m.homeY-55);}
      else{tx=m.homeX*.8+this.ball.x*.2;ty=m.homeY*.8+this.ball.y*.2;}
      const dxm=tx-m.x,dym=ty-m.y,dm=Math.hypot(dxm,dym);
      if(dm>4){m.x+=dxm/dm*mateSpeed;m.y+=dym/dm*mateSpeed;}
      m.x=Math.max(12,Math.min(this.W-12,m.x));m.y=Math.max(15,Math.min(this.H-15,m.y));
      // 田辺の近くのボールは田辺優先。味方はそれ以外の浮き球だけ拾う。
      if(!this.ball.owner&&!this.pendingGoal&&!ballNearTanabe&&this.elapsed>=this.mateNoPickupUntil&&this.distTo(m,this.ball)<pickupRadius)this.ball.owner=m;
    });

    const debuffed=this.elapsed<this.specialUntil;
    let enemySpeed=debuffed?1.05:1.5;
    if(j1)enemySpeed*=jm.enemySpeedMultiplier;
    // 敵もボールへ丸ごと群がらず、一番近い1人だけがプレスして、残りは陣形を保って
    // ボール側へじわっと寄る。ボールを持ったら少し保持した後、前にいる味方へパスを回す。
    let nearestEnemy=null,nearestEnemyDist=Infinity;
    this.enemies.forEach(en=>{ if(en===this.ball.owner) return; const d=this.distTo(en,this.ball); if(d<nearestEnemyDist){nearestEnemyDist=d;nearestEnemy=en;} });
    this.enemies.forEach(en=>{
      if(en===this.ball.owner) return;
      let tx,ty;
      if(en===nearestEnemy){tx=this.ball.x;ty=this.ball.y;}
      else{tx=en.homeX*.75+this.ball.x*.25;ty=en.homeY*.75+this.ball.y*.25;}
      const dxe=tx-en.x,dye=ty-en.y,de=Math.hypot(dxe,dye);
      if(de>4){en.x+=dxe/de*enemySpeed;en.y+=dye/de*enemySpeed;}
      en.x=Math.max(12,Math.min(this.W-12,en.x));en.y=Math.max(15,Math.min(this.H-15,en.y));
      const enemyPickupRadius=misfortune?13+mm.reboundToEnemyBonus*20:13;
      if(!this.ball.owner&&!this.pendingGoal&&this.distTo(en,this.ball)<enemyPickupRadius){this.ball.owner=en; en.holdSec=0; if(this.distTo(en,this.tanabe)<22)this.stats.defense++;}
    });
    this.enemies.forEach(en=>{
      if(this.ball.owner!==en) return;
      this.ball.x=en.x;this.ball.y=en.y+12; en.holdSec=(en.holdSec||0)+1/30;
      if(en.holdSec<.5) return;
      const better=this.enemies.filter(o=>o!==en).sort((a,b)=>a.y-b.y)[0];
      if(better&&Math.random()<(debuffed?.02:.035)){
        const ang=Math.atan2(better.y-en.y,better.x-en.x);
        this.ball.owner=null;this.ball.vx=Math.cos(ang)*5.5;this.ball.vy=Math.sin(ang)*5.5;en.holdSec=0;
      } else if(en.y>this.H*.55&&Math.random()<(debuffed?.008:.014)){
        this.ball.owner=null;this.ball.vy=6;
        let cpuShotChance=(debuffed?.08:.18);
        if(misfortune)cpuShotChance+=mm.enemyShootRateBonus+mm.unluckyConcedeRate;
        if(j1)cpuShotChance+=jm.enemyShootRateBonus;
        if(Math.random()<cpuShotChance){this.pendingGoal={concedeTeam:"player",scorer:"cpu",targetX:this.W/2+(Math.random()-.5)*60,targetY:this.H-8};}
      }
    });

    // ボールが画面外へ行ったらセンターへ（得点によるものではないのでキックオフ側の指定なし）
    if(!this.pendingGoal&&(this.ball.x<-20||this.ball.x>this.W+20||this.ball.y<-20||this.ball.y>this.H+20))this.resetBall();
    this.render();
  }
  // concedeTeam: 失点した側。そのままセンターサークルからそのチームのボールで再開する
  resetBall(concedeTeam){
    this.ball.owner=null;this.ball.x=this.W/2;this.ball.y=this.H/2;this.ball.vx=0;this.ball.vy=0;
    if(concedeTeam==="cpu"){const en=this.enemies[0];en.x=this.W/2-10;en.y=this.H/2+18;this.ball.owner=en;}
    else if(concedeTeam==="player"){this.tanabe.x=this.W/2;this.tanabe.y=this.H/2+18;this.ball.owner=this.tanabe;}
  }
  finish(){
    this.disable();
    const c2 = this.state.chapter2;
    const promotionDecider = !!(c2 && c2.promotionDeciderMatch);
    // 完全金縛り試合は、味方だけで勝ち越してしまった場合でも確定敗北にする
    // （昇格決定戦の金縛りは専用の強制交代フローで処理するため対象外にする）
    if (c2 && c2.paralyzedMatch && !promotionDecider && this.score.player >= this.score.cpu) {
      this.score.cpu = this.score.player + 1;
    }
    let promotionDeciderForcedSub = false;
    if (promotionDecider) {
      c2.paralyzedMatch = false;
      c2.promotionDeciderMatch = false;
      promotionDeciderForcedSub = true;
    }
    saveGame(this.state);
    this.onEnd({distance:Math.round(this.stats.distance),sprintSec:Math.round(this.stats.sprints),lateActiveSec:Math.round(this.stats.lateActive),pass:this.stats.pass,shoot:this.stats.shoot,defense:this.stats.defense,special:this.stats.special,goals:this.score.player,conceded:this.score.cpu,passed:true,promotionDeciderForcedSub});
  }

  render(){
    const c=this.ctx; c.clearRect(0,0,this.W,this.H);
    const bg=getImage("assets/maps/practice_map.png?v=1");
    if(bg){const sc=Math.max(this.W/bg.width,this.H/bg.height),sw=this.W/sc,sh=this.H/sc,sx=(bg.width-sw)/2,sy=(bg.height-sh)/2;c.drawImage(bg,sx,sy,sw,sh,0,0,this.W,this.H);}
    else{c.fillStyle="#2e7d32";c.fillRect(0,0,this.W,this.H);}
    c.save();c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=2;c.strokeRect(12,12,this.W-24,this.H-24);c.beginPath();c.moveTo(12,this.H/2);c.lineTo(this.W-12,this.H/2);c.stroke();c.beginPath();c.arc(this.W/2,this.H/2,36,0,Math.PI*2);c.stroke();
    // goals
    c.strokeRect(this.W/2-55,12,110,22);c.strokeRect(this.W/2-55,this.H-34,110,22);c.restore();
    const drawPlayer=(o,color)=>{c.fillStyle=color;c.beginPath();c.arc(o.x,o.y,8,0,Math.PI*2);c.fill();c.strokeStyle="#fff";c.stroke();};
    // 選手はドット絵の味方／敵スプライトで統一表示。読み込み前は従来の丸に自動フォールバック。
    const teamSprite=getImage("assets/characters/soccer_teammate.png");
    const enemySprite=getImage("assets/characters/soccer_enemy.png");
    this.teammates.forEach(m=>{if(teamSprite)c.drawImage(teamSprite,m.x-9,m.y-15,18,26);else drawPlayer(m,"#1976d2");});
    const debuffed=this.elapsed<this.specialUntil;
    this.enemies.forEach(e=>{
      if(enemySprite){c.save();if(debuffed)c.globalAlpha=.55;c.drawImage(enemySprite,e.x-9,e.y-15,18,26);c.restore();}
      else drawPlayer(e,debuffed?"#b07b7b":"#d32f2f");
    });
    const ti=getImage("assets/characters/tanabe.png?v=2");if(ti)c.drawImage(ti,this.tanabe.x-12,this.tanabe.y-18,24,34);else drawPlayer(this.tanabe,"#ffd54f");
    // 呪いレベル分の💩を田辺の頭上に常時表示
    if(this.state.chapter2&&this.state.chapter2.curseLevel>=1){
      const n=this.state.chapter2.curseLevel;
      c.save();c.font="16px 'Noto Color Emoji',sans-serif";c.textAlign="center";
      for(let i=0;i<n;i++)c.fillText("💩",this.tanabe.x+(i-(n-1)/2)*12,this.tanabe.y-26);
      c.restore();
    }
    // ボールの軌跡（シュート・パスがワープに見えないよう、通ってきた道を薄く残す）
    for(let i=0;i<this.ballTrail.length-1;i++){
      const p=this.ballTrail[i];
      c.save();c.globalAlpha=(i+1)/(this.ballTrail.length+1)*.4;c.fillStyle="#fff";
      c.beginPath();c.arc(p.x,p.y,3,0,Math.PI*2);c.fill();c.restore();
    }
    c.save();c.fillStyle="rgba(0,0,0,.25)";c.beginPath();c.ellipse(this.ball.x,this.ball.y+7,7,3,0,0,Math.PI*2);c.fill();
    c.font="22px 'Noto Color Emoji',sans-serif";c.textAlign="center";c.textBaseline="middle";c.fillText("⚽",this.ball.x,this.ball.y);c.restore();
    c.fillStyle="rgba(0,0,0,.72)";c.fillRect(0,0,this.W,52);c.fillStyle="#fff";c.font="bold 15px sans-serif";c.fillText(`田辺 ${this.score.player} - ${this.score.cpu} 相手`,14,22);c.font="12px sans-serif";c.fillText(`残り ${Math.max(0,Math.ceil(this.duration-this.elapsed))}秒`,14,41);
    c.fillStyle="rgba(0,0,0,.68)";c.fillRect(0,this.H-38,this.W,38);c.font="12px sans-serif";c.fillStyle="#fff";c.fillText(`体力 ${Math.ceil(this.state.player.stamina)}  運 ${this.state.player.luck}`,14,this.H-15);
    if(this.elapsed<this.specialUntil){c.fillStyle="#ffeb3b";c.textAlign="right";c.fillText(`必殺技 ${Math.ceil(this.specialUntil-this.elapsed)}秒`,this.W-12,this.H-15);c.textAlign="left";}
    if(this.elapsed<this.bannerUntil){c.fillStyle="rgba(0,0,0,.82)";c.fillRect(20,this.H/2-42,this.W-40,84);c.fillStyle="#fff";c.font="bold 17px sans-serif";c.textAlign="center";const text=this.bannerText||"";if(text.length>22){c.fillText(text.slice(0,22),this.W/2,this.H/2-4);c.fillText(text.slice(22),this.W/2,this.H/2+20);}else c.fillText(text,this.W/2,this.H/2+7);c.textAlign="left";}
  }
}
