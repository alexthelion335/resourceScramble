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
- Players are assigned to whichever of the two crews has fewer members.
- The host starts once at least two players have joined.
- Choose an active island site to begin a 30-second trip. You are committed to gathering that site's resource for the trip, and one supply is added to the shared stash automatically every six seconds.
- Try the site's one-time memory puzzle during a trip to earn a powerup. Trips can also uncover powerups at random. Keep up to two; select one before departing to double your first haul, return sooner, or add supplies to your chosen resource.
- Each crew has its own settlement order and progression. Spend materials from your shared stash to earn points; only your crew's next order changes when you deliver.
- Resource sites rotate through short rest periods. Crystal showers sometimes double crystal yields. Your crew can split up across sites or coordinate on one resource.
- At four or more players, each crew can customize its name and emblem in the lobby.
- At ten minutes, the higher score wins. A tie goes to the crew with more supplies left; if those are tied too, the game is a draw.

The host can start a rematch from the result screen.

The website opens in dark mode. Use the sun/moon control in the header to switch themes; your preference is saved on that device.
