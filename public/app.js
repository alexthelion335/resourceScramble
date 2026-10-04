const $ = (id) => document.getElementById(id);
const names = { wood: 'Wood', stone: 'Stone', crystal: 'Crystal' };
const icons = { wood: '🪵', stone: '🪨', crystal: '💎' };
let room = null, playerId = null, stream = null, toastTimer = null;

function setError(id, message = '') { $(id).textContent = message; }
async function api(path, data = {}, method = 'POST') {
  const response = await fetch(`/api/${path}`, { method, headers: method === 'POST' ? { 'content-type': 'application/json' } : {}, body: method === 'POST' ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}
function currentName() { return $('player-name').value.trim() || 'Rover'; }
function saveSession() {
  if (room && playerId) localStorage.setItem('resource-scramble-session', JSON.stringify({ code: room.code, playerId }));
}
function enterRoom(nextRoom, id) {
  room = nextRoom; playerId = id; saveSession();
  $('home').classList.add('hidden'); $('room').classList.remove('hidden');
  $('room-code-display').textContent = room.code; $('round-number').textContent = room.round;
  setError('room-error'); render();
  if (stream) stream.close();
  stream = new EventSource(`/api/stream?code=${room.code}`);
  stream.onmessage = (event) => { room = JSON.parse(event.data); render(); };
  stream.onerror = () => { if (room && room.phase !== 'finished') setError('room-error', 'Reconnecting to the island…'); };
  history.replaceState({}, '', `/?room=${room.code}`);
}
function render() {
  if (!room) return;
  $('room-code-display').textContent = room.code; $('round-number').textContent = room.round;
  $('player-count').textContent = room.players.length;
  const myPlayer = room.players.find((p) => p.id === playerId);
  if (!myPlayer) return;
  $('room-title').textContent = `Welcome, ${myPlayer.name}`;
  const lobby = room.phase === 'lobby';
  $('lobby-panel').classList.toggle('hidden', !lobby);
  $('game-panel').classList.toggle('hidden', room.phase !== 'playing');
  $('result-panel').classList.toggle('hidden', room.phase !== 'finished');
  $('start-game').disabled = room.players.length < 2 || myPlayer.id !== room.createdBy;
  $('start-game').textContent = myPlayer.id !== room.createdBy ? 'Waiting for host…' : room.players.length < 2 ? 'Waiting for players…' : 'Launch the round   ↗';
  renderTeams();
  if (room.phase === 'playing') renderGame(myPlayer);
  if (room.phase === 'finished') renderResult();
}
function renderTeams() {
  $('lobby-teams').innerHTML = room.teams.map((team) => {
    const players = room.players.filter((p) => p.team === team.id);
    return `<div class="team-box ${team.id ? 'tide' : 'ember'}"><div class="team-box-head"><span>${team.id ? '🌊' : '🔥'} ${team.name}</span><span>${players.length} ${players.length === 1 ? 'player' : 'players'}</span></div><div class="team-members">${players.map((p) => `<span class="player-chip">${escapeHtml(p.name)}${p.id === playerId ? ' · you' : ''}</span>`).join('') || '<span class="player-chip">Waiting for crew…</span>'}</div></div>`;
  }).join('');
}
function renderGame(me) {
  const team = room.teams[me.team];
  room.teams.forEach((entry) => {
    $(`team-name-${entry.id}`).textContent = entry.name; $(`points-${entry.id}`).textContent = entry.score;
  });
  const secs = Math.max(0, room.timeLeft);
  $('timer').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('timer-bar').style.width = `${(secs / room.duration) * 100}%`;
  $('event-banner').innerHTML = `<span>✦</span> ${escapeHtml(room.event)}`;
  $('sites').innerHTML = room.sites.map((site) => `<button class="site-card" data-site="${site.id}" ${!site.active ? 'disabled' : ''}><span class="site-icon">${site.icon}</span><strong>${escapeHtml(site.name)}</strong><small>${site.active ? `Gather ${names[site.resource]}` : 'Resting for now'}</small><span class="gather-cta">${site.active ? `GATHER ${icons[site.resource]} →` : 'SITE RESTING'}</span></button>`).join('');
  for (const key of Object.keys(names)) $(`stash-${key}`).textContent = team.stash[key];
  const ownTeam = team.id === 0 ? 'EMBER' : 'TIDE';
  $('my-team-pill').textContent = ownTeam; $('my-team-pill').className = `my-team-pill ${team.id ? 'tide-pill' : ''}`;
  $('order-name').textContent = room.order.name; $('order-points').textContent = room.order.points;
  $('order-costs').innerHTML = Object.entries(room.order.costs).map(([key, quantity]) => `<span class="cost-pill ${team.stash[key] >= quantity ? 'ready' : ''}">${icons[key]} ${team.stash[key]} / ${quantity} ${names[key]}</span>`).join('');
  const deliver = $('deliver-order'); deliver.disabled = !Object.entries(room.order.costs).every(([key, quantity]) => team.stash[key] >= quantity);
}
function renderResult() {
  const winner = room.winner;
  $('result-title').textContent = winner === 'draw' ? 'A perfect tie!' : `${room.teams[winner].name} wins!`;
  $('result-copy').textContent = winner === 'draw' ? 'Both crews left with the same stash.' : 'The island is saved. The crew takes the crown.';
  $('result-scores').innerHTML = room.teams.map((team) => `<div><small>${team.name}</small><b>${team.score} pts</b><small>${Object.values(team.stash).reduce((a,b)=>a+b,0)} supplies left</small></div>`).join('');
  $('rematch').classList.toggle('hidden', room.players.find((p) => p.id === playerId)?.id !== room.createdBy);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1700); }

$('create-room').addEventListener('click', async () => {
  setError('home-error'); $('create-room').disabled = true;
  try { const result = await api('rooms', { name: currentName() }); enterRoom(result.room, result.playerId); }
  catch (error) { setError('home-error', error.message); }
  finally { $('create-room').disabled = false; }
});
$('join-room').addEventListener('click', async () => {
  setError('home-error'); const code = $('room-code').value.trim().toUpperCase();
  if (!code) return setError('home-error', 'Enter a room code to join your crew.');
  $('join-room').disabled = true;
  try { const result = await api('join', { code, name: currentName() }); enterRoom(result.room, result.playerId); }
  catch (error) { setError('home-error', error.message); }
  finally { $('join-room').disabled = false; }
});
$('room-code').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('room-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('join-room').click(); });
$('start-game').addEventListener('click', async () => {
  try { const result = await api('start', { code: room.code, playerId }); room = result.room; render(); }
  catch (error) { setError('room-error', error.message); }
});
$('sites').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-site]'); if (!button || button.disabled) return;
  try { await api('gather', { code: room.code, playerId, siteId: button.dataset.site }); }
  catch (error) { if (error.message !== 'Catch your breath!') toast(error.message); }
});
$('deliver-order').addEventListener('click', async () => {
  try { await api('order', { code: room.code, playerId }); toast('Order delivered! Points for your crew.'); }
  catch (error) { toast(error.message); }
});
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(room.code); toast('Room code copied'); }
  catch { toast(`Room code: ${room.code}`); }
});
$('rematch').addEventListener('click', async () => {
  try { const result = await api('rematch', { code: room.code, playerId }); room = result.room; render(); }
  catch (error) { setError('room-error', error.message); }
});
window.addEventListener('pagehide', () => { if (stream) stream.close(); });

// Rejoin a room after a refresh on this device; the session token is local to this browser.
(async function restoreSession() {
  const queryCode = new URLSearchParams(location.search).get('room');
  const saved = localStorage.getItem('resource-scramble-session');
  if (!saved) return;
  try {
    const session = JSON.parse(saved);
    if (queryCode && queryCode.toUpperCase() !== session.code) return;
    const result = await api(`state?code=${session.code}`, {}, 'GET');
    if (result.room.players.some((p) => p.id === session.playerId)) enterRoom(result.room, session.playerId);
    else localStorage.removeItem('resource-scramble-session');
  } catch { localStorage.removeItem('resource-scramble-session'); }
})();
