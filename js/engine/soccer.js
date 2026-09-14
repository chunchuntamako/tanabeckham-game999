// ===== サッカーパート =====
// 入団テスト用5対5。田辺のみ操作、他はAI。
// パス・シュート・ダッシュに加え、習得済みなら「お年寄り殺し！」を実戦使用できる。

class SoccerMatch {
  constructor(canvas, state, durationSec, onEnd) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d");
    this.state = state; this.duration = durationSec; this.elapsed = 0; this.onEnd = onEnd;
    this.W = canvas.width; this.H = canvas.height;
    this.stats = { distance: 0, sprints: 0, pass: 0, shoot: 0, defense: 0, lateActive: 0, special: 0 };
    this.score = { player: 0, cpu: 0 };
    this.ball = { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0, owner: null };
    this.tanabe = { x: this.W / 2, y: this.H - 45, speed: 2.45, team: "player" };
    const availableParty=(state.party||[]).filter(m=>!m.dead);
    const lane=(i,n)=>this.W*(i+1)/(n+1);
    this.teammates = [0,1,2,3].map(i => ({ x: lane(i,4), y: this.H - 180 - (i%2)*75, team: "player", ai: true, sprite: availableParty[i] ? availableParty[i].sprite : null }));
    this.enemies = [0,1,2,3,4].map(i => ({ x: lane(i,5), y: 150 + (i%2)*80, team: "cpu", ai: true }));
    this.keys = {}; this.mateHoldSec = 0; this.specialUntil = 0; this.bannerUntil = 0;
    this.actionLatch = { shoot:false, pass:false, skill:false };
    this.keyDown = e => { this.keys[e.key] = true; };
    this.keyUp = e => { this.keys[e.key] = false; };
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

  tick() {
    this.elapsed += 1/30;
    if (this.elapsed >= this.duration) { this.finish(); return; }
    if (this.pressed("z","skill")) this.trySpecial();

    let dx=0,dy=0;
    if(this.keys["ArrowLeft"])dx--; if(this.keys["ArrowRight"])dx++;
    if(this.keys["ArrowUp"])dy--; if(this.keys["ArrowDown"])dy++;
    const sprinting=this.keys["Shift"] && this.state.player.stamina>0;
    const spd=this.tanabe.speed*(sprinting?1.62:1);
    if(dx||dy){const n=Math.hypot(dx,dy)||1;this.tanabe.x=Math.max(12,Math.min(this.W-12,this.tanabe.x+dx/n*spd));this.tanabe.y=Math.max(15,Math.min(this.H-15,this.tanabe.y+dy/n*spd));this.stats.distance+=spd;if(sprinting){this.stats.sprints+=1/30;this.state.player.stamina=Math.max(0,this.state.player.stamina-0.07);}if(this.elapsed>this.duration*.7)this.stats.lateActive+=1/30;}

    if(!this.ball.owner&&this.distTo(this.ball,this.tanabe)<17)this.ball.owner=this.tanabe;
    if(this.ball.owner===this.tanabe){
      this.ball.x=this.tanabe.x;this.ball.y=this.tanabe.y-13;
      if(this.pressed(" ","shoot")){
        this.stats.shoot++; this.ball.owner=null; this.ball.vy=-9; this.ball.vx=(Math.random()-.5)*3;
        const shotChance=Math.min(.82,.22+this.state.player.soccerSkills.shoot*.045+(this.tanabe.y<this.H*.5?.18:0));
        if(Math.random()<shotChance){this.score.player++;this.banner("GOAL！");this.resetBall();}
      } else if(this.pressed("x","pass")){
        this.stats.pass++; const mate=this.teammates[Math.floor(Math.random()*this.teammates.length)];
        const ang=Math.atan2(mate.y-this.tanabe.y,mate.x-this.tanabe.x); this.ball.owner=null; this.ball.vx=Math.cos(ang)*6;this.ball.vy=Math.sin(ang)*6;
      }
    } else if(this.ball.owner&&this.ball.owner.team==="player"&&this.ball.owner.ai){
      const mate=this.ball.owner;this.ball.x=mate.x;this.ball.y=mate.y-10;this.mateHoldSec+=1/30;
      if(this.mateHoldSec>=.55){const ang=Math.atan2(this.tanabe.y-mate.y,this.tanabe.x-mate.x);this.ball.owner=null;this.ball.vx=Math.cos(ang)*5.5;this.ball.vy=Math.sin(ang)*5.5;this.mateHoldSec=0;}
    } else if(!this.ball.owner){this.ball.x+=this.ball.vx;this.ball.y+=this.ball.vy;this.ball.vx*=.985;this.ball.vy*=.985;}

    const debuffed=this.elapsed<this.specialUntil;
    const enemySpeed=debuffed?1.05:1.5;
    this.enemies.forEach(en=>{
      if(this.distTo(en,this.ball)>5){const a=Math.atan2(this.ball.y-en.y,this.ball.x-en.x);en.x+=Math.cos(a)*enemySpeed;en.y+=Math.sin(a)*enemySpeed;}
      if(!this.ball.owner&&this.distTo(en,this.ball)<13){this.ball.owner=en; if(this.distTo(en,this.tanabe)<22)this.stats.defense++;}
      if(this.ball.owner===en){this.ball.x=en.x;this.ball.y=en.y+12; if(en.y>this.H*.55&&Math.random()<(debuffed?.008:.014)){this.ball.owner=null;this.ball.vy=6;if(Math.random()<(debuffed?.08:.18)){this.score.cpu++;this.banner("失点……");this.resetBall();}}}
    });

    // ボールが画面外へ行ったらセンターへ
    if(this.ball.x<-20||this.ball.x>this.W+20||this.ball.y<-20||this.ball.y>this.H+20)this.resetBall();
    this.render();
  }
  resetBall(){this.ball.owner=null;this.ball.x=this.W/2;this.ball.y=this.H/2;this.ball.vx=0;this.ball.vy=0;}
  finish(){this.disable();saveGame(this.state);this.onEnd({distance:Math.round(this.stats.distance),sprintSec:Math.round(this.stats.sprints),lateActiveSec:Math.round(this.stats.lateActive),pass:this.stats.pass,shoot:this.stats.shoot,defense:this.stats.defense,special:this.stats.special,goals:this.score.player,conceded:this.score.cpu,passed:true});}

