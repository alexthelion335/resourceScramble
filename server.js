const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, 'public');
const rooms = new Map();
const RESOURCES = ['wood', 'stone', 'crystal'];
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
    players: [...room.players.values()].map(({ id, name, team, online, trip, boosts }) => ({ id, name, team, online, trip: trip ? { siteId: trip.siteId, startedAt: trip.startedAt, endsAt: trip.endsAt, yields: trip.yields, puzzleSolved: trip.puzzleSolved, puzzleAvailable: !trip.puzzleAttempted && !trip.puzzleSolved } : null, boosts: boosts || [] })),
    teams: room.teams, order: room.order, timeLeft: room.phase === 'playing' ? Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000)) : room.duration,
    duration: room.duration, round: room.round, winner: room.winner,
    sites: room.sites, event: room.event,
  };
}
function emit(room) {
  const data = `data: ${JSON.stringify(publicRoom(room))}\n\n`;
  for (const res of room.listeners) res.write(data);
}
function newTeams() {
  return [0, 1].map((id) => ({ id, name: id ? 'Tide Crew' : 'Ember Crew', color: id ? '#368fe8' : '#f07846', score: 0, stash: { wood: 0, stone: 0, crystal: 0 } }));
}
function newOrder() {
  const order = ORDERS[Math.floor(Math.random() * ORDERS.length)];
  return { ...order, costs: { ...order.costs }, id: crypto.randomUUID() };
}
function createRoom(name) {
  let code;
  do { code = crypto.randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(code));
  const id = crypto.randomUUID();
  const room = {
    code, phase: 'lobby', createdBy: id, players: new Map([[id, { id, name: cleanName(name), team: 0, online: true, boosts: [], trip: null }]]),
    teams: newTeams(), order: newOrder(), duration: 300, round: 1, winner: null,
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
function start(room) {
  if (room.phase !== 'lobby' || room.players.size < 2) return false;
  room.phase = 'playing'; room.endsAt = Date.now() + room.duration * 1000; room.winner = null; room.nextRotation = Date.now() + 25000;
  room.sites.forEach((site) => { site.active = true; }); room.event = 'All sites are open';
  room.timer = setInterval(() => {
    const left = Math.ceil((room.endsAt - Date.now()) / 1000);
    for (const player of room.players.values()) {
      if (!player.trip) continue;
      const trip = player.trip;
      const finalGatherAt = Math.min(trip.endsAt, room.endsAt);
      while (trip.nextYieldAt <= Date.now() && trip.nextYieldAt <= finalGatherAt) {
        let amount = room.event === 'Crystal showers' && trip.resource === 'crystal' ? 2 : 1;
        if (trip.boostId === 'lucky_pick' && trip.yields === 0) amount *= 2;
        room.teams[player.team].stash[trip.resource] += amount;
        trip.yields += amount;
        trip.nextYieldAt += trip.yieldIntervalMs;
        if (player.boosts.length < 2 && Math.random() < 0.035) player.boosts.push(randomBoost());
      }
      if (Date.now() >= trip.endsAt || left <= 0) player.trip = null;
    }
    if (left > 0 && Date.now() >= room.nextRotation) {
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
    if (left <= 0) {
      room.phase = 'finished'; clearInterval(room.timer);
      for (const player of room.players.values()) player.trip = null;
      const [a, b] = room.teams;
      room.winner = a.score === b.score ? (sum(a.stash) === sum(b.stash) ? 'draw' : sum(a.stash) > sum(b.stash) ? 0 : 1) : a.score > b.score ? 0 : 1;
    }
    emit(room);
  }, 1000);
  emit(room); return true;
}
function sum(obj) { return RESOURCES.reduce((n, key) => n + obj[key], 0); }
function randomBoost() { return { ...BOOSTS[Math.floor(Math.random() * BOOSTS.length)] }; }
function enough(stash, costs) { return Object.entries(costs).every(([key, qty]) => stash[key] >= qty); }
function jsonRoute(req, res, pathname, data) {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }); return res.end(); }
  if (pathname === '/api/rooms' && req.method === 'POST') {
    const { room, playerId } = createRoom(data.name);
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
    room.players.set(id, { id, name: cleanName(data.name), team, online: true, boosts: [], trip: null });
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
  if (pathname === '/api/puzzle' && req.method === 'GET') {
    if (room.phase !== 'playing' || !player.trip) return send(res, 409, { error: 'Start a trip before trying its puzzle.' });
    if (player.trip.puzzleSolved || player.trip.puzzleAttempted) return send(res, 409, { error: 'You have already tried this trip’s puzzle.' });
    player.trip.puzzleAttempted = true;
    emit(room);
    return send(res, 200, { sequence: player.trip.puzzleSequence, symbols: ['🌙', '☀️', '⭐', '⚡'] });
  }
  if (pathname === '/api/start' && req.method === 'POST') {
    if (player.id !== room.createdBy) return send(res, 403, { error: 'Only the host can start the round.' });
    if (!start(room)) return send(res, 409, { error: 'Add at least one more player before starting.' });
    return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/trip' && req.method === 'POST') {
    if (room.phase !== 'playing') return send(res, 409, { error: 'The round is not running.' });
    if (player.trip) return send(res, 409, { error: 'Finish your current trip before choosing another site.' });
    const site = room.sites.find((s) => s.id === data.siteId);
    if (!site || !site.active) return send(res, 409, { error: 'That site is resting. Try another one.' });
    let boost = null;
    if (data.boostId) {
      const index = player.boosts.findIndex((item) => item.id === data.boostId);
      if (index < 0) return send(res, 409, { error: 'That powerup is no longer in your kit.' });
      boost = player.boosts.splice(index, 1)[0];
    }
    const now = Date.now();
    const tripMs = boost?.id === 'swift_boots' ? 30000 : 40000;
    const yieldIntervalMs = boost?.id === 'swift_boots' ? 6000 : 8000;
    player.trip = { siteId: site.id, resource: site.resource, startedAt: now, endsAt: now + tripMs, nextYieldAt: now + yieldIntervalMs, yieldIntervalMs, yields: 0, puzzleSolved: false, puzzleAttempted: false, puzzleSequence: Array.from({ length: 4 }, () => Math.floor(Math.random() * 4)), boostId: boost?.id || null };
    if (boost?.id === 'supply_flare') room.teams[player.team].stash[site.resource] += 3;
    emit(room); return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/puzzle' && req.method === 'POST') {
    if (room.phase !== 'playing' || !player.trip) return send(res, 409, { error: 'Start a trip before trying its puzzle.' });
    if (!player.trip.puzzleAttempted || player.trip.puzzleSolved) return send(res, 409, { error: 'Open the puzzle before submitting.' });
    const answer = Array.isArray(data.sequence) ? data.sequence : [];
    const correct = answer.length === 4 && answer.every((value, index) => value === player.trip.puzzleSequence[index]);
    let reward = null;
    if (correct) {
      player.trip.puzzleSolved = true;
      if (player.boosts.length < 2) { reward = randomBoost(); player.boosts.push(reward); }
      else room.teams[player.team].stash[player.trip.resource] += 2;
    }
    emit(room); return send(res, 200, { correct, boost: reward, consolation: correct && !reward });
  }
  if (pathname === '/api/order' && req.method === 'POST') {
    if (room.phase !== 'playing') return send(res, 409, { error: 'The round is not running.' });
    const team = room.teams[player.team];
    if (!enough(team.stash, room.order.costs)) return send(res, 409, { error: 'Your stash needs more materials for this order.' });
    for (const [key, qty] of Object.entries(room.order.costs)) team.stash[key] -= qty;
    team.score += room.order.points; room.order = newOrder(); emit(room);
    return send(res, 200, { room: publicRoom(room) });
  }
  if (pathname === '/api/rematch' && req.method === 'POST') {
    if (room.phase !== 'finished') return send(res, 409, { error: 'The round is still underway.' });
    if (player.id !== room.createdBy) return send(res, 403, { error: 'Only the host can start a rematch.' });
    room.teams = newTeams(); room.order = newOrder(); room.phase = 'lobby'; room.winner = null; room.round += 1;
    for (const member of room.players.values()) { member.trip = null; member.boosts = []; }
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
