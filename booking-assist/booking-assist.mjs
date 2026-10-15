// booking-assist.mjs — assisted, human-like Booking.com search.
// Philosophy: YOUR real browser profile, YOU logged in, slow, one page at a time.
// No tokens, no headless scraping. If Booking shows a CAPTCHA/login wall: solve it manually, script waits.
//
// Usage:
//   node booking-assist.mjs --help
//   node booking-assist.mjs --dry-run --base 2026-11-06 --nights 2
//   node booking-assist.mjs --login-only
//   node booking-assist.mjs --once --base 2026-11-06 --nights 2          (1 page, for first test)
//   node booking-assist.mjs --base 2026-11-06 --nights 2 --shifts=-1,0,1 (3 pages, slow)
//
// Output: ./out/results-<timestamp>.json + screenshots per search.

const fs = await import("node:fs");
const path = await import("node:path");
const readline = await import("node:readline");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) {
      const [k, v] = cur.slice(2).split("=");
      acc.push([k, v ?? (arr[i + 1]?.startsWith("--") || arr[i + 1] == null ? "1" : arr[i + 1])]);
    }
    return acc;
  }, [])
);

if (args.help || args.h) {
  console.log(`
booking-assist — human-like Booking.com opener

  --base YYYY-MM-DD        base check-in (default: next Friday)
  --nights N               base nights (default: 2)
  --shifts a,b,c           check-in shifts, e.g. -1,0,1 (default: 0; use -3,-2,-1,0,1,2,3 for full flex)
  --len-shifts a,b         length shifts, e.g. 0 or -1,0,1 (default: 0)
  --adults N               default 2
  --children-ages 4,6      default 4,6 (baby hidden = search-as-4)
  --kitchen=1/0            kitchen filter roomfacility=999 (default 1; NOT 24 — 24 returns hotels like Sheraton without a real kitchen)
  --breakfast=1/0          breakfast included mealplan=1 (default 1)
  --kidsclub=1/0           kids club hotelfacility=144 (default 0 — strict)
  --indoorpool=1/0         indoor pool hotelfacility=103 (default 0 — strict)
  --maxprice N             max EUR/night, 0 disables (default 280)
  --once                    only base date (safest first test)
  --login-only              just open Booking.com so you can log in manually
  --dry-run                 print URLs only, launch no browser
  --headed=0                run headless (NOT recommended, more bot detection)
  --min-wait S --max-wait S seconds between pages (default 10-20)

Examples:
  node booking-assist.mjs --dry-run
  node booking-assist.mjs --once
  node booking-assist.mjs --login-only
`);
  process.exit(0);
}

function nextFriday() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let diff = (5 - d.getDay() + 7) % 7; if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff); return d;
}
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

const base = args.base ? parseISO(args.base) : nextFriday();
const nightsBase = parseInt(args.nights ?? "2", 10);
const shifts = args.once === "1" || args.once === true ? [0] : String(args.shifts ?? "0").split(",").map(Number);
const lenShifts = String(args["len-shifts"] ?? "0").split(",").map(Number);
const adults = parseInt(args.adults ?? "2", 10);
const ages = String(args["children-ages"] ?? "3,6").split(",").map((s) => parseInt(s.trim(), 10)).filter(Number.isFinite);

// Favorites filters, same defaults as the web app (kitchen + breakfast + €280 on).
const fKitchen = String(args.kitchen ?? "1") === "1";
const fBreakfast = String(args.breakfast ?? "1") === "1";
const fKidsclub = String(args.kidsclub ?? "0") === "1";
const fIndoorpool = String(args.indoorpool ?? "0") === "1";
const fMaxprice = parseInt(args.maxprice ?? "280", 10);
function bookingNflt() {
  const parts = [];
  if (fKitchen) parts.push("roomfacility=999");
  if (fKidsclub) parts.push("hotelfacility=144");
  if (fIndoorpool) parts.push("hotelfacility=103");
  if (fBreakfast) parts.push("mealplan=1");
  if (Number.isFinite(fMaxprice) && fMaxprice > 0) parts.push(`price=EUR-min-${fMaxprice}-1`);
  return parts.join(";");
}

function bookingUrl(ci, co) {
  // Proven format from user's working search: needs dest_id/dest_type,
  // ss-only is NOT enough (lands on "enter destination").
  // dest_id=-372490 = Barcelona city (from working URL).
  const p = new URLSearchParams({
    ss: "Barcelona, Catalonia (Barcelona Province), Spain",
    dest_id: "-372490",
    dest_type: "city",
    checkin: toISO(ci), checkout: toISO(co),
    group_adults: String(adults),
    no_rooms: "1",
    group_children: String(ages.length),
  });
  ages.forEach((a) => p.append("age", String(a)));
  const nflt = bookingNflt();
  if (nflt) p.set("nflt", nflt);
  return `https://www.booking.com/searchresults.html?${p.toString()}`;
}

