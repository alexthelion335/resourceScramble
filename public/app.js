const $ = (id) => document.getElementById(id);
const names = { wood: 'Wood', stone: 'Stone', crystal: 'Crystal' };
const icons = { wood: '🪵', stone: '🪨', crystal: '💎' };
let room = null, playerId = null, stream = null, toastTimer = null, selectedBoostId = null, puzzleSequence = [], puzzleAnswer = [], puzzleSymbols = [];

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
  const trip = me.trip;
  const tripSite = trip && room.sites.find((site) => site.id === trip.siteId);
  if (trip && tripSite) {
    const duration = trip.endsAt - trip.startedAt;
    const elapsed = Math.max(0, Date.now() - trip.startedAt);
    const remaining = Math.max(0, Math.ceil((trip.endsAt - Date.now()) / 1000));
    const percent = Math.min(100, elapsed / duration * 100);
    const nextHaul = Math.max(0, 8 - Math.floor((elapsed % 8000) / 1000));
    $('trip-status').innerHTML = `<div class="trip-active"><strong>${tripSite.icon} On trip: ${escapeHtml(tripSite.name)}</strong><small>Return in ${remaining}s · ${trip.yields} ${names[tripSite.resource]} gathered</small><div class="trip-progress"><i style="width:${percent}%"></i></div>${trip.puzzleAvailable ? '<button class="puzzle-button" id="try-puzzle">Solve site puzzle · earn a powerup ✦</button>' : `<small>${trip.puzzleSolved ? 'Puzzle solved · powerup earned' : trip.puzzleAttempted ? 'Puzzle attempt used' : `Next automatic haul in ${nextHaul}s`}</small>`}</div>`;
  } else {
    $('trip-status').innerHTML = `<div class="trip-ready"><b>${selectedBoostId ? 'Powerup selected for your next trip' : 'Choose a site for your next trip'}</b><span>${selectedBoostId ? 'It will activate when you depart.' : 'Plan your crew’s resource route.'}</span></div>`;
  }
  $('sites').innerHTML = room.sites.map((site) => `<button class="site-card" data-site="${site.id}" ${!site.active || Boolean(trip) ? 'disabled' : ''}><span class="site-icon">${site.icon}</span><strong>${escapeHtml(site.name)}</strong><small>${site.active ? `Gather ${names[site.resource]}` : 'Resting for now'}</small><span class="gather-cta">${trip ? 'ON YOUR TRIP' : site.active ? `START 40s TRIP ${icons[site.resource]} →` : 'SITE RESTING'}</span></button>`).join('');
  $('crew-trips').innerHTML = room.players.filter((player) => player.id !== me.id && player.trip).map((player) => {
    const site = room.sites.find((entry) => entry.id === player.trip.siteId);
    return `<span class="crew-trip-chip">${escapeHtml(player.name)} · ${site?.icon || '✦'} ${escapeHtml(site?.name || 'on trip')}</span>`;
  }).join('');
  for (const key of Object.keys(names)) $(`stash-${key}`).textContent = team.stash[key];
  const ownTeam = team.id === 0 ? 'EMBER' : 'TIDE';
  $('my-team-pill').textContent = ownTeam; $('my-team-pill').className = `my-team-pill ${team.id ? 'tide-pill' : ''}`;
  $('order-name').textContent = room.order.name; $('order-points').textContent = room.order.points;
  $('order-costs').innerHTML = Object.entries(room.order.costs).map(([key, quantity]) => `<span class="cost-pill ${team.stash[key] >= quantity ? 'ready' : ''}">${icons[key]} ${team.stash[key]} / ${quantity} ${names[key]}</span>`).join('');
  const deliver = $('deliver-order'); deliver.disabled = !Object.entries(room.order.costs).every(([key, quantity]) => team.stash[key] >= quantity);
  const boosts = me.boosts || [];
  if (selectedBoostId && !boosts.some((boost) => boost.id === selectedBoostId)) selectedBoostId = null;
  $('boost-count').textContent = `${boosts.length} / 2`;
  $('powerups').innerHTML = boosts.length ? boosts.map((boost) => `<button class="powerup-card ${selectedBoostId === boost.id ? 'selected' : ''}" data-boost="${boost.id}" ${trip ? 'disabled' : ''}><span>${boost.icon}</span><b>${escapeHtml(boost.name)}${selectedBoostId === boost.id ? ' · READY' : ''}</b><small>${escapeHtml(boost.description)}</small></button>`).join('') : '<p class="powerup-empty">Find a powerup on a trip or solve a site puzzle.</p>';
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
  try { await api('trip', { code: room.code, playerId, siteId: button.dataset.site, boostId: selectedBoostId }); selectedBoostId = null; }
  catch (error) { toast(error.message); }
});
$('powerups').addEventListener('click', (event) => {
  const card = event.target.closest('[data-boost]'); if (!card || card.disabled) return;
  selectedBoostId = selectedBoostId === card.dataset.boost ? null : card.dataset.boost;
  render();
});
$('trip-status').addEventListener('click', async (event) => {
  if (!event.target.closest('#try-puzzle')) return;
  try {
    const result = await api(`puzzle?code=${room.code}&playerId=${playerId}`, {}, 'GET');
    puzzleSequence = result.sequence; puzzleSymbols = result.symbols; puzzleAnswer = [];
    $('puzzle-modal').classList.remove('hidden'); $('puzzle-input').classList.add('hidden'); $('puzzle-message').textContent = '';
    $('puzzle-instructions').textContent = 'Memorize this signal…';
    $('puzzle-sequence').innerHTML = puzzleSequence.map((index) => `<span>${puzzleSymbols[index]}</span>`).join('');
    setTimeout(() => {
      if ($('puzzle-modal').classList.contains('hidden')) return;
      $('puzzle-sequence').innerHTML = '<span>?</span><span>?</span><span>?</span><span>?</span>';
      $('puzzle-input').innerHTML = puzzleSymbols.map((symbol, index) => `<button class="puzzle-symbol" data-symbol="${index}">${symbol}</button>`).join('');
      $('puzzle-input').classList.remove('hidden'); $('puzzle-instructions').textContent = 'Tap the four symbols in the same order.';
    }, 1800);
  } catch (error) { toast(error.message); }
});
$('puzzle-input').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-symbol]'); if (!button || puzzleAnswer.length >= 4) return;
  puzzleAnswer.push(Number(button.dataset.symbol));
  $('puzzle-sequence').innerHTML = puzzleAnswer.map((index) => `<span>${puzzleSymbols[index]}</span>`).join('') + '<span>·</span>'.repeat(4 - puzzleAnswer.length);
  if (puzzleAnswer.length !== 4) return;
  try {
    const result = await api('puzzle', { code: room.code, playerId, sequence: puzzleAnswer });
    const message = $('puzzle-message');
    if (result.correct) {
      message.textContent = result.boost ? `Signal solved! ${result.boost.icon} ${result.boost.name} added to your kit.` : 'Signal solved! Your crew received 2 extra supplies.';
      setTimeout(() => { $('puzzle-modal').classList.add('hidden'); toast(result.boost ? `${result.boost.name} found!` : 'Puzzle bonus: 2 supplies'); }, 1150);
    } else {
      message.textContent = 'Not quite. This trip’s puzzle is spent.'; message.classList.add('wrong');
      setTimeout(() => $('puzzle-modal').classList.add('hidden'), 1100);
    }
  } catch (error) { $('puzzle-message').textContent = error.message; }
});
$('puzzle-close').addEventListener('click', () => $('puzzle-modal').classList.add('hidden'));
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
