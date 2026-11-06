'use strict';

const { resolveKick, standings } = globalThis.penaltyRules;
const stage = document.querySelector('#stage');
const score = document.querySelector('#score');
const cellNames = ['Arriba izquierda', 'Arriba centro', 'Arriba derecha',
  'Abajo izquierda', 'Abajo centro', 'Abajo derecha'];
const lasers = { none: 'Sin láser', red: 'Láser rojo', green: 'Láser verde' };
const outcomeMarks = { Gol: '✓', Atajada: '🧤', Afuera: '↗' };
const playerInputs = [...document.querySelectorAll('#setup input')];

let players;
let first = 0;
let kicker;
let phase;
let shot;
let selection;
let laser;
let result;
let table;
let handoffTo;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function action(label, handler) {
  const button = element('button', 'primary', label);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

function heading(container, label, title, subtitle) {
  container.append(element('p', 'eyebrow', label));
  const headline = element('h1', '', title);
  headline.tabIndex = -1;
  container.append(headline, element('p', 'subtitle', subtitle));
  return headline;
}

function renderScore() {
  table = standings(players);
  const total = players[0].attempts.length + players[1].attempts.length;
  const sudden = total >= 10 && (phase !== 'reveal' || total > 10);
  const caption = element('p', 'eyebrow score-caption', sudden ? 'MUERTE SÚBITA' : 'TANDA INICIAL · 5 TIROS POR PERSONA');
  const board = element('div', 'score-board');
  players.forEach((player, index) => {
    const card = element('div', 'player');
    const role = phase === 'winner' ? (table.winner === index ? 'Ganador' : 'Tanda finalizada')
      : (index === kicker ? 'Patea' : 'Ataja');
    const identity = element('div', 'identity');
    identity.append(element('span', 'role', role), element('strong', 'player-name', player.name));
    const tally = element('div', 'tally', table.goals[index]);
    tally.setAttribute('aria-label', table.goals[index] + ' goles');
    const history = element('ol', 'history');
    history.setAttribute('aria-label', 'Historial de ' + player.name);
    const shownAttempts = Math.max(5, player.attempts.length);
    for (let attempt = 0; attempt < shownAttempts; attempt += 1) {
      const kick = player.attempts[attempt];
      const label = 'Tiro ' + (attempt + 1) + ': ' + (kick ? kick.outcome : 'pendiente');
      const mark = element('li', 'attempt ' + (kick ? kick.outcome.toLowerCase() : 'pending'),
        kick ? outcomeMarks[kick.outcome] : '·');
      mark.title = label;
      mark.setAttribute('aria-label', label);
      history.append(mark);
    }
    card.append(identity, tally, history);
    board.append(card);
  });
  score.replaceChildren(caption, board);
  score.hidden = false;
}

function goalGrid(interactive, marker) {
  const grid = element('div', 'goal');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Arco de dos filas y tres columnas');
  cellNames.forEach((name, index) => {
    const cell = element(interactive ? 'button' : 'div', 'cell');
    cell.append(element('span', 'cell-label', name));
    if (interactive) {
      cell.type = 'button';
      cell.setAttribute('aria-label', name);
      cell.setAttribute('aria-pressed', 'false');
      cell.addEventListener('click', () => {
        selection = index;
        for (const button of grid.children) {
          button.setAttribute('aria-pressed', String(button === cell));
          button.querySelector('.marker')?.remove();
        }
        const badge = element('span', 'marker', marker);
        badge.setAttribute('aria-hidden', 'true');
        cell.append(badge);
        document.querySelector('#confirm').disabled = false;
      });
    } else {
      const marks = element('div', 'result-marks');
      if (index === result.final) marks.append(element('span', 'marker', '⚽ Pelota final'));
      if (index === result.glove) marks.append(element('span', 'marker glove', '🧤 Guante'));
      if (index === result.shot && result.shot !== result.final) {
        marks.append(element('span', 'marker origin', '◎ Apuntó acá'));
      }
      cell.append(marks);
    }
    grid.append(cell);
  });
  return grid;
}

function animateReveal(grid, kick) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !grid.animate) return;

  const frame = grid.getBoundingClientRect();
  const point = index => {
    const cell = grid.children[index].getBoundingClientRect();
    return { x: cell.left - frame.left + cell.width / 2 - grid.clientLeft,
      y: cell.top - frame.top + cell.height / 2 - grid.clientTop };
  };
  const aim = point(kick.shot);
  const gloveAt = point(kick.glove);
  const end = kick.final === null
    ? { x: kick.outside === 'izquierda' ? -10 : grid.clientWidth + 10, y: aim.y }
    : point(kick.final);
  const caught = kick.outcome === 'Atajada';
  const duration = 1250;
  const position = ({ x, y }, scale, offset, opacity = 1) => ({
    left: x + 'px', top: y + 'px', offset, opacity,
    transform: 'translate(-50%, -50%) scale(' + scale + ')'
  });

  const ball = element('span', 'flight-ball', '⚽');
  const glove = element('span', 'flight-glove', '🧤');
  const replay = element('div', 'flight');
  replay.setAttribute('aria-hidden', 'true');
  replay.append(ball, glove);
  grid.append(replay);
  grid.classList.add('in-flight');

  glove.animate([
    position({ x: grid.clientWidth / 2, y: grid.clientHeight - 13 }, .85, 0),
    position(gloveAt, 1, .47),
    position(gloveAt, 1, .72),
    position(gloveAt, caught ? 1.45 : 1, .84),
    position(gloveAt, 1, 1)
  ], { duration, fill: 'both' });

  if (kick.laser !== 'none') {
    const beam = element('span', 'flight-beam ' + kick.laser,
      kick.laser === 'red' ? '←' : '→');
    beam.style.left = aim.x + 'px';
    beam.style.top = aim.y + 'px';
    replay.append(beam);
    beam.animate([{ opacity: 0 }, { opacity: 1, offset: .22 }, { opacity: 0 }],
      { duration: 420, delay: 480, fill: 'both' });
  }

  ball.animate([
    position({ x: grid.clientWidth / 2, y: grid.clientHeight - 3 }, 1.5, 0),
    position(aim, .95, .46),
    position(end, caught ? .7 : .9, .76),
    position(end, kick.outcome === 'Gol' ? .55 : .75, 1, caught ? 1 : 0)
  ], { duration, fill: 'both' }).finished.then(() => {
    replay.remove();
    grid.classList.remove('in-flight');
  });
}