const combos = [];
for (const dx of shifts) for (const dn of lenShifts) {
  const n = nightsBase + dn; if (n < 1) continue;
  const ci = addDays(base, dx); const co = addDays(ci, n);
  combos.push({ ci, co, nights: n, shift: dx, url: bookingUrl(ci, co) });
}

const outDir = path.join(process.cwd(), "out");
if (args["dry-run"]) {
  console.log(`Family: ${adults} adults + ${ages.length} kids (ages ${ages.join(",")}) + baby informed later (search-as-4)`);
  combos.forEach((c) => console.log(`${toISO(c.ci)} → ${toISO(c.co)} (${c.nights}n, shift ${c.shift}):\n  ${c.url}`));
  console.log(`\n${combos.length} URL(s). Nothing opened (dry-run).`);
  process.exit(0);
}

// --- real browser run (lazy playwright import so dry-run needs no install) ---
const { chromium } = await import("playwright");
const headed = String(args.headed ?? "1") !== "0";
const minW = parseInt(args["min-wait"] ?? "10", 10), maxW = parseInt(args["max-wait"] ?? "20", 10);
const profileDir = path.join(process.cwd(), "profile");

console.log(`Profile: ${profileDir}\nHeaded: ${headed}\nPages: ${combos.length}\n`);
console.log("FIRST RUN: a Chrome window opens. Log into Booking.com manually if asked, then return here.");

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: !headed, viewport: { width: 1280, height: 860 }, locale: "en-GB",
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); res(a); });
});

if (args["login-only"]) {
  await page.goto("https://www.booking.com/", { waitUntil: "domcontentloaded" });
  await ask("Booking.com is open. Log in manually, then press ENTER here to close... ");
  await ctx.close(); process.exit(0);
}

await page.goto("https://www.booking.com/", { waitUntil: "domcontentloaded" });
await ask(`Browser is open (${combos.length} search(es) queued). If not logged in, log in now. Press ENTER to start... `);

fs.mkdirSync(outDir, { recursive: true });
const stamp = toISO(new Date()).replaceAll("-", "") + "-" + String(Date.now()).slice(-6);
const results = [];

for (let i = 0; i < combos.length; i++) {
  const c = combos[i];
  console.log(`\n[${i + 1}/${combos.length}] ${toISO(c.ci)} → ${toISO(c.co)} (${c.nights}n)`);
  console.log(c.url);
  await page.goto(c.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  // Best-effort price grab (Booking markup changes often — always verify visually)
  let cards = [];
  try {
    cards = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[data-testid="property-card"]').slice(0, 12).forEach((el) => {
        const name = el.querySelector('[data-testid="title"]')?.innerText?.trim() || "";
        const price = el.querySelector('[data-testid="price-and-discounted-price"]')?.innerText?.trim()
          || [...el.querySelectorAll("span")].map((s) => s.innerText).find((t) => /€\s?\d/.test(t)) || "";
        if (name) out.push({ name, price });
      });
      return out;
    });
  } catch (e) { console.log("  (auto-read failed, use visual prices):", String(e).slice(0, 120)); }
  console.log(`  found ${cards.length} property card(s). Top 5:`);
  cards.slice(0, 5).forEach((k) => console.log(`   - ${k.name} :: ${k.price.replace(/\n/g, " ")}`));
  const shot = path.join(outDir, `${toISO(c.ci)}_to_${toISO(c.co)}.png`);
  await page.screenshot({ path: shot });
  results.push({ checkin: toISO(c.ci), checkout: toISO(c.co), nights: c.nights, shift: c.shift, url: c.url, cards, screenshot: path.basename(shot) });
  if (i < combos.length - 1) {
    const waitS = minW + Math.random() * Math.max(0, maxW - minW);
    console.log(`  screenshot → ${path.basename(shot)}. Waiting ${waitS.toFixed(0)}s (human pause)...`);
    await page.waitForTimeout(waitS * 1000);
  }
}

const rf = path.join(outDir, `results-${stamp}.json`);
fs.writeFileSync(rf, JSON.stringify({ family: { adults, ages, note: "search-as-4, baby informed later" }, results }, null, 2));
console.log(`\nDone. Saved ${rf}`);
console.log("Next: open the app, click each € total and type the real price you saw. Or keep screenshots in ./out for reference.");
await ask("Press ENTER to close the browser... ");
await ctx.close();
