# Vacation Planner

Compare 2-night family long weekends (Friday to Sunday or Saturday to Monday) with the filters Booking.com lacks:
**kitchen + location presets**, plus weekend vs Monday-off and this-weekend-vs-next.

Barcelona is the default location preset (Sagrada Família focus).

## Run

No build step. Either:

1. Open `index.html` in a browser, or
2. `cd vacation-planner && python3 -m http.server 8000` → http://localhost:8000

## Booking URL builder (location + favorites filters)

Location is a parameter (preset object with `ss` + `dest_id` + `dest_type`).
Favorites filters are a second parameter, joined into Booking's `nflt`:

- kitchen → `roomfacility=999` (validated: `roomfacility=24` returns
  hotels like Sheraton without a real in-room kitchen, so we use `999`)
- kids club → `hotelfacility=144`
- indoor pool → `hotelfacility=103`
- breakfast included → `mealplan=1`
- max €/night → `price=EUR-min-{max}-1` (default 280)

## How it matches your request

- **Calendar picker**: base check-in date input.
- **±1, ±2, ±3 check-in flex**: checkboxes shift the whole trip (e.g. Thu→Sun becomes Fri→Mon = Monday-off instead of Friday-off).
- **Check-out flex**: −1 / base / +1 night options vary check-out independently (compare 1n vs 2n vs 3n).
- **Presets**: “Weekend (Fri→Sun)” and “Monday off (Sat→Mon)” one-click.
- **Kitchen filter**: all 8 sample stays have kitchen/kitchenette with type shown.
- **Near Sagrada Família**: distance slider (0.3–3 km), walk-time estimate, map link. Sagrada coords: 41.4036, 2.1744.
- **Family**: adults/kids inputs, family-friendly toggle, sleeps/cots info.
- **Price comparison**: estimates with weekend multipliers (Fri/Sat peak) + per-date variation so weekends differ. **Click any total to enter the real Booking.com price** — saved in localStorage. Export CSV, reset edits.

## Prices

Booking.com has no public API, so live prices can't be fetched automatically. The app ships with realistic estimates for 8 real aparthotels near Sagrada Família (Villa Sagrada, Art House, Comfy Lepant, BCN Apartments, 41Nap1102, Diagonal Family, Aparteasy, Derby Eixample). Overwrite with real prices you see for exact comparison.

## Assisted Booking search (option 2, human-like)

See `booking-assist/README.md`. Quick test:

```bash
cd booking-assist
node booking-assist.mjs --dry-run --base 2026-11-06 --nights 2 --shifts=-1,0,1
```

Then install once (`npm install && npx playwright install chromium`), run
`node booking-assist.mjs --login-only` to log in manually, then
`node booking-assist.mjs --once` for a 1-page real test.
