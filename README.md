# NIGHTSHIFT — a stealth game in three shifts

You are the night courier. Slip past the patrolling guards, stay in the dark,
grab the data chips, and reach the green vault exit — unseen.

## How to play

- **WASD / arrow keys** — move
- **SHIFT** — sneak (slower, quieter, harder to spot)
- **CLICK** — throw a coin; guards in earshot walk over to check the clink
- **C** — lob a coin at the nearest guard's patrol route
- **P** — pause · **M** — mute · **R** — restart the floor

## The rules of the dark

- Guards sweep **vision cones** across the floor. A cone that touches you fills
  your detection meter — faster in the light, slower in shadow, slower still
  while sneaking, fastest up close.
- At full detection a guard gives chase. Break line of sight and stay hidden
  until the alarm cools off.
- **Dark floor is shadow**: detection fills far slower there. **Crates** block
  a guard's sight as well as your feet.
- Walking is loud: guards nearby hear your footsteps and come to look.
- **Data chips** are worth 150 points each. Clearing a floor unseen earns the
  **GHOST bonus (+300)**.
- Floor 3, THE CORE, locks its vault: lift the **keycard** first.

## Floors

1. **WAREHOUSE 7** — first shift, 2 guards, 4 chips
2. **SERVER VAULT** — second shift, 3 guards, 4 chips
3. **THE CORE** — last shift, 4 guards, 6 chips, keycard-locked vault

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

No build step, no libraries, no network requests, no assets — every pixel is
drawn procedurally on canvas and every sound is synthesized with WebAudio.
The screenshots under `screenshots/` (title, mid-level, high tension, caught)
are real renders of this code, taken with `node shot-driver.mjs`.

## Hand-in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built for the make.fun bounty **best-stealth-game-20261121-1759**
(Make the best stealth game, $50). MIT licensed.
