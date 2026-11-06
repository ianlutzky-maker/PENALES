'use strict';

const { resolveKick, standings } = require('../rules.js');

const ttl = 86400;
const roomIdPattern = /^[0-9a-f]{24}$/;
const tokenPattern = /^[0-9a-f]{48}$/;
const compareAndSet = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]) end";

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

async function redis(...command) {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  if (!url || !token) fail(503, 'El modo online todavía necesita una base de datos configurada.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) fail(503, 'No pudimos conectar con la sala.');
  const data = await response.json();
  if (data.error) fail(503, 'No pudimos conectar con la sala.');
  return data.result;
}

function newPlayer(name, token) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 24) {
    fail(400, 'Escribí un nombre de hasta 24 caracteres.');
  }
  return { name: name.trim(), token, attempts: [], lasers: ['red', 'green'] };
}

function publicState(room, seat) {
  return {
    seat, revision: room.revision, turn: room.turn, phase: room.phase, kicker: room.kicker,
    players: room.players.map((player, index) => ({
      name: player.name, attempts: player.attempts, lasers: index === seat ? player.lasers : []
    })),
    locked: room.moves.map(Boolean), ready: room.ready, result: room.result
  };
}

function update(room, seat, input) {
  if (input.turn !== room.turn) return false;
  if (input.action === 'move') {
    if (room.phase !== 'play' || room.moves[seat]) return false;
    const { cell, laser } = input;
    const keeper = seat !== room.kicker;
    if (!Number.isInteger(cell) || cell < 0 || cell > 5 ||
        (laser !== 'none' && (!keeper || !room.players[seat].lasers.includes(laser)))) {
      fail(400, 'Esa jugada no es válida.');
    }
    room.moves[seat] = { cell, laser };
    if (room.moves.every(Boolean)) {
      const shot = room.moves[room.kicker];
      const glove = room.moves[1 - room.kicker];
      room.result = resolveKick(shot.cell, glove.cell, glove.laser);
      const goalie = room.players[1 - room.kicker];
      goalie.lasers = goalie.lasers.filter(item => item !== glove.laser);
      room.players[room.kicker].attempts.push(room.result);
      room.moves = [null, null];
      room.phase = 'reveal';
    }
  } else if (input.action === 'advance') {
    if (room.phase !== 'reveal' || room.ready[seat]) return false;
    room.ready[seat] = true;
    if (room.ready.every(Boolean)) {
      if (standings(room.players).winner !== null) {
        room.first = 1 - room.first;
        room.kicker = room.first;
        room.players = room.players.map(player => newPlayer(player.name, player.token));
      } else {
        room.kicker = 1 - room.kicker;
      }
      room.turn += 1;
      room.phase = 'play';
      room.ready = [false, false];
      room.result = null;
    }
  }
  return true;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') fail(405, 'Usá POST.');
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, id, token, name } = input ?? {};
    if (typeof id !== 'string' || !roomIdPattern.test(id) ||
        typeof token !== 'string' || !tokenPattern.test(token) ||
        !['create', 'join', 'state', 'move', 'advance'].includes(action)) {
      fail(400, 'La solicitud de sala no es válida.');
    }

    const key = 'penales:room:' + id;
    if (action === 'create') {
      const room = { players: [newPlayer(name, token)], first: 0, kicker: 0, turn: 0,
        revision: 0, phase: 'lobby', moves: [null, null], ready: [false, false], result: null };
      if (await redis('SET', key, JSON.stringify(room), 'NX', 'EX', ttl)) {
        return res.status(200).json(publicState(room, 0));
      }
    }

    // Redis compares and writes atomically so two simultaneous confirmations cannot overwrite each other.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const raw = await redis('GET', key);
      if (!raw) fail(404, 'La sala no existe o venció.');
      const room = JSON.parse(raw);
      let seat = room.players.findIndex(player => player.token === token);
      if (action === 'join' && seat === -1) {
        if (room.players.length === 2) fail(409, 'La sala ya tiene dos jugadores.');
        seat = 1;
        room.players.push(newPlayer(name, token));
        room.phase = 'play';
      } else {
        if (seat === -1) fail(403, 'Este navegador no tiene acceso a la partida.');
        if (['state', 'create', 'join'].includes(action) || !update(room, seat, input)) {
          return res.status(200).json(publicState(room, seat));
        }
      }
      room.revision += 1;
      if (await redis('EVAL', compareAndSet, 1, key, raw, JSON.stringify(room), ttl)) {
        return res.status(200).json(publicState(room, seat));
      }
    }
    fail(503, 'La sala está ocupada. Probá de nuevo.');
  } catch (error) {
    return res.status(error.status ?? 500).json({ error: error.status
      ? error.message : 'Hubo un problema al conectar con la partida.' });
  }
};
