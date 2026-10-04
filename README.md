# Resource Scramble

A real-time, two-crew resource gathering game for 2–8 players. Each crew shares a stash, gathers materials around the island, and completes settlement orders for points before the five-minute storm timer expires.

## Run it

Requires Node.js 18 or newer. From this folder, run:

```sh
npm start
```

Open `http://localhost:3000` to create a room. To play with others on your local network, they can open the host computer’s local network address on port `3000`. For friends outside that network, run this Node server on a publicly reachable host and share its URL. Room state is held in server memory and resets when the server restarts.

## How to play

- Create a room and share its six-character code. Up to eight players join from their own devices.
- Players are assigned to whichever of the two crews has fewer members.
- The host starts once at least two players have joined.
- Tap an active island site to add its material to your crew’s shared stash. Each player can gather about once per second.
- Spend the materials shown on the settlement order to earn its points. The next order appears immediately.
- Resource sites rotate through short rest periods. Crystal showers sometimes double crystal yields.
- At five minutes, the higher score wins. A tie goes to the crew with more supplies left; if those are tied too, the game is a draw.

The host can start a rematch from the result screen.
