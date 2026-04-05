import type { TimerState } from './types.js';

export function createTimer(opId: string, minutes: number): TimerState {
  const totalSeconds = Math.round(minutes * 60);
  return { opId, totalSeconds, remainingSeconds: totalSeconds, running: true };
}

export function tickTimer(timer: TimerState): TimerState {
  if (!timer.running || timer.remainingSeconds <= 0) return timer;
  const remainingSeconds = timer.remainingSeconds - 1;
  return {
    ...timer,
    remainingSeconds,
    running: remainingSeconds > 0,
  };
}

export function cancelTimer(timer: TimerState): TimerState {
  return { ...timer, running: false };
}

export function isTimerDone(timer: TimerState): boolean {
  return timer.remainingSeconds <= 0;
}

export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
