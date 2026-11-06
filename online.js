'use strict';

const inviteId = new URLSearchParams(location.search).get('sala');
const onlineForm = document.querySelector('#online-setup');
const networkMessage = document.querySelector('#network-message');
let onlineSession;
let onlineState;
let sending = false;

function randomId(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

function onlineNotice(message) {
  networkMessage.textContent = message;
  networkMessage.hidden = !message;
}

async function roomRequest(action, data = {}) {
  const response = await fetch('/api/room', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...onlineSession, ...data }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw Object.assign(new Error(details.error ?? 'No pudimos conectar con la sala.'), { status: response.status });
  }
  return response.json();
}

function waitingScreen(label, title, subtitle) {
  stage.replaceChildren();
  stage.className = 'stage handoff';
  const panel = element('div', 'panel');
  heading(panel, label, title, subtitle);
  stage.append(panel);
  return panel;
}

function showOnline(next) {
  const previous = onlineState;
  if (previous && next.revision <= previous.revision) return;
  onlineState = next;
  if (next.phase === 'lobby') {
    const panel = waitingScreen('SALA PRIVADA', 'Esperando a tu rival', 'Compartile este enlace para que entre a la sala.');
    const link = new URL(location.pathname, location.origin);
    link.searchParams.set('sala', onlineSession.id);
    const field = element('input', 'invite-link');
    field.value = link.href;
    field.readOnly = true;
    field.setAttribute('aria-label', 'Enlace de invitación');
    panel.append(field, action('Copiar enlace', async () => {
      try {
        await navigator.clipboard.writeText(field.value);
        onlineNotice('Enlace copiado.');
      } catch {
        field.select();
        onlineNotice('Copiá el enlace seleccionado.');
      }
    }));
    return;
  }

  players = next.players.map(player => ({ ...player, lasers: new Set(player.lasers) }));
  kicker = next.kicker;
  result = next.result;
  const sameTurn = previous?.turn === next.turn;
  if (sameTurn && previous.phase === 'play' && next.phase === 'play' &&
      previous.locked[next.seat] === next.locked[next.seat]) {
    const status = document.querySelector('#rival-status');
    if (status) status.textContent = rivalStatus();
    return;
  }
  if (sameTurn && previous.phase === 'reveal' && next.phase === 'reveal') {
    const button = document.querySelector('#advance-online');
    if (button && next.ready[next.seat]) markReady(button);
    return;
  }
  selection = null;
  laser = 'none';
  if (next.phase === 'reveal') phase = 'reveal';
  else if (next.locked[next.seat]) phase = 'online-wait';
  else phase = next.seat === kicker ? 'kick' : 'keep';
  render();
}

function rivalStatus() {
  return onlineState.locked[1 - onlineState.seat] ? 'Tu rival ya confirmó su jugada.' : 'Tu rival está eligiendo su jugada.';
}

function markReady(button) {
  button.disabled = true;
  button.textContent = 'Esperando a tu rival…';
}

function onlineAdvance(label) {
  const button = action(label, () => sendOnline('advance', {}, button));
  button.id = 'advance-online';
  if (onlineState.ready[onlineState.seat]) markReady(button);
  return button;
}

async function sendOnline(command, payload, button) {
  if (sending) return;
  sending = true;
  button.disabled = true;
  const formControls = [...stage.querySelectorAll('.cell:not(:disabled), .lasers input:not(:disabled)')];
  formControls.forEach(control => { control.disabled = true; });
  try {
    showOnline(await roomRequest(command, { turn: onlineState.turn, ...payload }));
    onlineNotice('');
  } catch (error) {
    onlineNotice(error.message);
  } finally {
    sending = false;
    if (button.isConnected) {
      button.disabled = command === 'advance' && onlineState.ready[onlineState.seat];
      formControls.forEach(control => { control.disabled = false; });
    }
  }
}

async function refreshRoom() {
  try {
    showOnline(await roomRequest('state'));
    if (networkMessage.dataset.reconnecting) onlineNotice('');
    delete networkMessage.dataset.reconnecting;
  } catch (error) {
    onlineNotice(error.status === 404 ? error.message + ' Volvé al inicio para crear otra.' : 'Se cortó la conexión. Reintentando…');
    if (error.status === 404 || error.status === 403) return;
    networkMessage.dataset.reconnecting = 'true';
  }
  setTimeout(refreshRoom, 1000);
}

async function enterRoom(command, id, name, token = randomId(24)) {
  onlineSession = { id, token };
  const storageKey = 'penales:seat:' + id;
  try {
    localStorage.setItem(storageKey, token);
    const state = await roomRequest(command, { name });
    const url = new URL(location.href);
    url.searchParams.set('sala', id);
    history.replaceState(null, '', url);
    document.querySelector('#leave-room').hidden = false;
    showOnline(state);
    onlineNotice('');
    setTimeout(refreshRoom, 1000);
  } catch (error) {
    if ([400, 403, 404, 409].includes(error.status)) localStorage.removeItem(storageKey);
    onlineSession = null;
    onlineNotice(error.message);
  }
}

if (location.protocol === 'file:') {
  onlineForm.hidden = true;
} else {
  onlineForm.hidden = false;
  if (inviteId) {
    document.querySelector('#setup').hidden = true;
    document.querySelector('#online-title').textContent = 'Entrá a la sala';
    onlineForm.querySelector('button').textContent = 'Unirme a la sala';
    document.querySelector('#leave-room').hidden = false;
  }
  onlineForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = onlineForm.querySelector('button');
    button.disabled = true;
    await enterRoom(inviteId ? 'join' : 'create', inviteId || randomId(12),
      onlineForm.elements.nickname.value, inviteId ? localStorage.getItem('penales:seat:' + inviteId) ?? undefined : undefined);
    button.disabled = false;
  });
  if (inviteId) {
    const token = localStorage.getItem('penales:seat:' + inviteId);
    if (token) {
      const button = onlineForm.querySelector('button');
      button.disabled = true;
      enterRoom('state', inviteId, undefined, token).finally(() => { button.disabled = false; });
    }
  }
}
