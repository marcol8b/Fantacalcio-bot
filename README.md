# ⚽ FantaLive Tactical Bot (Lega a 10 - 1000 Crediti)

Bot Telegram intelligente ad alte prestazioni per l'asta live del Fantacalcio, ottimizzato per **decisioni lampo (< 0.2 secondi)**, **controllo matematico della scarsità per Slot/Tier**, **tracciamento dei budget e delle offerte massime degli avversari**, **strategie di bluff/trappola** e **gestione personalizzata degli obiettivi**.

---

## 🌟 FUNZIONALITÀ CHIAVE

1. **⚽ Quadro Attacco & Max Offerta Singola (`/att`):**
   * Mappa istantanea degli **Slot 1 (Super Top)**, **Slot 2 (15+ gol)** e **Slot 3 (Titolari)** rimasti.
   * Tabella delle 10 squadre con **crediti residui**, **slot d'attacco mancanti**, **se hanno già un top** e **massima offerta singola sostenibile**.
   * **Allarme Scarsità automatico** quando i top stanno per finire e la domanda supera l'offerta.

2. **🔍 Flash Radar & Simulatore d'Asta per Giocatore:**
   * Scrivi il cognome (es. `kean`, `vlahovic`, `scamacca`):
     * 🏷️ **Slot 10 & Appetibilità IA**
     * 🛡️ **Titolarità** & 📝 **Note Tattiche del tuo Excel**
     * 🎯 **Tuo Budget Target personale** & **Badge Obiettivo** (Giallo, Rosa, Blu, Grigio)
     * 💸 **Prezzo Stimato d'Asta**
     * 👥 **Chi lo potrebbe prendere** (i 3 avversari più affamati e con più crediti)
     * 🃏 **Trappola / Bluff Strategico** (chi far dissanguare alla prossima chiamata per abbassare il prezzo del tuo vero obiettivo).

3. **🧠 Motore di Tattica Consigliata a 360° (`/tattica`):**
   * Calcola se puoi permetterti di attendere, se sei il più ricco della sala o se devi forzare subito l'asta.
   * Calcola la **media crediti disponibile per ciascun slot vuoto** per completare la rosa.

4. **👥 Gestione Totale Squadre e Rose (`/squadre`, `/squadra <Nome>`):**
   * Pre-caricate le tue 10 squadre reali: `Noi`, `Peppe`, `Cece`, `Zio`, `Nero`, `Gino`, `Cugino`, `Paolo`, `Andrea`, `Chiap`.
   * Consulta la rosa di chiunque in qualsiasi momento divisa per P, D, C, A.

5. **🎮 Modalità Simulazione Istantanea (`/simula`):**
   * Popola all'istante Portieri (3), Difensori (8) e Centrocampisti (8) con giocatori reali e prezzi coerenti per testare la fase calda dell'attacco.

6. **🎙️ Supporto Vocale Telegram:**
   * Invia note vocali brevi (es. *"Lautaro a Peppe per 320"*) trascritte all'istante con Whisper.

---

## 📖 GUIDA COMPLETA AI COMANDI

| Comando / Tasto | Sintassi / Esempio | Descrizione |
|---|---|---|
| **`⚽ Attacco`** | `/att` | Status Slot 1, 2, 3 + tabella di tutte le 10 squadre (crediti, slot mancanti, stato top, max offerta). |
| **`🧠 Tattica Consigliata`** | `/tattica` o `consiglio` | Analisi strategica 360°: potere d'acquisto, allarme scarsità, crediti medi per ruolo. |
| **`⭐ I Miei Obiettivi`** | `/obiettivi` | Lista live dei 72 giocatori selezionati divisi per colore (🟡 MUST HAVE, 🌸 1° SLOT, 🔵 TITOLARI, ⚪ SCOMMESSE). |
| **`💰 Saldi e Crediti`** | `/saldi` | Classifica dal più ricco al più povero con conteggio giocatori presi. |
| **`📋 La Mia Rosa`** | `/rosa` | Visualizza i tuoi giocatori acquistati, crediti rimasti e fabbisogno ruoli. |
| **Consulta Avversario** | `/squadra Peppe` (o `/rosa Peppe`) | Mostra la rosa dettagliata di Peppe divisa per Portieri, Difensori, Centrocampisti, Attaccanti. |
| **Lista Squadre** | `/squadre` | Mostra i 10 partecipanti attuali. |
| **Imposta Squadre** | `/squadre Noi, Peppe, Cece...` | Personalizza i nomi dei partecipanti all'asta. |
| **Assegna a TE** | `mio kean 140` | Assegna Kean a `Noi` per 140 crediti e aggiorna il tuo saldo e la rosa. |
| **Assegna ad AVVERSARIO** | `via lautaro 320 peppe` | Assegna Lautaro a Peppe per 320 crediti e aggiorna i Tier e le max offerte. |
| **Vocale Telegram** | 🎙️ *"Mio Zaccagni a 110"* | Riconosce la voce e registra l'assegnazione. |
| **Annulla** | `/annulla` | Annulla l'ultima operazione effettuata ripristinando crediti e calciatore. |
| **Reset Asta** | `/reset` (o tasto **`🔄 Reset Asta`**) | Ripristina tutti i 10 partecipanti a 1000 crediti e tutti i 517 giocatori liberi. |
| **Simulazione Attacco** | `/simula` | Riempie le rose fino all'attacco per testare la fase offensiva. |
| **Scheda Calciatore** | `kean` o `kean 150` | Scheda flash con slot, note, budget target, stima prezzo, contendenti e bluff. |

---

## 🏗️ ARCHITETTURA & TECNOLOGIA

* **Runtime:** Cloudflare Workers (Serverless a latenza sub-millisecondo globale).
* **Database:** `fanta_database.json` con 517 calciatori di Serie A, Slot 1-8 (Lega a 10), statistiche storiche, note tattiche e 4 categorie di target colorati dal file Excel.
* **Webhook Telegram:** Ricezione e invio messaggi in streaming con tastiera personalizzata e inline keyboards.
* **Voice Engine:** Trascrizione audio `.oga` via Whisper API.
