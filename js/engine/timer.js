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
