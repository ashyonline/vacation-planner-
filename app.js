// Vacation Planner (renamed from Barcelona Family Stay Comparer)
const SAGRADA = { lat: 41.4036, lng: 2.1744 };

// Location presets: location is a parameter (ss + dest_id + dest_type).
const LOCATIONS = {
  barcelona: {
    ss: "Barcelona, Catalonia (Barcelona Province), Spain",
    dest_id: "-372490",
    dest_type: "city",
  },
};

// Favorites filters for the Booking URL (nflt). Kitchen uses
// roomfacility=999 (validated: roomfacility=24 returns hotels like
// Sheraton without a real in-room kitchen).
function selectedBookingFilters() {
  const parts = [];
  if ($("b-kitchen")?.checked) parts.push("roomfacility=999");
  if ($("b-kidsclub")?.checked) parts.push("hotelfacility=144");
  if ($("b-indoorpool")?.checked) parts.push("hotelfacility=103");
  if ($("b-breakfast")?.checked) parts.push("mealplan=1");
  const max = parseInt($("b-maxprice")?.value || "", 10);
  if (Number.isFinite(max) && max > 0) parts.push(`price=EUR-min-${max}-1`);
  return parts;
}

const HOTELS = [
  { id: "villa-sagrada", name: "Villa Sagrada Apartments", distanceKm: 0.55, kitchen: "Kitchenette", family: "Sofa-bed, sleeps 4", rating: 8.6, baseNightly: 135, sleeps: 4, familyFriendly: true },
  { id: "art-house", name: "Art House Sagrada Familia", distanceKm: 0.2, kitchen: "Full kitchen", family: "2BR, cots, sleeps 6", rating: 8.4, baseNightly: 165, sleeps: 6, familyFriendly: true },
  { id: "comfy-lepant", name: "Sagrada Familia Comfy Apartment", distanceKm: 0.6, kitchen: "Kitchenette", family: "Cots, sleeps 4", rating: 8.1, baseNightly: 120, sleeps: 4, familyFriendly: true },
  { id: "bcn-apts", name: "BCN Sagrada Familia Apartments", distanceKm: 0.4, kitchen: "Kitchen", family: "Sitting area, sleeps 4", rating: 7.1, baseNightly: 105, sleeps: 4, familyFriendly: true },
  { id: "napoles-41", name: "41Nap1102 – Near Sagrada", distanceKm: 0.35, kitchen: "Full kitchen + washer", family: "2BR, cots, sleeps 5", rating: 8.1, baseNightly: 145, sleeps: 5, familyFriendly: true },
  { id: "diagonal-family", name: "Family Apartment Diagonal", distanceKm: 0.25, kitchen: "Kitchen + washer", family: "Family rooms, sleeps 5", rating: 8.3, baseNightly: 155, sleeps: 5, familyFriendly: true },
  { id: "aparteasy", name: "Aparteasy Authentic Family", distanceKm: 2.9, kitchen: "Full kitchen + parking", family: "2BR, cots, quiet, sleeps 5", rating: 8.2, baseNightly: 110, sleeps: 5, familyFriendly: true },
  { id: "derby-eixample", name: "Derby Barcelona Apartment Eixample", distanceKm: 1.4, kitchen: "Full kitchen", family: "Family suites, sleeps 4", rating: 8.7, baseNightly: 185, sleeps: 4, familyFriendly: true },
];

const $ = (id) => document.getElementById(id);
const LS_KEY = "vacation-planner-overrides-v1";
const getOverrides = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } };
const saveOverride = (k, v) => { const o = getOverrides(); o[k] = v; localStorage.setItem(LS_KEY, JSON.stringify(o)); };

