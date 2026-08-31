// ⚽ FantaLive Tactical Bot - Cloudflare Worker
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

export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") {
      return new Response("⚽ FantaLive Tactical Bot is Running 24/7!", { status: 200 });
    }

    if (request.method === "POST") {
      try {
        const update = await request.json();
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

  // COMANDI MENU
  if (lower === "/start" || lower === "/help" || lower === "menu") {
    await sendMainMenu(chatId);
    return;
  }

  // 1. GESTIONE SQUADRE (LISTA O SETUP): /squadre oppure squadre oppure /squadre Nome1, Nome2...
  if (lower.startsWith("/squadre") || lower.startsWith("squadre")) {
    let cleanParam = text.replace(/^\/?squadre(@[a-zA-Z0-9_]+)?/i, "").trim();
    
    // Se non ha passato argomenti, mostra la lista attuale
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

  // 2. RESET ASTA
  if (lower === "/reset" || lower === "reset" || lower === "🔄 reset asta" || lower === "reset asta") {
    resetAuction();
    await sendMessage(chatId, "🔄 <b>Asta Resettata!</b>\nTutte le 10 squadre sono state ripristinate a <b>1000 crediti</b> e tutti i 517 giocatori sono liberi.");
    return;
  }

  // 3. ANNULLA
  if (lower === "/annulla" || lower === "annulla") {
    const res = undoLastAction();
    await sendMessage(chatId, res);
    return;
  }

  // 4. CONSULTA LA MIA ROSA (/rosa)
  if (lower === "/rosa" || lower === "rosa" || lower === "📋 la mia rosa") {
    await sendMiaRosaStatus(chatId);
    return;
  }

  // 5. CONSULTA SQUADRA SPECIFICA (/squadra <Nome> oppure squadra <Nome> oppure /rosa <Nome>)
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

  // 6. BOTTONI RAPIDI DI REPARTO
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

  if (lower === "/obiettivi" || lower === "obiettivi" || lower === "⭐ i miei obiettivi") {
    await sendObiettiviStatus(chatId, db);
    return;
  }

  if (lower === "/saldi" || lower === "saldi" || lower === "💰 saldi e crediti") {
    await sendSaldiStatus(chatId);
    return;
  }

  // 7. ASSEGNAZIONI: "mio <giocatore> <prezzo>"
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

  // 8. ASSEGNAZIONI: "via <giocatore> <prezzo> [squadra]"
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

    // Risoluzione nome squadra
    const matchedTeam = Object.keys(auctionState.teams).find(k => k.toLowerCase() === teamName.toLowerCase() || k.toLowerCase().includes(teamName.toLowerCase())) || teamName;
    const res = assignPlayer(player, matchedTeam, price);
    await sendMessage(chatId, res);
    return;
  }

  // 9. RICERCA GIOCATORE / FLASH RADAR
  await handlePlayerLookup(chatId, text, db);
}

// -------------------------------------------------------------
// LOGICA ASSEGNAZIONE E STATO
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

// -------------------------------------------------------------
// VISTE E REPORT TATTICI
// -------------------------------------------------------------
async function sendAttaccoStatus(chatId, db) {
  const attAll = db.giocatori_per_reparto["ATTACCANTI"] || {};
  function getFree(slotKey) {
    const list = attAll[slotKey] || [];
    return list.filter(p => !auctionState.assigned[p.nome]);
  }

  const s1 = getFree("SLOT_1");
  const s2 = getFree("SLOT_2");
  const s3 = getFree("SLOT_3");

  let teamsWithTop = 0;
  let opponentBudgetsNoTop = [];

  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    if (tName === "Noi" || tName === "NOI") continue;
    const hasTop = tData.players.some(p => p.ruolo === "A" && p.prezzo >= 150);
    if (hasTop || (tData.role_count.A >= 1 && tData.players.some(p => p.ruolo === "A"))) {
      teamsWithTop++;
    } else {
      opponentBudgetsNoTop.push(tData.budget);
    }
  }

  opponentBudgetsNoTop.sort((a, b) => b - a);
  const myTeam = auctionState.teams["Noi"] || auctionState.teams["NOI"] || { budget: 1000 };
  const myBudget = myTeam.budget;

  let advice = "";
  if (myBudget >= (opponentBudgetsNoTop[0] || 0)) {
    advice = `💡 <b>CONSIGLIO TATTICO:</b> Hai <b>${myBudget} cr</b> e sei il <b>più ricco</b> tra chi cerca il top! Puoi attendere il tuo preferito o forzare l'asta controllando il prezzo.`;
  } else {
    advice = `💡 <b>CONSIGLIO TATTICO:</b> Ci sono ${opponentBudgetsNoTop.length} squadre a caccia del top (max crediti: ${opponentBudgetsNoTop.slice(0, 3).join(", ")} cr). Valuta i Tier 2 come Kean/Scamacca se i Tier 1 salgono troppo.`;
  }

  let text = `⚽ <b>STATUS ATTACCO (Lega a 10)</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `🔴 <b>SLOT 1 (Super Top):</b> ${s1.length} rimasti ➔ ${s1.map(p => `<b>${p.nome}</b>`).join(", ") || "<i>Nessuno</i>"}\n\n` +
             `🟠 <b>SLOT 2 (Top 15+ gol):</b> ${s2.length} rimasti ➔ ${s2.slice(0, 6).map(p => p.nome).join(", ")}${s2.length > 6 ? "..." : ""}\n\n` +
             `🟡 <b>SLOT 3 (Titolari 8-10 gol):</b> ${s3.length} rimasti\n\n` +
             `👥 <b>SITUAZIONE AVVERSARI:</b>\n` +
             `• ${teamsWithTop} squadre hanno già il 1° slot d'attacco.\n` +
             `• <b>${opponentBudgetsNoTop.length} avversari</b> sono ancora SENZA il Top.\n\n` +
             `${advice}`;

  await sendMessage(chatId, text, getRepartoKeyboard());
}

