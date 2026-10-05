const $ = (id) => document.getElementById(id);
const storedTheme = localStorage.getItem('resource-scramble-theme');
const systemDarkMode = window.matchMedia?.('(prefers-color-scheme: dark)');
if (storedTheme === 'light' || (!storedTheme && !systemDarkMode?.matches)) document.body.classList.add('light-mode');
const names = { wood: 'Wood', stone: 'Stone', crystal: 'Crystal' };
const icons = { wood: '🪵', stone: '🪨', crystal: '💎' };
const siteButtonOrder = ['grove', 'crystal', 'quarry'];
const teamSymbols = [['🔥', 'Flame'], ['🌊', 'Wave'], ['🌿', 'Leaf'], ['⭐', 'Star'], ['⚡', 'Bolt'], ['🦊', 'Fox'], ['🐙', 'Octopus'], ['🌈', 'Rainbow'], ['🦈', 'Shark'], ['🐢', 'Turtle'], ['🍄', 'Mushroom'], ['☀️', 'Sun']];
let room = null, playerId = null, stream = null, toastTimer = null, selectedBoostId = null, helperOverrideResource = 'auto', puzzleSequence = [], puzzleAnswer = [], puzzleSymbols = [], puzzleType = 'memory', countSequence = [], countTarget = 0, puzzleCountdownTimer = null, pendingSession = null, tutorialStep = 0;
const tutorialSteps = [
  ['Pick a region for each trip', 'Choose one active island site. Your 30-second trip gathers only that site’s resource, so coordinate with your crew to cover what your order needs.'],
  ['Your crew gathers together', 'Supplies arrive automatically every six seconds while you are away. Everyone on your team adds to the same stash, even when you are exploring different regions.'],
  ['Solve site signals for a boost', 'Once during a trip, try the quick site puzzle for a powerup. You can also discover powerups while gathering; choose one before your next trip.'],
  ['Deliver your crew’s orders', 'Use the shared stash to complete your crew’s next settlement order. A Survey Challenge can earn a token for a site upgrade. Your crew’s score after ten minutes wins; a tie starts Golden Beacon sudden death.']
];
const upgradeCosts = { wood: { wood: 8, stone: 4, crystal: 4 }, stone: { wood: 4, stone: 8, crystal: 4 }, crystal: { wood: 4, stone: 4, crystal: 8 } };

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
  room = nextRoom; playerId = id; helperOverrideResource = 'auto'; saveSession();
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
  if (['playing', 'tiebreak', 'finished'].includes(room.phase) && !myPlayer.newPlayer) localStorage.setItem('resource-scramble-tutorial-complete', 'true');
  $('room-title').textContent = `Welcome, ${myPlayer.name}`;
  const lobby = room.phase === 'lobby';
  $('lobby-panel').classList.toggle('hidden', !lobby);
  const inTutorial = room.phase === 'tutorial';
  $('tutorial-panel').classList.toggle('hidden', !inTutorial);
  const inGame = ['playing', 'tiebreak'].includes(room.phase);
  $('game-panel').classList.toggle('hidden', !inGame);
  $('result-panel').classList.toggle('hidden', room.phase !== 'finished');
  const readyCount = room.players.filter((player) => player.ready).length;
  const allReady = room.players.length >= 2 && readyCount === room.players.length;
  const teamCounts = [0, 1].map((teamId) => room.players.filter((player) => player.team === teamId).length);
  const teamsBalanced = Math.abs(teamCounts[0] - teamCounts[1]) <= 1;
  const idealCounts = [Math.ceil(room.players.length / 2), Math.floor(room.players.length / 2)];
  const balanceText = room.players.length < 2 ? 'Waiting for another player to form two crews.' : teamsBalanced ? `${room.teams[0].name} ${teamCounts[0]} · ${room.teams[1].name} ${teamCounts[1]} — balanced` : `Crews are ${teamCounts[0]}–${teamCounts[1]}. Move a player to make them ${idealCounts[0]}–${idealCounts[1]} before launch.`;
  $('team-balance-status').textContent = balanceText;
  $('team-balance-status').classList.toggle('unbalanced', !teamsBalanced);
  $('ready-up').disabled = !lobby;
  $('ready-up').classList.toggle('ready-confirmed', myPlayer.ready);
  $('ready-up').textContent = myPlayer.ready ? 'Ready ✓ · undo' : 'I’m ready';
  $('ready-status').textContent = `${readyCount} of ${room.players.length} ready${allReady ? ' · everyone is set' : ''}`;
  $('start-game').disabled = room.players.length < 2 || myPlayer.id !== room.createdBy || !allReady || !teamsBalanced;
  $('start-game').textContent = myPlayer.id !== room.createdBy ? 'Waiting for host…' : room.players.length < 2 ? 'Waiting for players…' : !teamsBalanced ? 'Balance teams before launch' : allReady ? 'Launch the round   ↗' : `Waiting for everyone (${readyCount}/${room.players.length})`;
  renderTeams();
  if (inTutorial) renderTutorial(myPlayer);
  if (inGame) renderGame(myPlayer);
  if (room.phase === 'finished') renderResult();
}
function renderTutorial(me) {
  const isLearning = me.newPlayer && !me.tutorialDone;
  $('tutorial-guide').classList.toggle('hidden', !isLearning);
  $('tutorial-wait').classList.toggle('hidden', isLearning);
  $('tutorial-wait-countdown').textContent = room.timeLeft;
  if (!isLearning) return;
  const [title, copy] = tutorialSteps[tutorialStep];
  $('tutorial-step-count').textContent = `STEP ${tutorialStep + 1} OF ${tutorialSteps.length}`;
  $('tutorial-title').textContent = title;
  $('tutorial-copy').textContent = copy;
  $('tutorial-back').disabled = tutorialStep === 0;
  $('tutorial-next').textContent = tutorialStep === tutorialSteps.length - 1 ? 'Start the round' : 'Next';
}
async function completeTutorial() {
  try {
    const result = await api('tutorial-done', { code: room.code, playerId });
    localStorage.setItem('resource-scramble-tutorial-complete', 'true');
    room = result.room; render();
  } catch (error) { setError('room-error', error.message); }
}
function renderTeams() {
  const me = room.players.find((player) => player.id === playerId);
  const counts = [0, 1].map((teamId) => room.players.filter((player) => player.team === teamId).length);
  const maxLobbyDifference = room.players.length % 2 === 0 ? 2 : 1;
  const canChoose = room.phase === 'lobby' && room.players.length >= 3;
  const canSwitch = (targetTeam) => {
    if (!me || targetTeam === me.team) return false;
    const next = [...counts]; next[me.team] -= 1; next[targetTeam] += 1;
    return Math.abs(next[0] - next[1]) <= maxLobbyDifference;
  };
  $('lobby-teams').innerHTML = room.teams.map((team) => {
    const players = room.players.filter((p) => p.team === team.id);
    const canCustomize = room.phase === 'lobby' && room.players.length >= 3 && me?.team === team.id;
    const teamChoice = canChoose ? `<div class="team-choice"><button class="team-select-button ${me?.team === team.id ? 'current' : ''}" data-join-team="${team.id}" ${me?.team === team.id || !canSwitch(team.id) ? 'disabled' : ''}>${me?.team === team.id ? 'Your crew' : canSwitch(team.id) ? `Join ${escapeHtml(team.name)}` : 'Too uneven'}</button></div>` : '';
    const controls = canCustomize ? `<div class="team-customize"><label>CREW NAME<input data-team-name="${team.id}" maxlength="18" value="${escapeHtml(team.name)}" aria-label="Crew name"></label><label>EMBLEM<select data-team-symbol="${team.id}" aria-label="Crew emblem">${teamSymbols.map(([symbol, label]) => `<option value="${symbol}" ${team.symbol === symbol ? 'selected' : ''}>${symbol} ${label}</option>`).join('')}</select></label></div>` : '';
    return `<div class="team-box ${team.id ? 'tide' : 'ember'}"><div class="team-box-head"><span><span class="team-emblem">${escapeHtml(team.symbol)}</span> ${escapeHtml(team.name)}</span><span>${players.length} ${players.length === 1 ? 'player' : 'players'}</span></div><div class="team-members">${players.map((p) => `<span class="player-chip ${p.ready ? 'is-ready' : 'is-not-ready'}"><span>${escapeHtml(p.name)}${p.id === playerId ? ' · you' : ''}</span><small>${p.ready ? 'READY' : 'NOT READY'}</small></span>`).join('') || '<span class="player-chip">Waiting for crew…</span>'}</div>${teamChoice}${controls}</div>`;
  }).join('');
}
function renderGame(me) {
  const team = room.teams[me.team];
  room.teams.forEach((entry) => {
    $(`team-name-${entry.id}`).textContent = entry.name; $(`points-${entry.id}`).textContent = entry.score; $(`team-symbol-${entry.id}`).textContent = entry.symbol;
  });
  const secs = Math.max(0, room.timeLeft);
  $('timer-label').textContent = room.phase === 'tiebreak' ? 'SUDDEN DEATH' : 'STORM IN';
  $('timer').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const timerDuration = room.phase === 'tiebreak' ? room.tiebreakDuration : room.duration;
  $('timer-bar').style.width = `${(secs / timerDuration) * 100}%`;
  $('event-banner').className = `event-banner ${room.phase === 'tiebreak' ? 'tiebreak-banner' : ''}`;
  $('event-banner').innerHTML = `<span>✦</span> ${escapeHtml(room.event)}`;
  const trip = me.trip;
  renderHelper(team);
  const tripSite = trip && room.sites.find((site) => site.id === trip.siteId);
  if (trip && tripSite) {
    const duration = trip.endsAt - trip.startedAt;
    const elapsed = Math.max(0, Date.now() - trip.startedAt);
    const remaining = Math.max(0, Math.ceil((trip.endsAt - Date.now()) / 1000));
    const percent = Math.min(100, elapsed / duration * 100);
    const interval = trip.yieldIntervalMs || 6000;
    const nextHaul = Math.max(0, Math.ceil((interval - (elapsed % interval)) / 1000));
    const puzzleAction = trip.puzzleAvailable ? '<button class="puzzle-button" id="try-puzzle">Solve site puzzle · earn a powerup ✦</button>' : `<small>${trip.puzzleSolved ? 'Puzzle solved · powerup earned' : trip.puzzleAttempted ? 'Puzzle attempt used' : `Next automatic haul in ${nextHaul}s`}</small>`;
    const challengeAction = team.surveySolved ? team.upgradeTokens ? '<small class="survey-status">Survey token ready · spend it on a site upgrade</small>' : '<small class="survey-status">Survey challenge solved this round</small>' : trip.challengeAttempted ? '<small class="survey-status">Try the Survey Challenge again on your next trip</small>' : '<button class="puzzle-button challenge-button" id="try-challenge">Survey challenge · win a yield token ✦</button>';
    $('trip-status').innerHTML = `<div class="trip-active"><strong>${tripSite.icon} On trip: ${escapeHtml(tripSite.name)}</strong><small>Return in ${remaining}s · ${trip.yields} ${names[tripSite.resource]} gathered${trip.upgradeBonus ? ` · +${trip.upgradeBonus} site bonus` : ''}</small><div class="trip-progress"><i style="width:${percent}%"></i></div>${puzzleAction}${challengeAction}</div>`;
  } else {
    $('trip-status').innerHTML = `<div class="trip-ready"><b>${selectedBoostId ? 'Powerup selected for your next trip' : 'Choose a site for your next trip'}</b><span>${selectedBoostId ? 'It will activate when you depart.' : 'Plan your crew’s resource route.'}</span></div>`;
  }
  $('sites').innerHTML = [...room.sites].sort((a, b) => siteButtonOrder.indexOf(a.id) - siteButtonOrder.indexOf(b.id)).map((site) => `<button class="site-card" data-site="${site.id}" ${!site.active || Boolean(trip) ? 'disabled' : ''}><span class="site-icon">${site.icon}</span><strong>${escapeHtml(site.name)}</strong><small>${site.active ? `Gather ${names[site.resource]}` : 'Resting for now'}</small><span class="gather-cta">${trip ? 'ON YOUR TRIP' : site.active ? `START 30s TRIP ${icons[site.resource]} →` : 'SITE RESTING'}</span></button>`).join('');
  $('crew-trips').innerHTML = room.players.filter((player) => player.id !== me.id && player.trip).map((player) => {
    const site = room.sites.find((entry) => entry.id === player.trip.siteId);
    return `<span class="crew-trip-chip">${escapeHtml(player.name)} · ${site?.icon || '✦'} ${escapeHtml(site?.name || 'on trip')}</span>`;
  }).join('');
  const activeTrips = room.players.filter((player) => player.trip);
  $('trip-count').textContent = `${activeTrips.length} EXPLORING`;
  $('trip-markers').innerHTML = activeTrips.map((player) => {
    const elapsed = Math.max(0, Date.now() - player.trip.startedAt);
    const duration = Math.max(1, player.trip.endsAt - player.trip.startedAt);
    const site = room.sites.find((entry) => entry.id === player.trip.siteId);
    const initials = player.name.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    return `<span class="trip-marker ${player.team ? 'tide' : 'ember'} ${player.trip.siteId}" style="animation-duration:${duration}ms;animation-delay:-${elapsed}ms" title="${escapeHtml(player.name)} · ${escapeHtml(site?.name || 'on expedition')}">${escapeHtml(initials)}</span>`;
  }).join('');
  for (const key of Object.keys(names)) $(`stash-${key}`).textContent = team.stash[key];
  $('my-team-pill').textContent = `${team.symbol} ${team.name}`; $('my-team-pill').className = `my-team-pill ${team.id ? 'tide-pill' : ''}`;
  $('order-kicker').textContent = room.phase === 'tiebreak' ? 'SUDDEN-DEATH ORDER' : 'YOUR CREW’S ORDER';
  $('order-icon').textContent = room.phase === 'tiebreak' ? '🏆' : '📦';
  $('order-name').textContent = team.order.name; $('order-points').textContent = room.phase === 'tiebreak' ? 'WIN' : team.order.points;
  $('order-unit').textContent = room.phase === 'tiebreak' ? 'TO WIN' : 'PTS';
  $('order-costs').innerHTML = Object.entries(team.order.costs).map(([key, quantity]) => `<span class="cost-pill ${team.stash[key] >= quantity ? 'ready' : ''}">${icons[key]} ${team.stash[key]} / ${quantity} ${names[key]}</span>`).join('');
  const deliver = $('deliver-order'); deliver.disabled = !Object.entries(team.order.costs).every(([key, quantity]) => team.stash[key] >= quantity);
  deliver.innerHTML = room.phase === 'tiebreak' ? 'Deliver to win <span>→</span>' : 'Deliver <span>→</span>';
  const boosts = me.boosts || [];
  if (selectedBoostId && !boosts.some((boost) => boost.instanceId === selectedBoostId)) selectedBoostId = null;
  $('boost-count').textContent = `${boosts.length} / 2`;
  $('powerups').innerHTML = boosts.length ? boosts.map((boost) => `<button class="powerup-card ${selectedBoostId === boost.instanceId ? 'selected' : ''}" data-boost="${boost.instanceId}" ${trip ? 'disabled' : ''}><span>${boost.icon}</span><b>${escapeHtml(boost.name)}${selectedBoostId === boost.instanceId ? ' · READY' : ''}</b><small>${escapeHtml(boost.description)}</small></button>`).join('') : '<p class="powerup-empty">Find a powerup on a trip or solve a site puzzle.</p>';
  $('upgrade-token-count').textContent = `${team.upgradeTokens} survey ${team.upgradeTokens === 1 ? 'token' : 'tokens'}`;
  $('yield-upgrades').innerHTML = Object.keys(names).map((resource) => {
    const costs = upgradeCosts[resource];
    const costLabel = Object.entries(costs).map(([key, amount]) => `${icons[key]} ${amount}`).join(' ');
    if (team.upgrades[resource]) return `<div class="yield-upgrade upgraded"><span>${icons[resource]}</span><b>${names[resource]} site</b><small>+3 per trip · upgraded</small></div>`;
    const canAfford = Object.entries(costs).every(([key, amount]) => team.stash[key] >= amount);
    const token = team.upgradeTokens > 0;
    const options = [
      ...(canAfford ? [`<button aria-label="Upgrade ${names[resource]} site with supplies" data-upgrade="${resource}" data-use-token="false">Buy · ${costLabel}</button>`] : []),
      ...(token ? [`<button aria-label="Upgrade ${names[resource]} site with a survey token" data-upgrade="${resource}" data-use-token="true">Use token</button>`] : []),
    ];
    if (!options.length) options.push(`<button disabled>Need ${costLabel}</button>`);
    return `<div class="yield-upgrade"><span>${icons[resource]}</span><b>${names[resource]} site</b><small>+3 per trip</small><div class="upgrade-options">${options.join('')}</div></div>`;
  }).join('');
}
function usefulHelperResource(team, exclude = null) {
  const need = (resource) => Math.max(0, (team.order.costs[resource] || 0) - team.stash[resource]);
  return Object.keys(names).filter((resource) => resource !== exclude).sort((a, b) => need(b) - need(a) || (team.order.costs[b] || 0) - (team.order.costs[a] || 0) || team.stash[a] - team.stash[b])[0];
}
function renderHelper(team) {
  const panel = $('helper-panel');
  if (room.helperTeamId !== team.id) { panel.innerHTML = ''; panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const helperTrip = team.helperTrip;
  const status = helperTrip ? `Helper gathering ${names[helperTrip.resource]} · ${helperTrip.yields}/3` : 'Helper gathers up to 3 supplies over 30s after a teammate departs.';
  const members = room.players.filter((player) => player.team === team.id);
  if (members.length === 1) {
    const options = ['auto', ...Object.keys(names)].map((resource) => `<option value="${resource}" ${helperOverrideResource === resource ? 'selected' : ''}>${resource === 'auto' ? 'Automatic · best other order resource' : `Override · ${names[resource]}`}</option>`).join('');
    panel.innerHTML = `<div class="helper-panel-head"><b>🧭 Crew helper</b><span>${escapeHtml(status)}</span></div><label class="helper-control">Helper resource<select id="helper-resource-override">${options}</select></label>`;
    return;
  }
  const modeVotes = team.helperModeVotes || {};
  const resourceVotes = team.helperResourceVotes || {};
  const autoVotes = members.filter((member) => modeVotes[member.id] === 'auto').length;
  const manualVotes = members.filter((member) => modeVotes[member.id] === 'manual').length;
  const resourceButtons = team.helperMode === 'manual' ? `<div class="helper-resource-votes">${Object.keys(names).map((resource) => {
    const votes = members.filter((member) => resourceVotes[member.id] === resource).length;
    return `<button class="helper-vote-button ${resourceVotes[playerId] === resource ? 'selected' : ''}" data-helper-resource="${resource}">${icons[resource]} ${names[resource]} <small>${votes} vote${votes === 1 ? '' : 's'}</small></button>`;
  }).join('')}</div>` : '';
  panel.innerHTML = `<div class="helper-panel-head"><b>🧭 Crew helper</b><span>${escapeHtml(status)}</span></div><p>Vote for automatic order-based gathering or manual resource choice. Majority decides; ties stay automatic. Manual resource ties also use the order-based choice.</p><div class="helper-mode-votes"><button class="helper-vote-button ${modeVotes[playerId] === 'auto' ? 'selected' : ''}" data-helper-mode="auto">Auto <small>${autoVotes} vote${autoVotes === 1 ? '' : 's'}</small></button><button class="helper-vote-button ${modeVotes[playerId] === 'manual' ? 'selected' : ''}" data-helper-mode="manual">Choose resource <small>${manualVotes} vote${manualVotes === 1 ? '' : 's'}</small></button></div>${resourceButtons}`;
}
function renderResult() {
  const winner = room.winner;
  $('result-title').textContent = winner === 'draw' ? 'A perfect tie!' : `${room.teams[winner].name} wins!`;
  const tiebreakCopy = { golden_beacon: 'Won sudden death by delivering the Golden Beacon first.', overtime_haul: 'Won sudden death with the biggest overtime haul.', remaining_supplies: 'Won the final tiebreak with more supplies left.', coin_flip: 'The crews stayed even through sudden death. A coin flip decided it.' };
  $('result-copy').textContent = winner === 'draw' ? 'Both crews left with the same stash.' : room.tiebreakMethod ? tiebreakCopy[room.tiebreakMethod] : 'The island is saved. The crew takes the crown.';
  $('result-scores').innerHTML = room.teams.map((team) => `<div><small>${escapeHtml(team.symbol)} ${escapeHtml(team.name)}</small><b>${team.score} pts</b><small>${Object.values(team.stash).reduce((a,b)=>a+b,0)} supplies left</small></div>`).join('');
  $('rematch').classList.toggle('hidden', room.players.find((p) => p.id === playerId)?.id !== room.createdBy);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function toast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1700); }
