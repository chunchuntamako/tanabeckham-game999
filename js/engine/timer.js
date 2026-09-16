// ===== 残り時間タイマー / 日数管理 =====
// 「日数」と「残り時間」は別管理。ゲームを開いている間だけ減少。

class GameTimer {
  constructor(state, onTimeUp) {
    this.state = state;
    this.onTimeUp = onTimeUp;
    this.intervalId = null;
    this.active = false;
  }

  start() {
    if (this.intervalId) return;
    this.active = true;
    this.intervalId = setInterval(() => {
      if (!this.active) return;
      if (this.state.flags.prologueClear) return;
      if (this.state.remainingSec > 0) {
        this.state.remainingSec -= 1;
        if (this.state.remainingSec <= 0) {
          this.state.remainingSec = 0;
          this.onTimeUp();
        }
      }
    }, 1000);
  }

  pause() { this.active = false; }
  resume() { this.active = true; }

  // 宿屋・整体研修などで時間を消費し、翌日へ進める
  consumeAndAdvanceDay(seconds) {
    this.state.remainingSec = Math.max(0, this.state.remainingSec - seconds);
    this.state.day += 1;
    // 呼び出し側がセーブや画面処理を終えてから時間切れイベントを出せるよう、
    // ここでは直接 onTimeUp を呼ばず true/false を返す。
    return this.state.remainingSec <= 0;
  }

  consume(seconds) {
    this.state.remainingSec = Math.max(0, this.state.remainingSec - seconds);
    return this.state.remainingSec <= 0;
  }

  formatTime() {
    const s = this.state.remainingSec;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
}

// ===== 第2章：次の公式戦までのタイマー =====
// 序章のGameTimerとは別物。残り時間を減らすのではなく、自由行動中に
// 実際にプレイした秒数をカウントし、CHAPTER2.matchIntervalSecに達したら
// onMatchDueを呼ぶ（試合中や会話中はmain.js側でpause/resumeする想定）。
class Chapter2Timer {
  constructor(state, onMatchDue) {
    this.state = state;
    this.onMatchDue = onMatchDue;
    this.intervalId = null;
    this.active = false;
  }

  start() {
    if (this.intervalId) return;
    this.active = true;
    this.intervalId = setInterval(() => {
      if (!this.active) return;
      const c2 = this.state.chapter2;
      if (!c2 || !c2.started || c2.cleared) return;
      if (c2.nextMatchTimerSec > 0) {
        c2.nextMatchTimerSec -= 1;
        if (c2.nextMatchTimerSec <= 0) {
          c2.nextMatchTimerSec = 0;
          this.onMatchDue();
        }
      }
    }, 1000);
  }

  pause() { this.active = false; }
  resume() { this.active = true; }

  formatTime() {
    const s = this.state.chapter2 ? Math.max(0, this.state.chapter2.nextMatchTimerSec) : 0;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
}
