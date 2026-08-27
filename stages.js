// ─────────────────────────────────────────────────────────────────────────────
// STAGE WORKSHOP
// Managing battle backgrounds is its own job, so it gets its own page. Stages
// are uploaded to websim, saved against the player's account the same way
// fighters are, and the arena reads the chosen one back on the next match.
// ─────────────────────────────────────────────────────────────────────────────
import { playSfx } from "./sfx.js";

const $ = (selector) => document.querySelector(selector);
const STAGE_PREF_KEY = "forge-stage-id";

let stages = [];
let selectedId = readPref();

function readPref() { try { return localStorage.getItem(STAGE_PREF_KEY) || ""; } catch { return ""; } }
function writePref(id) { try { if (id) localStorage.setItem(STAGE_PREF_KEY, id); else localStorage.removeItem(STAGE_PREF_KEY); } catch { /* storage unavailable */ } }

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
function setStatus(message, isError = false) {
  const el = $("#stage-status");
  el.textContent = message;
  el.classList.toggle("error", Boolean(isError));
}

function selected() { return stages.find((stage) => stage.id === selectedId) || null; }

function render() {
  const grid = $("#stage-grid");
  const tiles = [`<button class="stage-card${selectedId ? "" : " active"}" data-stage=""><span class="stage-card-art default"></span><strong>Default arena</strong><small>The built-in neon stage</small></button>`];
  for (const stage of stages) {
    tiles.push(`<button class="stage-card${stage.id === selectedId ? " active" : ""}" data-stage="${escapeHtml(stage.id)}"><span class="stage-card-art" style="background-image:url('${escapeHtml(stage.image_url)}')"></span><strong>${escapeHtml(stage.name)}</strong><small>${new Date(stage.created_at || Date.now()).toLocaleDateString()}</small></button>`);
  }
  grid.innerHTML = tiles.join("");
  grid.querySelectorAll(".stage-card").forEach((card) => {
    card.onclick = () => { selectedId = card.dataset.stage; playSfx("menuCursor", { volume: .4 }); render(); };
  });

  const stage = selected();
  const preview = $("#stage-preview");
  preview.style.backgroundImage = stage ? `url('${stage.image_url}')` : "";
  preview.classList.toggle("default", !stage);
  $("#preview-name").textContent = stage ? stage.name : "Default arena";
  $("#stage-remove").disabled = !stage;
  $("#stage-count").textContent = `${stages.length} STAGE${stages.length === 1 ? "" : "S"}`;
  $("#stage-legend-count").textContent = `${stages.length} SAVED`;
}

async function load() {
  try {
    const response = await fetch("/api/stages");
    const data = await response.json();
    stages = Array.isArray(data.stages) ? data.stages : [];
  } catch { stages = []; }
  // A stage that was deleted elsewhere should not stay selected.
  if (selectedId && !stages.some((stage) => stage.id === selectedId)) selectedId = "";
  render();
  if (!stages.length) setStatus("No stages yet. Upload a background to make one.");
}

$("#stage-file").onchange = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!window.websim?.upload) { setStatus("Uploads are unavailable here.", true); return; }
  setStatus("Uploading…");
  try {
    const imageUrl = await window.websim.upload(file);
    const typed = $("#stage-name").value.trim();
    const name = (typed || (file.name || "Stage").replace(/\.[^.]+$/, "")).slice(0, 32);
    const response = await fetch("/api/stages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, imageUrl }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The stage could not be saved.");
    stages = [{ ...data.stage, created_at: Date.now() }, ...stages];
    selectedId = data.stage.id;
    $("#stage-name").value = "";
    render();
    playSfx("menuOk", { volume: .6 });
    setStatus(`${data.stage.name} saved. Hit "Use this stage" to fight on it.`);
  } catch (error) { setStatus(error.message || "Stage upload failed.", true); }
};

$("#stage-use").onclick = () => {
  writePref(selectedId);
  playSfx("menuStart", { volume: .7 });
  setStatus(selected() ? `${selected().name} is now the battle stage.` : "Back to the default arena.");
  location.href = "index.html";
};

$("#stage-remove").onclick = async () => {
  const stage = selected(); if (!stage) return;
  const button = $("#stage-remove"); button.disabled = true;
  try {
    const response = await fetch(`/api/stages/${encodeURIComponent(stage.id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("The stage could not be removed.");
    stages = stages.filter((entry) => entry.id !== stage.id);
    // Deleting the stage the arena was set to means falling back to default.
    if (readPref() === stage.id) writePref("");
    selectedId = "";
    render();
    setStatus(`${stage.name} deleted.`);
  } catch (error) { setStatus(error.message || "Stage removal failed.", true); button.disabled = false; }
};

load();