function updateThemeButton() {
  const light = document.body.classList.contains('light-mode');
  $('theme-toggle').textContent = light ? '☾' : '☼';
  $('theme-toggle').setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  $('theme-toggle').title = light ? 'Switch to dark mode' : 'Switch to light mode';
}
function closePuzzle() {
  clearInterval(puzzleCountdownTimer); puzzleCountdownTimer = null;
  $('puzzle-modal').classList.add('hidden');
  $('puzzle-countdown').classList.add('hidden');
}
async function openPuzzle(mode = '') {
  try {
    const query = `puzzle?code=${room.code}&playerId=${playerId}${mode ? `&type=${mode}` : ''}`;
    const result = await api(query, {}, 'GET');
    puzzleSequence = result.sequence || []; puzzleSymbols = result.symbols; puzzleAnswer = []; puzzleType = result.type; countSequence = result.countSequence || []; countTarget = result.countTarget;
    $('puzzle-modal').classList.remove('hidden'); $('puzzle-input').classList.add('hidden'); $('puzzle-message').textContent = ''; $('puzzle-message').classList.remove('wrong');
    const sequence = puzzleType === 'count' ? countSequence : puzzleSequence;
    const display = $('puzzle-sequence');
    display.classList.remove('count-grid', 'count-answer', 'multi-grid', 'multi-answer');
    if (puzzleType === 'count') {
      $('puzzle-title').textContent = 'Count the signal';
      $('puzzle-instructions').textContent = `Memorize the display. How many ${puzzleSymbols[countTarget]} symbols did you see?`;
      display.classList.add('count-grid');
    } else if (puzzleType === 'challenge') {
      $('puzzle-title').textContent = 'Survey challenge';
      $('puzzle-instructions').textContent = 'Memorize all six symbols, then repeat them in order.';
      display.classList.add('multi-grid');
    } else {
      $('puzzle-title').textContent = 'Repeat the signal';
      $('puzzle-instructions').textContent = 'Memorize the four symbols, then repeat them in order.';
    }
    display.innerHTML = sequence.map((index) => `<span>${puzzleSymbols[index]}</span>`).join('');
    const counter = $('puzzle-countdown'); counter.textContent = '3'; counter.classList.remove('hidden');
    let remaining = 3;
    clearInterval(puzzleCountdownTimer);
    puzzleCountdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) { counter.textContent = String(remaining); return; }
      clearInterval(puzzleCountdownTimer); puzzleCountdownTimer = null; counter.classList.add('hidden');
      revealPuzzleInput();
    }, 1000);
  } catch (error) { toast(error.message); }
}
function revealPuzzleInput() {
  const display = $('puzzle-sequence');
  if (puzzleType === 'count') {
    display.innerHTML = '<span>?</span>'.repeat(countSequence.length);
    $('puzzle-instructions').textContent = `How many ${puzzleSymbols[countTarget]} symbols were in the display?`;
    $('puzzle-input').innerHTML = '<form id="count-puzzle-form" class="count-puzzle-form"><label for="count-puzzle-answer">Enter the number you counted</label><div><input id="count-puzzle-answer" type="number" min="0" max="9" step="1" inputmode="numeric" required><button class="button primary" type="submit">Check</button></div></form>';
  } else {
    display.innerHTML = '<span>?</span>'.repeat(puzzleSequence.length);
    const required = puzzleType === 'challenge' ? 6 : 4;
    $('puzzle-instructions').textContent = `Tap the ${required} symbols in the same order.`;
    $('puzzle-input').innerHTML = puzzleSymbols.map((symbol, index) => `<button class="puzzle-symbol" data-symbol="${index}">${symbol}</button>`).join('');
  }
  $('puzzle-input').classList.remove('hidden');
}
async function submitPuzzleAnswer(answer) {
  try {
    const result = await api('puzzle', { code: room.code, playerId, sequence: answer, type: puzzleType });
    const message = $('puzzle-message');
    if (result.correct) {
      const messageText = result.tokenEarned ? 'Survey solved! Your team earned a site-upgrade token.' : result.boost ? `Signal solved! ${result.boost.icon} ${result.boost.name} added to your kit.` : 'Signal solved! Your crew received 2 extra supplies.';
      message.textContent = messageText;
      setTimeout(() => { closePuzzle(); toast(result.tokenEarned ? 'Site-upgrade token earned!' : result.boost ? `${result.boost.name} found!` : 'Puzzle bonus: 2 supplies'); }, 1150);
    } else {
      message.textContent = puzzleType === 'challenge' ? 'Survey missed. Try the challenge again on your next trip.' : 'Not quite. This trip’s puzzle is spent.';
      message.classList.add('wrong'); setTimeout(closePuzzle, 1100);
    }
  } catch (error) { $('puzzle-message').textContent = error.message; }
}