  render(){
    const c=this.ctx; c.clearRect(0,0,this.W,this.H);
    const bg=getImage("assets/backgrounds/field.png");
    if(bg){const sc=Math.max(this.W/bg.width,this.H/bg.height),sw=this.W/sc,sh=this.H/sc,sx=(bg.width-sw)/2,sy=(bg.height-sh)/2;c.drawImage(bg,sx,sy,sw,sh,0,0,this.W,this.H);}
    else{c.fillStyle="#2e7d32";c.fillRect(0,0,this.W,this.H);}
    c.save();c.strokeStyle="rgba(255,255,255,.9)";c.lineWidth=2;c.strokeRect(12,12,this.W-24,this.H-24);c.beginPath();c.moveTo(12,this.H/2);c.lineTo(this.W-12,this.H/2);c.stroke();c.beginPath();c.arc(this.W/2,this.H/2,36,0,Math.PI*2);c.stroke();
    // goals
    c.strokeRect(this.W/2-55,12,110,22);c.strokeRect(this.W/2-55,this.H-34,110,22);c.restore();
    const drawPlayer=(o,color)=>{c.fillStyle=color;c.beginPath();c.arc(o.x,o.y,8,0,Math.PI*2);c.fill();c.strokeStyle="#fff";c.stroke();};
    this.teammates.forEach(m=>{const mi=m.sprite?getImage(m.sprite):null;if(mi)c.drawImage(mi,m.x-10,m.y-15,20,28);else drawPlayer(m,"#1976d2");});this.enemies.forEach(e=>drawPlayer(e,this.elapsed<this.specialUntil?"#b07b7b":"#d32f2f"));
    const ti=getImage("assets/characters/tanabe.png?v=2");if(ti)c.drawImage(ti,this.tanabe.x-12,this.tanabe.y-18,24,34);else drawPlayer(this.tanabe,"#ffd54f");
    c.fillStyle="#fff";c.beginPath();c.arc(this.ball.x,this.ball.y,5,0,Math.PI*2);c.fill();c.strokeStyle="#111";c.stroke();
    c.fillStyle="rgba(0,0,0,.72)";c.fillRect(0,0,this.W,52);c.fillStyle="#fff";c.font="bold 15px sans-serif";c.fillText(`田辺 ${this.score.player} - ${this.score.cpu} 相手`,14,22);c.font="12px sans-serif";c.fillText(`残り ${Math.max(0,Math.ceil(this.duration-this.elapsed))}秒`,14,41);
    c.fillStyle="rgba(0,0,0,.68)";c.fillRect(0,this.H-38,this.W,38);c.font="12px sans-serif";c.fillStyle="#fff";c.fillText(`体力 ${Math.ceil(this.state.player.stamina)}  運 ${this.state.player.luck}`,14,this.H-15);
    if(this.elapsed<this.specialUntil){c.fillStyle="#ffeb3b";c.textAlign="right";c.fillText(`必殺技 ${Math.ceil(this.specialUntil-this.elapsed)}秒`,this.W-12,this.H-15);c.textAlign="left";}
    if(this.elapsed<this.bannerUntil){c.fillStyle="rgba(0,0,0,.82)";c.fillRect(20,this.H/2-42,this.W-40,84);c.fillStyle="#fff";c.font="bold 17px sans-serif";c.textAlign="center";const text=this.bannerText||"";if(text.length>22){c.fillText(text.slice(0,22),this.W/2,this.H/2-4);c.fillText(text.slice(22),this.W/2,this.H/2+20);}else c.fillText(text,this.W/2,this.H/2+7);c.textAlign="left";}
  }
}
