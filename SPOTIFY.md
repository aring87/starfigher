# Optional Spotify music (v171)

Flight Manual > **05 YOUR MUSIC** lets a player connect their own Spotify account and hear their own music while they fly. It is **off by default**, free to ignore, and the game works exactly as before without it.

**Read "Spotify's rules" below before you share or sell a build that contains this.** In short: it is fine for you to try on your own computer, but Spotify's written rules restrict games and commercial use, so it is kept out of the default Windows build.

## What the player needs

- A **Spotify Premium** account (Free and mobile-only plans such as Lite or Mini do not work with Spotify's web player).
- An internet connection while using it.
- Microsoft Edge or Google Chrome (the browser must support protected audio).
- **Their own free Spotify developer app** (a few minutes, set up once, below). Spotify only lets a developer app serve five named people, so the game cannot ship one shared app that every friend uses.

## One-time setup

1. Sign in to <https://developer.spotify.com/dashboard> with the Spotify account that has Premium and press **Create app**. (The app's owner must have Premium or Spotify switches the app off.)
2. Give it any name and description. If the form asks which APIs or SDKs you will use, tick **Web Playback SDK** (and Web API). The labels on Spotify's form may differ from this guide.
3. In the game, open **Flight Manual > 05 YOUR MUSIC**. It shows a **Redirect URI** address. Press **COPY**, paste it into your Spotify app's **Redirect URIs** box and save. It must match exactly.
   - Open the game at `http://127.0.0.1:8765` for this. Spotify no longer accepts `localhost`.
   - The Windows EXE uses `http://127.0.0.1:18765/spotify-callback.html`, so add that one too if you use the EXE.
4. Copy the app's **Client ID** from its Settings page into **SPOTIFY APP ID** in the game. **Never paste the Client Secret anywhere; the game does not need it.**
5. Press **CONNECT SPOTIFY**. A Spotify window opens. Sign in and press Agree. The window closes by itself and the game says it is connected.
6. Choose music: paste a playlist, album, artist or song link and press **PLAY LINK**, or start something in your Spotify app and press **PLAY MY SPOTIFY HERE**. You can also pick "Starfighter: Last Signal" in Spotify's own device list.

If Spotify shows an error, a sign-in that "does not match a Redirect URI" means step 3 was not saved exactly. If the game says it was refused, add your own Spotify email under your app's **Settings > Users Management** (up to five people).

## How it shares sound with the game

| Situation | What happens |
| --- | --- |
| Spotify starts playing | The game soundtrack pauses. Sound effects keep working. |
| You pause Spotify | After about a second and a half the game soundtrack comes back. |
| MUSIC slider (AUDIO MIX) | Sets Spotify's volume too. |
| SOUND: OFF | Silences Spotify as well as the game. |
| Boss music fade | Spotify's volume dips and returns with the same timing as the soundtrack. |
| Page hidden, or Flight School practice open | Spotify pauses and resumes afterwards (only if it was playing). Switching to another window does **not** pause Spotify. |
| Anything goes wrong | The game soundtrack comes back and a plain message appears under CONNECT SPOTIFY. |

AUDIO MIX also shows the track name and PREV / PLAY / NEXT while Spotify is connected.

## Privacy

- Until you press CONNECT SPOTIFY (or COPY) the game does not even load its small `spotify.js` file, and nothing outside this computer is contacted. After you have signed in once, the game reconnects quietly when it starts.
- Stored in this browser profile only: your app's Client ID and Spotify's **refresh token**. The short-lived access token stays in memory. For the Windows EXE that is under `%LOCALAPPDATA%\StarfighterLastSignal`.
- Never written to saves, exports or the performance log. The performance log also ignores any error that mentions Spotify.
- **DISCONNECT** deletes the sign-in from this computer. To also remove the game's permission at Spotify, remove the app from your Spotify account's Apps page (not checked here).
- Addresses contacted after you connect: `accounts.spotify.com` (sign-in), `sdk.scdn.co` (Spotify's player script), `api.spotify.com` (start playback), plus Spotify's own audio and artwork servers. Permissions requested: `streaming`, `user-read-email`, `user-read-private` (the three Spotify's player guide lists; the game never reads or stores your email) and `user-modify-playback-state` (to start playing).
- Flight School practice never loads or shows any of it.

## Spotify's rules (checked November 20, 2026)

This is my reading of Spotify's published pages, not legal advice. The Developer Policy is dated 15 May 2025; I did not read the longer Developer Terms or Branding Guidelines.

- **Games.** Policy III.2 says: "Do not create a game, including trivia quizzes", and Spotify's Compliance Tips list "incorporating Spotify into any gaming or quiz functionality" (their example is a name-that-tune quiz). A shooter that plays your playlist in the background is a gray area at best; I cannot tell how Spotify would rule. A free, private use on your own computer is unlikely to be noticed, but that is a guess.
- **Overlapping sound.** Policy III.7 says not to "overlap any Spotify Content with any other audio content". Game sound effects playing over Spotify's music are that, read literally.
- **Selling.** Spotify's pages say the Web Playback SDK "must not be used in commercial projects without Spotify's prior written approval" and that the platform "can not be used to develop commercial streaming integrations". **A paid build must not contain this.** Spotify's "Extended Quota" (more than five users) is only given to registered organizations with at least 250,000 monthly users, so a hobby game cannot qualify.
- **Attribution.** Spotify wants cover art and track details shown whenever its music plays, with a link back. The game shows them in Flight Manual and AUDIO MIX, but not on the flight screen itself.
- **Five-person limit.** Development-mode apps work for up to five named users, and the owner needs Premium. Spotify can change these terms; the newest changelog I found was July 2026.

## Friends and the Windows EXE

`python tools/build-windows-playtest.py` (the normal build) **leaves Spotify out entirely**: no `spotify.js`, no callback page and no controls in the menus. Add `--with-spotify` to include them in a private build. A friend then needs their own developer app and Premium, or you add them (five at most) to your app and set `DEFAULT_CLIENT_ID` at the top of `spotify.js` to your app's public Client ID so they only press CONNECT. I have not run the EXE with Spotify; whether the EXE's browser window (Edge or Chrome in app mode with its own profile) allows the sign-in popup and protected audio is unverified. The frozen v157, v159 and v168 packages are unchanged and have no Spotify.

## If something goes wrong

| Message | Meaning |
| --- | --- |
| Paste the Client ID... | The app ID box is empty or not 32 letters and numbers. |
| ...does not accept "localhost" | Open the game at `http://127.0.0.1:8765`. |
| Your browser blocked the Spotify window | Allow pop-ups for the game page, then press CONNECT again. |
| Spotify does not recognise that Client ID | Copy it again from your app's Settings. |
| ...Redirect URI shown here... | Add the address shown in 05 YOUR MUSIC to your Spotify app exactly. |
| ...Microsoft Edge or Google Chrome | This browser cannot play protected audio. |
| ...needs Spotify Premium | Free and mobile-only plans cannot stream here. |
| ...Users Management | The account is not on your app's list of allowed people. |
| Cannot reach Spotify | Offline. The game music keeps playing; press CONNECT to retry. |
| Your Spotify sign-in expired | Sign-ins last about six months. Press CONNECT again. |
| Your browser held back the sound | Click anywhere in the game, then press PLAY. |

## What was checked

- `node tools/verify-spotify.cjs` (33 checks) tests the module with a pretend window, storage, network and Spotify player: sign-in steps and the exact requests, refresh and revoked tokens, every error above, the music hand-off, volume and mute, pausing, privacy, and that default builds leave Spotify out. `verify-game.cjs` and `verify-training-integration.cjs` test the game's hooks.
- **Not checked by a machine:** a real Spotify sign-in, real music, Spotify's token address accepting a request from a web page (their own examples do it, but no page promises it), whether the sign-in popup works in the EXE, and whether Spotify's player runs in the EXE's browser profile. Those need you in a real browser; the steps are above.

## For developers

- `spotify.js` (UMD, like `diagnostics.js`) exposes `StarfighterSpotify.create({window, document, storage, onChange, ...})`. The game lazy-loads it from `initSpotify()` in `game.js`, then calls `setLevel`, `setAway`, `takesMusic`. `spotify-callback.html` relays Spotify's one-time answer to the game window by BroadcastChannel (with opener-message and storage fallbacks) and closes itself.
- Storage keys: `starfighterSpotify` (`{v, clientId, refresh}`) and `starfighterSpotifyOn`.
- Remove it entirely: delete `spotify.js`, `spotify-callback.html`, the two `<!-- spotify:start -->` blocks in `index.html`, the `initSpotify` block and `spotifyCtl`/`spotifyHeld` hooks in `game.js`, and the Spotify rules in `style.css`.