function laserPicker() {
  const field = element('fieldset', 'lasers');
  field.append(element('legend', '', 'Láser del arquero'));
  const controls = element('div', 'laser-options');
  for (const [key, label] of Object.entries(lasers)) {
    const option = element('label', 'laser ' + key);
    const radio = element('input');
    radio.type = 'radio';
    radio.name = 'laser';
    radio.value = key;
    radio.checked = key === 'none';
    radio.disabled = key !== 'none' && !players[1 - kicker].lasers.has(key);
    radio.addEventListener('change', () => { laser = radio.value; });
    const detail = key === 'none' ? 'Sin desvío' : radio.disabled ? 'Ya usado'
      : key === 'red' ? '← Izquierda · 1 disponible' : '→ Derecha · 1 disponible';
    const copy = element('span');
    copy.append(element('strong', '', label), element('small', '', detail));
    option.append(radio, copy);
    controls.append(option);
  }
  field.append(controls);
  return field;
}

function start(names) {
  players = names.map(name => ({ name, attempts: [], lasers: new Set(['red', 'green']) }));
  kicker = first;
  selection = shot = result = null;
  laser = 'none';
  phase = 'kick';
  render();
}

function handoff(next) {
  selection = null;
  laser = 'none';
  phase = 'handoff';
  handoffTo = next;
  render();
}

