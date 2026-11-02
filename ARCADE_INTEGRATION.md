# Little Joy Arcade integration

Prism Party is one game in the [Little Joy Arcade](https://littlejoyarcade.site)
catalogue. This file records exactly what it shares with the platform and what it does
not, so nobody has to guess later.

## What is wired up

| Area | State |
| --- | --- |
| Catalogue row | Published to Supabase `public.games` and mirrored in `littlejoyarcade/src/data/games.ts` |
| Play URL | `https://jd4rider.github.io/prism-party/play/` (GitHub Pages, `base: './'`) |
| Preferred URL | `https://prismparty.littlejoyarcade.site` — documented, not enabled (see DEPLOYMENT.md) |
| Shared save key | `prism-party-save-v1`, registered in the catalogue manifest |
| Return to arcade | Every scene links `littlejoyarcade.site` in the footer |
| Desktop client | `public/arcade-client.js`, the same shared client the other arcade games ship |

The arcade client is loaded from `public/arcade-client.js` and exposes the platform's
`LittleJoy` global. It is optional by design: if the script is missing, blocked or the
player is offline, the game keeps working from `localStorage` with no error.

## Local-first saves

```js
// src/save.js
export const SAVE_KEY = 'prism-party-save-v1'
export const data = read()      // merge onto a fresh default, never throw
export function save()          // debounced localStorage write
```

The merge-on-read is the important part: a save written by an older build, or one that
lost a field, still loads. The player loses at most the fields that were corrupt, not the
file.

## Guest play

There is no sign-in wall. A player who never signs in gets the full game: all 200
puzzles, all modes, all awards, saved locally. Signing in through the arcade is a
convenience for carrying progress between devices, never a gate.

## Entitlements

Suggested and reserved, checked by the platform before any premium surface shows:

- `arcade.ad_free`
- `prismparty.ad_free`
- `prismparty.premium_themes`
- `prismparty.cosmetic_pack_1`

None of them gate gameplay, hints or accessibility. Nothing in this build reads them yet
because no paid surface exists yet.

## Not implemented, and not pretended

- **Cloud saves.** The shared client is present but this build does not push state to the
  platform. Progress is local only. When the platform's `saveState` endpoint is live,
  `save.js` is the single place to add the push, and the merge function is already
  conflict-safe.
- **Authentication.** No sign-in UI inside the game; the portal handles it.
- **Analytics.** Nothing is sent anywhere.
- **Ads.** No ad surface exists. The entitlement names above are reserved for one.