async function sendCentrocampoStatus(chatId, db) {
  const ccAll = db.giocatori_per_reparto["CENTROCAMPISTI"] || {};
  function getFree(slotKey) {
    const list = ccAll[slotKey] || [];
    return list.filter(p => !auctionState.assigned[p.nome]);
  }

  const s1 = getFree("SLOT_1");
  const s2 = getFree("SLOT_2");
  const s3 = getFree("SLOT_3");

  let text = `🎯 <b>STATUS CENTROCAMPO (Lega a 10)</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `🔴 <b>SLOT 1 (Top Bonus):</b> ${s1.length} rimasti ➔ ${s1.map(p => `<b>${p.nome}</b>`).join(", ") || "<i>Nessuno</i>"}\n\n` +
             `🟠 <b>SLOT 2 (Semi-Top):</b> ${s2.length} rimasti ➔ ${s2.slice(0, 7).map(p => p.nome).join(", ")}\n\n` +
             `🟡 <b>SLOT 3 (Titolari):</b> ${s3.length} rimasti\n\n` +
             `💡 <i>Suggerimento: I centrocampisti da bonus pesanti sono limitati. Assicurati almeno un top tra Pulisic, Zaccagni, Calhanoglu o Baturina.</i>`;

  await sendMessage(chatId, text, getRepartoKeyboard());
}

async function sendDifesaStatus(chatId, db) {
  const dAll = db.giocatori_per_reparto["DIFENSORI"] || {};
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
  const pAll = db.giocatori_per_reparto["PORTIERI"] || {};
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

async function sendObiettiviStatus(chatId, db) {
  const ob = db.obiettivi || {};
  function formatList(list) {
    if (!list || list.length === 0) return "<i>Nessuno</i>";
    return list.map(item => {
      const isTaken = auctionState.assigned[item.nome];
      const bStr = item.budget_target ? ` [${item.budget_target} cr]` : "";
      if (isTaken) {
        return `<s>${item.nome} (${item.ruolo})</s> ➔ <i>${isTaken.team} (${isTaken.price} cr)</i>`;
      }
      return `• <b>${item.nome}</b> (${item.ruolo} - ${item.squadra})${bStr}`;
    }).join("\n");
  }

  let text = `⭐ <b>I TUOI OBIETTIVI PERSONALI</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
             `🟡 <b>MUST HAVE (Giallo):</b>\n${formatList(ob.GIALLO_MUST_HAVE)}\n\n` +
             `🌸 <b>1° SLOT MUST HAVE (Rosa):</b>\n${formatList(ob.ROSA_PRIMO_SLOT_MUST_HAVE)}\n\n` +
             `🔵 <b>OTTIMI TITOLARI (Blu):</b>\n${formatList(ob.BLU_OTTIMO_TITOLARE)}\n\n` +
             `⚪ <b>SCOMMESSINE (Grigio):</b>\n${formatList(ob.GRIGIO_SCOMMESSINA)}`;

  await sendMessage(chatId, text, getRepartoKeyboard());
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
    await sendMessage(chatId, `🔍 Nessun giocatore trovato per "<b>${text}</b>". Prova a scrivere il cognome (es. <i>kean</i>, <i>pulisic</i>).`, getRepartoKeyboard());
    return;
  }

  let badge = "";
  if (p.tag_obiettivo === "GIALLO_MUST_HAVE") badge = "\n🟡 <b>TUO OBIETTIVO: MUST HAVE</b>";
  if (p.tag_obiettivo === "ROSA_PRIMO_SLOT_MUST_HAVE") badge = "\n🌸 <b>TUO OBIETTIVO: 1° SLOT MUST HAVE</b>";
  if (p.tag_obiettivo === "BLU_OTTIMO_TITOLARE") badge = "\n🔵 <b>TUO OBIETTIVO: OTTIMO TITOLARE</b>";
  if (p.tag_obiettivo === "GRIGIO_SCOMMESSINA") badge = "\n⚪ <b>TUO OBIETTIVO: SCOMMESSINA</b>";

  const budgetStr = p.budget_target ? `\n🎯 <b>Tuo Budget Target:</b> ${p.budget_target} cr` : "";
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
        evalStr = `\n\n💡 <b>VALUTAZIONE A ${askedPrice} cr:</b> In linea con il tuo budget target (${bMax} cr). <b>CONSIGLIATO RILANCIARE!</b>`;
      } else {
        evalStr = `\n\n⚠️ <b>VALUTAZIONE A ${askedPrice} cr:</b> Supera il tuo budget target di ${bMax} cr. Valuta se lasciarlo!`;
      }
    }
  }

  const out = `🎵 <b>${p.nome.toUpperCase()}</b> (${p.squadra} - <b>${p.ruolo}</b>)${badge}` +
              `\n━━━━━━━━━━━━━━━━━━━━━━━━━━` +
              `\n🏷️ <b>Slot Lega a 10:</b> SLOT ${p.slot_10} (Indice Appetibilità: ${p.ia_ordinamento})` +
              `\n🛡️ <b>Titolarità:</b> ${p.titolarita}/5` +
              budgetStr +
              notaStr +
              statsStr +
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
  const text = `⚽ <b>FantaLive Tactical Bot</b>\n` +
               `Il tuo assistente strategico per l'asta a 10 (1000 crediti).\n\n` +
               `<b>Comandi Rapidi:</b>\n` +
               `• 🔍 <b>Cerca:</b> Scrivi il nome (es. <i>kean</i> o <i>kean 140</i>).\n` +
               `• ⚡ <b>Assegna:</b> <code>mio kean 140</code> oppure <code>via lautaro 320 peppe</code>.\n` +
               `• 👥 <b>Squadre:</b> <code>/squadre</code> o <code>/squadra Peppe</code>.\n` +
               `• 🎙️ <b>Vocale:</b> Dici a voce <i>"Lautaro a Peppe per 320"</i>.\n` +
               `• ↩️ <b>Annulla:</b> <code>/annulla</code>.`;

  await sendMessage(chatId, text, getRepartoKeyboard());
}

function getRepartoKeyboard() {
  return {
    keyboard: [
      [{ text: "⚽ Attacco" }, { text: "🎯 Centrocampo" }],
      [{ text: "🛡️ Difesa" }, { text: "🧤 Portieri" }],
      [{ text: "⭐ I Miei Obiettivi" }, { text: "💰 Saldi e Crediti" }],
      [{ text: "📋 La Mia Rosa" }, { text: "🔄 Reset Asta" }]
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
