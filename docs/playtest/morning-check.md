# Morning check: 20 minutes at home with your own phone

Friday 23 October 2026, about 9:00 to 9:20, before the children's session ([`runsheet.md`](runsheet.md)). One run through everything the children and teachers will do, on the Mac and the build you will take, with your own real phone over the tunnel. No filming, nobody else. If a step fails, write the time and what you saw, try its fix once, and carry on. At the end, send back anything odd (last section) **by 10:00**, so a fix can land before you leave.

**Before you start**
- Mac on its charger. Phone charged, **Wi-Fi off** (mobile data, like a parent's phone over the tunnel), volume up, iPhone ring switch off silent.
- One drawing on white paper with a thick marker: any creature, not one of the video drawings.
- A TV with HDMI at home? Use it: it rehearses runsheet 3.4. If not, the Mac's screen is the TV.

## 1. Restart the Mac (0:00, 3 min)

Apple menu, Restart. After you log in, don't open Unity, Blender, Docker or a second VVD.

## 2. Start everything (0:03, 5 min)

Open 4 tabs in Terminal. In every tab paste:

```sh
cd ~/Desktop/Sketchlings && source ~/vega/env && L=notes/playtest-$(date +%Y%m%d).log && export ADB=$(command -v adb)
```

| Tab | Paste | Check |
|---|---|---|
| 1 | `vega virtual-device start --no-gui --timeout 300` then `adb devices` then `vega run-app tv/build/sketchlings_aarch64.vpkg com.starfungames.sketchlings.main -d VirtualDevice` | `emulator-5554  device`; the app launches |
| 2 | `scripts/tunnel.sh 2>&1 \| tee -a "$L" notes/tunnel-run.log` | `Phones join at https://…trycloudflare.com/j/<CODE>`, `Personas: Claude (…)`, `Voices: Kokoro-82M on this Mac` |
| 3 | `M="Morning check"; echo "=== $M start $(date +%T)" >> "$L"` | Nothing printed |
| 4 | `caffeinate -dis bun scripts/live-view.ts` | Then Chrome on http://localhost:8799/, click once: full screen. The app's Home, focus on Start party |

Then tab 1: `scripts/preflight.sh`. The Hall of Fame line FAILs (it holds earlier creatures): that is fine. Any other FAIL: use its hint. If the TV build line FAILs (older than the last TV commit), run `tv/scripts/vbuild.sh release --run` and wait for it.

- [ ] VVD up, app on Home
- [ ] Tunnel link, Claude and Kokoro lines in tab 2
- [ ] Live view full screen; keys work (Right moves the focus, Left moves it back)
- [ ] preflight: only the Hall of Fame line FAILs

## 3. Join over the tunnel (0:08, 2 min)

Enter on **Start party**. Phone: Camera at the QR on the screen.

- [ ] The page opens on `https://…trycloudflare.com`, over mobile data
- [ ] Name and age group (Grown-up); "You're in" shows; your chip appears in the TV Lobby

## 4. Snap a real drawing (0:10, 2 min)

Snap my drawing, take the photo upright (portrait), Bring it to life!

- [ ] The cut-out is upright and clean (no shadow blob, nothing from the table)
- [ ] The phone shows the creature with "I saw ... → ..." and the picture appears in the Lobby chip
- [ ] Tab 2: a `[scan] … upload->sketchling … ms source=claude` line

## 5. Reveal, race, Results (0:12, 3 min)

Enter (Start the show!). Enter through the Reveal card, then Race.

- [ ] The creature's own voice on its Reveal card, from the Mac or the TV
- [ ] The TV says 3, 2, 1, GO! at the race start
- [ ] On the phone in the race: tapping runs, **holding** a finger down runs, swipe up jumps, the ROAR button roars
- [ ] **Phone sounds**: taps, jump and ROAR make sounds (silent? check the volume, the ring switch, and the speaker button on the controller)
- [ ] "Enable shouting": the mic prompt appears, a loud roar triggers ROAR
- [ ] Results: the podium and the winner's voice line. Wait 8 s before Enter: Enter on Results is Play again
- [ ] Tab 2, after the race: one `[net] race rtt ms (median/p90): …` line and one `[race] inputs …` line

## 6. A second race, then a new drawing (0:15, 2 min)

Enter on Results (Play again): a second race with nothing restarted. Then Backspace to the Lobby. Phone: **Draw a new one** ("Draw on screen instead" is quickest), Bring it to life!

- [ ] The second race started from Results and ended on Results
- [ ] A second `[net]` and `[race]` line in tab 2
- [ ] "Draw a new one" showed on the phone in the Lobby, and the new creature replaced the old one in your chip

## 7. Hall of Fame and Race again (0:17, 3 min)

Backspace to Home. Arrow to **Hall of Fame**, Enter.

- [ ] Today's creature is there. Enter on it: "In your next party!"
- [ ] Backspace to Home, Start party: a new QR, and your Hall of Fame creature in the Lobby as a guest
- [ ] Phone: scan the new QR, join, snap ("Draw on screen instead" is quickest), Start the show, race: the guest races too
- [ ] Back to Home, then Hall of Fame **a second time**: it moves and doesn't freeze. If it freezes (`notes/tv.md` F11), write it down: at the session, reinstall the app before showing the Hall of Fame (runsheet section 7)

## 8. Close the log part (0:20)

Tab 3:

```sh
echo "=== $M end $(date +%T)" >> "$L"
sed -n "/=== $M start/,/=== $M end/p" "$L" | grep -E '^\[[a-z]+\]'
```

- [ ] `[scan]`, `[net]` and `[race]` lines are all there

Before you pack: Ctrl-C tabs 2 and 4. At the venue, start them again (runsheet section 3). The VVD may not survive the lid closing: check `vega virtual-device status` there.

## If anything was odd: send this back

In the Claude chat, by 10:00:

1. **Which step and box**, the clock time, what you expected and what you saw, one line each.
2. **The lines from step 8**, pasted as they are (they hold the first name you typed and timings, no key).
3. **The preflight output** from step 2.
4. **A screenshot from the phone** of anything odd there, and a picture of the TV (`mkdir -p ~/Desktop/sketchlings-footage && tv/scripts/remote.sh shot ~/Desktop/sketchlings-footage/check.png`, or a phone photo of the screen).
5. **Phone model and browser** (Safari or Chrome), and mobile data or Wi-Fi.
6. For a freeze or crash: the output of `vega virtual-device status` and the time it happened.

Never paste `server/.env` or anything from it.

All boxes ticked: send "Morning check OK" and the step 8 lines anyway. They are the first real-phone `[net]` and `[race]` numbers.
