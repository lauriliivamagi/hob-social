import type { ReactiveController, ReactiveControllerHost } from 'lit';

export interface TimerCallbacks {
  onTick(opId: string): void;
  onDone(opId: string): void;
}

export class TimerController implements ReactiveController {
  private _host: ReactiveControllerHost;
  private _intervals = new Map<string, ReturnType<typeof setInterval>>();
  private _callbacks: TimerCallbacks;

  constructor(host: ReactiveControllerHost, callbacks: TimerCallbacks) {
    this._host = host;
    this._callbacks = callbacks;
    host.addController(this);
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    this.cancelAll();
  }

  start(opId: string, _seconds: number): void {
    this.cancel(opId);
    const interval = setInterval(() => {
      this._callbacks.onTick(opId);
    }, 1000);
    this._intervals.set(opId, interval);
  }

  cancel(opId: string): void {
    const interval = this._intervals.get(opId);
    if (interval) {
      clearInterval(interval);
      this._intervals.delete(opId);
    }
  }

  done(opId: string): void {
    this.cancel(opId);
    this._callbacks.onDone(opId);
  }

  cancelAll(): void {
    for (const interval of this._intervals.values()) {
      clearInterval(interval);
    }
    this._intervals.clear();
  }

  get activeCount(): number {
    return this._intervals.size;
  }
}