function render() {
  // Remove the previous view synchronously before building the next one.
  stage.replaceChildren();
  renderScore();
  stage.className = 'stage ' + phase;
  const panel = element('div', 'panel');
  let title;

  if (phase === 'handoff') {
    panel.append(element('div', 'handoff-icon', '↔'));
    const keeperTurn = handoffTo === 'keep';
    title = heading(panel, 'CAMBIO DE MANOS', 'Pasale la compu a ' + players[keeperTurn ? 1 - kicker : kicker].name,
      keeperTurn ? 'Ahora le toca elegir al arquero.' : 'Ahora le toca elegir a quien patea.');
    panel.append(action('Estoy listo', () => { phase = handoffTo; render(); }));
  } else if (phase === 'kick' || phase === 'keep') {
    const kicking = phase === 'kick';
    title = heading(panel, kicking ? '01 / EL TIRO' : '02 / LA ATAJADA',
      players[kicking ? kicker : 1 - kicker].name + (kicking ? ', te toca patear' : ', te toca atajar'),
      kicking ? 'Marcá el casillero al que querés apuntar.' : 'Marcá dónde ponés el guante y elegí si usás un láser.');
    panel.append(goalGrid(true, kicking ? '⚽' : '🧤'));
    if (!kicking) panel.append(laserPicker());
    const confirm = action(kicking ? 'Confirmar tiro' : 'Confirmar atajada', () => {
      if (selection === null) return;
      if (kicking) {
        shot = selection;
        handoff('keep');
      } else {
        result = resolveKick(shot, selection, laser);
        if (laser !== 'none') players[1 - kicker].lasers.delete(laser);
        players[kicker].attempts.push(result);
        phase = 'reveal';
        render();
      }
    });
    confirm.id = 'confirm';
    confirm.disabled = true;
    panel.append(confirm);
  } else if (phase === 'reveal') {
    title = heading(panel, '03 / LA REVELACIÓN', result.outcome + (result.outcome === 'Gol' ? '!' : ''),
      'Tiro de ' + players[kicker].name + ' · Arco de ' + players[1 - kicker].name);
    panel.append(goalGrid(false));
    if (result.outcome === 'Afuera') {
      panel.append(element('p', 'outside-call',
        '¡Se te fue afuera por la ' + result.outside + '! Perdiste este penal.'));
    }
    const details = element('dl', 'details');
    const end = result.final === null
      ? 'Afuera por la ' + result.outside + ' · ' + (result.shot < 3 ? 'fila de arriba' : 'fila de abajo')
      : cellNames[result.final];
    const items = [['Apuntó', cellNames[result.shot]], ['Guante', cellNames[result.glove]],
      ['Láser', lasers[result.laser]], ['Pelota final', end]];
    for (const [label, value] of items) {
      const item = element('div');
      item.append(element('dt', '', label), element('dd', '', value));
      details.append(item);
    }
    panel.append(details);
    if (table.winner !== null) {
      panel.append(element('p', 'finish-note', players[table.winner].name + ' ganó la tanda.'),
        action('Ver resultado final', () => { phase = 'winner'; render(); }));
    } else {
      if (table.sudden && players.every(player => player.attempts.length === 5)) {
        panel.append(element('p', 'finish-note', 'Empate después de cinco tiros por lado. ¡Vamos a muerte súbita!'));
      }
      panel.append(action('Siguiente penal', () => { kicker = 1 - kicker; shot = result = null; handoff('kick'); }));
    }
  } else {
    panel.append(element('div', 'handoff-icon', '🏆'));
    title = heading(panel, 'FINAL DE LA TANDA', 'Ganó ' + players[table.winner].name,
      table.goals[table.winner] + ' a ' + table.goals[1 - table.winner] + ' en la tanda de penales.');
    panel.append(action('Revancha', () => {
      first = 1 - first;
      start(players.map(player => player.name));
    }));
  }
  stage.append(panel);
  if (phase === 'reveal') animateReveal(panel.querySelector('.goal'), result);
  title.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

for (const input of playerInputs) {
  input.addEventListener('input', () => input.setCustomValidity(''));
}
document.querySelector('#setup').addEventListener('submit', event => {
  event.preventDefault();
  for (const input of playerInputs) {
    if (!input.value.trim()) {
      input.setCustomValidity('Escribí un nombre.');
      input.reportValidity();
      return;
    }
  }
  start(playerInputs.map(input => input.value.trim()));
});
