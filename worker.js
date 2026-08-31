// ⚽ FantaLive Tactical Bot & Web Dashboard - Cloudflare Worker
// Lega a 10 partecipanti, 1000 crediti

const TELEGRAM_TOKEN = "8815005406:AAGwSBf--WvbEMCeQ1AusqJGQaXn1oxO0y4";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GROQ_API_KEY = ""; // Opzionale per i vocali gratuiti (console.groq.com)

// Stato in-memory dell'asta con le 10 squadre predefinite dal file Excel
let auctionState = {
  teams: {
    "Noi": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Peppe": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Cece": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Zio": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Nero": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Gino": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Cugino": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Paolo": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Andrea": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
    "Chiap": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } }
  },
  assigned: {},
  history: []
};

let databaseCache = null;

async function getDatabase() {
  if (databaseCache) return databaseCache;
  try {
    const res = await fetch("https://raw.githubusercontent.com/marcol8b/Fantacalcio-bot/main/fanta_database.json");
    if (res.ok) {
      databaseCache = await res.json();
      return databaseCache;
    }
  } catch (e) {
    console.error("Errore fetch database:", e);
  }
  return null;
}

function normalize(str) {
  if (!str) return "";
  return str.toLowerCase().replace(/[\-_/\\.,:']/g, ' ').replace(/\s+/g, ' ').trim();
}

function findBestPlayer(query, allPlayers) {
  if (!allPlayers || allPlayers.length === 0) return null;
  const q = normalize(query);
  if (!q) return null;
  
  let exact = allPlayers.find(p => normalize(p.nome) === q);
  if (exact) return exact;

  let starts = allPlayers.filter(p => normalize(p.nome).startsWith(q));
  if (starts.length === 1) return starts[0];

  let contains = allPlayers.filter(p => normalize(p.nome).includes(q));
  if (contains.length > 0) {
    contains.sort((a, b) => (a.slot_10 - b.slot_10) || (b.ia_ordinamento - a.ia_ordinamento));
    return contains[0];
  }
  return null;
}

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="it" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚽ FantaLive Command Center</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 500: '#10b981', 600: '#059669' },
            dark: { 900: '#0b0f19', 800: '#111827', 700: '#1f2937', 600: '#374151' },
            gold: '#f59e0b',
            fuchsia: '#d946ef',
            cyan: '#06b6d4'
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    body { font-family: 'Inter', sans-serif; }
    .neon-border-gold { border-left: 4px solid #f59e0b; }
    .neon-border-pink { border-left: 4px solid #d946ef; }
    .neon-border-blue { border-left: 4px solid #3b82f6; }
    .neon-border-gray { border-left: 4px solid #9ca3af; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #111827; }
    ::-webkit-scrollbar-thumb { background: #374151; border-radius: 3px; }
  </style>
</head>
<body class="bg-dark-900 text-gray-100 min-h-screen flex flex-col selection:bg-brand-500 selection:text-white">

  <!-- TOP NAVBAR -->
  <header class="bg-dark-800/90 backdrop-blur border-b border-dark-700 sticky top-0 z-40 px-4 py-3">
    <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center space-x-3">
        <span class="text-2xl">⚽</span>
        <div>
          <h1 class="text-lg font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">FANTALIVE COMMAND CENTER</h1>
          <p class="text-xs text-gray-400">Lega a 10 • 1000 Crediti • Live Tactical Engine</p>
        </div>
      </div>

      <!-- SEARCH BAR -->
      <div class="flex-1 max-w-md relative">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input type="text" id="searchInput" oninput="onSearchInput(this.value)" placeholder="Cerca calciatore (es: Kean, Vlahovic, Paz)..." 
               class="w-full bg-dark-700 border border-dark-600 rounded-xl pl-9 pr-10 py-2 text-sm focus:outline-none focus:border-brand-500 text-white placeholder-gray-400">
        <button onclick="startVoiceRecognition()" title="Cerca con la voce" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-400 p-1">
          <i class="fa-solid fa-microphone"></i>
        </button>
        <!-- Search Results Dropdown -->
        <div id="searchResults" class="hidden absolute top-full left-0 right-0 mt-1 bg-dark-800 border border-dark-600 rounded-xl shadow-2xl z-50 max-h-80 overflow-y-auto"></div>
      </div>

      <!-- ACTION BUTTONS -->
      <div class="flex items-center space-x-2">
        <button onclick="triggerSimula()" class="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5">
          <i class="fa-solid fa-play"></i> Simula Asta
        </button>
        <button onclick="triggerUndo()" class="bg-dark-700 hover:bg-dark-600 text-gray-300 text-xs px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5">
          <i class="fa-solid fa-rotate-left"></i> Annulla
        </button>
        <button onclick="triggerReset()" class="bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5">
          <i class="fa-solid fa-arrows-rotate"></i> Reset
        </button>
      </div>
    </div>
  </header>

  <!-- MAIN CONTAINER -->
  <main class="max-w-7xl mx-auto w-full p-4 flex-1 space-y-4">

    <!-- HERO CARDS (STATI & CONSIGLIO TATTICO) -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <!-- TUO BUDGET -->
      <div class="bg-dark-800 border border-dark-700 p-4 rounded-2xl flex items-center justify-between shadow-lg">
        <div>
          <span class="text-xs text-gray-400 uppercase font-semibold tracking-wider">Tuo Budget (Noi)</span>
          <div class="flex items-baseline gap-2 mt-1">
            <span id="myBudgetDisplay" class="text-3xl font-extrabold text-emerald-400">1000</span>
            <span class="text-xs text-gray-500">/ 1000 cr</span>
          </div>
          <p id="myRankDisplay" class="text-xs text-emerald-500/80 mt-1 font-medium">👑 #1° più ricco</p>
        </div>
        <div class="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">
          <i class="fa-solid fa-coins"></i>
        </div>
      </div>

      <!-- COMPOSIZIONE ROSA -->
      <div class="bg-dark-800 border border-dark-700 p-4 rounded-2xl flex items-center justify-between shadow-lg">
        <div>
          <span class="text-xs text-gray-400 uppercase font-semibold tracking-wider">Slot Occupati</span>
          <div class="text-2xl font-bold text-white mt-1" id="mySlotCountDisplay">0 / 25</div>
          <div class="flex gap-2 text-xs text-gray-400 mt-1" id="myRoleBadges">
            <span class="bg-dark-700 px-1.5 py-0.5 rounded">P: 0/3</span>
            <span class="bg-dark-700 px-1.5 py-0.5 rounded">D: 0/8</span>
            <span class="bg-dark-700 px-1.5 py-0.5 rounded">C: 0/8</span>
            <span class="bg-dark-700 px-1.5 py-0.5 rounded">A: 0/6</span>
          </div>
        </div>
        <div class="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-xl">
          <i class="fa-solid fa-shield-halved"></i>
        </div>
      </div>

      <!-- MEDIA CREDITI PER SLOT MANCANTE -->
      <div class="bg-dark-800 border border-dark-700 p-4 rounded-2xl flex items-center justify-between shadow-lg">
        <div>
          <span class="text-xs text-gray-400 uppercase font-semibold tracking-wider">Budget Medio / Slot</span>
          <div class="text-2xl font-bold text-amber-400 mt-1" id="myAvgPerSlotDisplay">~40 cr</div>
          <p class="text-xs text-gray-500 mt-1">per completare la rosa</p>
        </div>
        <div class="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xl">
          <i class="fa-solid fa-calculator"></i>
        </div>
      </div>

      <!-- STATUS ATTACCO FLASH -->
      <div class="bg-dark-800 border border-dark-700 p-4 rounded-2xl flex items-center justify-between shadow-lg">
        <div>
          <span class="text-xs text-gray-400 uppercase font-semibold tracking-wider">Top Attacco Rimasti</span>
          <div class="text-2xl font-bold text-fuchsia-400 mt-1" id="topAttRemainingDisplay">Slot 1: 3 rimasti</div>
          <p class="text-xs text-gray-400 mt-1" id="topAttOppsCount">10 squadre senza top</p>
        </div>
        <div class="w-12 h-12 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400 text-xl">
          <i class="fa-solid fa-fire"></i>
        </div>
      </div>
    </div>

    <!-- TACTICAL ADVICE HERO BANNER -->
    <div id="tacticalHeroBanner" class="bg-gradient-to-r from-emerald-950/40 via-dark-800 to-cyan-950/40 border border-emerald-500/20 rounded-2xl p-4 shadow-xl flex items-start gap-3">
      <div class="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-lg mt-0.5">
        <i class="fa-solid fa-brain"></i>
      </div>
      <div class="flex-1 text-sm text-gray-300" id="tacticalHeroText">
        Caricamento intelligence tattica in corso...
      </div>
    </div>

    <!-- 3 COLUMNS INTERACTIVE MATRIX -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
      
      <!-- COLONNA 1: CLASSIFICA SQUADRE (4 COLS) -->
      <div class="lg:col-span-4 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <i class="fa-solid fa-users text-emerald-400"></i> Squadre & Crediti (10)
          </h2>
          <span class="text-xs text-gray-500">Max Offerta Singola</span>
        </div>
        <div id="teamsLedgerList" class="space-y-2 max-h-[700px] overflow-y-auto pr-1"></div>
      </div>

      <!-- COLONNA 2: SCARSITÀ REPARTI (4 COLS) -->
      <div class="lg:col-span-4 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <i class="fa-solid fa-layer-group text-cyan-400"></i> Radar Scarsità Reparti
          </h2>
        </div>

        <!-- Role Tabs -->
        <div class="flex rounded-xl bg-dark-800 p-1 border border-dark-700 text-xs font-semibold gap-1">
          <button onclick="switchScarcityTab('ATT')" id="tab_ATT" class="flex-1 py-1.5 rounded-lg bg-dark-700 text-white transition">⚽ Attacco</button>
          <button onclick="switchScarcityTab('CC')" id="tab_CC" class="flex-1 py-1.5 rounded-lg text-gray-400 hover:text-white transition">🎯 CC</button>
          <button onclick="switchScarcityTab('DIF')" id="tab_DIF" class="flex-1 py-1.5 rounded-lg text-gray-400 hover:text-white transition">🛡️ Difesa</button>
          <button onclick="switchScarcityTab('POR')" id="tab_POR" class="flex-1 py-1.5 rounded-lg text-gray-400 hover:text-white transition">🧤 Portieri</button>
        </div>

        <div id="scarcitySlotContainer" class="space-y-3 max-h-[640px] overflow-y-auto pr-1"></div>
      </div>

      <!-- COLONNA 3: I MIEI OBIETTIVI (4 COLS) -->
      <div class="lg:col-span-4 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <i class="fa-solid fa-star text-gold"></i> I Tuoi Obiettivi
          </h2>
          <span class="text-xs text-gray-400" id="targetStatsBadge">72 calciatori</span>
        </div>

        <!-- Role Filter for Targets -->
        <div class="flex rounded-xl bg-dark-800 p-1 border border-dark-700 text-xs font-medium gap-1">
          <button onclick="filterTargets('ALL')" id="tgt_ALL" class="px-2.5 py-1 rounded-lg bg-dark-700 text-white">Tutti</button>
          <button onclick="filterTargets('P')" id="tgt_P" class="px-2.5 py-1 rounded-lg text-gray-400 hover:text-white">🧤 Por</button>
          <button onclick="filterTargets('D')" id="tgt_D" class="px-2.5 py-1 rounded-lg text-gray-400 hover:text-white">🛡️ Dif</button>
          <button onclick="filterTargets('C')" id="tgt_C" class="px-2.5 py-1 rounded-lg text-gray-400 hover:text-white">🎯 CC</button>
          <button onclick="filterTargets('A')" id="tgt_A" class="px-2.5 py-1 rounded-lg text-gray-400 hover:text-white">⚽ Att</button>
        </div>

        <div id="targetListContainer" class="space-y-3 max-h-[640px] overflow-y-auto pr-1"></div>
      </div>

    </div>
  </main>

  <!-- MODALE DETTAGLIO CALCIATORE & ASSEGNAZIONE RAPIDA -->
  <div id="assignModal" class="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-dark-800 border border-dark-700 rounded-2xl max-w-lg w-full p-5 shadow-2xl relative space-y-4">
      <button onclick="closeModal()" class="absolute top-4 right-4 text-gray-400 hover:text-white text-lg">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <div id="modalPlayerHeader"></div>

      <!-- Tattica & Contendenti Flash -->
      <div id="modalTacticalInsights" class="bg-dark-900/80 border border-dark-700 p-3.5 rounded-xl text-xs space-y-2"></div>

      <!-- Form Assegnazione -->
      <div class="space-y-3 pt-2 border-t border-dark-700">
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-gray-300">Prezzo d'Asta (cr):</label>
          <div class="flex items-center gap-2">
            <button onclick="adjustPrice(-5)" class="bg-dark-700 px-2 py-1 rounded text-xs hover:bg-dark-600">-5</button>
            <input type="number" id="assignPriceInput" class="w-20 bg-dark-700 border border-dark-600 rounded-lg text-center font-bold text-emerald-400 py-1" value="1">
            <button onclick="adjustPrice(5)" class="bg-dark-700 px-2 py-1 rounded text-xs hover:bg-dark-600">+5</button>
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-gray-300 block mb-1.5">Assegna alla Squadra:</label>
          <div id="modalTeamButtons" class="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto p-1 bg-dark-900/50 rounded-xl border border-dark-700"></div>
        </div>

        <button onclick="confirmAssign()" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30">
          <i class="fa-solid fa-check"></i> Conferma Assegnazione
        </button>
      </div>
    </div>
  </div>

  <!-- JAVASCRIPT LIVE ENGINE -->
  <script>
    let appState = null;
    let currentScarcityTab = 'ATT';
    let currentTargetFilter = 'ALL';
    let selectedPlayer = null;

    function getPlayerTacticalDossier(player) {
      if (!appState || !player) return '';

      const meKey = appState.teams["Noi"] ? "Noi" : (appState.teams["NOI"] ? "NOI" : Object.keys(appState.teams)[0]);
      const me = appState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
      const myBudget = me.budget;
      const maxRole = (player.ruolo === "P" ? 3 : (player.ruolo === "D" || player.ruolo === "C" ? 8 : 6));

      let aboveMeNoTop = [];
      let belowMeNoTop = [];

      for (const [tName, tData] of Object.entries(appState.teams)) {
        if (tName === meKey) continue;
        
        let topThreshold = 130;
        if (player.ruolo === "C") topThreshold = 50;
        if (player.ruolo === "D") topThreshold = 35;
        if (player.ruolo === "P") topThreshold = 40;

        const hasTop = tData.players.some(x => x.ruolo === player.ruolo && x.prezzo >= topThreshold);
        const roleCount = tData.role_count[player.ruolo] || 0;
        const roleMissing = Math.max(0, maxRole - roleCount);

        const otherMissing = Math.max(0, 3 - (tData.role_count.P || 0)) + 
                             Math.max(0, 8 - (tData.role_count.D || 0)) + 
                             Math.max(0, 8 - (tData.role_count.C || 0)) + 
                             Math.max(0, 6 - (tData.role_count.A || 0)) - 1;
        const maxBid = Math.max(1, tData.budget - Math.max(0, otherMissing));

        const teamObj = {
          name: tName,
          budget: tData.budget,
          maxBid: maxBid,
          hasTop: hasTop,
          roleCount: roleCount,
          roleMissing: roleMissing,
          diff: tData.budget - myBudget
        };

        if (roleMissing > 0) {
          if (tData.budget > myBudget) aboveMeNoTop.push(teamObj);
          else belowMeNoTop.push(teamObj);
        }
      }

      aboveMeNoTop.sort((a, b) => b.budget - a.budget);
      belowMeNoTop.sort((a, b) => b.budget - a.budget);

      let estimatedMin = 1;
      let estimatedMax = 5;
      if (player.ruolo === "A") {
        if (player.slot_10 === 1) { estimatedMin = 280; estimatedMax = 380; }
        else if (player.slot_10 === 2) { estimatedMin = 140; estimatedMax = 230; }
        else if (player.slot_10 === 3) { estimatedMin = 60; estimatedMax = 120; }
        else { estimatedMin = 10; estimatedMax = 40; }
      } else if (player.ruolo === "C") {
        if (player.slot_10 === 1) { estimatedMin = 90; estimatedMax = 140; }
        else if (player.slot_10 === 2) { estimatedMin = 45; estimatedMax = 80; }
        else if (player.slot_10 === 3) { estimatedMin = 15; estimatedMax = 40; }
        else { estimatedMin = 2; estimatedMax = 12; }
      } else if (player.ruolo === "D") {
        if (player.slot_10 === 1) { estimatedMin = 40; estimatedMax = 70; }
        else if (player.slot_10 === 2) { estimatedMin = 15; estimatedMax = 35; }
        else { estimatedMin = 1; estimatedMax = 10; }
      } else if (player.ruolo === "P") {
        if (player.slot_10 === 1) { estimatedMin = 60; estimatedMax = 90; }
        else { estimatedMin = 10; estimatedMax = 40; }
      }

      let res = `
        <div class="space-y-2.5">
          <div class="flex items-center justify-between bg-dark-800 p-2 rounded-lg border border-dark-700">
            <span class="text-gray-400 font-semibold">💸 A quanto potrebbe andare:</span>
            <span class="text-amber-400 font-bold text-sm">~${estimatedMin} - ${estimatedMax} cr</span>
          </div>

          <div class="space-y-1 bg-dark-800 p-2.5 rounded-lg border border-dark-700">
            <span class="font-bold text-gray-300 block mb-1">👥 QUADRO CONTENDENTI PER IL RUOLO [${player.ruolo}]:</span>
      `;

      if (aboveMeNoTop.length > 0) {
        res += `<div class="text-red-400 font-semibold text-[11px] mb-1">🔴 SOPRA DI TE CON SLOT LIBERI (${aboveMeNoTop.length} squadre):</div>`;
        res += `<div class="space-y-1 pl-1">` + aboveMeNoTop.map((t, idx) => `
          <div class="flex justify-between items-center text-[11px] bg-dark-900/60 px-2 py-1 rounded">
            <span class="font-bold text-white">${idx+1}. ${t.name}</span>
            <span class="text-gray-300"><b>${t.budget} cr</b> (<span class="text-red-400 font-semibold">+${t.diff} cr</span> vs te | Slot ${player.ruolo}: ${t.roleCount}/${maxRole})</span>
          </div>
        `).join('') + `</div>`;
      } else {
        res += `<div class="text-emerald-400 font-semibold text-[11px] bg-emerald-950/30 p-1.5 rounded border border-emerald-500/20">👑 SEI AL 1° POSTO! Nessun avversario a caccia di [${player.ruolo}] ha più crediti di te (${myBudget} cr).</div>`;
      }

      if (belowMeNoTop.length > 0) {
        res += `<div class="text-amber-400 font-semibold text-[11px] mt-2 mb-1">🟡 SOTTO DI TE CON SLOT LIBERI (${belowMeNoTop.length} squadre):</div>`;
        res += `<div class="space-y-1 pl-1 max-h-24 overflow-y-auto">` + belowMeNoTop.map(t => `
          <div class="flex justify-between items-center text-[11px] bg-dark-900/40 px-2 py-0.5 rounded">
            <span class="text-gray-300">• ${t.name}</span>
            <span class="text-gray-400">${t.budget} cr (Max: <b>${t.maxBid} cr</b>)</span>
          </div>
        `).join('') + `</div>`;
      }

      res += `</div>`;

      let targetName = "";
      let reasonText = "";
      if (aboveMeNoTop.length > 0) {
        const richest = aboveMeNoTop[0];
        targetName = richest.name + " (" + richest.budget + " cr)";
        reasonText = "Ha <b>più crediti di te (+" + richest.diff + " cr)</b> e ha ancora bisogno di [" + player.ruolo + "]. Se il tuo obiettivo primario non è " + player.nome + ", fallo spendere rilanciando fino a ~" + Math.floor(estimatedMin * 0.85) + " cr per prosciugargli i crediti!";
      } else if (belowMeNoTop.length > 0) {
        const topBelow = belowMeNoTop[0];
        targetName = topBelow.name + " (" + topBelow.budget + " cr)";
        reasonText = "È il tuo inseguitore più vicino per questo ruolo. Fallo spendere per togliergli spazio di manovra!";
      }

      if (targetName) {
        res += `
          <div class="bg-gradient-to-r from-red-950/40 to-amber-950/40 border border-red-500/30 p-2.5 rounded-lg text-[11px] space-y-1">
            <div class="flex items-center gap-1.5 text-amber-400 font-bold">
              <i class="fa-solid fa-wand-magic-sparkles"></i> 🃏 TRAPPOLA / BLUFF STRATEGICO:
            </div>
            <div>🎯 <b>Bersaglio da prosciugare:</b> <span class="text-white font-bold">${targetName}</span></div>
            <div class="text-gray-300 leading-relaxed">💡 <b>Perché:</b> ${reasonText}</div>
          </div>
        `;
      }

      res += `</div>`;
      return res;
    }

    function openTeamRosterModal(teamName) {
      const tData = appState.teams[teamName];
      if (!tData) return;

      const isMe = (teamName === 'Noi' || teamName === 'NOI');
      const byRole = { P: [], D: [], C: [], A: [] };
      tData.players.forEach(p => {
        if (byRole[p.ruolo]) byRole[p.ruolo].push(p);
        else byRole["A"].push(p);
      });

      function renderRoleSection(list) {
        if (!list || list.length === 0) return `<div class="text-xs text-gray-500 py-1"><i>Nessun giocatore acquistato</i></div>`;
        return list.map(p => `
          <div class="flex justify-between items-center text-xs bg-dark-900/60 px-2.5 py-1.5 rounded-lg border border-dark-700/50">
            <span class="font-bold text-white">${p.nome}</span>
            <span class="text-emerald-400 font-extrabold">${p.prezzo} cr</span>
          </div>
        `).join('');
      }

      document.getElementById('modalPlayerHeader').innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-lg font-bold text-white flex items-center gap-2">📋 ROSA: ${teamName.toUpperCase()} ${isMe ? '👑 (TU)' : ''}</h3>
            <p class="text-xs text-gray-400 mt-1">Crediti Residui: <b class="text-emerald-400 text-sm">${tData.budget} cr</b> / 1000 • Giocatori: <b>${tData.players.length}/25</b></p>
          </div>
        </div>
      `;

      document.getElementById('modalTacticalInsights').innerHTML = `
        <div class="space-y-3 max-h-96 overflow-y-auto pr-1">
          <div>
            <span class="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1.5">🧤 Portieri (${byRole.P.length}/3)</span>
            <div class="space-y-1">${renderRoleSection(byRole.P)}</div>
          </div>
          <div>
            <span class="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1.5">🛡️ Difensori (${byRole.D.length}/8)</span>
            <div class="space-y-1">${renderRoleSection(byRole.D)}</div>
          </div>
          <div>
            <span class="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1.5">🎯 Centrocampisti (${byRole.C.length}/8)</span>
            <div class="space-y-1">${renderRoleSection(byRole.C)}</div>
          </div>
          <div>
            <span class="text-xs font-bold text-cyan-400 uppercase tracking-wider block mb-1.5">⚽ Attaccanti (${byRole.A.length}/6)</span>
            <div class="space-y-1">${renderRoleSection(byRole.A)}</div>
          </div>
        </div>
      `;

      document.getElementById('modalTeamButtons').innerHTML = '';
      const formSec = document.querySelector('#assignModal .space-y-3.pt-2');
      if (formSec) formSec.classList.add('hidden');
      document.getElementById('assignModal').classList.remove('hidden');
    }


    async function fetchState() {
      try {
        const res = await fetch('/api/state');
        if (res.ok) {
          appState = await res.json();
          renderDashboard();
        }
      } catch (e) {
        console.error("Errore fetch stato:", e);
      }
    }

    function renderDashboard() {
      if (!appState) return;

      const me = appState.teams["Noi"] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
      
      // 1. Hero Stats
      document.getElementById('myBudgetDisplay').innerText = me.budget;
      const myTotalSlots = (me.role_count.P||0) + (me.role_count.D||0) + (me.role_count.C||0) + (me.role_count.A||0);
      document.getElementById('mySlotCountDisplay').innerText = \`\${myTotalSlots} / 25\`;
      document.getElementById('myRoleBadges').innerHTML = \`
        <span class="bg-dark-700 px-1.5 py-0.5 rounded">P: \${me.role_count.P||0}/3</span>
        <span class="bg-dark-700 px-1.5 py-0.5 rounded">D: \${me.role_count.D||0}/8</span>
        <span class="bg-dark-700 px-1.5 py-0.5 rounded">C: \${me.role_count.C||0}/8</span>
        <span class="bg-dark-700 px-1.5 py-0.5 rounded">A: \${me.role_count.A||0}/6</span>
      \`;

      const missingSlots = Math.max(1, 25 - myTotalSlots);
      document.getElementById('myAvgPerSlotDisplay').innerText = \`~\${Math.floor(me.budget / missingSlots)} cr\`;

      // Hero Attacco Stat
      const attReparto = appState.scarcity.ATTACCANTI || appState.scarcity.A || {};
      const freeS1Att = (attReparto.SLOT_1 || []).filter(p => !appState.assigned[p.nome]);
      document.getElementById('topAttRemainingDisplay').innerText = \`Slot 1: \${freeS1Att.length} rimasti\`;
      const oppsNoTop = Object.entries(appState.teams).filter(([n, d]) => n !== 'Noi' && !d.players.some(p => p.ruolo === 'A' && p.prezzo >= 130));
      document.getElementById('topAttOppsCount').innerText = \`\${oppsNoTop.length} avversari senza top\`;

      // Hero Tactical Text
      document.getElementById('tacticalHeroText').innerHTML = appState.tacticalAdviceHtml || "Seleziona un calciatore o verifica i reparti per i consigli in tempo reale.";

      // 2. Render Teams Ledger
      renderTeamsLedger();

      // 3. Render Scarcity Matrix
      renderScarcityMatrix();

      // 4. Render Targets
      renderTargetsList();
    }

    function renderTeamsLedger() {
      const container = document.getElementById('teamsLedgerList');
      const teams = Object.entries(appState.teams).map(([name, data]) => ({ name, ...data }));
      teams.sort((a, b) => b.budget - a.budget);

      container.innerHTML = teams.map((t, idx) => {
        const isMe = t.name === 'Noi';
        const aCount = t.role_count.A || 0;
        const cCount = t.role_count.C || 0;
        const dCount = t.role_count.D || 0;
        const pCount = t.role_count.P || 0;

        const otherMissing = Math.max(0, 3 - pCount) + Math.max(0, 8 - dCount) + Math.max(0, 8 - cCount) + Math.max(0, 6 - aCount - 1);
        const maxBidA = Math.max(1, t.budget - otherMissing);

        const hasTopAtt = t.players.some(p => p.ruolo === 'A' && p.prezzo >= 130);
        const topBadge = hasTopAtt ? \`<span class="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">✅ Ha Top</span>\` : \`<span class="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded">❌ Senza Top</span>\`;

        return \`
          <div class="bg-dark-800 border \${isMe ? 'border-emerald-500/50 bg-emerald-950/10' : 'border-dark-700'} p-3 rounded-xl hover:border-dark-600 transition space-y-1.5 shadow-md">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold \${idx < 3 ? 'text-amber-400' : 'text-gray-500'}">#\${idx+1}</span>
                <span class="font-bold text-sm text-white">\${t.name} \${isMe ? '👑 (TU)' : ''}</span>
              </div>
              <div class="text-right">
                <span class="text-sm font-extrabold \${isMe ? 'text-emerald-400' : 'text-cyan-400'}">\${t.budget} cr</span>
              </div>
            </div>
            <div class="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-dark-700/60">
              <div class="flex gap-1.5">
                <span>P:\${pCount}/3</span>
                <span>D:\${dCount}/8</span>
                <span>C:\${cCount}/8</span>
                <span>A:\${aCount}/6</span>
              </div>
              <div class="flex items-center gap-2">
                \${topBadge}
                <span class="font-semibold text-gray-300">Max Bid: <b class="text-amber-400">\${maxBidA}cr</b></span>
              </div>
            </div>
          </div>
        \`;
      }).join('');
    }

    function switchScarcityTab(role) {
      currentScarcityTab = role;
      ['ATT', 'CC', 'DIF', 'POR'].forEach(r => {
        const btn = document.getElementById(\`tab_\${r}\`);
        if (r === role) {
          btn.className = "flex-1 py-1.5 rounded-lg bg-dark-700 text-white transition";
        } else {
          btn.className = "flex-1 py-1.5 rounded-lg text-gray-400 hover:text-white transition";
        }
      });
      renderScarcityMatrix();
    }

    function renderScarcityMatrix() {
      const container = document.getElementById('scarcitySlotContainer');
      const repartiMap = { 'ATT': 'ATTACCANTI', 'CC': 'CENTROCAMPISTI', 'DIF': 'DIFENSORI', 'POR': 'PORTIERI' };
      const roleRepKey = repartiMap[currentScarcityTab] || 'ATTACCANTI';
      const slots = appState.scarcity[roleRepKey] || {};

      let html = '';
      for (let s = 1; s <= 4; s++) {
        const slotKey = \`SLOT_\${s}\`;
        const players = slots[slotKey] || [];
        if (players.length === 0) continue;

        const freePlayers = players.filter(p => !appState.assigned[p.nome]);
        const slotTitle = s === 1 ? '🔴 SLOT 1 (Super Top)' : (s === 2 ? '🟠 SLOT 2 (Top / 15+ gol)' : (s === 3 ? '🟡 SLOT 3 (Titolari)' : '⚪ SLOT 4 (Scommesse)'));

        html += \`
          <div class="bg-dark-800 border border-dark-700 rounded-xl p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-gray-300 uppercase">\${slotTitle}</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded bg-dark-700 text-emerald-400">\${freePlayers.length} / \${players.length} liberi</span>
            </div>
            <div class="grid grid-cols-2 gap-1.5">
              \${players.map(p => {
                const isTaken = appState.assigned[p.nome];
                return \`
                  <button onclick="openPlayerModal('\${p.nome}')" class="text-left p-2 rounded-lg border text-xs transition flex flex-col justify-between \${isTaken ? 'bg-dark-900/60 border-dark-800 opacity-40' : 'bg-dark-700/50 hover:bg-dark-700 border-dark-600/60 hover:border-brand-500'}">
                    <div class="flex justify-between items-start">
                      <span class="font-bold text-white truncate">\${p.nome}</span>
                      <span class="text-[10px] text-gray-400">\${p.squadra}</span>
                    </div>
                    <div class="flex justify-between items-center mt-1 text-[10px]">
                      <span class="text-gray-400">IA: \${p.ia_ordinamento} • Tit: \${p.titolarita}/5</span>
                      \${isTaken ? \`<span class="text-red-400 font-bold">\${isTaken.price}cr</span>\` : (p.budget_target ? \`<span class="text-emerald-400 font-semibold">\${p.budget_target}cr</span>\` : '')}
                    </div>
                  </button>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      }
      container.innerHTML = html || '<p class="text-xs text-gray-500 text-center py-6">Nessun calciatore disponibile.</p>';
    }

    function filterTargets(role) {
      currentTargetFilter = role;
      ['ALL', 'P', 'D', 'C', 'A'].forEach(r => {
        const btn = document.getElementById(\`tgt_\${r}\`);
        if (r === role) {
          btn.className = "px-2.5 py-1 rounded-lg bg-dark-700 text-white";
        } else {
          btn.className = "px-2.5 py-1 rounded-lg text-gray-400 hover:text-white";
        }
      });
      renderTargetsList();
    }

    function renderTargetsList() {
      const container = document.getElementById('targetListContainer');
      const cats = [
        { key: 'GIALLO_MUST_HAVE', label: 'MUST HAVE', icon: '🟡', border: 'neon-border-gold' },
        { key: 'ROSA_PRIMO_SLOT_MUST_HAVE', label: '1° SLOT MUST HAVE', icon: '🌸', border: 'neon-border-pink' },
        { key: 'BLU_OTTIMO_TITOLARE', label: 'OTTIMI TITOLARI', icon: '🔵', border: 'neon-border-blue' },
        { key: 'GRIGIO_SCOMMESSINA', label: 'SCOMMESSINE', icon: '⚪', border: 'neon-border-gray' }
      ];

      let html = '';
      cats.forEach(cat => {
        let players = appState.targets[cat.key] || [];
        if (currentTargetFilter !== 'ALL') {
          players = players.filter(p => p.ruolo === currentTargetFilter);
        }
        if (players.length === 0) return;

        html += \`
          <div class="bg-dark-800 border border-dark-700 rounded-xl p-3 \${cat.border} space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-gray-200">\${cat.icon} \${cat.label}</span>
              <span class="text-xs text-gray-500">\${players.length} calciatori</span>
            </div>
            <div class="space-y-1">
              \${players.map(p => {
                const isTaken = appState.assigned[p.nome];
                let statusBadge = '';
                if (!isTaken) statusBadge = \`<span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">LIBERO</span>\`;
                else if (isTaken.team === 'Noi') statusBadge = \`<span class="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">TUO (\${isTaken.price}cr)</span>\`;
                else statusBadge = \`<span class="text-[10px] text-gray-500 line-through">\${isTaken.team} (\${isTaken.price}cr)</span>\`;

                return \`
                  <div onclick="openPlayerModal('\${p.nome}')" class="cursor-pointer hover:bg-dark-700/60 p-1.5 rounded-lg flex items-center justify-between text-xs transition">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-white \${isTaken ? 'line-through text-gray-500' : ''}">\${p.nome}</span>
                      <span class="text-[10px] text-gray-400">(\${p.squadra} • \${p.ruolo})</span>
                    </div>
                    <div class="flex items-center gap-2">
                      \${p.budget_target ? \`<span class="text-xs font-semibold text-amber-400">\${p.budget_target}cr</span>\` : ''}
                      \${statusBadge}
                    </div>
                  </div>
                \`;
              }).join('')}
            </div>
          </div>
        \`;
      });

      container.innerHTML = html || '<p class="text-xs text-gray-500 text-center py-6">Nessun obiettivo per questo filtro.</p>';
    }

    // Modal & Assign Flow
    function openPlayerModal(playerName) {
      selectedPlayer = appState.allPlayers.find(p => p.nome.toLowerCase() === playerName.toLowerCase());
      if (!selectedPlayer) return;

      const isTaken = appState.assigned[selectedPlayer.nome];
      document.getElementById('modalPlayerHeader').innerHTML = \`
        <div class="flex justify-between items-start">
          <div>
            <h3 class="text-lg font-bold text-white">\${selectedPlayer.nome}</h3>
            <p class="text-xs text-gray-400">\${selectedPlayer.squadra} • \${selectedPlayer.ruolo} • Slot \${selectedPlayer.slot_10} (IA: \${selectedPlayer.ia_ordinamento})</p>
          </div>
          \${isTaken ? \`<span class="text-xs bg-red-500/20 text-red-400 px-2.5 py-1 rounded-lg font-bold">Assegnato a \${isTaken.team} (\${isTaken.price}cr)</span>\` : \`<span class="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-lg font-bold">🟢 LIBERO</span>\`}
        </div>
        \${selectedPlayer.nota ? \`<p class="text-xs text-gray-300 italic mt-2 bg-dark-900 p-2 rounded-lg border border-dark-700">📝 \${selectedPlayer.nota}</p>\` : ''}
      \`;

      // Set suggested price
      document.getElementById('assignPriceInput').value = selectedPlayer.budget_target || (selectedPlayer.slot_10 === 1 ? 250 : (selectedPlayer.slot_10 === 2 ? 140 : 20));

      // Insights & Bluff
      document.getElementById('modalTacticalInsights').innerHTML = \`
        <div class="font-semibold text-emerald-400 flex items-center gap-1.5"><i class="fa-solid fa-chart-line"></i> Intelligence Tattica:</div>
        <p class="text-gray-300">Stima d'asta realistica: <b>\${selectedPlayer.slot_10 === 1 ? '280-380' : '140-230'} cr</b>.</p>
        <p class="text-gray-400">💡 <i>Usa i tasti rapidi qui sotto per assegnare in 1 click a Noi o a un avversario.</i></p>
      \`;

      // Team Buttons
      const teamBtnContainer = document.getElementById('modalTeamButtons');
      const teams = Object.keys(appState.teams);
      teamBtnContainer.innerHTML = teams.map(tName => \`
        <button onclick="selectTeamForAssign('\${tName}')" id="btnTeam_\${tName}" class="team-assign-btn text-xs py-1.5 px-2 rounded-lg border border-dark-600 bg-dark-800 hover:bg-dark-700 text-gray-200 truncate \${tName==='Noi'?'border-emerald-500 text-emerald-400 font-bold':''}">
          \${tName}
        </button>
      \`).join('');

      selectedTeamToAssign = "Noi";
      document.getElementById('assignModal').classList.remove('hidden');
    }

    let selectedTeamToAssign = "Noi";
    function selectTeamForAssign(tName) {
      selectedTeamToAssign = tName;
      document.querySelectorAll('.team-assign-btn').forEach(b => {
        b.classList.remove('bg-emerald-600', 'text-white', 'border-emerald-400');
      });
      const target = document.getElementById(\`btnTeam_\${tName}\`);
      if (target) {
        target.classList.add('bg-emerald-600', 'text-white', 'border-emerald-400');
      }
    }

    function adjustPrice(delta) {
      const inp = document.getElementById('assignPriceInput');
      inp.value = Math.max(1, parseInt(inp.value || 1) + delta);
    }

    async function confirmAssign() {
      if (!selectedPlayer) return;
      const price = parseInt(document.getElementById('assignPriceInput').value || 1);
      try {
        const res = await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'assign',
            player: selectedPlayer.nome,
            team: selectedTeamToAssign,
            price: price
          })
        });
        if (res.ok) {
          closeModal();
          await fetchState();
        }
      } catch (e) {
        console.error(e);
      }
    }

    function closeModal() {
      document.getElementById('assignModal').classList.add('hidden');
      const formSec = document.querySelector('#assignModal .space-y-3.pt-2');
      if (formSec) formSec.classList.remove('hidden');
    }

    // Quick Actions
    async function triggerSimula() {
      if (confirm("Attivare la simulazione pre-asta attaccanti?")) {
        await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'simulate' }) });
        await fetchState();
      }
    }

    async function triggerUndo() {
      await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'undo' }) });
      await fetchState();
    }

    async function triggerReset() {
      if (confirm("Sei sicuro di voler resettare tutta l'asta a 1000 crediti?")) {
        await fetch('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) });
        await fetchState();
      }
    }

    // Search Autocomplete
    function onSearchInput(query) {
      const resultsDiv = document.getElementById('searchResults');
      if (!query || query.length < 2 || !appState) {
        resultsDiv.classList.add('hidden');
        return;
      }
      const q = query.toLowerCase().trim();
      const matches = appState.allPlayers.filter(p => p.nome.toLowerCase().includes(q)).slice(0, 8);

      if (matches.length === 0) {
        resultsDiv.innerHTML = '<p class="text-xs text-gray-400 p-3 text-center">Nessun calciatore trovato</p>';
      } else {
        resultsDiv.innerHTML = matches.map(p => \`
          <div onclick="openPlayerModal('\${p.nome}'); document.getElementById('searchResults').classList.add('hidden');" class="p-2.5 hover:bg-dark-700 cursor-pointer border-b border-dark-700/50 flex items-center justify-between text-xs">
            <div>
              <span class="font-bold text-white">\${p.nome}</span>
              <span class="text-[10px] text-gray-400 ml-1.5">\${p.squadra} • \${p.ruolo} (Slot \${p.slot_10})</span>
            </div>
            <span class="text-emerald-400 font-semibold">\${p.budget_target ? p.budget_target + ' cr' : ''}</span>
          </div>
        \`).join('');
      }
      resultsDiv.classList.remove('hidden');
    }

    // Voice recognition in browser
    function startVoiceRecognition() {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Il tuo browser non supporta il riconoscimento vocale diretto. Usa la barra di ricerca o Telegram.");
        return;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.lang = 'it-IT';
      rec.onstart = () => { document.getElementById('searchInput').placeholder = "🎙️ Parla adesso (es: Kean, Vlahovic)..."; };
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        document.getElementById('searchInput').value = text;
        onSearchInput(text);
      };
      rec.onend = () => { document.getElementById('searchInput').placeholder = "Cerca calciatore..."; };
      rec.start();
    }

    // Auto-polling every 3 seconds
    fetchState();
    setInterval(fetchState, 3000);
  </script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. DASHBOARD WEB / TELEGRAM WEBAPP
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
      return new Response(DASHBOARD_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }

    // 2. API STATO COMPLETO PER LA DASHBOARD
    if (request.method === "GET" && url.pathname === "/api/state") {
      const db = await getDatabase();
      const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
      
      const tacticalAdvice = db ? generateTacticalAdvice(db) : "Caricamento in corso...";
      const tacticalHtml = tacticalAdvice.replace(/\n/g, '<br>');
      
      const payload = {
        teams: auctionState.teams,
        assigned: auctionState.assigned,
        scarcity: db ? db.giocatori_per_reparto : {},
        targets: db ? db.obiettivi : {},
        allPlayers: db ? db.tutti_i_giocatori : [],
        tacticalAdviceHtml: tacticalHtml
      };
      return new Response(JSON.stringify(payload), {
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        }
      });
    }

    // 3. API AZIONI DALLA DASHBOARD
    if (request.method === "POST" && url.pathname === "/api/action") {
      try {
        const body = await request.json();
        const db = await getDatabase();
        if (body.action === "assign") {
          const player = findBestPlayer(body.player, db.tutti_i_giocatori);
          if (player) {
            assignPlayer(player, body.team || "Noi", parseInt(body.price || 1));
          }
        } else if (body.action === "undo") {
          undoLastAction();
        } else if (body.action === "reset") {
          resetAuction();
        } else if (body.action === "simulate") {
          runAttackSimulation(db);
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*" 
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
      }
    }

    // 4. TELEGRAM WEBHOOK POST
    if (request.method === "POST") {
      try {
        const update = await request.json();
        if (update.callback_query) {
          const cb = update.callback_query;
          const chatId = cb.message.chat.id;
          const data = cb.data || "";
          const db = await getDatabase();
          if (data === "ob_P") await sendObiettiviStatus(chatId, db, "p");
          else if (data === "ob_D") await sendObiettiviStatus(chatId, db, "d");
          else if (data === "ob_C") await sendObiettiviStatus(chatId, db, "c");
          else if (data === "ob_A") await sendObiettiviStatus(chatId, db, "a");
          else if (data === "ob_ALL") await sendObiettiviStatus(chatId, db, null);
          return new Response("OK", { status: 200 });
        }
        if (update.message) {
          await handleTelegramMessage(update.message, env);
        }
      } catch (err) {
        console.error("Worker error:", err);
      }
      return new Response("OK", { status: 200 });
    }

    return new Response("Method not allowed", { status: 405 });
  }
};

async function handleTelegramMessage(msg, env) {
  const chatId = msg.chat.id;
  const db = await getDatabase();
  if (!db) {
    await sendMessage(chatId, "⚠️ Database calciatori in caricamento... riprova tra 2 secondi.");
    return;
  }

  // Gestione Vocale
  let text = msg.text || "";
  if (msg.voice) {
    await sendMessage(chatId, "🎙️ <i>Ascolto il vocale...</i>");
    text = await transcribeTelegramVoice(msg.voice.file_id, env);
    if (!text) {
      await sendMessage(chatId, "❌ Non sono riuscito a trascrivere il vocale. Invia un messaggio di testo o riprova.");
      return;
    }
    await sendMessage(chatId, `🗣️ <i>Hai detto:</i> "<b>${text}</b>"`);
  }

  text = text.trim();
  const lower = text.toLowerCase();

  // COMANDI PRINCIPALI
  if (lower === "/start" || lower === "/help" || lower === "/comandi" || lower === "comandi" || lower === "/guida" || lower === "guida" || lower === "menu" || lower === "help") {
    await sendMainMenu(chatId);
    return;
  }

  // GESTIONE SQUADRE: /squadre oppure squadre oppure /squadre Nome1, Nome2...
  if (lower.startsWith("/squadre") || lower.startsWith("squadre")) {
    let cleanParam = text.replace(/^\/?squadre(@[a-zA-Z0-9_]+)?/i, "").trim();
    
    if (!cleanParam) {
      const currentList = Object.keys(auctionState.teams).map((t, idx) => `${idx + 1}. <b>${t}</b> (${auctionState.teams[t].budget} cr - ${auctionState.teams[t].players.length} giocatori)`).join("\n");
      await sendMessage(chatId, `👥 <b>SQUADRE PARTECIPANTI (Lega a 10):</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n${currentList}\n\n💡 <i>Per cambiare i nomi scrivi:</i>\n<code>/squadre Noi, Peppe, Cece, Zio, Nero, Gino, Cugino, Paolo, Andrea, Chiap</code>`);
      return;
    }

    const names = cleanParam.split(/[,\n]/).map(n => n.trim()).filter(n => n.length > 0);
    if (names.length < 2) {
      await sendMessage(chatId, "⚠️ Inserisci almeno 2 o più squadre separate da virgola (es: <code>/squadre Noi, Peppe, Cece, Zio, Nero, Gino, Cugino, Paolo, Andrea, Chiap</code>).");
      return;
    }
    
    auctionState.teams = {};
    names.forEach(n => {
      auctionState.teams[n] = { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
    });
    if (!auctionState.teams["Noi"] && !auctionState.teams["NOI"] && names.length > 0) {
      auctionState.teams["Noi"] = { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
    }
    
    const outList = Object.keys(auctionState.teams).map(t => `• <b>${t}</b>`).join("\n");
    await sendMessage(chatId, `✅ <b>Impostate ${Object.keys(auctionState.teams).length} Squadre (1000 crediti):</b>\n${outList}`);
    return;
  }

  // SIMULAZIONE PRE-ASTA ATTACCO
  if (lower === "/simula" || lower === "/simula_attacco" || lower === "simula" || lower === "🎮 simula pre-asta attacco") {
    runAttackSimulation(db);
    const textOut = `🎮 <b>SIMULAZIONE PRE-ASTA ATTACCO ATTIVATA!</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Tutte le 10 squadre hanno completato Portieri, Difensori e Centrocampisti.\n\n` +
                    `💰 <b>SITUAZIONE CREDITI PER L'ATTACCO:</b>\n` +
                    Object.entries(auctionState.teams).map(([t, d]) => `• <b>${t}</b>${(t==='Noi'||t==='NOI')?' 👑 (TU)':''}: <b>${d.budget} cr</b> rimasti (0/6 attaccanti)`).join("\n") +
                    `\n\n👉 <i>Tutti gli Attaccanti (Slot 1, 2, 3, 4) sono LIBERI! Clicca su <b>[⚽ Attacco]</b> o scrivi <b>kean</b> o <b>vlahovic</b> per testare la strategia!</i>`;
    await sendMessage(chatId, textOut, getRepartoKeyboard());
    return;
  }

  // RESET ASTA
  if (lower === "/reset" || lower === "reset" || lower === "🔄 reset asta" || lower === "reset asta") {
    resetAuction();
    await sendMessage(chatId, "🔄 <b>Asta Resettata!</b>\nTutte le 10 squadre sono state ripristinate a <b>1000 crediti</b> e tutti i 517 giocatori sono liberi.");
    return;
  }

  // ANNULLA
  if (lower === "/annulla" || lower === "annulla") {
    const res = undoLastAction();
    await sendMessage(chatId, res);
    return;
  }

  // TATTICA CONSIGLIATA
  if (lower === "/tattica" || lower === "tattica" || lower === "🧠 tattica consigliata" || lower === "consiglio") {
    const advice = generateTacticalAdvice(db);
    await sendMessage(chatId, advice, getRepartoKeyboard());
    return;
  }

  // REPARTI
  if (lower === "/att" || lower === "attaccanti" || lower === "⚽ attacco") {
    await sendAttaccoStatus(chatId, db);
    return;
  }

  if (lower === "/cc" || lower === "centrocampisti" || lower === "🎯 centrocampo") {
    await sendCentrocampoStatus(chatId, db);
    return;
  }

  if (lower === "/dif" || lower === "difensori" || lower === "🛡️ difesa") {
    await sendDifesaStatus(chatId, db);
    return;
  }

  if (lower === "/por" || lower === "portieri" || lower === "🧤 portieri") {
    await sendPortieriStatus(chatId, db);
    return;
  }

  // OBIETTIVI
  if (lower.startsWith("/obiettivi") || lower.startsWith("obiettivi") || lower === "⭐ i miei obiettivi") {
    let cleanParam = text.replace(/^\/?obiettivi(@[a-zA-Z0-9_]+)?/i, "").trim();
    if (lower === "⭐ i miei obiettivi") cleanParam = "";
    await sendObiettiviStatus(chatId, db, cleanParam || null);
    return;
  }

  // SALDI E CREDITI
  if (lower === "/saldi" || lower === "saldi" || lower === "💰 saldi e crediti") {
    await sendSaldiStatus(chatId);
    return;
  }

  // LA MIA ROSA
  if (lower === "/rosa" || lower === "rosa" || lower === "📋 la mia rosa") {
    await sendMiaRosaStatus(chatId);
    return;
  }

  // CONSULTA SQUADRA SPECIFICA (/squadra <Nome> oppure squadra <Nome> oppure /rosa <Nome>)
  if (lower.startsWith("/squadra") || lower.startsWith("squadra") || lower.startsWith("/rosa ") || (lower.startsWith("rosa ") && lower !== "rosa")) {
    let qTeam = "";
    if (lower.startsWith("/squadra") || lower.startsWith("squadra")) {
      qTeam = text.replace(/^\/?squadra(@[a-zA-Z0-9_]+)?/i, "").trim();
    } else {
      qTeam = text.replace(/^\/?rosa(@[a-zA-Z0-9_]+)?/i, "").trim();
    }

    if (!qTeam) {
      let msg = "👥 <b>DI QUALE SQUADRA VUOI VEDERE LA ROSA?</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
      Object.keys(auctionState.teams).forEach((t, i) => {
        msg += `${i + 1}. <code>/squadra ${t}</code> (${auctionState.teams[t].budget} cr - ${auctionState.teams[t].players.length} acquistati)\n`;
      });
      await sendMessage(chatId, msg, getRepartoKeyboard());
      return;
    }

    const targetKey = Object.keys(auctionState.teams).find(k => k.toLowerCase() === qTeam.toLowerCase() || k.toLowerCase().includes(qTeam.toLowerCase()));
    if (!targetKey) {
      await sendMessage(chatId, `❌ Squadra "<b>${qTeam}</b>" non trovata.\nSquadre disponibili:\n` + Object.keys(auctionState.teams).map(t => `• <code>/squadra ${t}</code>`).join("\n"));
      return;
    }

    const tData = auctionState.teams[targetKey];
    let lines = [
      `📋 <b>ROSA: ${targetKey.toUpperCase()}</b>`,
      `💰 <b>Crediti rimasti:</b> ${tData.budget} / 1000`,
      `📦 <b>Giocatori acquistati (${tData.players.length}):</b> P: ${tData.role_count.P}/3 | D: ${tData.role_count.D}/8 | C: ${tData.role_count.C}/8 | A: ${tData.role_count.A}/6\n`
    ];

    if (tData.players.length === 0) {
      lines.push("<i>Nessun giocatore acquistato finora.</i>");
    } else {
      const byRole = { P: [], D: [], C: [], A: [] };
      tData.players.forEach(p => {
        if (byRole[p.ruolo]) byRole[p.ruolo].push(p);
        else byRole["A"].push(p);
      });

      if (byRole.P.length > 0) {
        lines.push("🧤 <b>PORTIERI:</b>");
        byRole.P.forEach(p => lines.push(`  • ${p.nome} (<b>${p.prezzo} cr</b>)`));
      }
      if (byRole.D.length > 0) {
        lines.push("🛡️ <b>DIFENSORI:</b>");
        byRole.D.forEach(p => lines.push(`  • ${p.nome} (<b>${p.prezzo} cr</b>)`));
      }
      if (byRole.C.length > 0) {
        lines.push("🎯 <b>CENTROCAMPISTI:</b>");
        byRole.C.forEach(p => lines.push(`  • ${p.nome} (<b>${p.prezzo} cr</b>)`));
      }
      if (byRole.A.length > 0) {
        lines.push("⚽ <b>ATTACCANTI:</b>");
        byRole.A.forEach(p => lines.push(`  • ${p.nome} (<b>${p.prezzo} cr</b>)`));
      }
    }

    await sendMessage(chatId, lines.join("\n"), getRepartoKeyboard());
    return;
  }

  // COMANDO /ADD: /add <giocatore> <prezzo> [squadra]
  if (lower.startsWith("/add ")) {
    const raw = text.substring(5).trim();
    const parts = raw.split(" ");
    if (parts.length < 2) {
      await sendMessage(chatId, "⚠️ Formato non valido. Usa: <code>/add giocatore prezzo squadra</code> (es: <code>/add kean 140 Noi</code> o <code>/add lautaro 320 Peppe</code>).");
      return;
    }

    let price = 1;
    let teamName = "Noi";
    let nameParts = [];

    for (let i = 0; i < parts.length; i++) {
      if (!isNaN(parseInt(parts[i]))) {
        price = parseInt(parts[i]);
        if (i + 1 < parts.length) {
          teamName = parts.slice(i + 1).join(" ");
        }
        break;
      } else {
        nameParts.push(parts[i]);
      }
    }

    const nameQuery = nameParts.length > 0 ? nameParts.join(" ") : parts[0];
    const player = findBestPlayer(nameQuery, db.tutti_i_giocatori);
    if (!player) {
      await sendMessage(chatId, `❌ Calciatore "<b>${nameQuery}</b>" non trovato nel listone.`);
      return;
    }

    const matchedTeam = Object.keys(auctionState.teams).find(k => k.toLowerCase() === teamName.toLowerCase() || k.toLowerCase().includes(teamName.toLowerCase())) || teamName;
    const res = assignPlayer(player, matchedTeam, price);
    await sendMessage(chatId, res);
    return;
  }

  // COMANDO /REM: /rem <giocatore> <squadra> (SOLO SE C'È CORRISPONDENZA)
  if (lower.startsWith("/rem ")) {
    const raw = text.substring(5).trim();
    const parts = raw.split(" ");
    if (parts.length < 2) {
      await sendMessage(chatId, "⚠️ Formato non valido. Usa: <code>/rem giocatore squadra</code> (es: <code>/rem kean Noi</code> o <code>/rem lautaro Peppe</code>).");
      return;
    }

    let teamQuery = parts[parts.length - 1];
    let nameQuery = parts.slice(0, -1).join(" ");

    const matchedTeam = Object.keys(auctionState.teams).find(k => k.toLowerCase() === teamQuery.toLowerCase() || k.toLowerCase().includes(teamQuery.toLowerCase()));
    if (!matchedTeam) {
      if (parts.length >= 3) {
        teamQuery = parts.slice(-2).join(" ");
        nameQuery = parts.slice(0, -2).join(" ");
      }
    }

    const player = findBestPlayer(nameQuery, db.tutti_i_giocatori);
    if (!player) {
      await sendMessage(chatId, `❌ Calciatore "<b>${nameQuery}</b>" non trovato nel listone.`);
      return;
    }

    const currentAssigned = auctionState.assigned[player.nome];
    if (!currentAssigned) {
      await sendMessage(chatId, `⚠️ <b>${player.nome}</b> risulta già <b>LIBERO</b> e non assegnato ad alcuna squadra!`);
      return;
    }

    const actualTeam = currentAssigned.team;
    const targetTeam = Object.keys(auctionState.teams).find(k => k.toLowerCase() === teamQuery.toLowerCase() || k.toLowerCase().includes(teamQuery.toLowerCase())) || teamQuery;

    if (actualTeam.toLowerCase() !== targetTeam.toLowerCase() && !actualTeam.toLowerCase().includes(targetTeam.toLowerCase()) && !targetTeam.toLowerCase().includes(actualTeam.toLowerCase())) {
      await sendMessage(chatId, `❌ <b>CORRISPONDENZA FALLITA!</b>\n<b>${player.nome}</b> NON è presente nella rosa di <b>${targetTeam}</b>, ma risulta assegnato a <b>${actualTeam}</b> (per ${currentAssigned.price} cr).\n\nPer rimuoverlo usa: <code>/rem ${player.nome} ${actualTeam}</code>`);
      return;
    }

    const pricePaid = currentAssigned.price;
    delete auctionState.assigned[player.nome];

    const teamObj = auctionState.teams[actualTeam];
    if (teamObj) {
      teamObj.budget += pricePaid;
      teamObj.players = teamObj.players.filter(p => p.nome !== player.nome);
      teamObj.role_count[player.ruolo] = Math.max(0, (teamObj.role_count[player.ruolo] || 1) - 1);
    }

    auctionState.history = auctionState.history.filter(h => h.player.nome !== player.nome);

    await sendMessage(chatId, `🗑️ <b>RIMOZIONE CONFERMATA!</b>\n` +
                             `• Calciatore: <b>${player.nome}</b> (${player.ruolo}) rimosso dalla rosa di <b>${actualTeam}</b>.\n` +
                             `• 💰 Restituiti <b>${pricePaid} cr</b> a ${actualTeam} (Nuovo saldo: <b>${teamObj ? teamObj.budget : ''} cr</b>).\n` +
                             `• 🟢 <b>${player.nome}</b> è tornato nuovamente <b>LIBERO</b> nel listone.`);
    return;
  }

  // ASSEGNAZIONI RAPIDE: "mio <giocatore> <prezzo>"
  if (lower.startsWith("mio ")) {
    const parts = text.substring(4).trim().split(" ");
    let price = 1;
    let nameQuery = parts.join(" ");
    const lastPart = parts[parts.length - 1];
    if (!isNaN(parseInt(lastPart))) {
      price = parseInt(lastPart);
      nameQuery = parts.slice(0, -1).join(" ");
    }
    const player = findBestPlayer(nameQuery, db.tutti_i_giocatori);
    if (!player) {
      await sendMessage(chatId, `❌ Giocatore "<b>${nameQuery}</b>" non trovato nel listone.`);
      return;
    }
    const myTeamKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
    const res = assignPlayer(player, myTeamKey, price);
    await sendMessage(chatId, res);
    return;
  }

  // ASSEGNAZIONI RAPIDE: "via <giocatore> <prezzo> [squadra]"
  if (lower.startsWith("via ")) {
    const raw = text.substring(4).trim();
    const parts = raw.split(" ");
    let price = 1;
    let teamName = "Avversario";
    let nameParts = [];

    for (let i = 0; i < parts.length; i++) {
      if (!isNaN(parseInt(parts[i]))) {
        price = parseInt(parts[i]);
        if (i + 1 < parts.length) {
          teamName = parts.slice(i + 1).join(" ");
        }
        break;
      } else {
        nameParts.push(parts[i]);
      }
    }
    const nameQuery = nameParts.length > 0 ? nameParts.join(" ") : parts[0];
    const player = findBestPlayer(nameQuery, db.tutti_i_giocatori);
    if (!player) {
      await sendMessage(chatId, `❌ Giocatore "<b>${nameQuery}</b>" non trovato nel listone.`);
      return;
    }

    const matchedTeam = Object.keys(auctionState.teams).find(k => k.toLowerCase() === teamName.toLowerCase() || k.toLowerCase().includes(teamName.toLowerCase())) || teamName;
    const res = assignPlayer(player, matchedTeam, price);
    await sendMessage(chatId, res);
    return;
  }

  // RICERCA GIOCATORE / FLASH RADAR
  await handlePlayerLookup(chatId, text, db);
}

// -------------------------------------------------------------
// MOTORE TATTICO E FUNZIONI DI SUPPORTO
// -------------------------------------------------------------
function assignPlayer(player, teamName, price) {
  if (auctionState.assigned[player.nome]) {
    const old = auctionState.assigned[player.nome];
    return `⚠️ <b>${player.nome}</b> è già stato assegnato a <b>${old.team}</b> per ${old.price} cr! Usa /annulla se hai sbagliato.`;
  }

  if (!auctionState.teams[teamName]) {
    auctionState.teams[teamName] = { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  }

  auctionState.teams[teamName].budget -= price;
  auctionState.teams[teamName].players.push({ nome: player.nome, ruolo: player.ruolo, prezzo: price });
  auctionState.teams[teamName].role_count[player.ruolo] = (auctionState.teams[teamName].role_count[player.ruolo] || 0) + 1;

  auctionState.assigned[player.nome] = { team: teamName, price: price, player: player };
  auctionState.history.push({ player: player, team: teamName, price: price });

  let badge = "";
  if (player.tag_obiettivo === "GIALLO_MUST_HAVE") badge = " 🟡 [MUST HAVE]";
  if (player.tag_obiettivo === "ROSA_PRIMO_SLOT_MUST_HAVE") badge = " 🌸 [1° SLOT MUST HAVE]";
  if (player.tag_obiettivo === "BLU_OTTIMO_TITOLARE") badge = " 🔵 [OTTIMO TITOLARE]";
  if (player.tag_obiettivo === "GRIGIO_SCOMMESSINA") badge = " ⚪ [SCOMMESSINA]";

  return `✅ <b>ASSEGNATO!</b>${badge}\n` +
         `⚽ <b>${player.nome}</b> (${player.squadra} - ${player.ruolo}) ➔ <b>${teamName}</b> a <b>${price} cr</b>.\n` +
         `💰 <i>Budget residuo ${teamName}: ${auctionState.teams[teamName].budget} cr.</i>`;
}

function undoLastAction() {
  if (auctionState.history.length === 0) {
    return "⚠️ Nessuna azione da annullare.";
  }
  const last = auctionState.history.pop();
  delete auctionState.assigned[last.player.nome];
  
  const team = auctionState.teams[last.team];
  if (team) {
    team.budget += last.price;
    team.players = team.players.filter(p => p.nome !== last.player.nome);
    team.role_count[last.player.ruolo] = Math.max(0, (team.role_count[last.player.ruolo] || 1) - 1);
  }
  return `↩️ <b>Annullata assegnazione di ${last.player.nome} a ${last.team} (${last.price} cr).</b>`;
}

function resetAuction() {
  auctionState = {
    teams: {
      "Noi": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Peppe": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Cece": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Zio": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Nero": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Gino": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Cugino": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Paolo": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Andrea": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } },
      "Chiap": { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } }
    },
    assigned: {},
    history: []
  };
}

function generateTacticalAdvice(db) {
  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const me = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  const myBudget = me.budget;

  const attAll = db.giocatori_per_reparto ? (db.giocatori_per_reparto["ATTACCANTI"] || {}) : {};
  const s1_att = (attAll["SLOT_1"] || []).filter(p => !auctionState.assigned[p.nome]);
  const iHaveTopAtt = me.players.some(p => p.ruolo === "A" && p.prezzo >= 130);

  const ccAll = db.giocatori_per_reparto ? (db.giocatori_per_reparto["CENTROCAMPISTI"] || {}) : {};
  const s1_cc = (ccAll["SLOT_1"] || []).filter(p => !auctionState.assigned[p.nome]);
  const iHaveTopCc = me.players.some(p => p.ruolo === "C" && p.prezzo >= 50);

  let oppsNoTopAtt = [];
  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    if (tName === meKey) continue;
    const hasTop = tData.players.some(p => p.ruolo === "A" && p.prezzo >= 130);
    if (!hasTop) {
      oppsNoTopAtt.push({ name: tName, budget: tData.budget });
    }
  }
  oppsNoTopAtt.sort((a, b) => b.budget - a.budget);

  const allBudgets = Object.entries(auctionState.teams).map(([name, d]) => ({ name, budget: d.budget }));
  allBudgets.sort((a, b) => b.budget - a.budget);
  const myRank = allBudgets.findIndex(t => t.name === meKey) + 1;

  let lines = [
    `🧠 <b>TATTICA CONSIGLIATA & STRATEGIA D'ASTA</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 <b>Il tuo Potere d'Acquisto:</b> <b>${myBudget} cr</b> (Sei al <b>#${myRank}° posto</b> su 10 squadre)\n`
  ];

  lines.push(`⚽ <b>STRATEGIA ATTACCO:</b>`);
  if (iHaveTopAtt) {
    const myTop = me.players.find(p => p.ruolo === "A" && p.prezzo >= 130);
    lines.push(`• ✅ <b>Hai già il tuo 1° Slot (${myTop.nome} a ${myTop.prezzo} cr).</b>`);
    lines.push(`• 💡 <b>Consiglio:</b> Non rilanciare su altri Slot 1. Attendi che gli avversari si scannino e prendi un 2° slot conveniente o completa centrocampo e difesa.\n`);
  } else {
    lines.push(`• ⚠️ <b>Sei ancora SENZA il 1° Slot d'attacco.</b>`);
    lines.push(`• 🔴 <b>Slot 1 rimasti:</b> ${s1_att.length} (${s1_att.map(p => p.nome).join(", ") || "Finiti!"})`);
    lines.push(`• 👥 <b>Avversari diretti in cerca di Top:</b> <b>${oppsNoTopAtt.length} squadre</b> (Budget max concorrenti: ${oppsNoTopAtt.slice(0, 3).map(o => `${o.name} ${o.budget}cr`).join(", ") || "Nessuno"}).`);

    if (s1_att.length <= 2 && s1_att.length > 0 && oppsNoTopAtt.length >= 3) {
      lines.push(`• 🚨 <b>ALLARME SCARSITÀ:</b> Restano solo ${s1_att.length} Super Top per ${oppsNoTopAtt.length} squadre! <b>Forza subito ${s1_att[0].nome} oppure punta tutto su Kean/Scamacca/Ramos prima che salgano anche quelli!</b>\n`);
    } else if (myBudget >= (oppsNoTopAtt[0] ? oppsNoTopAtt[0].budget : 0)) {
      lines.push(`• 👑 <b>SEI IL PIÙ RICCO TRA CHI CERCA IL TOP!</b> Puoi dettare tu il prezzo sapendo che nessun concorrente diretto può superarti.\n`);
    } else {
      lines.push(`• 💡 <b>Consiglio:</b> Ci sono avversari con più crediti (${oppsNoTopAtt[0] ? oppsNoTopAtt[0].name : ""}). Lascia sfogare i più ricchi e prendi il secondo top a prezzo di saldo.\n`);
    }
  }

  lines.push(`🎯 <b>STRATEGIA CENTROCAMPO:</b>`);
  if (iHaveTopCc) {
    lines.push(`• ✅ Hai già coperto un top di centrocampo. Concentrati su ottimi titolari a 10-20 cr.\n`);
  } else {
    lines.push(`• 🔴 <b>Top Centrocampo rimasti:</b> ${s1_cc.length} (${s1_cc.slice(0, 4).map(p => p.nome).join(", ") || "Finiti"}).`);
    lines.push(`• 💡 <b>Consiglio:</b> I centrocampisti da bonus pesanti finiscono in fretta. Assicurati almeno un top prima di rimanere con soli mediani.\n`);
  }

  const missingP = Math.max(0, 3 - me.role_count.P);
  const missingD = Math.max(0, 8 - me.role_count.D);
  const missingC = Math.max(0, 8 - me.role_count.C);
  const missingA = Math.max(0, 6 - me.role_count.A);
  const totalMissing = missingP + missingD + missingC + missingA;

  if (totalMissing > 0) {
    const avgCrPerSlot = Math.floor(myBudget / totalMissing);
    lines.push(`📊 <b>GESTIONE CREDITI:</b>`);
    lines.push(`• Ti mancano <b>${totalMissing} giocatori</b> (P:${missingP}, D:${missingD}, C:${missingC}, A:${missingA}).`);
    lines.push(`• Budget medio disponibile: <b>~${avgCrPerSlot} crediti per ogni slot rimanente</b>.`);
  }

  return lines.join("\n");
}

function runAttackSimulation(db) {
  resetAuction();

  const simData = {
    "Noi": {
      players: [
        { nome: "Falcone", ruolo: "P", prezzo: 15 },
        { nome: "Butez", ruolo: "P", prezzo: 12 },
        { nome: "Bleve", ruolo: "P", prezzo: 1 },
        { nome: "Bastoni", ruolo: "D", prezzo: 55 },
        { nome: "Wesley", ruolo: "D", prezzo: 50 },
        { nome: "Gila", ruolo: "D", prezzo: 18 },
        { nome: "Valeri", ruolo: "D", prezzo: 8 },
        { nome: "Dragusin", ruolo: "D", prezzo: 5 },
        { nome: "Norton-Cuffy", ruolo: "D", prezzo: 3 },
        { nome: "Badiashile", ruolo: "D", prezzo: 2 },
        { nome: "Marcandalli", ruolo: "D", prezzo: 1 },
        { nome: "Pulisic", ruolo: "C", prezzo: 115 },
        { nome: "Baturina", ruolo: "C", prezzo: 45 },
        { nome: "Fazzini", ruolo: "C", prezzo: 12 },
        { nome: "Frendrup", ruolo: "C", prezzo: 8 },
        { nome: "Gaetano", ruolo: "C", prezzo: 6 },
        { nome: "Diouf", ruolo: "C", prezzo: 4 },
        { nome: "Vergara", ruolo: "C", prezzo: 2 },
        { nome: "Calò", ruolo: "C", prezzo: 1 }
      ]
    },
    "Peppe": {
      players: [
        { nome: "Carnesecchi", ruolo: "P", prezzo: 45 },
        { nome: "Caprile", ruolo: "P", prezzo: 8 },
        { nome: "Mandas", ruolo: "P", prezzo: 1 },
        { nome: "Dimarco", ruolo: "D", prezzo: 65 },
        { nome: "Bisseck", ruolo: "D", prezzo: 22 },
        { nome: "Rrahmani", ruolo: "D", prezzo: 18 },
        { nome: "Miranda J.", ruolo: "D", prezzo: 8 },
        { nome: "Monterisi", ruolo: "D", prezzo: 2 },
        { nome: "Mangas", ruolo: "D", prezzo: 1 },
        { nome: "Ahanor", ruolo: "D", prezzo: 1 },
        { nome: "Antov", ruolo: "D", prezzo: 1 },
        { nome: "Calhanoglu", ruolo: "C", prezzo: 120 },
        { nome: "Ederson D.S.", ruolo: "C", prezzo: 48 },
        { nome: "McKennie", ruolo: "C", prezzo: 20 },
        { nome: "Cristante", ruolo: "C", prezzo: 10 },
        { nome: "Busio", ruolo: "C", prezzo: 8 },
        { nome: "Ekkelenkamp", ruolo: "C", prezzo: 4 },
        { nome: "Ghedjemis", ruolo: "C", prezzo: 2 },
        { nome: "Schmid", ruolo: "C", prezzo: 1 }
      ]
    },
    "Cece": {
      players: [
        { nome: "Svilar", ruolo: "P", prezzo: 40 },
        { nome: "Martinez Jo.", ruolo: "P", prezzo: 10 },
        { nome: "Contini", ruolo: "P", prezzo: 1 },
        { nome: "Bremer", ruolo: "D", prezzo: 60 },
        { nome: "Kalulu", ruolo: "D", prezzo: 25 },
        { nome: "Molina N.", ruolo: "D", prezzo: 15 },
        { nome: "Couto", ruolo: "D", prezzo: 12 },
        { nome: "Chalobah T.", ruolo: "D", prezzo: 8 },
        { nome: "Bernasconi", ruolo: "D", prezzo: 4 },
        { nome: "Zappacosta", ruolo: "D", prezzo: 10 },
        { nome: "N'Dicka", ruolo: "D", prezzo: 15 },
        { nome: "Zaccagni", ruolo: "C", prezzo: 110 },
        { nome: "Frattesi", ruolo: "C", prezzo: 55 },
        { nome: "Samardzic", ruolo: "C", prezzo: 30 },
        { nome: "Baldanzi", ruolo: "C", prezzo: 12 },
        { nome: "Casadei", ruolo: "C", prezzo: 8 },
        { nome: "Taylor K.", ruolo: "C", prezzo: 5 },
        { nome: "Alajbegovic", ruolo: "C", prezzo: 4 },
        { nome: "Adopo", ruolo: "C", prezzo: 1 }
      ]
    },
    "Zio": {
      players: [
        { nome: "Maignan", ruolo: "P", prezzo: 48 },
        { nome: "Christensen O.", ruolo: "P", prezzo: 2 },
        { nome: "Daffara", ruolo: "P", prezzo: 1 },
        { nome: "Mancini", ruolo: "D", prezzo: 30 },
        { nome: "Pavlovic", ruolo: "D", prezzo: 22 },
        { nome: "Solet", ruolo: "D", prezzo: 18 },
        { nome: "Ramon", ruolo: "D", prezzo: 8 },
        { nome: "Stankovic F.", ruolo: "D", prezzo: 4 },
        { nome: "Kristensen T.", ruolo: "D", prezzo: 2 },
        { nome: "Tiago Gabriel", ruolo: "D", prezzo: 1 },
        { nome: "Amey", ruolo: "D", prezzo: 1 },
        { nome: "Barella", ruolo: "C", prezzo: 65 },
        { nome: "Zaniolo", ruolo: "C", prezzo: 45 },
        { nome: "Mora", ruolo: "C", prezzo: 20 },
        { nome: "Gudmundsson A.", ruolo: "C", prezzo: 35 },
        { nome: "Santos A.", ruolo: "C", prezzo: 15 },
        { nome: "De Bruyne", ruolo: "C", prezzo: 12 },
        { nome: "Akinsanmiro", ruolo: "C", prezzo: 2 },
        { nome: "Adzic", ruolo: "C", prezzo: 2 }
      ]
    },
    "Nero": {
      players: [
        { nome: "Di Gregorio", ruolo: "P", prezzo: 45 },
        { nome: "Corvi", ruolo: "P", prezzo: 1 },
        { nome: "Okoye", ruolo: "P", prezzo: 10 },
        { nome: "Akanji", ruolo: "D", prezzo: 35 },
        { nome: "Badiashile", ruolo: "D", prezzo: 15 },
        { nome: "Alhassane", ruolo: "D", prezzo: 2 },
        { nome: "Akpoguma", ruolo: "D", prezzo: 1 },
        { nome: "Abankwah", ruolo: "D", prezzo: 1 },
        { nome: "Antov", ruolo: "D", prezzo: 1 },
        { nome: "Arizala", ruolo: "D", prezzo: 1 },
        { nome: "Aurelio", ruolo: "D", prezzo: 1 },
        { nome: "Paz N.", ruolo: "C", prezzo: 85 },
        { nome: "Ferguson", ruolo: "C", prezzo: 40 },
        { nome: "Fabbian", ruolo: "C", prezzo: 25 },
        { nome: "Pessina", ruolo: "C", prezzo: 15 },
        { nome: "Pasalic", ruolo: "C", prezzo: 20 },
        { nome: "Colpani", ruolo: "C", prezzo: 25 },
        { nome: "Addai", ruolo: "C", prezzo: 2 },
        { nome: "Aboukhlal", ruolo: "C", prezzo: 3 }
      ]
    }
  };

  const otherTeams = ["Gino", "Cugino", "Paolo", "Andrea", "Chiap"];
  otherTeams.forEach((tName, idx) => {
    const budgetSpent = 350 + (idx * 25);
    auctionState.teams[tName] = {
      budget: 1000 - budgetSpent,
      players: [
        { nome: `Portiere_${tName}`, ruolo: "P", prezzo: 35 },
        { nome: `Difesa_${tName}_1`, ruolo: "D", prezzo: 30 },
        { nome: `Difesa_${tName}_2`, ruolo: "D", prezzo: 20 },
        { nome: `Centrocampo_${tName}_1`, ruolo: "C", prezzo: 60 },
        { nome: `Centrocampo_${tName}_2`, ruolo: "C", prezzo: 40 }
      ],
      role_count: { P: 3, D: 8, C: 8, A: 0 }
    };
  });

  for (const [tName, data] of Object.entries(simData)) {
    auctionState.teams[tName] = { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
    data.players.forEach(p => {
      auctionState.teams[tName].budget -= p.prezzo;
      auctionState.teams[tName].players.push(p);
      auctionState.teams[tName].role_count[p.ruolo] = (auctionState.teams[tName].role_count[p.ruolo] || 0) + 1;
      auctionState.assigned[p.nome] = { team: tName, price: p.prezzo, player: p };
    });
  }
}

async function sendAttaccoStatus(chatId, db) {
  const attAll = db.giocatori_per_reparto ? (db.giocatori_per_reparto["ATTACCANTI"] || {}) : {};
  function getFree(slotKey) {
    const list = attAll[slotKey] || [];
    return list.filter(p => !auctionState.assigned[p.nome]);
  }

  const s1 = getFree("SLOT_1");
  const s2 = getFree("SLOT_2");
  const s3 = getFree("SLOT_3");

  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const myTeam = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  const myBudget = myTeam.budget;

  let teamDetails = [];
  let oppsNoTop = [];

  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    const isMe = (tName === meKey);
    const aCount = tData.role_count.A || 0;
    const aMissing = Math.max(0, 6 - aCount);
    
    const otherMissing = Math.max(0, 3 - (tData.role_count.P || 0)) + 
                         Math.max(0, 8 - (tData.role_count.D || 0)) + 
                         Math.max(0, 8 - (tData.role_count.C || 0)) + 
                         Math.max(0, aMissing - 1);
    const maxBidAttacco = Math.max(1, tData.budget - otherMissing);

    const topPlayer = tData.players.find(p => p.ruolo === "A" && p.prezzo >= 130);
    const statusTop = topPlayer ? `✅ <b>${topPlayer.nome}</b> (${topPlayer.prezzo}cr)` : `❌ <i>Senza Top</i>`;

    if (!topPlayer && !isMe) {
      oppsNoTop.push({ name: tName, budget: tData.budget, maxBid: maxBidAttacco });
    }

    teamDetails.push({
      name: tName,
      isMe: isMe,
      budget: tData.budget,
      aCount: aCount,
      aMissing: aMissing,
      maxBid: maxBidAttacco,
      topPlayer: topPlayer,
      statusTop: statusTop
    });
  }

  teamDetails.sort((a, b) => b.budget - a.budget);
  oppsNoTop.sort((a, b) => b.maxBid - a.maxBid);

  let lines = [
    `⚽ <b>STATUS ATTACCO DETTAGLIATO (Lega a 10)</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🔴 <b>SLOT 1 (Super Top):</b> ${s1.length} rimasti ➔ ${s1.map(p => `<b>${p.nome}</b>`).join(", ") || "<i>Finiti!</i>"}\n`,
    `🟠 <b>SLOT 2 (Top 15+ gol):</b> ${s2.length} rimasti ➔ ${s2.slice(0, 6).map(p => p.nome).join(", ")}${s2.length > 6 ? "..." : ""}\n`,
    `🟡 <b>SLOT 3 (Titolari 8-10 gol):</b> ${s3.length} rimasti\n`,
    `👥 <b>QUADRO AVVERSARI & SLOT ATTACCO RIMASTI:</b>`
  ];

  teamDetails.forEach((t, idx) => {
    const badge = t.isMe ? " 👑 (TU)" : "";
    lines.push(
      `${idx + 1}. <b>${t.name}</b>${badge}: <b>${t.budget} cr</b> | Slot A: <b>${t.aCount}/6</b> (mancano ${t.aMissing})\n` +
      `   └ 1° Slot: ${t.statusTop} | Max Offerta Singola: <b>${t.maxBid} cr</b>`
    );
  });

  lines.push("");

  if (s1.length <= 2 && s1.length > 0 && oppsNoTop.length >= 3) {
    lines.push(`🚨 <b>ALLARME SCARSITÀ:</b> Restano solo <b>${s1.length} Super Top</b> per <b>${oppsNoTop.length} avversari</b> senza top!`);
    lines.push(`💡 <i>I più ricchi senza top: ${oppsNoTop.slice(0, 3).map(o => `<b>${o.name}</b> (max ${o.maxBid}cr)`).join(", ")}.</i>`);
    lines.push(`👉 <b>Strategia:</b> Fai scannare ${oppsNoTop[0] ? oppsNoTop[0].name : "gli avversari"} su ${s1[0].nome} per svuotargli i crediti, e assicurati subito uno tra <b>Kean, Scamacca o Hojlund</b>!`);
  } else if (myBudget >= (oppsNoTop[0] ? oppsNoTop[0].budget : 0)) {
    lines.push(`👑 <b>SEI IL PIÙ RICCO (${myBudget} cr)!</b> Nessun avversario senza top può superare la tua offerta massima.`);
  } else {
    lines.push(`💡 <b>TATTICA:</b> Concorrenti più pericolosi per l'attacco: ${oppsNoTop.slice(0, 2).map(o => `<b>${o.name}</b> (${o.maxBid}cr)`).join(" e ")}.`);
  }

  await sendMessage(chatId, lines.join("\n"), getRepartoKeyboard());
}

async function sendCentrocampoStatus(chatId, db) {
  const ccAll = db.giocatori_per_reparto ? (db.giocatori_per_reparto["CENTROCAMPISTI"] || {}) : {};
  function getFree(slotKey) {
    const list = ccAll[slotKey] || [];
    return list.filter(p => !auctionState.assigned[p.nome]);
  }

  const s1 = getFree("SLOT_1");
  const s2 = getFree("SLOT_2");
  const s3 = getFree("SLOT_3");

  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const myTeam = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  const myBudget = myTeam.budget;

  let teamDetails = [];
  let oppsNoTop = [];

  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    const isMe = (tName === meKey);
    const cCount = tData.role_count.C || 0;
    const cMissing = Math.max(0, 8 - cCount);

    const otherMissing = Math.max(0, 3 - (tData.role_count.P || 0)) + 
                         Math.max(0, 8 - (tData.role_count.D || 0)) + 
                         Math.max(0, (8 - cCount) - 1) + 
                         Math.max(0, 6 - (tData.role_count.A || 0));
    const maxBidCc = Math.max(1, tData.budget - otherMissing);

    const topPlayer = tData.players.find(p => p.ruolo === "C" && p.prezzo >= 50);
    const statusTop = topPlayer ? `✅ <b>${topPlayer.nome}</b> (${topPlayer.prezzo}cr)` : (cMissing === 0 ? `⚪ <i>Completato (8/8)</i>` : `❌ <i>Senza Top</i>`);

    if (!topPlayer && !isMe && cMissing > 0) {
      oppsNoTop.push({ name: tName, budget: tData.budget, maxBid: maxBidCc });
    }

    teamDetails.push({
      name: tName,
      isMe: isMe,
      budget: tData.budget,
      cCount: cCount,
      cMissing: cMissing,
      maxBid: maxBidCc,
      topPlayer: topPlayer,
      statusTop: statusTop
    });
  }

  teamDetails.sort((a, b) => b.budget - a.budget);
  oppsNoTop.sort((a, b) => b.maxBid - a.maxBid);

  let lines = [
    `🎯 <b>STATUS CENTROCAMPO DETTAGLIATO (Lega a 10)</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `🔴 <b>SLOT 1 (Top Bonus):</b> ${s1.length} rimasti ➔ ${s1.map(p => `<b>${p.nome}</b>`).join(", ") || "<i>Finiti!</i>"}\n`,
    `🟠 <b>SLOT 2 (Semi-Top):</b> ${s2.length} rimasti ➔ ${s2.slice(0, 6).map(p => p.nome).join(", ")}${s2.length > 6 ? "..." : ""}\n`,
    `🟡 <b>SLOT 3 (Titolari):</b> ${s3.length} rimasti\n`,
    `👥 <b>QUADRO AVVERSARI & SLOT CENTROCAMPO:</b>`
  ];

  teamDetails.forEach((t, idx) => {
    const badge = t.isMe ? " 👑 (TU)" : "";
    lines.push(
      `${idx + 1}. <b>${t.name}</b>${badge}: <b>${t.budget} cr</b> | Slot C: <b>${t.cCount}/8</b> (mancano ${t.cMissing})\n` +
      `   └ 1° Slot: ${t.statusTop} | Max Offerta: <b>${t.maxBid} cr</b>`
    );
  });

  lines.push("");

  if (s1.length <= 2 && s1.length > 0 && oppsNoTop.length >= 3) {
    lines.push(`🚨 <b>ALLARME SCARSITÀ:</b> Restano solo <b>${s1.length} Top CC</b> per <b>${oppsNoTop.length} squadre</b> affamate!`);
    lines.push(`👉 <b>Strategia:</b> I centrocampisti da bonus pesanti sono finiti. Assicurati subito ${s1[0].nome} o i migliori Slot 2 prima dell'asta al rialzo.`);
  } else if (myBudget >= (oppsNoTop[0] ? oppsNoTop[0].budget : 0)) {
    lines.push(`👑 <b>SEI IL PIÙ RICCO PER IL CENTROCAMPO (${myBudget} cr)!</b>`);
  } else {
    lines.push(`💡 <b>TATTICA:</b> Concorrenti diretti senza top CC: ${oppsNoTop.slice(0, 2).map(o => `<b>${o.name}</b> (${o.maxBid}cr)`).join(" e ") || "Nessuno"}.`);
  }

  await sendMessage(chatId, lines.join("\n"), getRepartoKeyboard());
}

async function sendDifesaStatus(chatId, db) {
  const dAll = db.giocatori_per_reparto ? (db.giocatori_per_reparto["DIFENSORI"] || {}) : {};
  function getFree(slotKey) {
    return (dAll[slotKey] || []).filter(p => !auctionState.assigned[p.nome]);
  }
  const s1 = getFree("SLOT_1");
  const s2 = getFree("SLOT_2");

  let text = `🛡️ <b>STATUS DIFESA</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `🔴 <b>SLOT 1 (Top Difesa):</b> ${s1.length} rimasti ➔ ${s1.map(p => p.nome).join(", ")}\n` +
             `🟠 <b>SLOT 2 (Ottimi Titolari):</b> ${s2.length} rimasti ➔ ${s2.slice(0, 8).map(p => p.nome).join(", ")}\n`;

  await sendMessage(chatId, text, getRepartoKeyboard());
}

async function sendPortieriStatus(chatId, db) {
  const pAll = db.giocatori_per_reparto ? (db.giocatori_per_reparto["PORTIERI"] || {}) : {};
  function getFree(slotKey) {
    return (pAll[slotKey] || []).filter(p => !auctionState.assigned[p.nome]);
  }
  const s1 = getFree("SLOT_1");
  const s2 = getFree("SLOT_2");

  let text = `🧤 <b>STATUS PORTIERI</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `🔴 <b>SLOT 1:</b> ${s1.map(p => p.nome).join(", ")}\n` +
             `🟠 <b>SLOT 2:</b> ${s2.map(p => p.nome).join(", ")}\n`;

  await sendMessage(chatId, text, getRepartoKeyboard());
}

async function sendObiettiviStatus(chatId, db, roleFilter = null) {
  const ob = db.obiettivi || {};
  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);

  const roleMap = {
    "P": { name: "PORTIERI", icon: "🧤", keys: ["p", "por", "portieri", "portiere"] },
    "D": { name: "DIFENSORI", icon: "🛡️", keys: ["d", "dif", "difensori", "difensore", "difesa"] },
    "C": { name: "CENTROCAMPISTI", icon: "🎯", keys: ["c", "cc", "centrocampisti", "centrocampista", "centrocampo"] },
    "A": { name: "ATTACCANTI", icon: "⚽", keys: ["a", "att", "attaccanti", "attaccante", "attacco"] }
  };

  const categories = [
    { key: "GIALLO_MUST_HAVE", label: "MUST HAVE", icon: "🟡" },
    { key: "ROSA_PRIMO_SLOT_MUST_HAVE", label: "1° SLOT MUST HAVE", icon: "🌸" },
    { key: "BLU_OTTIMO_TITOLARE", label: "OTTIMI TITOLARI", icon: "🔵" },
    { key: "GRIGIO_SCOMMESSINA", label: "SCOMMESSINE", icon: "⚪" }
  ];

  const dataByRole = { P: {}, D: {}, C: {}, A: {} };
  categories.forEach(cat => {
    const list = ob[cat.key] || [];
    list.forEach(p => {
      const r = p.ruolo || "A";
      if (!dataByRole[r][cat.key]) dataByRole[r][cat.key] = [];
      dataByRole[r][cat.key].push(p);
    });
  });

  let activeRoles = Object.keys(roleMap);
  if (roleFilter) {
    const cleanFilter = roleFilter.toLowerCase().trim();
    const matchedRole = Object.keys(roleMap).find(r => roleMap[r].keys.includes(cleanFilter));
    if (matchedRole) {
      activeRoles = [matchedRole];
    }
  }

  let lines = [];
  if (activeRoles.length === 1) {
    const rCode = activeRoles[0];
    const rInfo = roleMap[rCode];
    lines.push(`⭐ <b>I TUOI OBIETTIVI: ${rInfo.icon} ${rInfo.name}</b>`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  } else {
    lines.push(`⭐ <b>I TUOI OBIETTIVI (TUTTI I REPARTI)</b>`);
    lines.push(`💡 <i>Filtra per reparto: <code>/obiettivi att</code>, <code>/obiettivi cc</code>, <code>/obiettivi dif</code>, <code>/obiettivi por</code></i>`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }

  for (const rCode of activeRoles) {
    const rInfo = roleMap[rCode];
    let roleBlock = [];
    let freeTotal = 0;
    let myTotal = 0;
    let oppTotal = 0;

    categories.forEach(cat => {
      const players = dataByRole[rCode][cat.key] || [];
      if (players.length > 0) {
        let catLines = [];
        players.forEach(p => {
          const isTaken = auctionState.assigned[p.nome];
          const bStr = p.budget_target ? ` [Target: ${p.budget_target}cr]` : "";

          if (!isTaken) {
            freeTotal++;
            catLines.push(`     • <b>${p.nome}</b> (${p.squadra})${bStr} ➔ 🟢 <b>LIBERO</b>`);
          } else if (isTaken.team === meKey || isTaken.team === "Noi" || isTaken.team === "NOI") {
            myTotal++;
            catLines.push(`     • <b>${p.nome}</b> ➔ ✅ <b>TUO (${isTaken.price} cr)</b>`);
          } else {
            oppTotal++;
            catLines.push(`     • <s>${p.nome}</s> ➔ ❌ <i>${isTaken.team} (${isTaken.price} cr)</i>`);
          }
        });

        roleBlock.push(`  ${cat.icon} <b>${cat.label}:</b>\n` + catLines.join("\n"));
      }
    });

    if (roleBlock.length > 0) {
      lines.push(`${rInfo.icon} <b>${rInfo.name}</b> (🟢 ${freeTotal} Liberi | ✅ ${myTotal} Tuoi | ❌ ${oppTotal} Andati)\n` + roleBlock.join("\n\n") + "\n");
    }
  }

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "🧤 Portieri", callback_data: "ob_P" },
        { text: "🛡️ Difensori", callback_data: "ob_D" }
      ],
      [
        { text: "🎯 Centrocampisti", callback_data: "ob_C" },
        { text: "⚽ Attaccanti", callback_data: "ob_A" }
      ],
      [
        { text: "⭐ Mostra Tutti", callback_data: "ob_ALL" }
      ]
    ]
  };

  await sendMessage(chatId, lines.join("\n"), inlineKeyboard);
}

