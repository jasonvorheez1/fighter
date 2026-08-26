import { VFX_ENTRIES, VFX_GROUPS, VFX_FRAME_COUNT, getVfx, framePath } from "./vfx-data.js";

const $ = (selector) => document.querySelector(selector);
const state = { filter: "all", query: "", selected: VFX_ENTRIES[0], frame: 0, playing: true, lastTime: 0, accumulator: 0 };

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", "\"":"&quot;"}[c])); }
function formatRole(role) { return role === "hit-spark" ? "HIT SPARK" : role === "main-effect" ? "MAIN EFFECT" : "MODULAR LAYER"; }
function visibleEntries() {
  return VFX_ENTRIES.filter((entry) => {
    const matchesFilter = state.filter === "all" || (state.filter === "hit-sparks" && entry.role === "hit-spark") || (state.filter === "move-effects" && entry.role === "main-effect") || (state.filter === "modular-layers" && entry.role === "layer");
    const haystack = `${entry.name} ${entry.role} ${entry.tags.join(" ")} ${entry.note}`.toLowerCase();
    return matchesFilter && (!state.query || haystack.includes(state.query));
  });
}

function renderFilters() {
  const filters = [{ id:"all", label:"ALL" }, ...VFX_GROUPS.map((group) => ({ id:group.id, label:group.label.toUpperCase() }))];
  $("#vfx-filters").innerHTML = filters.map((filter) => `<button class="vfx-filter ${filter.id === state.filter ? "active" : ""}" data-filter="${filter.id}" type="button">${filter.label}</button>`).join("");
  $("#vfx-filters").querySelectorAll("button").forEach((button) => button.onclick = () => { state.filter = button.dataset.filter; renderFilters(); renderGrid(); });
}

function renderGrid() {
  const entries = visibleEntries();
  $("#result-count").textContent = `${entries.length} ASSET${entries.length === 1 ? "" : "S"}`;
  $("#vfx-grid").innerHTML = entries.length ? entries.map((entry) => `<button type="button" class="vfx-card ${entry.id === state.selected.id ? "selected" : ""}" data-id="${entry.id}">
    <div class="vfx-card-art checkerboard"><img src="${entry.frames[0]}" alt="" loading="lazy" /><span>${String(entry.frames.length).padStart(2, "0")}F</span></div>
    <div class="vfx-card-copy"><strong>${escapeHtml(entry.name)}</strong><small>${formatRole(entry.role)}</small></div>
  </button>`).join("") : `<div class="empty-vfx"><strong>No matching assets.</strong><span>Try a broader search or reset the filter.</span></div>`;
  $("#vfx-grid").querySelectorAll(".vfx-card").forEach((card) => card.onclick = () => selectEntry(card.dataset.id));
}

function selectEntry(id) {
  state.selected = getVfx(id); state.frame = 0; state.accumulator = 0;
  renderGrid(); renderInspector();
}

function renderInspector() {
  const entry = state.selected;
  $("#inspector-name").textContent = entry.name;
  $("#inspector-role").textContent = formatRole(entry.role);
  $("#inspector-image").src = framePath(entry.id, state.frame);
  $("#inspector-frame").textContent = `${String(state.frame + 1).padStart(2, "0")} / ${String(entry.frames.length).padStart(2, "0")}`;
  $("#inspector-frames").textContent = `${entry.frames.length} ${entry.frames.length === 1 ? "FRAME" : "FRAMES"}`;
  $("#inspector-fps").textContent = entry.fps === 1 ? "STATIC" : `${entry.fps}`;
  $("#inspector-tags").innerHTML = entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  $("#inspector-note").textContent = entry.note;
  $("#timeline-strip").innerHTML = entry.frames.slice(0, 18).map((path, index) => `<span class="timeline-frame ${index === state.frame ? "active" : ""}"><img src="${path}" alt="" loading="lazy" /></span>`).join("");
  $("#vfx-snippet").textContent = JSON.stringify({ useAs: entry.role === "hit-spark" ? "visual.hitVfx" : "visual.mainVfx", id: entry.id, frames: entry.frames, fps: entry.fps }, null, 2);
  $("#play-toggle").textContent = state.playing ? "Ⅱ" : "▶";
  $("#play-toggle").setAttribute("aria-label", state.playing ? "Pause preview" : "Play preview");
}

async function copyText(text, message) {
  try { await navigator.clipboard.writeText(text); $("#copy-status").textContent = message; } catch { $("#copy-status").textContent = "Clipboard unavailable — select the hook manually."; }
}

$("#asset-count").textContent = `${VFX_FRAME_COUNT} FRAMES`;
$("#vfx-search").oninput = (event) => { state.query = event.target.value.trim().toLowerCase(); renderGrid(); };
$("#play-toggle").onclick = () => { state.playing = !state.playing; renderInspector(); };
$("#copy-hook").onclick = () => copyText($("#vfx-snippet").textContent, "Move hook copied.");
$("#copy-path").onclick = () => copyText(framePath(state.selected.id, state.frame), "Frame path copied.");

function animate(time) {
  const dt = Math.min(80, time - (state.lastTime || time)); state.lastTime = time;
  if (state.playing && state.selected.frames.length > 1) {
    state.accumulator += dt;
    if (state.accumulator > 1000 / state.selected.fps) { state.accumulator = 0; state.frame = (state.frame + 1) % state.selected.frames.length; renderInspector(); }
  }
  requestAnimationFrame(animate);
}

renderFilters(); renderGrid(); renderInspector(); requestAnimationFrame(animate);
