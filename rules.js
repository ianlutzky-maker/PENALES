/* The rules work in both the browser and the local Node test runner. */
(function (root) {
  const laserShift = { none: 0, red: -1, green: 1 };

  function resolveKick(shot, glove, laser) {
    const column = shot % 3 + laserShift[laser];
    const row = Math.floor(shot / 3);
    if (column < 0 || column > 2) {
      return { shot, glove, laser, final: null, outside: column < 0 ? 'izquierda' : 'derecha', outcome: 'Afuera' };
    }

    const final = row * 3 + column;
    return { shot, glove, laser, final, outcome: final === glove ? 'Atajada' : 'Gol' };
  }

  function standings(players) {
    const goals = players.map(player => player.attempts.filter(kick => kick.outcome === 'Gol').length);
    const counts = players.map(player => player.attempts.length);
    const remaining = counts.map(count => Math.max(0, 5 - count));
    let winner = null;

    if (counts[0] <= 5 && counts[1] <= 5) {
      if (goals[0] > goals[1] + remaining[1]) winner = 0;
      if (goals[1] > goals[0] + remaining[0]) winner = 1;
    } else if (counts[0] === counts[1] && goals[0] !== goals[1]) {
      winner = goals[0] > goals[1] ? 0 : 1;
    }

    return { goals, winner, sudden: counts.every(count => count >= 5) };
  }

  const rules = { resolveKick, standings };
  if (typeof module === 'object') module.exports = rules;
  else root.penaltyRules = rules;
})(globalThis);