async function sendSaldiStatus(chatId) {
  let lines = ["💰 <b>CLASSIFICA CREDITI PARTECIPANTI</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━━"];
  const list = Object.entries(auctionState.teams).map(([name, d]) => ({ name, budget: d.budget, count: d.players.length }));
  list.sort((a, b) => b.budget - a.budget);

  list.forEach((t, i) => {
    const isMe = (t.name === "Noi" || t.name === "NOI") ? " 👑 (TU)" : "";
    lines.push(`${i + 1}. <b>${t.name}</b>${isMe}: <b>${t.budget} cr</b> (${t.count} acquistati)`);
  });

  await sendMessage(chatId, lines.join("\n"), getRepartoKeyboard());
}

async function sendMiaRosaStatus(chatId) {
  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const me = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  
  let lines = [
    `📋 <b>LA TUA ROSA (${meKey.toUpperCase()})</b>`,
    `💰 <b>Crediti rimasti:</b> ${me.budget} / 1000`,
    `📦 <b>Composizione:</b> P: ${me.role_count.P}/3 | D: ${me.role_count.D}/8 | C: ${me.role_count.C}/8 | A: ${me.role_count.A}/6\n`,
    `<b>Giocatori acquistati:</b>`
  ];

  if (me.players.length === 0) {
    lines.push("<i>Nessun giocatore acquistato finora.</i>");
  } else {
    me.players.forEach((p, idx) => {
      lines.push(`${idx + 1}. [${p.ruolo}] <b>${p.nome}</b> ➔ <b>${p.prezzo} cr</b>`);
    });
  }

  await sendMessage(chatId, lines.join("\n"), getRepartoKeyboard());
}

