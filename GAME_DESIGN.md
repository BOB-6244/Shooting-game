# Game Design: Cursor-Aimed Lane Defense

## Core idea

A simple side-view arcade shooter. The player controls a gun on the left side of the play area and defends against enemies approaching from the right.

## Player

- The gun moves up and down with A/D or the Up/Down arrow keys (A/Up moves up; D/Down moves down).
- The gun rotates to aim toward the cursor.
- Clicking fires a shot toward the cursor's position.
- Starter shots deal 20 damage and fire every 0.5 seconds.
- Player and sentry shot damage and initial speed scale with the aimed-at enemy's closeness to the gun, up to 2× at the nearest edge. Shots start fast and decelerate during flight.
- Hits near an enemy's eyes are critical hits: they deal 1.5× damage and show a brief red CRIT! popup.

## Enemies

- Enemies can include slimes, zombies, and other creatures.
- Enemies move around as they approach, so the player must track them while aiming.
- Different enemy types can eventually have distinct movement patterns (for example, slimes hopping and zombies advancing steadily).
- Enemy health increases by 10% each 30-second wave, compounding from the previous wave.
- A boss appears every fifth wave. Boss health follows the same 10% per-wave scaling and bosses deal more damage to the base if they break through.
- A counter at the top shows how many waves remain until the next boss.
- The wave 10 boss is a large orange gas cloud. It fires one-health projectiles toward the gun; each takes 5 seconds to arrive and deals 10 base-health points if it hits. The player can destroy projectiles with a single shot.

## Score and currency

- Each point of damage dealt awards 1 score and 1 currency.
- Rewards are based on damage, not only on defeating an enemy. For example, 6 damage dealt grants 6 score and 6 currency.
- Currency is collected and spent on upgrades.

## Upgrades

- **Quicker Cycle:** costs 500 credits initially and reduces the player's time between shots by 15% per purchase. Each later purchase costs 1.5 times the previous price.
- **Heavy Rounds:** costs 1,000 credits initially and increases player damage by 50% per purchase. Each later purchase costs 1.75 times the previous price.
- Quicker Cycle and Heavy Rounds are each limited to five purchases per match.
- **Trigger Lock:** costs 2,500 credits once and unlocks hold-to-fire.
- **Pocket Sentry:** costs 250 credits each, with no price increase. Each sentry deals 10 damage per shot (half the player's base 20 damage), fires at the player's current attack speed, and expires after 30 seconds. A maximum of two can be active at once.
- **Airstrike:** costs 3,000 credits per use, with no price increase. It deals up to 100 damage to every enemy currently on screen and has a two-minute cooldown.
- Damage dealt by the player, sentries, and airstrikes awards 1 score and 1 credit per damage point actually removed from enemy health.
- On a successful upgrade purchase, gameplay pauses for 3 seconds while a flashing upgrade announcement appears.
- The player can pause and resume from a control in the header; gameplay timers stop while paused, but the upgrade shop remains available.
- **Repair Matrix:** costs 1,000 credits once and restores 1% base health per active gameplay second.
- **Revive:** once per match, spend 5,000 credits after defeat to resume with 50% base health.

## Upgrade ideas

These upgrade offers have been proposed; they are design notes and are not implemented yet.

- **Attack speed:** First purchase costs 500 credits and reduces the firing delay by 15%. Each next purchase costs 1.5 times the previous price.
- **Damage:** First purchase costs 1,000 credits and increases damage by 50%. Each next purchase costs 1.75 times the previous price.

## Current scope

This document records the agreed game idea. The game engine, visual style, enemy details, weapon behavior, progression, and upgrade system have not been chosen yet.

## First playable version checklist

- A play area with the player gun positioned on the left.
- Vertical gun movement and cursor-directed rotation.
- Click-to-shoot behavior.
- At least one enemy that approaches and moves around.
- Damage tracking, with score and currency each increasing by the damage dealt.
- A basic way to see the current score and currency, with an upgrade shop.
