import { describe, it, expect } from 'vitest';
import { nextStep, prevStep, jumpToStep, isFirstStep, isLastStep } from './step-navigation.js';
import { createTimer, tickTimer, cancelTimer, isTimerDone, formatTime } from './timer.js';

describe('step navigation', () => {
  it('nextStep advances by 1', () => {
    expect(nextStep(0, 5)).toBe(1);
  });

  it('nextStep at last step stays at last', () => {
    expect(nextStep(4, 5)).toBe(4);
  });

  it('prevStep decrements by 1', () => {
    expect(prevStep(3)).toBe(2);
  });

  it('prevStep at 0 stays at 0', () => {
    expect(prevStep(0)).toBe(0);
  });

  it('jumpToStep clamps to valid range', () => {
    expect(jumpToStep(-1, 5)).toBe(0);
    expect(jumpToStep(10, 5)).toBe(4);
    expect(jumpToStep(2, 5)).toBe(2);
  });

  it('isFirstStep returns true at 0', () => {
    expect(isFirstStep(0)).toBe(true);
    expect(isFirstStep(1)).toBe(false);
  });

  it('isLastStep returns true at total - 1', () => {
    expect(isLastStep(4, 5)).toBe(true);
    expect(isLastStep(3, 5)).toBe(false);
  });
});

describe('timer', () => {
  it('createTimer sets correct totalSeconds', () => {
    const timer = createTimer('op-1', 5);
    expect(timer.totalSeconds).toBe(300);
    expect(timer.remainingSeconds).toBe(300);
    expect(timer.running).toBe(true);
  });

  it('tickTimer decrements by 1', () => {
    const timer = createTimer('op-1', 1);
    const ticked = tickTimer(timer);
    expect(ticked.remainingSeconds).toBe(59);
    expect(ticked.running).toBe(true);
  });

  it('tickTimer at 0 stops running', () => {
    const timer = { opId: 'op-1', totalSeconds: 60, remainingSeconds: 1, running: true };
    const ticked = tickTimer(timer);
    expect(ticked.remainingSeconds).toBe(0);
    expect(ticked.running).toBe(false);
  });

  it('cancelTimer sets running to false', () => {
    const timer = createTimer('op-1', 5);
    const cancelled = cancelTimer(timer);
    expect(cancelled.running).toBe(false);
  });

  it('isTimerDone returns true at 0', () => {
    expect(isTimerDone({ opId: 'op-1', totalSeconds: 60, remainingSeconds: 0, running: false })).toBe(true);
    expect(isTimerDone({ opId: 'op-1', totalSeconds: 60, remainingSeconds: 30, running: true })).toBe(false);
  });

  it('tickTimer on already-stopped timer returns unchanged', () => {
    const stopped = { opId: 'op-1', totalSeconds: 60, remainingSeconds: 30, running: false };
    const result = tickTimer(stopped);
    expect(result).toBe(stopped);
  });

  it('formatTime formats correctly', () => {
    expect(formatTime(300)).toBe('5:00');
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(725)).toBe('12:05');
  });
});
