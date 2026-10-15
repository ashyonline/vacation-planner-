# booking-assist — test the human-like Booking search

Assisted automation: your real Chromium profile, you logged in, slow, one page at a time.
No tokens needed. Do NOT share Booking credentials.

## 1. Install (one time)

```bash
cd booking-assist
npm install
npx playwright install chromium
```

## 2. Dry run (no browser — safe first test)

```bash
node booking-assist.mjs --dry-run --base 2026-11-06 --nights 2 --shifts=-1,0,1
node booking-assist.mjs --help
```

You should see 3 Booking URLs for Fri→Sun / Sat→Mon style shifts. Paste one into your normal browser — you’re already logged in, results appear like a human search.

## 3. Login once (recommended)

```bash
node booking-assist.mjs --login-only
```

A Chrome window opens with a fresh `booking-assist/profile` folder. Log into Booking.com manually in that window, then press ENTER in the terminal. From now on that profile stays logged in.

## 4. First real test (1 page only)

```bash
node booking-assist.mjs --once --base 2026-11-06 --nights 2
```

Expected: browser opens Booking, you press ENTER, it visits 1 search (2 adults + 2 kids ages 4,6 — baby hidden per search-as-4), waits ~4s, prints top property cards (best effort), saves screenshot to `out/`. Copy the real price into the main app by clicking the € total.

## 5. Full flex test (slow, human pauses 10–20s between pages)

```bash
node booking-assist.mjs --base 2026-11-06 --nights 2 --shifts=-3,-2,-1,0,1,2,3
```

Go make coffee. If Booking shows a CAPTCHA or login wall: solve it in the opened window — the script waits between pages anyway.

## Output

- `out/results-<stamp>.json` — dates, URLs, best-effort property names/prices
- `out/<checkin>_to_<checkout>.png` — screenshot per search for manual price entry

## Troubleshooting

- `npx playwright install chromium` fails → run with sudo/network, or use `--dry-run` + manual clicking (still fully usable).
- Auto-read prices empty → normal, Booking changes markup often. Screenshots + visual copy into the app is the reliable path.
- Blocked/CAPTCHA → stop, wait an hour, increase `--min-wait 20 --max-wait 40`, fewer `--shifts`.
