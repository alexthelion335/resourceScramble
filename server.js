const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();
const RESOURCES = ['wood', 'stone', 'crystal'];
const TEAM_SYMBOLS = ['🔥', '🌊', '🌿', '⭐', '⚡', '🦊', '🐙', '🌈', '🦈', '🐢', '🍄', '☀️'];
const BOOSTS = [
  { id: 'lucky_pick', name: 'Lucky Pick', icon: '⛏️', description: 'Double your first haul this trip.' },
  { id: 'swift_boots', name: 'Swift Boots', icon: '🥾', description: 'Return 10 seconds sooner.' },
  { id: 'supply_flare', name: 'Supply Flare', icon: '🚩', description: 'Add 3 of this resource to the stash.' },
];
const ORDERS = [
  { name: 'Beacon Repair', costs: { wood: 8, stone: 5 }, points: 8 },
  { name: 'Crystal Radio', costs: { wood: 4, crystal: 6 }, points: 10 },
  { name: 'Storm Wall', costs: { wood: 7, stone: 8 }, points: 12 },
  { name: 'Signal Flare', costs: { stone: 4, crystal: 5 }, points: 9 },
  { name: 'Sky Bridge', costs: { wood: 10, crystal: 4 }, points: 11 },
  { name: 'Shelter Kit', costs: { wood: 6, stone: 6, crystal: 2 }, points: 13 },
];

