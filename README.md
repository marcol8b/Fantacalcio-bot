# ⚽ FantaLive Tactical Bot (Lega a 10 - 1000 Crediti)

Assistente d'asta in tempo reale per Telegram, ottimizzato per **decisioni lampo (< 1 secondo)**, **controllo della scarsità per Slot/Tier**, **tracciamento dei budget avversari** e **gestione personalizzata degli obiettivi**.

---

## 📋 GUIDA COMPLETA AI COMANDI

### 👥 1. Gestione Squadre & Saldi
| Comando | Descrizione |
|---|---|
| `/squadre` | Mostra l'elenco delle 10 squadre e i relativi budget. |
| `/squadre Noi, Peppe, Cece...` | Imposta/aggiorna i nomi dei 10 partecipanti. |
| `/squadra <NomeSquadra>` | Visualizza la rosa completa e i crediti spesi da uno specifico avversario (es: `/squadra Peppe`). |
| `/saldi` (o tasto **`💰 Saldi e Crediti`**) | Classifica in tempo reale dei crediti residui di tutti i 10 partecipanti. |
| `/rosa` (o tasto **`📋 La Mia Rosa`**) | Mostra la tua rosa (`Noi`), crediti rimasti e conteggio ruoli (P/D/C/A). |
| `/reset` (o tasto **`🔄 Reset Asta`**) | Azzera l'asta e ripristina tutti i partecipanti a 1000 crediti e tutti i giocatori liberi. |

---

### ⚡ 2. Assegnazioni Rapide durante l'Asta
| Sintassi | Esempio | Azione |
|---|---|---|
| `mio <giocatore> <prezzo>` | `mio kean 140` | Assegna Kean alla tua rosa (`Noi`) e scala 140 crediti. |
| `via <giocatore> <prezzo> <squadra>` | `via lautaro 320 peppe` | Assegna Lautaro a Peppe per 320 crediti e aggiorna i Tier rimasti. |
| 🗣️ **Vocale Telegram** | *"Lautaro a Peppe per 320"* | Riconosce la voce e assegna automaticamente. |
| `/annulla` | `/annulla` | Annulla l'ultima operazione effettuata ripristinando crediti e giocatore. |

---

### 📊 3. Mappa Tattica & Scarsità Slot
| Pulsante / Comando | Cosa visualizza |
|---|---|
| **`⚽ Attacco`** (o `/att`) | Quanti **Slot 1 (Super Top)**, **Slot 2** e **Slot 3** restano liberi + quanti avversari sono ancora senza il 1° slot + **Consiglio Tattico** calibrato sul tuo budget. |
| **`🎯 Centrocampo`** (o `/cc`) | I centrocampisti da bonus divisi per Slot 1, Slot 2 e Slot 3. |
| **`🛡️ Difesa`** (o `/dif`) | I top e ottimi titolari di difesa disponibili. |
| **`🧤 Portieri`** (o `/por`) | Griglia portieri disponibili per Slot. |

---

### ⭐ 4. I Tuoi Obiettivi Personali (Mappati dal tuo Excel)
Cliccando sul tasto **`⭐ I Miei Obiettivi`** (o `/obiettivi`), vedi lo stato dei tuoi 72 giocatori selezionati divisi per colore:
* 🟡 **`GIALLO_MUST_HAVE`**: I tuoi top assoluti (*Martinez L., Malen, Nico Paz*).
* 🌸 **`ROSA_PRIMO_SLOT_MUST_HAVE`**: I cardini di reparto con budget target (*Pulisic, Zaccagni, Kean, Scamacca, Bastoni, Vicario...*).
* 🔵 **`BLU_OTTIMO_TITOLARE`**: I 2°/3° slot solidi (*Kolo Muani, Carnesecchi, Bisseck, Santos, Laurientè...*).
* ⚪ **`GRIGIO_SCOMMESSINA`**: I colpi low cost (*Gudmundsson, Fazzini, Valeri, Colombo...*).

---

### 🔍 5. Flash Radar (Scheda Calciatore)
* **Scrivi solo il nome**: `kean` ➔ Ricevi in 0.2s: Ruolo, Slot 10, Indice Appetibilità, Titolarità, Note del tuo Excel e Badge Obiettivo.
* **Scrivi nome + prezzo**: `kean 150` ➔ Ti dice subito se è conveniente rispetto al tuo budget target o se fermarti!
