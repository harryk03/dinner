/* Dinner vote — one page per dinner. Reads ./data.json, stores votes in Supabase
   (or this device only, in demo mode when assets/config.js is empty). */
(function () {
  "use strict";

  /* ---------- Small helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (t) => { const [h, m] = t.split(":").map(Number); return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")}`; };
  const K = (id, t) => `${id}@${t}`;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.random() * 256));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /* ---------- Vote storage ---------- */
  const CFG = window.DINNER_CONFIG || {};
  const LIVE = !!(CFG.supabaseUrl && CFG.supabaseKey);
  function headers() {
    const h = { apikey: CFG.supabaseKey, "Content-Type": "application/json" };
    if (!/^sb_/.test(CFG.supabaseKey)) h.Authorization = "Bearer " + CFG.supabaseKey;
    return h;
  }
  const api = {
    async list(slug) {
      if (!LIVE) { const mine = store.get("dinner-demo-" + slug); return mine ? [mine] : []; }
      const u = `${CFG.supabaseUrl}/rest/v1/votes?dinner=eq.${encodeURIComponent(slug)}&select=voter_name,picks,top_pick,updated_at&order=updated_at.asc`;
      const r = await fetch(u, { headers: headers(), cache: "no-store" });
      if (!r.ok) throw new Error("list " + r.status);
      return r.json();
    },
    async cast(slug, vote) {
      if (!LIVE) { store.set("dinner-demo-" + slug, { voter_name: vote.name, picks: vote.picks, top_pick: vote.top, mine: true }); return; }
      const r = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/cast_vote`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ p_dinner: slug, p_voter_id: vote.voterId, p_name: vote.name, p_picks: vote.picks, p_top: vote.top })
      });
      if (!r.ok) throw new Error("cast " + r.status);
    }
  };

  /* ---------- Icons ---------- */
  const STAR = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z"/></svg>`;
  const STAR_O = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.9-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.1 1.1-6.5L2.6 9.5l6.5-.9z"/></svg>`;
  const TICK = `<svg class="tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>`;
  const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
  const LINK = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="6" cy="6" r="4.8"/><path d="M1.2 6h9.6M6 1.2c1.6 1.4 1.6 8.2 0 9.6M6 1.2c-1.6 1.4-1.6 8.2 0 9.6"/></svg>`;

  /* ---------- State ---------- */
  let D = null, VENUES = [], byId = {}, DEADLINE = Infinity, LS = "";
  const voterId = (() => { let v = store.get("dinner-voter-id"); if (!v) { v = uuid(); store.set("dinner-voter-id", v); } return v; })();
  const state = { picks: new Set(), top: null, name: store.get("dinner-voter-name") || "", filter: "all", submitted: null, votes: [], loadErr: false };
  const closed = () => Date.now() >= DEADLINE;
  const sig = () => JSON.stringify([[...state.picks].sort(), state.top, state.name.trim()]);
  const dirty = () => state.submitted !== sig();
  function save() { store.set(LS, { picks: [...state.picks], top: state.top, submitted: state.submitted }); store.set("dinner-voter-name", state.name); }

  /* ---------- Boot ---------- */
  fetch("data.json", { cache: "no-store" }).then((r) => { if (!r.ok) throw 0; return r.json(); }).then(init).catch(() => {
    $("app").innerHTML = `<div class="err"><b>This dinner couldn't load</b><span class="who">Check the link with Harry, or refresh in a minute.</span></div>`;
  });

  let VIS = "afterClose", ORG = false;
  function init(data) {
    D = data; VENUES = data.venues || []; byId = Object.fromEntries(VENUES.map((v) => [v.id, v]));
    DEADLINE = data.deadline ? Date.parse(data.deadline) : Infinity;
    LS = "dinner-" + data.slug;
    VIS = data.resultsVisibility || "afterClose"; // "live" | "afterClose" | "never"
    ORG = !!data.organiserKey && location.hash === "#r-" + data.organiserKey;
    const saved = store.get(LS);
    if (saved) { (saved.picks || []).forEach((k) => state.picks.add(k)); state.top = saved.top || null; state.submitted = saved.submitted || null; }
    document.title = ORG ? `Results · ${data.dayLabel || data.title}` : (data.title || "Where are we eating?");
    if (ORG) { buildOrganiser(); refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 15000); return; }
    buildShell(); render(); tick(); refresh();
    setInterval(() => { const was = closed(); tick(); if (closed() !== was) render(); }, 30000);
    setInterval(() => { if (!document.hidden) refresh(); }, 20000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  }

  function buildShell() {
    const areas = D.areas || [];
    const segs = areas.length > 1 ? [{ id: "all", label: "All" }, ...areas] : [];
    $("app").innerHTML = `
      <header>
        <div class="kicker">${esc(D.kicker)}</div>
        <h1>${esc(D.title)}</h1>
        <p class="lede">${esc(D.lede)}</p>
        <div class="status">
          <span class="pill" id="deadline"><span class="dot"></span><span id="deadline-text"></span><span class="sub" id="deadline-left"></span></span>
          <span class="pill voted" id="count-pill" hidden><span class="dot"></span><span id="count-text"></span></span>
        </div>
        ${LIVE ? "" : `<p class="banner">Example page. Votes here stay on this phone only.</p>`}
      </header>
      <div class="seg-row">
        ${segs.length ? `<div class="seg" role="group" aria-label="Filter by area" style="grid-template-columns:repeat(${segs.length},1fr)">
          <span class="thumb" id="seg-thumb" style="width:calc((100% - 4px)/${segs.length})"></span>
          ${segs.map((s) => `<button type="button" id="seg-${esc(s.id)}" data-f="${esc(s.id)}" aria-pressed="${s.id === "all"}">${esc(s.label)}</button>`).join("")}
        </div>` : ""}
        ${D.checked ? `<span class="checked">${esc(D.checked)}</span>` : ""}
      </div>
      <main class="grid" id="grid" aria-live="polite"></main>
      ${D.note ? `<p class="note">${esc(D.note)}</p>` : ""}
      <section class="results" id="results" aria-live="polite"></section>
    <div class="dock">
      <div class="dock-in">
        <div class="sum">
          <b id="sum-main">Pick some times</b>
          <button type="button" class="who-btn" id="who-btn">Add your name</button>
        </div>
        <button type="button" class="send" id="send" aria-disabled="true">${CHECK}<span id="send-label">Submit vote</span></button>
      </div>
    </div>`;
    document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => setFilter(b.dataset.f)));
    $("grid").addEventListener("click", onGridClick);
    $("send").addEventListener("click", submit);
    $("who-btn").addEventListener("click", () => openName(false));
  }

  /* ---------- Render: cards ---------- */
  function cover(v, withAlt) {
    const p = v.photos && v.photos[0];
    if (p) return `<img src="${esc(p.src)}" alt="${withAlt ? esc(p.alt) : ""}" style="object-position:${esc(p.pos || "50% 50%")}" decoding="async" loading="lazy">`;
    return `<span class="ph" aria-hidden="true">${esc((v.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join(""))}</span>`;
  }
  function timesHtml(v) {
    return (v.times || []).map((t) => {
      const k = K(v.id, t), on = state.picks.has(k);
      return `<button type="button" class="time${v.unverified ? " unverified" : ""}" data-k="${esc(k)}" aria-pressed="${on}" aria-label="${esc(v.name)} ${fmt(t)} pm"${closed() ? " disabled" : ""}>${TICK}<span>${fmt(t)}</span></button>`;
    }).join("");
  }
  const timesLabel = (v) => v.unverified ? `Times to confirm by phone, tap all that work` : `Free for ${D.party}, tap all that work`;
  function render() {
    $("grid").innerHTML = VENUES.filter((v) => state.filter === "all" || v.area === state.filter).map((v) => {
      const top = state.top === v.id, n = (v.photos || []).length;
      return `<article class="card${top ? " top" : ""}" data-id="${esc(v.id)}">
        <div class="cover">
          <button type="button" class="open" data-open="${esc(v.id)}" aria-label="More about ${esc(v.name)}">${cover(v, true)}</button>
          ${n > 1 ? `<span class="photo-tag">${n} photos</span>` : ""}
          ${top ? `<span class="toplabel">Your top pick</span>` : ""}
          <button type="button" class="star" data-star="${esc(v.id)}" aria-pressed="${top}" aria-label="${top ? "Remove" : "Make"} ${esc(v.name)} ${top ? "as " : ""}your top pick"${closed() ? " disabled" : ""}>${top ? STAR : STAR_O}</button>
        </div>
        <div class="body">
          <div class="meta">${esc(v.cuisine)} · ${esc(v.areaLabel)}${v.price ? ` · ${esc(v.price)}` : ""}</div>
          <h3 class="name">${esc(v.name)}</h3>
          <p class="hook">${esc(v.hook)}</p>
          <button type="button" class="more" data-open="${esc(v.id)}">Menu, details & links</button>
          <p class="times-label">${timesLabel(v)}</p>
          <div class="times">${timesHtml(v)}</div>
        </div>
      </article>`;
    }).join("");
    renderDock();
  }

  function renderDock() {
    const n = state.picks.size, top = state.top && byId[state.top] ? byId[state.top].name : null;
    const sent = state.submitted && !dirty();
    $("sum-main").textContent = closed() ? "Voting has closed"
      : sent ? `Vote in · ${n} time${n === 1 ? "" : "s"}${top ? ` · ★ ${top}` : ""}`
      : n ? `${n} time${n > 1 ? "s" : ""}${top ? ` · ★ ${top}` : ""}` : (top ? `★ ${top} · now pick times` : "Pick some times");
    $("who-btn").textContent = state.name.trim() ? `Voting as ${state.name.trim()} · Edit` : "Add your name";
    const ok = n > 0 && !closed() && (!sent);
    $("send").setAttribute("aria-disabled", String(!ok));
    $("send-label").textContent = closed() ? "Closed" : sent ? "Sent" : state.submitted ? "Update vote" : "Submit vote";
  }

  /* ---------- Events ---------- */
  function onGridClick(e) {
    const t = e.target.closest(".time"), s = e.target.closest(".star"), o = e.target.closest("[data-open]");
    if (t) toggleTime(t.dataset.k); else if (s) toggleTop(s.dataset.star); else if (o) openVenue(o.dataset.open);
  }
  function toggleTime(k) {
    if (closed()) return;
    state.picks.has(k) ? state.picks.delete(k) : state.picks.add(k); save();
    document.querySelectorAll(`.time[data-k="${CSS.escape(k)}"]`).forEach((b) => b.setAttribute("aria-pressed", state.picks.has(k)));
    renderDock();
  }
  function toggleTop(id) { if (closed()) return; state.top = state.top === id ? null : id; save(); render(); if (sheetMode === "venue" && sheetVenue) fillVenue(sheetVenue); }
  function setFilter(f) {
    state.filter = f;
    const btns = [...document.querySelectorAll(".seg button")], i = btns.findIndex((b) => b.dataset.f === f);
    btns.forEach((b) => b.setAttribute("aria-pressed", b.dataset.f === f));
    const th = $("seg-thumb"); if (th) th.style.transform = `translateX(${i * 100}%)`;
    render();
  }

  async function submit() {
    if (closed()) { toast("Voting has closed"); return; }
    if (!state.picks.size) { toast("Tap the times that work for you first"); return; }
    if (state.submitted && !dirty()) { toast("Your vote is in. Change a time to update it"); return; }
    if (!state.name.trim()) { openName(true); return; }
    const btn = $("send"); btn.setAttribute("aria-disabled", "true"); $("send-label").textContent = "Sending…";
    try {
      await api.cast(D.slug, { voterId, name: state.name.trim(), picks: [...state.picks].sort(), top: state.top });
      const first = !state.submitted; state.submitted = sig(); save();
      toast(first ? `Vote in. Thanks, ${state.name.trim()}` : "Vote updated");
      renderDock(); refresh();
    } catch (e) {
      renderDock(); toast("Couldn't send your vote. Check your signal and try again");
    }
  }

  /* ---------- Results ---------- */
  async function refresh() {
    try { state.votes = dedupe(await api.list(D.slug)); state.loadErr = false; } catch (e) { state.loadErr = true; }
    ORG ? renderOrganiser() : renderResults();
  }
  // One vote per name: if someone votes again from another phone, their latest vote counts.
  function dedupe(votes) {
    const m = new Map();
    (votes || []).forEach((v) => { const k = String(v.voter_name || "").trim().toLowerCase(); if (k) { m.delete(k); m.set(k, v); } });
    return [...m.values()];
  }
  const resultsHidden = () => VIS === "never" || (VIS === "afterClose" && !closed());
  function tally(votes) {
    const c = {}, f = {};
    votes.forEach((p) => { (p.picks || []).forEach((k) => (c[k] = (c[k] || 0) + 1)); if (p.top_pick) f[p.top_pick] = (f[p.top_pick] || 0) + 1; });
    return Object.entries(c).map(([k, n]) => { const [id, t] = k.split("@"); return { v: byId[id], t, n, fav: f[id] || 0 }; })
      .filter((r) => r.v && (r.v.times || []).includes(r.t))
      .sort((a, b) => b.n - a.n || b.fav - a.fav || a.t.localeCompare(b.t));
  }
  function renderResults() {
    const box = $("results"); if (!box) return;
    const votes = state.votes || [], rows = tally(votes).slice(0, 6), total = votes.length, party = D.party || total;
    const me = state.name.trim().toLowerCase();
    const cp = $("count-pill");
    if (total) { cp.hidden = false; $("count-text").textContent = `${total} of ${party} voted`; } else cp.hidden = true;
    const lead = rows[0];
    if (resultsHidden()) {
      box.innerHTML = `
        <div class="results-head"><h2>Results</h2><span>${total} of ${party} voted</span></div>
        <p class="empty">${VIS === "never" ? "Harry will share where we're going once everyone's voted." : `Hidden until voting closes ${esc(D.deadlineLabel || "")}, so everyone picks what they actually feel like.`}</p>
        ${total ? `<div class="voters">${votes.map((p) => `<span class="${p.voter_name && p.voter_name.trim().toLowerCase() === me && state.submitted ? "me" : ""}">${esc(p.voter_name)}</span>`).join("")}</div>` : ""}
        <p class="fine">You can change your vote any time before it closes. ${D.bookingNote ? esc(D.bookingNote) : "Harry books once voting closes."}</p>`;
      return;
    }
    box.innerHTML = `
      <div class="results-head"><h2>${closed() ? "Results" : "Live results"}</h2><span>${total} of ${party} voted</span></div>
      ${state.loadErr ? `<p class="empty">Results couldn't load right now. They'll refresh on their own.</p>`
        : !total ? `<p class="empty">No votes yet. Be the first: tap your times, star a favourite, then hit Submit vote.</p>`
        : `${lead ? `<div class="leader"><span class="k">${closed() ? "Winner" : "Leading"}</span><b>${esc(lead.v.name)} · ${fmt(lead.t)} pm</b><span>${lead.n} of ${party} can make it${lead.fav ? ` · ★ ${lead.fav} favourite${lead.fav > 1 ? "s" : ""}` : ""}</span></div>` : ""}
           <div class="res">${rows.map((r, i) => `<div class="row${i === 0 ? " lead" : ""}"><b>${esc(r.v.name)} · ${fmt(r.t)} pm${r.fav ? ` · ★${r.fav}` : ""}</b><span>${r.n} of ${party}</span><div class="bar"><i style="width:${Math.round((r.n / party) * 100)}%"></i></div></div>`).join("")}</div>
           <div class="voters">${votes.map((p) => `<span class="${p.voter_name && p.voter_name.trim().toLowerCase() === me && state.submitted ? "me" : ""}">${esc(p.voter_name)}</span>`).join("")}</div>`}
      <p class="fine">Most people free wins; stars break a tie. ${D.bookingNote ? esc(D.bookingNote) : "Harry books once voting closes."}</p>`;
  }

  /* ---------- Organiser view (private link: #r-<organiserKey>) ---------- */
  function buildOrganiser() {
    $("app").innerHTML = `
      <header>
        <div class="kicker">${esc(D.kicker)} · Organiser view</div>
        <h1>Results</h1>
        <p class="lede">Only you see this page. Mates ${VIS === "live" ? "see live results too" : VIS === "never" ? "never see results" : `see results after voting closes ${esc(D.deadlineLabel || "")}`}. Refreshes on its own.</p>
        <div class="status"><span class="pill" id="deadline"><span class="dot"></span><span id="deadline-text"></span><span class="sub" id="deadline-left"></span></span></div>
      </header>
      <section class="results" id="org-results" aria-live="polite"><p class="empty">Loading votes…</p></section>
      <section class="results" id="org-people" aria-live="polite" hidden></section>`;
    tick(); setInterval(tick, 30000);
  }
  function renderOrganiser() {
    const box = $("org-results"), ppl = $("org-people"); if (!box) return;
    const votes = state.votes || [], rows = tally(votes), total = votes.length, party = D.party || total, lead = rows[0];
    if (state.loadErr) { box.innerHTML = `<p class="empty">Votes couldn't load right now. This page will try again shortly.</p>`; return; }
    box.innerHTML = `
      <div class="results-head"><h2>${closed() ? "Final" : "So far"}</h2><span>${total} of ${party} voted</span></div>
      ${!total ? `<p class="empty">No votes yet.</p>` : `
        ${lead ? `<div class="leader"><span class="k">${closed() ? "Winner" : "Leading"}</span><b>${esc(lead.v.name)} · ${fmt(lead.t)} pm</b><span>${lead.n} of ${party} can make it${lead.fav ? ` · ★ ${lead.fav}` : ""}${rows[1] ? ` · next: ${esc(rows[1].v.name)} ${fmt(rows[1].t)} (${rows[1].n})` : ""}</span></div>` : ""}
        <div class="res">${rows.map((r, i) => `<div class="row${i === 0 ? " lead" : ""}"><b>${esc(r.v.name)} · ${fmt(r.t)} pm${r.fav ? ` · ★${r.fav}` : ""}</b><span>${r.n} of ${party}</span><div class="bar"><i style="width:${Math.round((r.n / party) * 100)}%"></i></div></div>`).join("")}</div>`}
      <p class="fine">Most people free wins; stars break a tie.</p>`;
    ppl.hidden = !total;
    ppl.innerHTML = `<div class="results-head"><h2>Who picked what</h2></div>
      <div class="group">${votes.map((p) => {
        const by = {}; (p.picks || []).forEach((k) => { const [id, t] = k.split("@"); if (byId[id]) (by[id] = by[id] || []).push(fmt(t)); });
        const lines = Object.entries(by).map(([id, ts]) => `${esc(byId[id].name)} ${ts.join(", ")}`);
        return `<div class="item"><span class="k">${esc(p.voter_name)}${p.top_pick && byId[p.top_pick] ? ` · ★ ${esc(byId[p.top_pick].name)}` : ""}</span><span class="v">${lines.join("<br>") || "No times picked"}</span></div>`;
      }).join("")}</div>`;
  }

  /* ---------- Toast ---------- */
  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

  /* ---------- Deadline ---------- */
  function tick() {
    const pill = $("deadline"); if (!pill) return;
    const txt = $("deadline-text"), sub = $("deadline-left");
    if (!isFinite(DEADLINE)) { pill.hidden = true; return; }
    const left = DEADLINE - Date.now();
    if (left <= 0) { pill.className = "pill closed"; txt.textContent = `Voting closed ${D.deadlineLabel || ""}`.trim(); sub.textContent = ""; }
    else {
      const h = Math.floor(left / 3.6e6), m = Math.floor((left % 3.6e6) / 6e4);
      pill.className = "pill" + (left < 3.6e6 ? " closing" : "");
      txt.textContent = `Voting closes ${D.deadlineLabel || ""}`.trim();
      sub.textContent = h > 23 ? "" : `${h ? h + "h " : ""}${m}m left`;
    }
  }

  /* ---------- Sheet (spring physics, drag to dismiss) ---------- */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function spring({ from, to, velocity = 0, response = 0.38, damping = 1, onUpdate, onDone }) {
    let x = from, v = velocity, last = performance.now(), id, stopped = false;
    const k = Math.pow((2 * Math.PI) / response, 2), c = (4 * Math.PI * damping) / response;
    const step = (now) => {
      if (stopped) return; const dt = Math.min(0.034, (now - last) / 1000); last = now;
      for (let i = 0; i < 4; i++) { const h = dt / 4, a = -k * (x - to) - c * v; v += a * h; x += v * h; }
      if (Math.abs(v) < 4 && Math.abs(x - to) < 0.4) { x = to; onUpdate(x); onDone && onDone(); return; }
      onUpdate(x); id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return { stop() { stopped = true; cancelAnimationFrame(id); } };
  }
  const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
  const rubber = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));
  const sheet = $("sheet"), scrim = $("scrim"), grab = $("grab"), sbody = $("sheet-body");
  let sheetY = 0, sheetH = 600, anim = null, sheetOpen = false, sheetMode = null, sheetVenue = null, returnFocus = null;
  function setY(y) { sheetY = y; sheet.style.transform = `translateY(${y}px)`; scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - y / sheetH))); }
  function showSheet() {
    returnFocus = document.activeElement;
    sheet.hidden = false; scrim.hidden = false; document.body.style.overflow = "hidden";
    sheetH = sheet.offsetHeight || 600; anim && anim.stop();
    if (reduce) setY(0); else { const start = sheetOpen ? sheetY : sheetH; setY(start); anim = spring({ from: start, to: 0, onUpdate: setY }); }
    sheetOpen = true;
    setTimeout(() => $("sheet-close").focus({ preventScroll: true }), 50);
  }
  function hideSheet(velocity = 0) {
    if (!sheetOpen) return; anim && anim.stop(); sheetOpen = false;
    const done = () => { if (sheetOpen) return; sheet.hidden = true; scrim.hidden = true; document.body.style.overflow = ""; sheetMode = null; sheetVenue = null; returnFocus && returnFocus.focus && returnFocus.focus({ preventScroll: true }); };
    if (reduce) { setY(sheetH); done(); return; }
    anim = spring({ from: sheetY, to: sheetH + 20, velocity, response: 0.34, onUpdate: setY, onDone: done });
  }
  $("sheet-close").addEventListener("click", () => hideSheet());
  scrim.addEventListener("click", () => hideSheet());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen) hideSheet(); });
  let drag = null;
  grab.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".sheet-close")) return;
    anim && anim.stop(); grab.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, y0: e.clientY, base: sheetY, hist: [{ y: e.clientY, t: performance.now() }] };
  });
  grab.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    let y = drag.base + (e.clientY - drag.y0); if (y < 0) y = rubber(y, sheetH);
    setY(y); drag.hist.push({ y: e.clientY, t: performance.now() }); if (drag.hist.length > 6) drag.hist.shift();
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const h = drag.hist, a = h[0], b = h[h.length - 1], vel = ((b.y - a.y) / Math.max(1, b.t - a.t)) * 1000; drag = null;
    if (sheetY + project(vel) > sheetH * 0.45 && vel > -200) hideSheet(vel);
    else anim = spring({ from: sheetY, to: 0, velocity: vel, response: 0.3, damping: 0.8, onUpdate: setY });
  };
  grab.addEventListener("pointerup", endDrag); grab.addEventListener("pointercancel", endDrag);

  /* ---------- Sheet contents ---------- */
  function openVenue(id) { sheetMode = "venue"; sheetVenue = id; fillVenue(id); showSheet(); }
  function fillVenue(id) {
    const v = byId[id], top = state.top === id, gal = v.photos || [];
    sbody.innerHTML = `
      ${gal.length ? `<div class="gallery" aria-label="${esc(v.name)} photos">${gal.map((p) => `<figure><img src="${esc(p.src)}" alt="${esc(p.alt)}" style="object-position:${esc(p.pos || "50% 50%")}" decoding="async"><figcaption>${esc(p.cap)}</figcaption></figure>`).join("")}</div>` : ""}
      <div><div class="meta">${esc(v.cuisine)} · ${esc(v.areaLabel)}${v.price ? ` · ${esc(v.price)}` : ""}</div><h2 id="sheet-title">${esc(v.name)}</h2><p class="addr">${esc(v.addr)}</p></div>
      <p class="why">${esc(v.why)}</p>
      ${v.order || v.know ? `<div class="group">${v.order ? `<div class="item"><span class="k">What to order</span><span class="v">${esc(v.order)}</span></div>` : ""}${v.know ? `<div class="item"><span class="k">Good to know</span><span class="v">${esc(v.know)}</span></div>` : ""}</div>` : ""}
      ${(v.links || []).length ? `<p class="sec-title">Menu & links</p>
      <div class="links">${v.links.map((l) => `<a class="bm" href="${esc(l.u)}" target="_blank" rel="noopener"><span class="t"><b>${esc(l.t)}</b><span>${esc(l.d)}</span><small>${LINK}${esc(l.dom)}</small></span><span class="thumb">${l.pdf ? `<span class="doc">PDF</span>` : cover(v, false)}</span></a>`).join("")}</div>` : ""}
      <p class="sec-title">${v.unverified ? "Times to confirm" : `Free for ${esc(D.party)} on ${esc(D.dayLabel || "the night")}`}</p>
      ${v.unverified ? `<p class="unv">Couldn't check online. Harry will call to confirm.</p>` : ""}
      <div class="times">${timesHtml(v)}</div>
      <div class="sheet-actions"><button type="button" class="toggle-top" data-star="${esc(v.id)}" aria-pressed="${top}"${closed() ? " disabled" : ""}>${STAR}<span>${top ? "Your top pick" : "Make this my top pick"}</span></button></div>`;
  }
  sbody.addEventListener("click", (e) => {
    if (sheetMode !== "venue") return;
    const t = e.target.closest(".time"), s = e.target.closest("[data-star]");
    if (t) toggleTime(t.dataset.k); else if (s) toggleTop(s.dataset.star);
  });

  function openName(thenSubmit) {
    sheetMode = "name";
    sbody.innerHTML = `
      <div><h2 id="sheet-title">What's your name?</h2><p class="addr">So everyone knows whose vote it is.</p></div>
      <form class="namebox" id="name-form">
        <input id="name-input" type="text" autocomplete="given-name" enterkeyhint="done" maxlength="30" placeholder="First name" aria-label="Your first name">
        <button type="submit" class="send" id="name-go">${CHECK}<span>${thenSubmit ? "Submit vote" : "Save"}</span></button>
      </form>`;
    const inp = $("name-input"); inp.value = state.name;
    $("name-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!inp.value.trim()) { inp.focus(); return; }
      state.name = inp.value.trim(); save(); renderDock(); hideSheet();
      if (thenSubmit || state.submitted) submit();
    });
    showSheet();
    setTimeout(() => inp.focus({ preventScroll: true }), 380);
  }
})();
