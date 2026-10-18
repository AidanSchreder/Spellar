// Scoring a guess. Two passes so repeated letters are counted correctly:
// 1. exact matches are marked correct and use up that letter of the answer;
// 2. left to right, any other letter still left over in the answer is marked present (and used up);
// everything else is absent.

export const CORRECT = 'correct';
export const PRESENT = 'present';
export const ABSENT = 'absent';

export function evaluate(guess, answer) {
  const result = new Array(answer.length).fill(ABSENT);
  const left = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) result[i] = CORRECT;
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (result[i] === CORRECT) continue;
    const c = guess[i];
    if (left[c] > 0) {
      result[i] = PRESENT;
      left[c]--;
    }
  }
  return result;
}

const RANK = { [ABSENT]: 1, [PRESENT]: 2, [CORRECT]: 3 };

// Keyboard colours only ever move up: correct > present > absent.
export function mergeKeyStates(keys, guess, result) {
  for (let i = 0; i < guess.length; i++) {
    const c = guess[i];
    if (!keys[c] || RANK[result[i]] > RANK[keys[c]]) keys[c] = result[i];
  }
  return keys;
}

export const isWin = (result) => result.every((s) => s === CORRECT);