function publicRoom(room) {
  return {
    code: room.code, phase: room.phase, createdBy: room.createdBy,
    players: [...room.players.values()].map(({ id, name, team, online, ready, trip, boosts, newPlayer, tutorialDone }) => ({ id, name, team, online, ready, newPlayer, tutorialDone, trip: trip ? { siteId: trip.siteId, startedAt: trip.startedAt, endsAt: trip.endsAt, yieldIntervalMs: trip.yieldIntervalMs, yields: trip.yields, upgradeBonus: trip.upgradeBonus, puzzleSolved: trip.puzzleSolved, puzzleAvailable: !trip.puzzleAttempted && !trip.puzzleSolved, challengeAttempted: trip.challengeAttempted } : null, boosts: boosts || [] })),
    teams: room.teams, timeLeft: room.phase === 'tutorial' ? Math.max(0, Math.ceil((room.tutorialEndsAt - Date.now()) / 1000)) : ['playing', 'tiebreak'].includes(room.phase) ? Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000)) : room.duration,
    duration: room.duration, tutorialDuration: room.tutorialDuration, tiebreakDuration: room.tiebreakDuration, round: room.round, winner: room.winner, tiebreakMethod: room.tiebreakMethod,
    sites: room.sites, event: room.event,
  };
}
function emit(room) {
  const data = `data: ${JSON.stringify(publicRoom(room))}\n\n`;
  for (const res of room.listeners) res.write(data);
}
function newTeams() {
  const orders = [newOrder(), newOrder()];
  while (orders[0].name === orders[1].name) orders[1] = newOrder();
  return [0, 1].map((id) => ({ id, name: id ? 'Tide Crew' : 'Ember Crew', symbol: id ? '🌊' : '🔥', color: id ? '#368fe8' : '#f07846', score: 0, stash: { wood: 0, stone: 0, crystal: 0 }, order: orders[id], upgrades: { wood: false, stone: false, crystal: false }, upgradeTokens: 0, surveySolved: false }));
}
function newOrder() {
  const order = ORDERS[Math.floor(Math.random() * ORDERS.length)];
  return { ...order, costs: { ...order.costs }, id: crypto.randomUUID() };
}
function createRoom(name, isNewPlayer) {
  let code;
  do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
  const id = crypto.randomUUID();
  const room = {
    code, phase: 'lobby', createdBy: id, players: new Map([[id, { id, name: cleanName(name), team: 0, online: true, ready: false, boosts: [], trip: null, newPlayer: Boolean(isNewPlayer), tutorialDone: !isNewPlayer }]]),
    teams: newTeams(), duration: 600, tutorialDuration: 60, tutorialEndsAt: 0, tiebreakDuration: 120, tiebreakHauls: [0, 0], tiebreakMethod: null, round: 1, winner: null,
    sites: [
      { id: 'grove', name: 'Driftwood Grove', resource: 'wood', icon: '🌲', active: true },
      { id: 'quarry', name: 'Cloudstone Ridge', resource: 'stone', icon: '🪨', active: true },
      { id: 'crystal', name: 'Prism Grotto', resource: 'crystal', icon: '💎', active: true },
    ], event: 'All sites are open', listeners: new Set(), timer: null, endsAt: 0,
  };
  rooms.set(code, room);
  return { room, playerId: id };
}
function cleanName(value) { return String(value || 'Rover').trim().slice(0, 16) || 'Rover'; }
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let raw = ''; for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
function auth(room, id) { return room.players.get(id); }
function teamCounts(room) { return [0, 1].map((teamId) => [...room.players.values()].filter((player) => player.team === teamId).length); }
function launchRound(room) {
  room.phase = 'playing'; room.endsAt = Date.now() + room.duration * 1000; room.winner = null; room.tiebreakMethod = null; room.tiebreakHauls = [0, 0]; room.nextRotation = Date.now() + 25000;
  room.sites.forEach((site) => { site.active = true; }); room.event = 'All sites are open';
}
function start(room) {
  const counts = teamCounts(room);
  if (room.phase !== 'lobby' || room.players.size < 2 || Math.abs(counts[0] - counts[1]) > 1 || [...room.players.values()].some((player) => !player.ready)) return false;
  const newPlayers = [...room.players.values()].filter((player) => player.newPlayer && !player.tutorialDone);
  if (newPlayers.length) { room.phase = 'tutorial'; room.tutorialEndsAt = Date.now() + room.tutorialDuration * 1000; room.event = 'Quick crew briefing · the round starts when everyone is ready'; }
  else launchRound(room);
  room.timer = setInterval(() => {
    if (room.phase === 'tutorial') {
      const waiting = [...room.players.values()].filter((player) => player.newPlayer && !player.tutorialDone);
      if (!waiting.length || Date.now() >= room.tutorialEndsAt) {
        for (const player of waiting) { player.tutorialDone = true; player.newPlayer = false; }
        launchRound(room); emit(room); return;
      }
      emit(room); return;
    }
    const left = Math.ceil((room.endsAt - Date.now()) / 1000);
    for (const player of room.players.values()) {
      if (!player.trip) continue;
      const trip = player.trip;
      const finalGatherAt = Math.min(trip.endsAt, room.endsAt);
      while (trip.nextYieldAt <= Date.now() && trip.nextYieldAt <= finalGatherAt) {
        let amount = room.event === 'Crystal showers' && trip.resource === 'crystal' ? 2 : 1;
        if (trip.boostId === 'lucky_pick' && trip.yields === 0) amount *= 2;
        room.teams[player.team].stash[trip.resource] += amount;
        if (room.phase === 'tiebreak') room.tiebreakHauls[player.team] += amount;
        trip.yields += amount;
        trip.nextYieldAt += trip.yieldIntervalMs;
        if (player.boosts.length < 2 && Math.random() < 0.035) player.boosts.push(randomBoost());
      }
      if (Date.now() >= trip.endsAt || left <= 0) player.trip = null;
    }
    if (room.phase === 'playing' && left > 0 && Date.now() >= room.nextRotation) {
      room.sites.forEach((site) => { site.active = true; });
      const resting = room.sites[Math.floor(Math.random() * room.sites.length)];
      resting.active = false;
      room.event = `${resting.name} is resting · other sites yield normally`;
      room.nextRotation = Date.now() + 18000;
      if (Math.random() < 0.35) {
        const crystal = room.sites.find((site) => site.resource === 'crystal');
        crystal.active = true; room.event = 'Crystal showers · crystal yields double';
      }
    }
    if (left <= 0 && room.phase === 'playing') {
      const [a, b] = room.teams;
      if (a.score === b.score) {
        room.phase = 'tiebreak'; room.endsAt = Date.now() + room.tiebreakDuration * 1000; room.tiebreakHauls = [0, 0]; room.nextRotation = Date.now() + 10000;
        room.sites.forEach((site) => { site.active = true; });
        room.event = 'SUDDEN DEATH · Deliver the Golden Beacon first to win';
        for (const team of room.teams) team.order = { name: 'Golden Beacon', costs: { wood: 3, stone: 3, crystal: 3 }, points: 0, id: crypto.randomUUID() };
        for (const player of room.players.values()) player.trip = null;
      } else {
        room.phase = 'finished'; clearInterval(room.timer); room.winner = a.score > b.score ? 0 : 1;
        for (const player of room.players.values()) player.trip = null;
      }
    } else if (left <= 0 && room.phase === 'tiebreak') {
      room.phase = 'finished'; clearInterval(room.timer);
      const [a, b] = room.teams;
      if (room.tiebreakHauls[0] !== room.tiebreakHauls[1]) { room.winner = room.tiebreakHauls[0] > room.tiebreakHauls[1] ? 0 : 1; room.tiebreakMethod = 'overtime_haul'; }
      else if (sum(a.stash) !== sum(b.stash)) { room.winner = sum(a.stash) > sum(b.stash) ? 0 : 1; room.tiebreakMethod = 'remaining_supplies'; }
      else { room.winner = Math.random() < 0.5 ? 0 : 1; room.tiebreakMethod = 'coin_flip'; }
      for (const player of room.players.values()) player.trip = null;
    }
    emit(room);
  }, 1000);
  emit(room); return true;
}
function sum(obj) { return RESOURCES.reduce((n, key) => n + obj[key], 0); }
function randomBoost() { return { ...BOOSTS[Math.floor(Math.random() * BOOSTS.length)], instanceId: crypto.randomUUID() }; }
function enough(stash, costs) { return Object.entries(costs).every(([key, qty]) => stash[key] >= qty); }
function jsonRoute(req, res, pathname, data) {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); return res.end(); }
  if (pathname === '/api/rooms' && req.method === 'POST') {
    const { room, playerId } = createRoom(data.name, data.newPlayer);
    return send(res, 201, { room: publicRoom(room), playerId });
  }
  const code = String(data.code || '').toUpperCase();
  const room = rooms.get(code);
  if (pathname === '/api/join' && req.method === 'POST') {
    if (!room) return send(res, 404, { error: 'That room code was not found.' });
    if (room.phase !== 'lobby') return send(res, 409, { error: 'This round has already started.' });
    if (room.players.size >= 8) return send(res, 409, { error: 'This crew is full.' });
    const id = crypto.randomUUID();
    const counts = [0, 1].map((team) => [...room.players.values()].filter((p) => p.team === team).length);
    const team = counts[0] <= counts[1] ? 0 : 1;
    room.players.set(id, { id, name: cleanName(data.name), team, online: true, ready: false, boosts: [], trip: null, newPlayer: Boolean(data.newPlayer), tutorialDone: !data.newPlayer });
    emit(room); return send(res, 200, { room: publicRoom(room), playerId: id });
  }
  if (pathname === '/api/stream' && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const liveRoom = rooms.get(String(url.searchParams.get('code') || '').toUpperCase());
    if (!liveRoom) return send(res, 404, { error: 'That room has expired.' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
    res.write(`data: ${JSON.stringify(publicRoom(liveRoom))}\n\n`);
    liveRoom.listeners.add(res);
    req.on('close', () => liveRoom.listeners.delete(res));
    return;
  }
  if (!room) return send(res, 404, { error: 'That room code was not found.' });
  if (pathname === '/api/state' && req.method === 'GET') return send(res, 200, { room: publicRoom(room) });
  const player = auth(room, data.playerId);
  if (!player) return send(res, 401, { error: 'Player not found in this room.' });
  if (pathname === '/api/tutorial-done' && req.method === 'POST') {
    if (room.phase !== 'tutorial') return send(res, 409, { error: 'The tutorial period has ended.' });
    player.tutorialDone = true; player.newPlayer = false;
    if (![...room.players.values()].some((member) => member.newPlayer && !member.tutorialDone)) launchRound(room);
    emit(room); return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/ready' && req.method === 'POST') {
    if (room.phase !== 'lobby') return send(res, 409, { error: 'Readiness can only be changed in the lobby.' });
    player.ready = Boolean(data.ready);
    emit(room); return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/team-select' && req.method === 'POST') {
    if (room.phase !== 'lobby') return send(res, 409, { error: 'Teams can only be changed in the lobby.' });
    if (room.players.size < 4) return send(res, 409, { error: 'Team selection unlocks when four players have joined.' });
    const teamId = Number(data.teamId);
    if (teamId !== 0 && teamId !== 1) return send(res, 400, { error: 'Choose one of the two crews.' });
    if (teamId === player.team) return send(res, 200, { room: publicRoom(room) });
    const counts = teamCounts(room);
    counts[player.team] -= 1; counts[teamId] += 1;
    const maxLobbyDifference = room.players.size % 2 === 0 ? 2 : 1;
    if (Math.abs(counts[0] - counts[1]) > maxLobbyDifference) return send(res, 409, { error: 'That switch would make the crews too uneven. Pick a player from the larger crew instead.' });
    player.team = teamId; player.ready = false;
    emit(room); return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/team-settings' && req.method === 'POST') {
    if (room.phase !== 'lobby') return send(res, 409, { error: 'Crew identity can only be changed in the lobby.' });
    if (room.players.size < 4) return send(res, 409, { error: 'Crew identity unlocks when four players have joined.' });
    const team = room.teams[player.team];
    if (data.teamId !== player.team) return send(res, 403, { error: 'You can only customize your own crew.' });
    const name = String(data.name || '').trim().slice(0, 18);
    if (name) {
      if (room.teams.some((other) => other.id !== team.id && other.name.toLowerCase() === name.toLowerCase())) return send(res, 409, { error: 'Choose a name different from the other crew.' });
      team.name = name;
    }
    if (TEAM_SYMBOLS.includes(data.symbol)) team.symbol = data.symbol;
    emit(room); return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/puzzle' && req.method === 'GET') {
    if (!['playing', 'tiebreak'].includes(room.phase) || !player.trip) return send(res, 409, { error: 'Start a trip before trying its puzzle.' });
    const symbols = ['🌙', '☀️', '⭐', '⚡'];
    if (data.type === 'challenge') {
      const team = room.teams[player.team];
      if (team.surveySolved) return send(res, 409, { error: 'Your team has already earned this round’s survey token.' });
      if (player.trip.challengeAttempted) return send(res, 409, { error: 'You have already tried the survey challenge this trip. Try again on your next trip.' });
      player.trip.challengeAttempted = true;
      player.trip.challengeSequence = Array.from({ length: 6 }, () => Math.floor(Math.random() * symbols.length));
      emit(room);
      return send(res, 200, { type: 'challenge', sequence: player.trip.challengeSequence, symbols });
    }
    if (player.trip.puzzleSolved || player.trip.puzzleAttempted) return send(res, 409, { error: 'You have already tried this trip’s puzzle.' });
    player.trip.puzzleAttempted = true;
    player.trip.puzzleType = Math.random() < 0.5 ? 'memory' : 'count';
    if (player.trip.puzzleType === 'memory') player.trip.puzzleSequence = Array.from({ length: 4 }, () => Math.floor(Math.random() * symbols.length));
    else {
      player.trip.countTarget = Math.floor(Math.random() * symbols.length);
      player.trip.countAnswer = 2 + Math.floor(Math.random() * 4);
      const otherSymbols = symbols.map((_, index) => index).filter((index) => index !== player.trip.countTarget);
      player.trip.countSequence = [
        ...Array(player.trip.countAnswer).fill(player.trip.countTarget),
        ...Array.from({ length: 9 - player.trip.countAnswer }, () => otherSymbols[Math.floor(Math.random() * otherSymbols.length)]),
      ].sort(() => Math.random() - 0.5);
    }
    emit(room);
    return send(res, 200, { type: player.trip.puzzleType, sequence: player.trip.puzzleSequence, symbols, countSequence: player.trip.countSequence, countTarget: player.trip.countTarget });
  }
  if (pathname === '/api/start' && req.method === 'POST') {
    if (player.id !== room.createdBy) return send(res, 403, { error: 'Only the host can start the round.' });
    if (room.players.size < 2) return send(res, 409, { error: 'Add at least one more player before starting.' });
    const counts = teamCounts(room);
    if (Math.abs(counts[0] - counts[1]) > 1) return send(res, 409, { error: 'Balance the crews before starting. Odd-sized groups may differ by one player.' });
    if ([...room.players.values()].some((member) => !member.ready)) return send(res, 409, { error: 'Wait until every player is ready.' });
    if (!start(room)) return send(res, 409, { error: 'This room cannot start yet.' });
    return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/upgrade' && req.method === 'POST') {
    if (!['playing', 'tiebreak'].includes(room.phase)) return send(res, 409, { error: 'Site upgrades can only be purchased during a round.' });
    const resource = data.resource;
    if (!RESOURCES.includes(resource)) return send(res, 400, { error: 'Choose a valid site resource.' });
    const team = room.teams[player.team];
    if (team.upgrades[resource]) return send(res, 409, { error: 'Your team has already upgraded that site this round.' });
    const costs = { wood: 4, stone: 4, crystal: 4 }; costs[resource] = 8;
    if (data.useToken) {
      if (team.upgradeTokens < 1) return send(res, 409, { error: 'Your team has no survey token to spend.' });
      team.upgradeTokens -= 1;
    } else {
      if (!enough(team.stash, costs)) return send(res, 409, { error: 'Your team needs more supplies for that site upgrade.' });
      for (const [key, quantity] of Object.entries(costs)) team.stash[key] -= quantity;
    }
    team.upgrades[resource] = true;
    emit(room); return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/trip' && req.method === 'POST') {
    if (!['playing', 'tiebreak'].includes(room.phase)) return send(res, 409, { error: 'The round is not running.' });
    if (player.trip) return send(res, 409, { error: 'Finish your current trip before choosing another site.' });
    const site = room.sites.find((s) => s.id === data.siteId);
    if (!site || !site.active) return send(res, 409, { error: 'That site is resting. Try another one.' });
    let boost = null;
    if (data.boostId) {
      const index = player.boosts.findIndex((item) => item.instanceId === data.boostId);
      if (index < 0) return send(res, 409, { error: 'That powerup is no longer in your kit.' });
      boost = player.boosts.splice(index, 1)[0];
    }
    const now = Date.now();
    const tripMs = boost?.id === 'swift_boots' ? 20000 : 30000;
    const yieldIntervalMs = boost?.id === 'swift_boots' ? 4000 : 6000;
    player.trip = { siteId: site.id, resource: site.resource, startedAt: now, endsAt: now + tripMs, nextYieldAt: now + yieldIntervalMs, yieldIntervalMs, yields: 0, puzzleSolved: false, puzzleAttempted: false, puzzleSubmitted: false, challengeAttempted: false, challengeSubmitted: false, upgradeBonus: 0, boostId: boost?.id || null };
    if (room.teams[player.team].upgrades[site.resource]) {
      player.trip.upgradeBonus = 3;
      room.teams[player.team].stash[site.resource] += 3;
      if (room.phase === 'tiebreak') room.tiebreakHauls[player.team] += 3;
    }
    if (boost?.id === 'supply_flare') {
      room.teams[player.team].stash[site.resource] += 3;
      if (room.phase === 'tiebreak') room.tiebreakHauls[player.team] += 3;
    }
    emit(room); return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/puzzle' && req.method === 'POST') {
    if (!['playing', 'tiebreak'].includes(room.phase) || !player.trip) return send(res, 409, { error: 'Start a trip before trying its puzzle.' });
    const answer = Array.isArray(data.sequence) ? data.sequence : [];
    const isChallenge = data.type === 'challenge';
    if (isChallenge && (!player.trip.challengeAttempted || player.trip.challengeSubmitted)) return send(res, 409, { error: 'Open the survey challenge before submitting.' });
    if (!isChallenge && (!player.trip.puzzleAttempted || player.trip.puzzleSubmitted)) return send(res, 409, { error: 'Open the puzzle before submitting.' });
    if (isChallenge) player.trip.challengeSubmitted = true;
    else player.trip.puzzleSubmitted = true;
    const correct = isChallenge
      ? answer.length === 6 && answer.every((value, index) => value === player.trip.challengeSequence[index])
      : player.trip.puzzleType === 'count'
        ? answer.length === 1 && Number.isInteger(answer[0]) && answer[0] >= 0 && answer[0] <= 9 && answer[0] === player.trip.countAnswer
        : answer.length === 4 && answer.every((value, index) => value === player.trip.puzzleSequence[index]);
    let reward = null;
    if (correct) {
      if (isChallenge) {
        player.trip.challengeSolved = true;
        room.teams[player.team].surveySolved = true;
        room.teams[player.team].upgradeTokens += 1;
      } else {
        player.trip.puzzleSolved = true;
        if (player.boosts.length < 2) { reward = randomBoost(); player.boosts.push(reward); }
        else {
          room.teams[player.team].stash[player.trip.resource] += 2;
          if (room.phase === 'tiebreak') room.tiebreakHauls[player.team] += 2;
        }
      }
    }
    emit(room); return send(res, 200, { correct, boost: reward, consolation: correct && !reward && !isChallenge, tokenEarned: correct && isChallenge });
  }
  if (pathname === '/api/order' && req.method === 'POST') {
    if (!['playing', 'tiebreak'].includes(room.phase)) return send(res, 409, { error: 'The round is not running.' });
    const team = room.teams[player.team];
    if (!enough(team.stash, team.order.costs)) return send(res, 409, { error: 'Your stash needs more materials for this order.' });
    for (const [key, qty] of Object.entries(team.order.costs)) team.stash[key] -= qty;
    if (room.phase === 'tiebreak') {
      room.winner = team.id; room.phase = 'finished'; room.tiebreakMethod = 'golden_beacon'; room.event = `${team.name} delivered the Golden Beacon first!`; clearInterval(room.timer);
      for (const member of room.players.values()) member.trip = null;
    } else {
      team.score += team.order.points; team.order = newOrder();
    }
    emit(room);
    return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/rematch' && req.method === 'POST') {
    if (room.phase !== 'finished') return send(res, 409, { error: 'The round is still underway.' });
    if (player.id !== room.createdBy) return send(res, 403, { error: 'Only the host can start a rematch.' });
    room.teams = newTeams(); room.phase = 'lobby'; room.winner = null; room.tiebreakMethod = null; room.round += 1;
    for (const member of room.players.values()) { member.trip = null; member.boosts = []; member.ready = false; }
    emit(room);
    return send(res, 200, { room: publicRoom(room) });
  }
  return send(res, 404, { error: 'Unknown action.' });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const data = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await body(req);
    try { return jsonRoute(req, res, url.pathname, data); } catch (error) { return send(res, 500, { error: 'Something went wrong.' }); }
  }
  let file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404); return res.end('Not found'); }
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` }); res.end(content);
  });
});
server.listen(PORT, () => console.log(`Resource Scramble listening on http://localhost:${PORT}`));