async function handlePlayerLookup(chatId, text, db) {
  const parts = text.split(" ");
  let askedPrice = null;
  let nameQuery = text;

  const last = parts[parts.length - 1];
  if (!isNaN(parseInt(last))) {
    askedPrice = parseInt(last);
    nameQuery = parts.slice(0, -1).join(" ");
  }

  const p = findBestPlayer(nameQuery, db.tutti_i_giocatori);
  if (!p) {
    await sendMessage(chatId, `🔍 Nessun giocatore trovato per "<b>${text}</b>". Prova a scrivere il cognome (es. <i>kean</i>, <i>rowe</i>, <i>pulisic</i>).`, getRepartoKeyboard());
    return;
  }

  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const me = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  const myBudget = me.budget;
  const maxRole = (p.ruolo === "P" ? 3 : (p.ruolo === "D" || p.ruolo === "C" ? 8 : 6));
  const myRoleMissing = Math.max(0, maxRole - (me.role_count[p.ruolo] || 0));

  let aboveMeNoTop = [];
  let belowMeNoTop = [];
  let completedRole = [];
  let alreadyHaveTop = [];

  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    if (tName === meKey) continue;
    
    let topThreshold = 130;
    if (p.ruolo === "C") topThreshold = 50;
    if (p.ruolo === "D") topThreshold = 35;
    if (p.ruolo === "P") topThreshold = 40;

    const hasTop = tData.players.some(x => x.ruolo === p.ruolo && x.prezzo >= topThreshold);
    const roleCount = tData.role_count[p.ruolo] || 0;
    const roleMissing = Math.max(0, maxRole - roleCount);

    const otherMissing = Math.max(0, 3 - (tData.role_count.P || 0)) + 
                         Math.max(0, 8 - (tData.role_count.D || 0)) + 
                         Math.max(0, 8 - (tData.role_count.C || 0)) + 
                         Math.max(0, 6 - (tData.role_count.A || 0)) - 1;
    const maxBid = Math.max(1, tData.budget - Math.max(0, otherMissing));

    const teamObj = {
      name: tName,
      budget: tData.budget,
      maxBid: maxBid,
      hasTop: hasTop,
      roleCount: roleCount,
      roleMissing: roleMissing,
      diff: tData.budget - myBudget
    };

    if (roleMissing === 0) {
      completedRole.push(teamObj);
    } else if (hasTop) {
      alreadyHaveTop.push(teamObj);
    } else if (tData.budget > myBudget) {
      aboveMeNoTop.push(teamObj);
    } else {
      belowMeNoTop.push(teamObj);
    }
  }

  aboveMeNoTop.sort((a, b) => b.budget - a.budget);
  belowMeNoTop.sort((a, b) => b.budget - a.budget);
  alreadyHaveTop.sort((a, b) => b.budget - a.budget);
  completedRole.sort((a, b) => b.budget - a.budget);

  let estimatedMin = 1;
  let estimatedMax = 5;
  if (p.ruolo === "A") {
    if (p.slot_10 === 1) { estimatedMin = 280; estimatedMax = 380; }
    else if (p.slot_10 === 2) { estimatedMin = 140; estimatedMax = 230; }
    else if (p.slot_10 === 3) { estimatedMin = 60; estimatedMax = 120; }
    else { estimatedMin = 10; estimatedMax = 40; }
  } else if (p.ruolo === "C") {
    if (p.slot_10 === 1) { estimatedMin = 90; estimatedMax = 140; }
    else if (p.slot_10 === 2) { estimatedMin = 45; estimatedMax = 80; }
    else if (p.slot_10 === 3) { estimatedMin = 15; estimatedMax = 40; }
    else { estimatedMin = 2; estimatedMax = 12; }
  } else if (p.ruolo === "D") {
    if (p.slot_10 === 1) { estimatedMin = 40; estimatedMax = 70; }
    else if (p.slot_10 === 2) { estimatedMin = 15; estimatedMax = 35; }
    else { estimatedMin = 1; estimatedMax = 10; }
  } else if (p.ruolo === "P") {
    if (p.slot_10 === 1) { estimatedMin = 60; estimatedMax = 90; }
    else { estimatedMin = 10; estimatedMax = 40; }
  }

  let badge = "";
  if (p.tag_obiettivo === "GIALLO_MUST_HAVE") badge = "\n🟡 <b>TUO OBIETTIVO: MUST HAVE</b>";
  if (p.tag_obiettivo === "ROSA_PRIMO_SLOT_MUST_HAVE") badge = "\n🌸 <b>TUO OBIETTIVO: 1° SLOT MUST HAVE</b>";
  if (p.tag_obiettivo === "BLU_OTTIMO_TITOLARE") badge = "\n🔵 <b>TUO OBIETTIVO: OTTIMO TITOLARE</b>";
  if (p.tag_obiettivo === "GRIGIO_SCOMMESSINA") badge = "\n⚪ <b>TUO OBIETTIVO: SCOMMESSINA</b>";

  const budgetStr = p.budget_target ? `\n🎯 <b>Tuo Budget Target:</b> <b>${p.budget_target} cr</b>` : "";
  const notaStr = p.nota ? `\n📝 <b>Nota Tattica:</b> <i>${p.nota}</i>` : "";
  
  let statsStr = "";
  if (p.stats_passate && p.stats_passate.pv) {
    statsStr = `\n📊 <b>Stats Passate:</b> ${p.stats_passate.pv} presenze | FM: ${p.stats_passate.fm} | ${p.stats_passate.gf || 0} gol, ${p.stats_passate.ass || 0} assist`;
  }

  let statusAssigned = "";
  if (auctionState.assigned[p.nome]) {
    const asg = auctionState.assigned[p.nome];
    statusAssigned = `\n\n🚨 <b>GIÀ ASSEGNATO a ${asg.team} per ${asg.price} cr!</b>`;
  }

  let evalStr = "";
  if (askedPrice !== null) {
    if (p.budget_target && !isNaN(parseInt(p.budget_target))) {
      const bMax = parseInt(p.budget_target);
      if (askedPrice <= bMax) {
        evalStr = `\n\n💡 <b>VALUTAZIONE A ${askedPrice} cr:</b> In linea con il tuo target (${bMax} cr). <b>CONSIGLIATO RILANCIARE!</b>`;
      } else {
        evalStr = `\n\n⚠️ <b>VALUTAZIONE A ${askedPrice} cr:</b> Supera il tuo budget target di ${bMax} cr. Valuta se lasciarlo!`;
      }
    }
  }

  let tacticalSection = "";
  if (!auctionState.assigned[p.nome]) {
    tacticalSection = `\n\n🎯 <b>SIMULAZIONE & TATTICA D'ASTA:</b>` +
                      `\n💸 <b>A quanto potrebbe andare:</b> ~<b>${estimatedMin} - ${estimatedMax} crediti</b>\n` +
                      `\n👥 <b>QUADRO CONTENDENTI PER IL RUOLO [${p.ruolo}]:</b>\n`;

    const totalNeedingRole = aboveMeNoTop.length + belowMeNoTop.length + alreadyHaveTop.length;

    if (totalNeedingRole === 0 && myRoleMissing === 0) {
      tacticalSection += `⚪ <i>Tutte le 10 squadre (inclusa la tua) hanno già COMPLETATO gli slot per questo reparto (${maxRole}/${maxRole})!</i>\n`;
    } else {
      if (aboveMeNoTop.length > 0) {
        tacticalSection += `🔴 <b>SOPRA DI TE CON SLOT LIBERI (${aboveMeNoTop.length} squadre):</b>\n`;
        aboveMeNoTop.forEach((t, i) => {
          tacticalSection += `  ${i + 1}. <b>${t.name}</b>: <b>${t.budget} cr</b> (+${t.diff} cr rispetto a te | Slot ${p.ruolo}: ${t.roleCount}/${maxRole})\n`;
        });
      } else {
        tacticalSection += `👑 <b>SEI AL 1° POSTO! Nessun avversario a caccia di [${p.ruolo}] ha più crediti di te (${myBudget} cr).</b>\n`;
      }

      if (belowMeNoTop.length > 0) {
        tacticalSection += `\n🟡 <b>SOTTO DI TE CON SLOT LIBERI (${belowMeNoTop.length} squadre):</b>\n`;
        belowMeNoTop.forEach((t, i) => {
          tacticalSection += `  • <b>${t.name}</b>: <b>${t.budget} cr</b> (Slot ${p.ruolo}: ${t.roleCount}/${maxRole} | Max offerta: <b>${t.maxBid} cr</b>)\n`;
        });
      }

      if (alreadyHaveTop.length > 0) {
        tacticalSection += `\n🔵 <i>Hanno già il Top ma cercano gregari: ${alreadyHaveTop.map(t => `${t.name} (${t.budget}cr, ${t.roleCount}/${maxRole})`).join(", ")}</i>\n`;
      }

      if (completedRole.length > 0) {
        tacticalSection += `\n⚪ <i>Reparto completato (${maxRole}/${maxRole}): ${completedRole.map(t => `${t.name} (${t.budget}cr)`).join(", ")}</i>\n`;
      }
    }

    let targetName = "";
    let reasonText = "";

    if (aboveMeNoTop.length > 0) {
      const richest = aboveMeNoTop[0];
      targetName = `<b>${richest.name} (${richest.budget} cr)</b>`;
      reasonText = `Ha <b>più crediti di te (+${richest.diff} cr)</b> e ha ancora bisogno di [${p.ruolo}]. Se il tuo obiettivo primario non è ${p.nome}, fallo spendere rilanciando fino a ~${Math.floor(estimatedMin * 0.85)} cr per prosciugargli i crediti!`;
    } else if (belowMeNoTop.length > 0) {
      const topBelow = belowMeNoTop[0];
      targetName = `<b>${topBelow.name} (${topBelow.budget} cr)</b>`;
      reasonText = `È il tuo inseguitore più vicino per questo ruolo. Fallo spendere per togliergli spazio di manovra!`;
    }

    if (targetName) {
      tacticalSection += `\n🃏 <b>TRAPPOLA / BLUFF STRATEGICO:</b>` +
                         `\n🎯 <b>Bersaglio da prosciugare:</b> ${targetName}` +
                         `\n💡 <b>Perché:</b> ${reasonText}`;
    }
  }

  const out = `🎵 <b>${p.nome.toUpperCase()}</b> (${p.squadra} - <b>${p.ruolo}</b>)${badge}` +
              `\n━━━━━━━━━━━━━━━━━━━━━━━━━━` +
              `\n🏷️ <b>Slot Lega a 10:</b> SLOT ${p.slot_10} (Appetibilità IA: ${p.ia_ordinamento})` +
              `\n🛡️ <b>Titolarità:</b> ${p.titolarita}/5` +
              budgetStr +
              notaStr +
              statsStr +
              tacticalSection +
              evalStr +
              statusAssigned;

  await sendMessage(chatId, out, getRepartoKeyboard());
}

