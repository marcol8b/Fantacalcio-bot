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
    if (lower === "/tattica" || lower === "tattica" || lower === "🧠 tattica consigliata" || lower === "consiglio") {
    const advice = generateTacticalAdvice(db);
    await sendMessage(chatId, advice, getRepartoKeyboard());
    return;
  }

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

    // Ultima parola o parole per la squadra
    let teamQuery = parts[parts.length - 1];
    let nameQuery = parts.slice(0, -1).join(" ");

    // Se la squadra è composta da più parole (es. "Peppe Bisio")
    const matchedTeam = Object.keys(auctionState.teams).find(k => k.toLowerCase() === teamQuery.toLowerCase() || k.toLowerCase().includes(teamQuery.toLowerCase()));
    if (!matchedTeam) {
      // Prova con ultime due parole
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

    // VERIFICA CORRISPONDENZA ASSEGNAZIONE
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

    // Rimozione effettiva e restituzione crediti
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
// 🧠 MOTORE DI TATTICA DINAMICA AVANZATA
// -------------------------------------------------------------
function generateTacticalAdvice(db) {
  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const me = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  const myBudget = me.budget;

  // Analisi Attacco
  const attAll = db.giocatori_per_reparto["ATTACCANTI"] || {};
  const s1_att = (attAll["SLOT_1"] || []).filter(p => !auctionState.assigned[p.nome]);
  const s2_att = (attAll["SLOT_2"] || []).filter(p => !auctionState.assigned[p.nome]);
  const iHaveTopAtt = me.players.some(p => p.ruolo === "A" && p.prezzo >= 130);

  // Analisi Centrocampo
  const ccAll = db.giocatori_per_reparto["CENTROCAMPISTI"] || {};
  const s1_cc = (ccAll["SLOT_1"] || []).filter(p => !auctionState.assigned[p.nome]);
  const s2_cc = (ccAll["SLOT_2"] || []).filter(p => !auctionState.assigned[p.nome]);
  const iHaveTopCc = me.players.some(p => p.ruolo === "C" && p.prezzo >= 70);

  // Avversari senza top in attacco
  let oppsNoTopAtt = [];
  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    if (tName === meKey) continue;
    const hasTop = tData.players.some(p => p.ruolo === "A" && p.prezzo >= 130);
    if (!hasTop) {
      oppsNoTopAtt.push({ name: tName, budget: tData.budget });
    }
  }
  oppsNoTopAtt.sort((a, b) => b.budget - a.budget);

  // Classifica generale budget
  const allBudgets = Object.entries(auctionState.teams).map(([name, d]) => ({ name, budget: d.budget }));
  allBudgets.sort((a, b) => b.budget - a.budget);
  const myRank = allBudgets.findIndex(t => t.name === meKey) + 1;

  let lines = [
    `🧠 <b>TATTICA CONSIGLIATA & STRATEGIA D'ASTA</b>`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 <b>Il tuo Potere d'Acquisto:</b> <b>${myBudget} cr</b> (Sei al <b>#${myRank}° posto</b> su 10 squadre)\n`
  ];

  // 1. Tattica Attacco
  lines.push(`⚽ <b>STRATEGIA ATTACCO:</b>`);
  if (iHaveTopAtt) {
    const myTop = me.players.find(p => p.ruolo === "A" && p.prezzo >= 130);
    lines.push(`• ✅ <b>Hai già il tuo 1° Slot (${myTop.nome} a ${myTop.prezzo} cr).</b>`);
    lines.push(`• 💡 <b>Consiglio:</b> Non rilanciare su altri Slot 1 per non sprecare budget. Attendi che gli avversari si scannino e prendi un 2° slot conveniente (es. Kean, Scamacca o Raspadori) o completa centrocampo e difesa.\n`);
  } else {
    lines.push(`• ⚠️ <b>Sei ancora SENZA il 1° Slot d'attacco.</b>`);
    lines.push(`• 🔴 <b>Slot 1 rimasti:</b> ${s1_att.length} (${s1_att.map(p => p.nome).join(", ") || "Finiti!"})`);
    lines.push(`• 👥 <b>Avversari diretti in cerca di Top:</b> <b>${oppsNoTopAtt.length} squadre</b> (Budget max concorrenti: ${oppsNoTopAtt.slice(0, 3).map(o => `${o.name} ${o.budget}cr`).join(", ") || "Nessuno"}).`);

    if (s1_att.length <= 2 && s1_att.length > 0 && oppsNoTopAtt.length >= 3) {
      lines.push(`• 🚨 <b>ALLARME SCARSITÀ:</b> Restano solo ${s1_att.length} Super Top ma ci sono ben ${oppsNoTopAtt.length} squadre a cercarlo! L'asta su di loro andrà altissima: <b>o forzi subito ${s1_att[0].nome} oppure punta tutto su Slot 2 pesanti (Kean/Ramos/Hojlund) prima che salgano anche quelli!</b>\n`);
    } else if (myBudget >= (oppsNoTopAtt[0] ? oppsNoTopAtt[0].budget : 0)) {
      lines.push(`• 👑 <b>SEI IL PIÙ RICCO TRA CHI CERCA IL TOP!</b> Puoi decidere tu il ritmo dell'asta. Se esce ${s1_att[0] ? s1_att[0].nome : "un top"}, puoi rilanciare sicuro sapendo che nessun concorrente diretto può superarti.\n`);
    } else {
      lines.push(`• 💡 <b>Consiglio:</b> Ci sono avversari con più crediti (${oppsNoTopAtt[0] ? oppsNoTopAtt[0].name : ""}). Non entrare in aste folli oltre 350 cr: lascia sfogare i più ricchi e prendi il secondo top o Kean/Scamacca a prezzo di saldo.\n`);
    }
  }

  // 2. Tattica Centrocampo
  lines.push(`🎯 <b>STRATEGIA CENTROCAMPO:</b>`);
  if (iHaveTopCc) {
    lines.push(`• ✅ Hai già coperto un top di centrocampo. Concentrati su ottimi titolari a 10-20 cr.\n`);
  } else {
    lines.push(`• 🔴 <b>Top Centrocampo rimasti:</b> ${s1_cc.length} (${s1_cc.slice(0, 4).map(p => p.nome).join(", ") || "Finiti"}).`);
    lines.push(`• 💡 <b>Consiglio:</b> I centrocampisti da bonus pesanti finiscono in fretta. Assicurati almeno uno tra <b>Pulisic, Zaccagni, Calhanoglu o Baturina</b> prima di rimanere con soli mediani.\n`);
  }

  // 3. Fabbisogno per ruoli mancanti
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

// -------------------------------------------------------------
// 🎮 SIMULAZIONE REALISTICA PRE-ASTA ATTACCO (/simula)
// -------------------------------------------------------------
function runAttackSimulation(db) {
  resetAuction();

  // Assegnazioni realistiche Portieri, Difensori, Centrocampisti
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

  // Assegnazioni generiche per le squadre 6-10 (Gino, Cugino, Paolo, Andrea, Chiap)
  const otherTeams = ["Gino", "Cugino", "Paolo", "Andrea", "Chiap"];
  otherTeams.forEach((tName, idx) => {
    const budgetSpent = 350 + (idx * 25); // Hanno speso tra 350 e 450 crediti
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

  // Applica simData
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

  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const myTeam = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  const myBudget = myTeam.budget;

  // Analisi di ciascuna squadra per l'attacco
  let teamDetails = [];
  let oppsNoTop = [];

  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    const isMe = (tName === meKey);
    const aCount = tData.role_count.A || 0;
    const aMissing = Math.max(0, 6 - aCount);
    
    // Calcola posti mancanti negli altri ruoli (per sapere quanti crediti DEVE tenere da parte a 1 credito ciascuno)
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

  // Ordina le squadre per budget residuo
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

  lines.push(""); // Spazio vuoto

  // Consiglio tattico calibrato
  if (s1.length <= 2 && s1.length > 0 && oppsNoTop.length >= 3) {
    lines.push(`🚨 <b>ALLARME SCARSITÀ:</b> Restano solo <b>${s1.length} Super Top</b> ma ben <b>${oppsNoTop.length} squadre</b> cercano il 1° slot!`);
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
  const ccAll = db.giocatori_per_reparto["CENTROCAMPISTI"] || {};
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
  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);

  function formatCategory(list, catName, icon) {
    if (!list || list.length === 0) return `${icon} <b>${catName}:</b> <i>Nessuno</i>\n`;

    let freeCount = 0;
    let myCount = 0;
    let oppCount = 0;

    // Raggruppa per ruolo P, D, C, A
    const byRole = { P: [], D: [], C: [], A: [] };

    list.forEach(item => {
      const isTaken = auctionState.assigned[item.nome];
      const bStr = item.budget_target ? ` [Target: ${item.budget_target}cr]` : "";
      
      let statusStr = "";
      if (!isTaken) {
        freeCount++;
        statusStr = `• <b>${item.nome}</b> (${item.squadra})${bStr} ➔ 🟢 <b>LIBERO</b>`;
      } else if (isTaken.team === meKey || isTaken.team === "Noi" || isTaken.team === "NOI") {
        myCount++;
        statusStr = `• <b>${item.nome}</b> ➔ ✅ <b>TUO (${isTaken.price} cr)</b>`;
      } else {
        oppCount++;
        statusStr = `• <s>${item.nome}</s> ➔ ❌ <i>${isTaken.team} (${isTaken.price} cr)</i>`;
      }

      if (byRole[item.ruolo]) byRole[item.ruolo].push(statusStr);
      else byRole["A"].push(statusStr);
    });

    let out = `${icon} <b>${catName}</b> (Liberi: <b>${freeCount}</b> | Tuoi: <b>${myCount}</b> | Andati: <b>${oppCount}</b>)\n`;
    
    if (byRole.P.length > 0) {
      out += `  🧤 <b>Portieri:</b>\n` + byRole.P.map(s => `     ${s}`).join("\n") + "\n";
    }
    if (byRole.D.length > 0) {
      out += `  🛡️ <b>Difensori:</b>\n` + byRole.D.map(s => `     ${s}`).join("\n") + "\n";
    }
    if (byRole.C.length > 0) {
      out += `  🎯 <b>Centrocampisti:</b>\n` + byRole.C.map(s => `     ${s}`).join("\n") + "\n";
    }
    if (byRole.A.length > 0) {
      out += `  ⚽ <b>Attaccanti:</b>\n` + byRole.A.map(s => `     ${s}`).join("\n") + "\n";
    }

    return out;
  }

  let text = `⭐ <b>I TUOI OBIETTIVI PERSONALI (RUOLO PER RUOLO)</b>\n` +
             `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
             formatCategory(ob.GIALLO_MUST_HAVE, "MUST HAVE (Giallo)", "🟡") + "\n" +
             formatCategory(ob.ROSA_PRIMO_SLOT_MUST_HAVE, "1° SLOT MUST HAVE (Rosa)", "🌸") + "\n" +
             formatCategory(ob.BLU_OTTIMO_TITOLARE, "OTTIMI TITOLARI (Blu)", "🔵") + "\n" +
             formatCategory(ob.GRIGIO_SCOMMESSINA, "SCOMMESSINE (Grigio)", "⚪");

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
    await sendMessage(chatId, `🔍 Nessun giocatore trovato per "<b>${text}</b>". Prova a scrivere il cognome (es. <i>kean</i>, <i>rowe</i>, <i>pulisic</i>).`, getRepartoKeyboard());
    return;
  }

  const meKey = auctionState.teams["Noi"] ? "Noi" : (auctionState.teams["NOI"] ? "NOI" : Object.keys(auctionState.teams)[0]);
  const me = auctionState.teams[meKey] || { budget: 1000, players: [], role_count: { P: 0, D: 0, C: 0, A: 0 } };
  const myBudget = me.budget;
  const maxRole = (p.ruolo === "P" ? 3 : (p.ruolo === "D" || p.ruolo === "C" ? 8 : 6));
  const myRoleMissing = Math.max(0, maxRole - (me.role_count[p.ruolo] || 0));

  // Analisi di TUTTI gli avversari per il ruolo del giocatore
  let aboveMeNoTop = [];
  let belowMeNoTop = [];
  let completedRole = [];
  let alreadyHaveTop = [];

  for (const [tName, tData] of Object.entries(auctionState.teams)) {
    if (tName === meKey) continue;
    
    // Soglia top per ruolo (A: >=130, C: >=50, D: >=35, P: >=40)
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

  // Stima Prezzo Probabile d'Asta
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

  // Costruzione della sezione Tattica e Contendenti
  let tacticalSection = "";
  if (!auctionState.assigned[p.nome]) {
    tacticalSection = `\n\n🎯 <b>SIMULAZIONE & TATTICA D'ASTA:</b>` +
                      `\n💸 <b>A quanto potrebbe andare:</b> ~<b>${estimatedMin} - ${estimatedMax} crediti</b>\n` +
                      `\n👥 <b>QUADRO CONTENDENTI PER IL RUOLO [${p.ruolo}]:</b>\n`;

    const totalNeedingRole = aboveMeNoTop.length + belowMeNoTop.length + alreadyHaveTop.length;

    if (totalNeedingRole === 0 && myRoleMissing === 0) {
      tacticalSection += `⚪ <i>Tutte le 10 squadre (inclusa la tua) hanno già COMPLETATO gli slot per questo reparto (${maxRole}/${maxRole})!</i>\n`;
    } else {
      // 1. Quelli SOPRA di te senza top
      if (aboveMeNoTop.length > 0) {
        tacticalSection += `🔴 <b>SOPRA DI TE CON SLOT LIBERI (${aboveMeNoTop.length} squadre):</b>\n`;
        aboveMeNoTop.forEach((t, i) => {
          tacticalSection += `  ${i + 1}. <b>${t.name}</b>: <b>${t.budget} cr</b> (+${t.diff} cr rispetto a te | Slot ${p.ruolo}: ${t.roleCount}/${maxRole})\n`;
        });
      } else {
        tacticalSection += `👑 <b>SEI AL 1° POSTO! Nessun avversario a caccia di [${p.ruolo}] ha più crediti di te (${myBudget} cr).</b>\n`;
      }

      // 2. Quelli SOTTO di te senza top
      if (belowMeNoTop.length > 0) {
        tacticalSection += `\n🟡 <b>SOTTO DI TE CON SLOT LIBERI (${belowMeNoTop.length} squadre):</b>\n`;
        belowMeNoTop.forEach((t, i) => {
          tacticalSection += `  • <b>${t.name}</b>: <b>${t.budget} cr</b> (Slot ${p.ruolo}: ${t.roleCount}/${maxRole} | Max offerta: <b>${t.maxBid} cr</b>)\n`;
        });
      }

      // 3. Quelli che hanno già il top nel reparto
      if (alreadyHaveTop.length > 0) {
        tacticalSection += `\n🔵 <i>Hanno già il Top ma cercano gregari: ${alreadyHaveTop.map(t => `${t.name} (${t.budget}cr, ${t.roleCount}/${maxRole})`).join(", ")}</i>\n`;
      }

      // 4. Quelli che hanno completato il reparto
      if (completedRole.length > 0) {
        tacticalSection += `\n⚪ <i>Reparto completato (${maxRole}/${maxRole}): ${completedRole.map(t => `${t.name} (${t.budget}cr)`).join(", ")}</i>\n`;
      }
    }

    // Trappola / Bluff
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