function toISO(d) { const p2 = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; } // local date, NOT toISOString (UTC shifts the day in CET)
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }
function fmt(d) { return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function fmtISO(iso) { return fmt(parseDate(iso)); }

function tripType(checkin, checkout) {
  // Long weekend = 2 nights: Fri->Sun (standard weekend) or Sat->Mon (Monday off).
  // checkin inclusive, checkout exclusive; checkout day decides Monday-off.
  if (checkout.getDay() === 1) return { label: "Monday off", cls: "mon" };
  if (checkin.getDay() === 4) return { label: "Friday off", cls: "fri" };
  const days = [];
  for (let d = new Date(checkin); d < checkout; d = addDays(d, 1)) days.push(d.getDay());
  const hasFri = days.includes(5), hasMon = days.includes(1);
  if (hasFri && hasMon) return { label: "Long bridge", cls: "best" };
  if (hasFri) return { label: "Weekend", cls: "" };
  return { label: "Midweek", cls: "" };
}

function nightlyMultiplier(date) {
  const dow = date.getDay();
  if (dow === 5 || dow === 6) return 1.25; // Fri,Sat peak
  if (dow === 0 || dow === 4) return 1.05; // Sun,Thu shoulder
  return 0.95;
}

// Deterministic pseudo-variation so "this weekend vs next" differs realistically
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

function estimateTotal(hotel, checkinDate, nights) {
  let total = 0;
  for (let i = 0; i < nights; i++) {
    const d = addDays(checkinDate, i);
    const seasonal = 1 + 0.08 * Math.sin((d.getMonth() * 30 + d.getDate()) / 10);
    total += hotel.baseNightly * nightlyMultiplier(d) * seasonal;
  }
  const wobble = 1 + ((hashStr(hotel.id + toISO(checkinDate)) % 15) - 7) / 100; // ±7%
  return Math.round(total * wobble);
}

function selectedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map((el) => parseInt(el.value, 10));
}

function buildOptions() {
  const baseISO = $("base-checkin").value;
  if (!baseISO) return [];
  const base = parseDate(baseISO);
  const baseNights = Math.max(1, parseInt($("nights").value || "2", 10));
  const inShifts = selectedValues("checkin-flex");
  const lenShifts = selectedValues("length-flex");
  const opts = [];
  for (const dx of inShifts) {
    for (const dn of lenShifts) {
      const nights = baseNights + dn;
      if (nights < 1) continue;
      const ci = addDays(base, dx);
      const co = addDays(ci, nights);
      opts.push({ ci, co, nights, shift: dx, lenShift: dn });
    }
  }
  return opts.sort((a, b) => a.ci - b.ci || a.nights - b.nights);
}

function mapLink(h) {
  return `https://www.google.com/maps/search/?api=1&query=Sagrada+Familia+Barcelona+to+${encodeURIComponent(h.name)}`;
}