async function transcribeTelegramVoice(fileId, env) {
  try {
    const fileRes = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok) return null;

    const filePath = fileData.result.file_path;
    const voiceUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;

    const audioRes = await fetch(voiceUrl);
    const audioBlob = await audioRes.blob();

    const groqKey = env.GROQ_API_KEY || GROQ_API_KEY;
    if (!groqKey) {
      console.warn("GROQ_API_KEY non configurata per la trascrizione vocale.");
      return null;
    }

    const formData = new FormData();
    formData.append("file", audioBlob, "voice.oga");
    formData.append("model", "whisper-large-v3");
    formData.append("language", "it");

    const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}` },
      body: formData
    });

    if (whisperRes.ok) {
      const data = await whisperRes.json();
      return data.text || null;
    }
  } catch (e) {
    console.error("Errore trascrizione vocale:", e);
  }
  return null;
}

async function sendMainMenu(chatId) {
  const text = `📖 <b>LISTA COMPLETA DEI COMANDI DISPONIBILI</b>\n` +
               `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
               `⚡ <b>1. ASSEGNAZIONI E RIMOZIONI:</b>\n` +
               `• <code>/add giocatore prezzo squadra</code> (es: <code>/add kean 140 Noi</code> o <code>/add lautaro 320 Peppe</code>)\n` +
               `• <code>/rem giocatore squadra</code> ➔ Rimuove il giocatore restituendo i crediti (solo se corrisponde alla rosa!).\n` +
               `• <code>mio kean 140</code> (o vocale: <i>"Mio Kean a 140"</i>) ➔ Assegna a Noi.\n` +
               `• <code>via lautaro 320 peppe</code> ➔ Assegna all'avversario.\n` +
               `• <code>/annulla</code> ➔ Annulla l'ultima operazione effettuata.\n\n` +
               `👥 <b>2. GESTIONE SQUADRE E ROSE:</b>\n` +
               `• <code>/squadre</code> ➔ Elenco delle 10 squadre e crediti.\n` +
               `• <code>/squadre Noi, Peppe, Cece...</code> ➔ Imposta i nomi dei 10 partecipanti.\n` +
               `• <code>/squadra Peppe</code> (o <code>/rosa Peppe</code>) ➔ Mostra la rosa dettagliata di una squadra.\n` +
               `• <b>📋 La Mia Rosa</b> (o <code>/rosa</code>) ➔ Visualizza la tua rosa e i crediti rimasti.\n` +
               `• <b>💰 Saldi e Crediti</b> (o <code>/saldi</code>) ➔ Classifica generale dei crediti.\n\n` +
               `📊 <b>3. RADAR TATTICO E REPARTI:</b>\n` +
               `• <b>⚽ Attacco</b> (o <code>/att</code>) ➔ Tabella 10 squadre, slot liberi, stato top e max offerta singola.\n` +
               `• <b>🎯 Centrocampo</b> (o <code>/cc</code>) ➔ Tabella 10 squadre per centrocampo e top bonus rimasti.\n` +
               `• <b>🛡️ Difesa</b> (o <code>/dif</code>) e <b>🧤 Portieri</b> (o <code>/por</code>).\n` +
               `• <b>🧠 Tattica Consigliata</b> (o <code>/tattica</code>) ➔ Analisi strategica 360° e gestione crediti medi.\n` +
               `• <b>⭐ I Miei Obiettivi</b> (o <code>/obiettivi</code>) ➔ Mappa live 72 obiettivi divisi per Ruolo (Giallo, Rosa, Blu, Grigio).\n\n` +
               `🔍 <b>4. SCHEDA CALCIATORE & BLUFF:</b>\n` +
               `• Scrivi solo il cognome: <code>kean</code> o <code>vlahovic</code> o <code>rowe</code> ➔ Scheda, slot, stima prezzo, chi sta SOPRA e chi SOTTO di te, e bersaglio di bluff!\n` +
               `• Scrivi nome + prezzo: <code>kean 150</code> ➔ Valutazione se rilanciare o lasciare.\n\n` +
               `🎮 <b>5. UTILITÀ:</b>\n` +
               `• <code>/simula</code> ➔ Popola P, D, C per testare l'asta attaccanti.\n` +
               `• <code>/reset</code> (o <b>[🔄 Reset Asta]</b>) ➔ Azzera l'asta e ripristina tutti a 1000 crediti.`;

  await sendMessage(chatId, text, getRepartoKeyboard());
}

function getRepartoKeyboard() {
  return {
    keyboard: [
      [{ text: "📱 Apri Live Dashboard", web_app: { url: "https://fantasoci-bot.marcol8b-2.workers.dev/" } }],
      [{ text: "🧠 Tattica Consigliata" }, { text: "⭐ I Miei Obiettivi" }],
      [{ text: "⚽ Attacco" }, { text: "🎯 Centrocampo" }],
      [{ text: "🛡️ Difesa" }, { text: "🧤 Portieri" }],
      [{ text: "💰 Saldi e Crediti" }, { text: "📋 La Mia Rosa" }],
      [{ text: "🔄 Reset Asta" }]
    ],
    resize_keyboard: true,
    persistent: true
  };
}

async function sendMessage(chatId, text, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Errore invio messaggio Telegram:", e);
  }
}
