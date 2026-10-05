# Resource Scramble

A real-time, two-crew resource gathering game for 2–8 players. Each crew shares a stash, gathers materials around the island, and completes settlement orders for points before the ten-minute storm timer expires.

## Run it

Requires Node.js 18 or newer. From this folder, run:

```sh
npm start
```

Open `http://localhost:3000` to create a room. To play with others on your local network, they can open the host computer’s local network address on port `3000`. For friends outside that network, run this Node server on a publicly reachable host and share its URL. Room state is held in server memory and resets when the server restarts.

When returning in the same browser, the home screen offers to continue the last room or join/create another. The server must still be running with that room in memory for Continue to work.

## How to play

- Create a room and share its six-character code. Up to eight players join from their own devices.
- Players are assigned to the smaller crew as they join. Once four players have joined, players can choose a crew; even-sized lobbies may briefly be off balance while players arrange themselves.
- Before launch, each player marks themselves ready. The lobby shows each player’s status, and the host can launch once everyone is ready; readiness resets for a rematch.
- The host can start with at least two players when the crews are balanced: equal sizes for even lobbies, or a one-player difference for odd lobbies. The host also waits for every player to mark ready.
- New players see a short four-step tutorial before the round. Their teammates wait in a crew briefing, and the round starts when everyone finishes or after one minute.
- Choose an active island site to begin a 30-second trip. You are committed to gathering that site's resource for the trip, and one supply is added to the shared stash automatically every six seconds.
- Try the site's quick puzzle during a trip to earn a powerup. Each visit randomly offers a four-symbol memory sequence or a symbol-count challenge with a numeric answer. Both show a three-second countdown. Trips can also uncover powerups at random. Keep up to two; select one before departing to double your first haul, return sooner, or add supplies to your chosen resource.
- Each crew can try the six-symbol Survey Challenge during a trip. A wrong answer uses that trip’s attempt; try again on a later trip. The first correct answer earns one team token that pays for a site yield upgrade. Otherwise, buy an upgrade with 8 of that site's resource and 4 of each other resource; each site can be upgraded once per round, adding 3 supplies to every trip there.
- Each crew has its own settlement order and progression. Spend materials from your shared stash to earn points; only your crew's next order changes when you deliver.
- Resource sites rotate through short rest periods. Crystal showers sometimes double crystal yields. Your crew can split up across sites or coordinate on one resource.
- At four or more players, each crew can customize its name and emblem in the lobby.
- At ten minutes, the higher score wins. If scores are tied, a two-minute sudden-death round begins: the first crew to deliver a Golden Beacon wins. If neither crew delivers in time, the bigger overtime haul wins, followed by remaining supplies; a perfectly even overtime ends with a coin flip.

The host can start a rematch from the result screen.

The website follows the device's light/dark appearance by default. Use the sun/moon control in the header to choose a saved theme override for that device.
