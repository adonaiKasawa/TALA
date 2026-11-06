// Only active playback calls sample(); prefetching never creates an impression.
export class WatchTracker {
  private lastTime: number | null = null;
  private lastPosition = 0;
  private total = 0;
  private sequence = 0;
  private sentAt = 0;
  private pending = Promise.resolve();
  private closed = false;
  constructor(
    private readonly send: (body: {
      sequence: number;
      event: string;
      watchedMs: number;
      positionMs: number;
    }) => Promise<unknown>,
    private readonly clock = () => performance.now(),
  ) {}
  sample(position: number, playing: boolean) {
    const now = this.clock(),
      delta = position - this.lastPosition;
    if (playing && this.lastTime !== null && delta > 0 && delta < 2)
      this.total += Math.max(0, Math.min(now - this.lastTime, delta * 1000));
    this.lastTime = now;
    this.lastPosition = position;
    if (playing && now - this.sentAt > 10000) this.emit("progress");
  }
  emit(event: string) {
    if (this.closed) return;
    this.sentAt = this.clock();
    const body = {
      sequence: ++this.sequence,
      event,
      watchedMs: Math.max(0, Math.round(this.total)),
      positionMs: Math.max(0, Math.round(this.lastPosition * 1000)),
    };
    this.pending = this.pending
      .then(() => this.send(body))
      .then(() => undefined)
      .catch(() => undefined);
  }
  finish() {
    this.emit("skip");
    this.closed = true;
    return this.pending;
  }
}