$('create-room').addEventListener('click', async () => {
  setError('home-error'); $('create-room').disabled = true;
  try { const result = await api('rooms', { name: currentName(), newPlayer: localStorage.getItem('resource-scramble-tutorial-complete') !== 'true' }); enterRoom(result.room, result.playerId); }
  catch (error) { setError('home-error', error.message); }
  finally { $('create-room').disabled = false; }
});
$('join-room').addEventListener('click', async () => {
  setError('home-error'); const code = $('room-code').value.trim().toUpperCase();
  if (!code) return setError('home-error', 'Enter a room code to join your crew.');
  $('join-room').disabled = true;
  try { const result = await api('join', { code, name: currentName(), newPlayer: localStorage.getItem('resource-scramble-tutorial-complete') !== 'true' }); enterRoom(result.room, result.playerId); }
  catch (error) { setError('home-error', error.message); }
  finally { $('join-room').disabled = false; }
});
$('room-code').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('room-code').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('join-room').click(); });
$('lobby-teams').addEventListener('change', async (event) => {
  const nameField = event.target.closest('[data-team-name]');
  const symbolField = event.target.closest('[data-team-symbol]');
  if (!nameField && !symbolField) return;
  const teamId = Number((nameField || symbolField).dataset.teamName ?? (nameField || symbolField).dataset.teamSymbol);
  const team = room.teams.find((entry) => entry.id === teamId);
  try {
    const result = await api('team-settings', { code: room.code, playerId, teamId, name: nameField ? nameField.value : team.name, symbol: symbolField ? symbolField.value : team.symbol });
    room = result.room; renderTeams();
  } catch (error) { toast(error.message); renderTeams(); }
});
$('lobby-teams').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-join-team]'); if (!button || button.disabled) return;
  try {
    const result = await api('team-select', { code: room.code, playerId, teamId: Number(button.dataset.joinTeam) });
    room = result.room; render();
  } catch (error) { toast(error.message); }
});
$('start-game').addEventListener('click', async () => {
  try { const result = await api('start', { code: room.code, playerId }); room = result.room; render(); }
  catch (error) { setError('room-error', error.message); }
});
$('ready-up').addEventListener('click', async () => {
  try {
    const result = await api('ready', { code: room.code, playerId, ready: !room.players.find((player) => player.id === playerId)?.ready });
    room = result.room; render();
  } catch (error) { setError('room-error', error.message); }
});
$('tutorial-back').addEventListener('click', () => { tutorialStep = Math.max(0, tutorialStep - 1); renderTutorial(room.players.find((player) => player.id === playerId)); });
$('tutorial-next').addEventListener('click', () => {
  if (tutorialStep < tutorialSteps.length - 1) { tutorialStep += 1; renderTutorial(room.players.find((player) => player.id === playerId)); }
  else completeTutorial();
});
$('tutorial-skip').addEventListener('click', completeTutorial);
$('sites').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-site]'); if (!button || button.disabled) return;
  try { const result = await api('trip', { code: room.code, playerId, siteId: button.dataset.site, boostId: selectedBoostId, helperResource: helperOverrideResource === 'auto' ? null : helperOverrideResource }); room = result.room; selectedBoostId = null; render(); }
  catch (error) { toast(error.message); }
});
$('helper-panel').addEventListener('change', (event) => {
  if (!event.target.matches('#helper-resource-override')) return;
  helperOverrideResource = event.target.value;
});
$('helper-panel').addEventListener('click', async (event) => {
  const modeButton = event.target.closest('[data-helper-mode]');
  const resourceButton = event.target.closest('[data-helper-resource]');
  if (!modeButton && !resourceButton) return;
  const team = room.teams[room.players.find((player) => player.id === playerId).team];
  const mode = modeButton?.dataset.helperMode || 'manual';
  const resource = resourceButton?.dataset.helperResource || team.helperResourceVotes?.[playerId] || usefulHelperResource(team);
  try { const result = await api('helper-vote', { code: room.code, playerId, mode, resource }); room = result.room; render(); }
  catch (error) { toast(error.message); }
});
$('powerups').addEventListener('click', (event) => {
  const card = event.target.closest('[data-boost]'); if (!card || card.disabled) return;
  selectedBoostId = selectedBoostId === card.dataset.boost ? null : card.dataset.boost;
  render();
});
$('trip-status').addEventListener('click', async (event) => {
  if (event.target.closest('#try-puzzle')) openPuzzle();
  else if (event.target.closest('#try-challenge')) openPuzzle('challenge');
});
$('yield-upgrades').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-upgrade]'); if (!button || button.disabled) return;
  const resource = button.dataset.upgrade;
  const me = room.players.find((player) => player.id === playerId);
  const useToken = button.dataset.useToken === 'true';
  try { const result = await api('upgrade', { code: room.code, playerId, resource, useToken }); room = result.room; render(); toast(`${names[resource]} site upgraded · +3 per trip`); }
  catch (error) { toast(error.message); }
});
$('puzzle-input').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-symbol]'); const requiredAnswers = puzzleType === 'count' ? 1 : puzzleType === 'challenge' ? 6 : 4;
  if (!button || puzzleAnswer.length >= requiredAnswers) return;
  puzzleAnswer.push(Number(button.dataset.symbol));
  $('puzzle-sequence').innerHTML = puzzleType === 'count'
    ? `<span>${puzzleAnswer[0]}</span>`
    : puzzleAnswer.map((index) => `<span>${puzzleSymbols[index]}</span>`).join('') + '<span>·</span>'.repeat(requiredAnswers - puzzleAnswer.length);
  if (puzzleType === 'count') $('puzzle-sequence').classList.add('count-answer');
  if (puzzleType === 'challenge') $('puzzle-sequence').classList.add('multi-answer');
  if (puzzleAnswer.length !== requiredAnswers) return;
  submitPuzzleAnswer(puzzleAnswer);
});
$('puzzle-input').addEventListener('submit', (event) => {
  if (!event.target.matches('#count-puzzle-form')) return;
  event.preventDefault();
  if (puzzleAnswer.length) return;
  const input = $('count-puzzle-answer');
  if (!input.reportValidity()) return;
  const answer = Number(input.value);
  puzzleAnswer = [answer];
  $('puzzle-sequence').innerHTML = `<span>${answer}</span>`;
  $('puzzle-sequence').classList.add('count-answer');
  submitPuzzleAnswer(puzzleAnswer);
});
$('puzzle-close').addEventListener('click', closePuzzle);
$('deliver-order').addEventListener('click', async () => {
  const wasTiebreak = room.phase === 'tiebreak';
  try { await api('order', { code: room.code, playerId }); toast(wasTiebreak ? 'Golden Beacon delivered!' : 'Order delivered! Points for your crew.'); }
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
$('theme-toggle').addEventListener('click', () => {
  const light = document.body.classList.toggle('light-mode');
  localStorage.setItem('resource-scramble-theme', light ? 'light' : 'dark');
  updateThemeButton();
});
updateThemeButton();
systemDarkMode?.addEventListener?.('change', (event) => {
  if (localStorage.getItem('resource-scramble-theme')) return;
  document.body.classList.toggle('light-mode', !event.matches);
  updateThemeButton();
});
window.addEventListener('pagehide', () => { if (stream) stream.close(); });

// Rejoin a room after a refresh on this device; the session token is local to this browser.
(async function restoreSession() {
  const saved = localStorage.getItem('resource-scramble-session');
  if (!saved) return;
  let session;
  try {
    session = JSON.parse(saved);
    pendingSession = session;
    const result = await api(`state?code=${session.code}`, {}, 'GET');
    const player = result.room.players.find((p) => p.id === session.playerId);
    if (!player) { localStorage.removeItem('resource-scramble-session'); return; }
    $('return-title').textContent = `Continue as ${player.name}`;
    const phase = { lobby: 'Waiting in the lobby', playing: 'Round in progress', tiebreak: 'Sudden-death tiebreak', finished: 'Last round finished' }[result.room.phase] || 'Room available';
    $('return-meta').textContent = `${result.room.code} · ${phase}`;
    $('return-session').classList.remove('hidden');
  } catch (error) {
    if (!session) { localStorage.removeItem('resource-scramble-session'); return; }
    $('return-session').classList.remove('hidden');
    $('return-title').textContent = 'Your last room may still be available';
    $('return-meta').textContent = `${session.code} · last played here`;
    $('return-error').textContent = 'Could not reach the room right now. Retry Continue, or join/start another room below.';
  }
})();

$('continue-game').addEventListener('click', async () => {
  if (!pendingSession) return;
  $('continue-game').disabled = true;
  try {
    const result = await api(`state?code=${pendingSession.code}`, {}, 'GET');
    if (!result.room.players.some((player) => player.id === pendingSession.playerId)) throw new Error('This player is no longer in that room.');
    enterRoom(result.room, pendingSession.playerId);
  } catch (error) { $('return-error').textContent = error.message; }
  finally { $('continue-game').disabled = false; }
});
