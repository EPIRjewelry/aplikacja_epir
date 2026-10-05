/**
 * Jedna tura kupującego na sesję: następne pytanie czeka, aż ta odda jedną odpowiedź.
 * Inaczej historia układa się user, user, assistant i odpowiedź ląduje pod złym pytaniem.
 */

type Waiter = {
  turnId: string;
  resume: () => void;
  timer: ReturnType<typeof setTimeout>;
};

export class BuyerTurnGate {
  private active: string | null = null;
  private waiters: Waiter[] = [];

  constructor(private readonly waitMs = 20_000) {}

  begin(turnId: string): Promise<void> {
    if (!this.active) {
      this.active = turnId;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.turnId !== turnId);
        this.active = turnId;
        resolve();
      }, this.waitMs);
      this.waiters.push({
        turnId,
        timer,
        resume: () => {
          clearTimeout(timer);
          this.active = turnId;
          resolve();
        },
      });
    });
  }

  end(turnId: string): void {
    const waiting = this.waiters.find((waiter) => waiter.turnId === turnId);
    if (waiting) {
      clearTimeout(waiting.timer);
      this.waiters = this.waiters.filter((waiter) => waiter.turnId !== turnId);
    }
    if (this.active !== turnId) return;
    const next = this.waiters.shift();
    if (next) next.resume();
    else this.active = null;
  }
}
