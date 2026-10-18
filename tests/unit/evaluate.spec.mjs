import { test, expect } from '@playwright/test';
import { evaluate, mergeKeyStates, isWin } from '../../src/evaluate.js';

const C = 'correct';
const P = 'present';
const A = 'absent';

test.describe('evaluate (two-pass scoring)', () => {
  test('COMET / TEMPO', () => {
    expect(evaluate('TEMPO', 'COMET')).toEqual([P, P, C, A, P]);
  });

  test('NEBULA / BUBBLE: a correct B uses up the only B', () => {
    expect(evaluate('BUBBLE', 'NEBULA')).toEqual([A, P, C, A, C, P]);
  });

  test('APOLLO with one, two and three Ls', () => {
    expect(evaluate('LXXXXX', 'APOLLO')).toEqual([P, A, A, A, A, A]);
    expect(evaluate('LLXXXX', 'APOLLO')).toEqual([P, P, A, A, A, A]);
    expect(evaluate('LLLXXX', 'APOLLO')).toEqual([P, P, A, A, A, A]);
    expect(evaluate('XXXLLL', 'APOLLO')).toEqual([A, A, A, C, C, A]);
    expect(evaluate('XXXLXL', 'APOLLO')).toEqual([A, A, A, C, A, P]);
    expect(evaluate('LXXLXX', 'APOLLO')).toEqual([P, A, A, C, A, A]);
  });

  test('a correct letter is counted before an earlier misplaced copy', () => {
    // APOLLO has two Os (positions 3 and 6). OOOXXO: position 3 and 6 are correct, so the first
    // two Os have nothing left to match.
    expect(evaluate('OOOXXO', 'APOLLO')).toEqual([A, A, C, A, A, C]);
    expect(evaluate('OOOXXX', 'APOLLO')).toEqual([P, A, C, A, A, A]);
  });

  test('a solved word', () => {
    const r = evaluate('ORBIT', 'ORBIT');
    expect(r).toEqual([C, C, C, C, C]);
    expect(isWin(r)).toBe(true);
    expect(isWin(evaluate('ROBIT', 'ORBIT'))).toBe(false);
  });

  test('letters not in the answer at all', () => {
    expect(evaluate('XYZW', 'MARS')).toEqual([A, A, A, A]);
  });
});

test.describe('keyboard state priority', () => {
  test('a key never downgrades: correct > present > absent', () => {
    const keys = {};
    mergeKeyStates(keys, 'TEMPO', evaluate('TEMPO', 'COMET'));
    expect(keys).toMatchObject({ T: P, E: P, M: C, P: A, O: P });
    mergeKeyStates(keys, 'COMET', evaluate('COMET', 'COMET'));
    expect(keys).toMatchObject({ C: C, O: C, M: C, E: C, T: C, P: A });
    // A later guess with O absent (no O left) must not downgrade O.
    mergeKeyStates(keys, 'OXXXX', [A, A, A, A, A]);
    expect(keys.O).toBe(C);
  });

  test('present upgrades to correct, absent upgrades to present', () => {
    const keys = { A: A, B: P };
    mergeKeyStates(keys, 'AB', [P, C]);
    expect(keys).toEqual({ A: P, B: C });
  });
});