// ---- Family: real vs searched occupancy ("search as 4, inform baby later") ----
function getFamily() {
  const adults = Math.max(1, parseInt($("adults").value || "2", 10));
  const kids = Math.max(0, parseInt($("kids").value || "0", 10));
  const rawAges = ($("kid-ages").value || "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
  while (rawAges.length < kids) rawAges.push(5); // default age if missing
  const kidAges = rawAges.slice(0, kids);
  const hasBaby = $("has-baby").checked;
  const searchMode = $("search-mode").value; // "4" or "5"
  return { adults, kids, kidAges, hasBaby, searchMode };
}

function effectiveSearchGuests() {
  const f = getFamily();
  if (f.searchMode === "5" && f.hasBaby) {
    return { adults: f.adults, children: f.kids + 1, ages: [...f.kidAges, 1] };
  }
  return { adults: f.adults, children: f.kids, ages: f.kidAges }; // baby hidden, informed later
}

function bookingSearchUrl(checkinDate, checkoutDate) {
  const g = effectiveSearchGuests();
  const loc = LOCATIONS[$("location")?.value] || LOCATIONS.barcelona;
  const p = new URLSearchParams({
    ss: loc.ss,
    dest_id: loc.dest_id,
    dest_type: loc.dest_type,
    checkin: toISO(checkinDate),
    checkout: toISO(checkoutDate),
    group_adults: String(g.adults),
    no_rooms: "1",
    group_children: String(g.children),
  });
  g.ages.forEach((a) => p.append("age", String(a)));
  const nflt = selectedBookingFilters().join(";");
  if (nflt) p.set("nflt", nflt);
  return `https://www.booking.com/searchresults.html?${p.toString()}`;
}

function babyMessage() {
  const f = getFamily();
  const lang = $("msg-lang").value;
  const kidsTxt = f.kidAges.length ? f.kidAges.map((a) => `${a}y`).join(" + ") : "—";
  if (lang === "es") {
    return `Hola, somos 2 adultos, ${f.kids} niños (${kidsTxt}) y un bebé. Hemos reservado/buscado para 4 personas porque el bebé dormirá en cuna de viaje propia y no necesita cama extra. ¿Pueden confirmar que aceptan bebé + cuna de viaje en este apartamento y si hay algún suplemento? ¡Gracias!`;
  }
  return `Hello, we are 2 adults, ${f.kids} small kids (${kidsTxt}) plus a baby. We searched/booked for 4 people as is common, since the baby sleeps in our own travel cot and needs no extra bed. Can you confirm a baby in a travel cot is OK in this apartment and if there is any surcharge? Thank you!`;
}

function renderOccupancyNote() {
  const f = getFamily();
  const g = effectiveSearchGuests();
  const real = `${f.adults}+${f.kids}${f.hasBaby ? "+baby" : ""}`;
  const searched = `${g.adults}+${g.children} (ages: ${g.ages.join(", ") || "—"})`;
  $("occupancy-note").textContent =
    `Real family: ${real} · Booking search runs as: ${searched}. ` +
    (f.hasBaby && f.searchMode === "4"
      ? "Recommended: search as 4 to avoid hiding 1-bedroom apartments, then message the host about the baby + travel cot."
      : "Strict mode: baby included as age 1 — fewer results, but no follow-up message needed.");
}

function render() {
  const opts = buildOptions();
  renderOccupancyNote();
  const needKitchen = $("f-kitchen").checked;
  const familyOnly = $("f-family").checked;
  const maxDist = parseFloat($("f-distance").value);
  const minRating = parseFloat($("f-rating").value);
  const budget = parseFloat($("f-budget").value);
  const sortBy = $("sort-by").value;
  $("dist-label").textContent = `${maxDist.toFixed(1)} km`;
  $("rating-label").textContent = minRating.toFixed(1);

  const overrides = getOverrides();
  let rows = [];
  for (const o of opts) {
    for (const h of HOTELS) {
      if (needKitchen && !h.kitchen) continue;
      if (familyOnly && !h.familyFriendly) continue;
      if (h.distanceKm > maxDist) continue;
      if (h.rating < minRating) continue;
      const key = `${h.id}|${toISO(o.ci)}|${o.nights}`;
      const est = estimateTotal(h, o.ci, o.nights);
      const total = overrides[key] ?? est;
      if (total > budget) continue;
      const perNight = Math.round(total / o.nights);
      const t = tripType(o.ci, o.co);
      rows.push({ o, h, total, perNight, edited: key in overrides, key, type: t });
    }
  }

  const sorters = {
    total: (a, b) => a.total - b.total,
    perNight: (a, b) => a.perNight - b.perNight,
    distance: (a, b) => a.h.distanceKm - b.h.distanceKm || a.total - b.total,
    rating: (a, b) => b.h.rating - a.h.rating || a.total - b.total,
  };
  rows.sort(sorters[sortBy]);

  $("result-count").textContent = `– ${rows.length} options`;
  const tb = document.querySelector("#results tbody");
  tb.innerHTML = "";
  const showDebug = $("debug-urls")?.checked;
  rows.forEach((r, i) => {
    const shiftLbl = r.o.shift === 0 ? "base" : r.o.shift > 0 ? `+${r.o.shift}` : `${r.o.shift}`;
    const bUrl = bookingSearchUrl(r.o.ci, r.o.co);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${fmt(r.o.ci)} → ${fmt(r.o.co)}</strong><span class="badge">${shiftLbl}, ${r.o.nights}n</span></td>
      <td><span class="badge ${r.type.cls}">${r.type.label}</span>${i === 0 ? '<span class="badge best">★ cheapest</span>' : ""}</td>
      <td><strong>${r.h.name}</strong><br/><span class="hint">🍳 ${r.h.kitchen} · 🚶 ${r.h.distanceKm} km (~${Math.round(r.h.distanceKm * 12)} min) · 👨‍👩‍👧 ${r.h.family}</span></td>
      <td>${r.h.rating.toFixed(1)}</td>
      <td>${r.o.nights}</td>
      <td class="price-cell ${r.edited ? "edited" : ""}" data-key="${r.key}" title="Click to enter real price">€${r.total}${r.edited ? " ✓" : ""}</td>
      <td>€${r.perNight}</td>
      <td><a href="${mapLink(r.h)}" target="_blank" rel="noopener">Map</a></td>
      <td><a href="${bUrl}" target="_blank" rel="noopener">Check</a> <button type="button" class="copy-link" title="Copy this row's Booking URL">Copy</button>${showDebug ? `<div class="debug-url">${bUrl}</div>` : ""}</td>`;
    tb.appendChild(tr);
  });

  if (!rows.length) tb.innerHTML = `<tr><td colspan="9">No matches – widen distance/budget or enable more flex days.</td></tr>`;

  // Best deal banner
  if (rows.length) {
    const b = rows[0];
    const savingVsMax = Math.max(...rows.map((r) => r.total)) - b.total;
    $("best-deal").innerHTML = `★ <strong>Best:</strong> ${b.h.name} · ${fmt(b.o.ci)} → ${fmt(b.o.co)} (${b.o.nights}n, ${b.type.label}) · <strong>€${b.total}</strong> (€${b.perNight}/night) · saves ~€${savingVsMax} vs priciest shown.`;
  } else $("best-deal").innerHTML = "";

  // Click-to-edit prices
  tb.querySelectorAll(".price-cell").forEach((cell) => {
    cell.onclick = () => {
      const cur = cell.textContent.replace(/[^0-9]/g, "");
      const v = prompt("Enter real total price in € (from Booking.com / hotel site):", cur);
      if (v === null) return;
      const n = parseInt(v.replace(/[^0-9]/g, ""), 10);
      if (!Number.isFinite(n) || n <= 0) return alert("Enter a valid price.");
      saveOverride(cell.dataset.key, n);
      render();
    };
  });

  // Copy row Booking URLs (pasting into a fresh tab forces a clean Booking search)
  tb.querySelectorAll(".copy-link").forEach((btn) => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const url = btn.closest("tr")?.querySelector("td:last-child a")?.href || "";
      try { await navigator.clipboard.writeText(url); btn.textContent = "Copied"; }
      catch { prompt("Copy this Booking URL:", url); return; }
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    };
  });

  renderHotelList();
}

function renderHotelList() {
  $("hotel-list").innerHTML = HOTELS.map((h) => `
    <div class="hotel"><strong>${h.name}</strong><br/>
    🍳 ${h.kitchen} · 🚶 ${h.distanceKm} km to Sagrada Família<br/>
    ⭐ ${h.rating} · ~€${h.baseNightly}/night base · 👨‍👩‍👧 ${h.family}</div>`).join("");
}

function nextWeekday(target) {
  // target: 0=Sun..4=Thu,5=Fri
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let diff = (target - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function bind() {
  ["location", "base-checkin", "nights", "adults", "kids", "kid-ages", "has-baby", "search-mode", "msg-lang", "f-kitchen", "f-family", "f-distance", "f-rating", "f-budget", "sort-by", "b-kitchen", "b-breakfast", "b-kidsclub", "b-indoorpool", "b-maxprice", "debug-urls"]
    .forEach((id) => $(id)?.addEventListener("input", render));
  document.querySelectorAll("#checkin-flex input, #length-flex input").forEach((el) => el.addEventListener("change", render));
  ["location", "search-mode", "msg-lang", "has-baby", "b-kitchen", "b-breakfast", "b-kidsclub", "b-indoorpool"].forEach((id) => $(id)?.addEventListener("change", render));

  $("preset-fri-off").onclick = () => { $("base-checkin").value = toISO(nextWeekday(5)); $("nights").value = 2; render(); };
  $("preset-mon-off").onclick = () => { $("base-checkin").value = toISO(nextWeekday(6)); $("nights").value = 2; render(); };
  $("preset-next-weekend").onclick = () => { const f = nextWeekday(5); $("base-checkin").value = toISO(f); render(); };

  $("export-csv").onclick = () => {
    const rows = [["checkin", "checkout", "shift", "nights", "type", "hotel", "kitchen", "distance_km", "rating", "total_eur", "per_night_eur", "booking_url"]];
    const opts = buildOptions();
    // export from current rendered rows + booking urls
    document.querySelectorAll("#results tbody tr").forEach((tr, idx) => {
      if (tr.cells.length < 9) return;
      const cells = [...tr.cells].slice(0, 7).map((c) => `"${c.innerText.replace(/"/g, '""')}"`);
      const link = tr.querySelector("td:last-child a")?.href || "";
      rows.push([...cells, `"${link}"`]);
    });
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "vacation-stays.csv"; a.click();
  };
  $("reset-prices").onclick = () => { localStorage.removeItem(LS_KEY); render(); };

  $("open-booking-base").onclick = () => {
    const baseISO = $("base-checkin").value;
    if (!baseISO) return alert("Pick a base check-in date first.");
    const ci = parseDate(baseISO);
    const nights = Math.max(1, parseInt($("nights").value || "2", 10));
    window.open(bookingSearchUrl(ci, addDays(ci, nights)), "_blank", "noopener");
  };
  $("copy-msg").onclick = async () => {
    try { await navigator.clipboard.writeText(babyMessage()); alert("Message copied – paste it to the host on Booking.com."); }
    catch { prompt("Copy this message:", babyMessage()); }
  };
}

// init: default to next Friday (Monday-off long weekend)
(function init() {
  const f = nextWeekday(5);
  $("base-checkin").value = toISO(f);
  bind();
  render();
})();
