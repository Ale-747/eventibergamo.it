/* Il sito decide da solo cosa mostrare.
   Il JSON porta l'elenco delle guide ancora utili con le loro date; il confronto
   con oggi avviene qui, nel browser. Così quando un periodo passa il sito si
   riallinea da solo, anche se nessuno ha rigenerato niente: una pagina statica
   che dice il falso è peggio di una pagina che dice "torna venerdì". */

const ROMA = "Europe/Rome";
const $ = (sel) => document.querySelector(sel);

function oggiRoma() {
  // 'sv-SE' dà già AAAA-MM-GG; il fuso lo impone la timeZone, non il browser di chi guarda.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: ROMA }).format(new Date());
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function nl(s) { return esc(s).replace(/\n/g, "<br>"); }

function badgePrezzo(p) {
  const tipo = p?.tipo ?? "nd";
  if (tipo === "nd") return { testo: "n.d.", cls: "prezzo nd" };
  if (tipo === "gratis") return { testo: "gratis", cls: "prezzo" };
  const v = Number.isInteger(p.valore) ? p.valore : String(p.valore).replace(".", ",");
  return { testo: tipo === "da" ? `da ${v}€` : `${v}€`, cls: "prezzo pay" };
}

const GIORNI_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
                 "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function giornoMese(iso) {
  const [, m, g] = iso.split("-").map(Number);
  return `${g} ${MESI_IT[m - 1]}`;
}
function nomeGiorno(iso) {
  const [a, m, g] = iso.split("-").map(Number);
  return GIORNI_IT[new Date(Date.UTC(a, m - 1, g)).getUTCDay()];
}
/* Lo slug delle pagine giorno, uguale a GIORNI_SLUG di statico.py: se i due
   divergono, il rimando al secondo livello punta a un 404. */
const GIORNI_SLUG = ["domenica", "lunedi", "martedi", "mercoledi", "giovedi", "venerdi", "sabato"];
function urlGiorno(iso) {
  const [a, m, g] = iso.split("-").map(Number);
  const s = GIORNI_SLUG[new Date(Date.UTC(a, m - 1, g)).getUTCDay()];
  return `/${a}/${String(m).padStart(2, "0")}/${String(g).padStart(2, "0")}-${s}/`;
}
function etichettaPeriodo(p) {
  return p.etichetta ?? `${p.da} → ${p.a}`;
}

/* ------------------------------------------------------------------ scelta

   Si tengono le guide non ancora finite, in ordine di data d'inizio, e si apre su
   quella che COPRE OGGI. Se oggi non è coperto da nessuna — capita nei buchi tra
   una guida e l'altra — si apre sulla prima che comincia, cioè la più vicina nel
   futuro, non la più lontana.

   `valide` è ordinata per data d'inizio e le guide finite sono già fuori, quindi
   una guida in corso (da <= oggi) sta sempre prima di una futura (da > oggi):
   `valide[0]` è di per sé "quella in corso, altrimenti la prossima". `inCorso`
   resta esplicito perché serve comunque a etichettare il bottone "Adesso".

   Le altre guide restano tutte raggiungibili dai bottoni in cima. */

function scegli(guide, oggi) {
  const valide = [...guide]
    .filter((g) => g.periodo.a >= oggi)          // finite: fuori
    .sort((a, b) => a.periodo.da.localeCompare(b.periodo.da));
  const inCorso = valide.find((g) => g.periodo.da <= oggi && oggi <= g.periodo.a) ?? null;
  const attiva = inCorso ?? valide[0] ?? null;
  return { valide, inCorso, attiva };
}

/* La settimana di cinema "di adesso", scelta come le guide: quella in corso,
   altrimenti la prossima. Il cinema sta in una lista sua dentro corrente.json
   (`dati.cinema`) perché lì l'unità è il film e non la serata — vedi
   sito/genera.py, compila_cinema(). */

function scegliCinema(settimane, oggi) {
  return [...(settimane ?? [])]
    .filter((c) => c.periodo.a >= oggi)
    .sort((a, b) => a.periodo.da.localeCompare(b.periodo.da))
    .find((c) => c.periodo.da <= oggi) ?? null;
}

/* Il ponte verso /cinema/. Stesso markup di rimando_cinema() in statico.py: la
   home viene ricostruita da qui, e un blocco che esistesse solo nel pre-render
   sparirebbe appena questa funzione gira. Senza, dalla home non si arriva più
   alla sezione cinema in nessun modo — il piede qui sotto non ha la trama di
   link che scrive statico.py. */

function rimandoCinema(cin) {
  if (!cin) return "";
  const nFilm = (cin.film ?? []).length;
  const nSale = (cin.sale ?? []).length;
  const comuni = new Set((cin.sale ?? []).map((s) => s.comune).filter(Boolean)).size;
  return `<a class="rimando" href="/cinema/">
      <span class="occhiello"><span>Anche al cinema</span></span>
      <b>${esc(etichettaPeriodo(cin.periodo))}</b>
      <span class="dettaglio">${nFilm} film in ${nSale} sale di ${comuni} comuni, con orari e prezzi</span>
      <span class="freccia">Vai alla programmazione &rarr;</span></a>`;
}

/* Le keyword di un evento, sotto il luogo. Sono bottoni: un click mostra solo
   gli eventi con quella parola, un secondo click la toglie. Stessa classe di
   parole() in statico.py, dove invece sono testo — lì il filtro non c'è. */
function parole(e) {
  const kw = e.keyword ?? [];
  if (!kw.length) return "";
  return `<div class="kw">${kw.map((k) =>
    `<button type="button" data-kw="${esc(k)}" aria-pressed="false">${esc(k)}</button>`).join("")}</div>`;
}

/* ------------------------------------------------------------------ profilo

   Chi visita può dire una volta cosa gli interessa — le categorie, e se partire
   da "solo la guida" o da "tutti gli eventi" — e ritrovarlo già impostato ogni
   volta che torna. Nessun account e nessun server: sta tutto in un cookie su
   questo dispositivo. GitHub Pages se lo vede arrivare con le richieste e lo
   ignora, perché lì non c'è niente che lo legga.

   È un cookie tecnico di funzionalità, chiesto da chi lo salva: per questo non
   serve il banner del consenso. Proprio per restare tale si scrive solo a un
   click ("Salva" o "No grazie"), mai all'arrivo. Chi cancella i cookie riparte
   da zero, e va bene così.

   Il profilo decide da dove si parte, non chiude niente: chip e switch restano
   cliccabili, e quei click valgono per la visita, non toccano il profilo. */

const COOKIE = "eb_profilo";
const UN_ANNO = 60 * 60 * 24 * 365;

function leggiProfilo() {
  try {
    const riga = document.cookie.split("; ").find((c) => c.startsWith(COOKIE + "="));
    if (!riga) return null;
    const p = JSON.parse(decodeURIComponent(riga.slice(COOKIE.length + 1)));
    return { cat: Array.isArray(p.cat) ? p.cat.map(String) : [], tutti: !!p.tutti, no: !!p.no };
  } catch {
    return null;   // un cookie rotto vale come nessun profilo
  }
}

function scriviProfilo(p) {
  const sicuro = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(p))}; Max-Age=${UN_ANNO}; Path=/; SameSite=Lax${sicuro}`;
  STATO.profilo = leggiProfilo();
}

function cancellaProfilo() {
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  STATO.profilo = null;
}

/* Un profilo vero, cioè non il solo "No grazie" all'invito. */
function profiloAttivo() {
  return STATO.profilo && !STATO.profilo.no ? STATO.profilo : null;
}

/* Il punto di partenza di una guida: all'arrivo, al cambio di guida, dopo un
   salvataggio. Le categorie del profilo che in questa guida non ci sono si
   lasciano fuori dal filtro — altrimenti accenderebbero chip invisibili — e se
   non ne resta nessuna si mostra tutto, dicendo perché: una pagina vuota con
   scritto "nessun evento" sembrerebbe un sito rotto. */
function ripartiDalProfilo(catsGuida, tutteCat) {
  const p = profiloAttivo();
  if (!p) { STATO.filtri = new Set(); return null; }
  STATO.tutti = p.tutti;
  const presenti = new Set(p.tutti ? tutteCat.map((c) => c.chiave) : catsGuida);
  STATO.filtri = new Set(p.cat.filter((c) => presenti.has(c)));
  if (!p.cat.length || STATO.filtri.size) return null;
  const fuori = p.cat.some((c) => tutteCat.some((t) => t.chiave === c));
  return fuori
    ? "Le categorie del tuo profilo questa volta stanno fuori dalla guida: le trovi in «Tutti gli eventi»."
    : "In questa guida non c'è niente delle categorie del tuo profilo: ti mostro tutto.";
}

/* Tutte le categorie del registro, anche quelle senza eventi in vetrina: una
   preferenza vale per le prossime guide. Il registro lo scrive genera.py in
   corrente.json; un file generato prima di quel campo ripiega sulle categorie
   delle guide in vetrina. */
function categorieProfilo() {
  if (STATO.dati.categorie?.length) return STATO.dati.categorie;
  const viste = new Map();
  STATO.valide.forEach((g) => (g.categorie_tutte ?? g.categorie).forEach((c) => viste.set(c.chiave, c)));
  return [...viste.values()];
}

/* Il pannello sta fuori da #app: un render della guida non lo cancella, e i
   suoi chip e switch non si confondono con quelli dei filtri. */
function apriProfilo() {
  let dlg = $("dialog.profilo");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.className = "profilo";
    dlg.setAttribute("aria-labelledby", "profilo-titolo");
    document.body.append(dlg);
    // Il click sullo sfondo chiude, come Esc.
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  }
  // Si parte dal profilo salvato; senza, da quello che si sta guardando adesso.
  const p = profiloAttivo();
  const scelte = new Set(p ? p.cat : STATO.filtri);
  let tutti = p ? p.tutti : STATO.tutti;

  const chips = categorieProfilo().map((c) =>
    `<button type="button" class="chip${scelte.has(c.chiave) ? " sel" : ""}" data-cat="${esc(c.chiave)}"
      aria-pressed="${scelte.has(c.chiave)}"><i>${esc(c.icona)}</i>${esc(c.etichetta)}</button>`).join("");
  const sw = (v, testo) => `<button type="button" class="sw${tutti === v ? " sel" : ""}"
      data-tutti="${v ? 1 : 0}" aria-pressed="${tutti === v}">${testo}</button>`;

  dlg.innerHTML = `
    <div class="occhiello"><span id="profilo-titolo">Il tuo profilo</span></div>
    <h2>Cosa ti interessa?</h2>
    <p class="aiuto">Scegline quante vuoi: quando entri trovi la guida già filtrata. Nessuna vuol dire tutto.</p>
    <div class="chips">${chips}</div>
    <h2>Quando entri, mostrami</h2>
    <div class="switch" role="group" aria-label="Cosa mostrare all'arrivo">${sw(false, "Solo la guida")}${sw(true, "Tutti gli eventi")}</div>
    <p class="aiuto">La guida è la nostra selezione. Tutti gli eventi sono anche quelli che abbiamo trovato e non scelto.</p>
    <div class="azioni">
      <button type="button" class="bott pieno" data-azione="salva">Salva</button>
      <button type="button" class="bott" data-azione="chiudi">Annulla</button>
    </div>
    <p class="privacy">Le scelte restano in un cookie tecnico su questo dispositivo, per un anno.
      Niente account, e non le legge nessuno: se cancelli i cookie si riparte da zero.
      <a href="/privacy/">Privacy e cookie</a>.
      ${p ? '<button type="button" class="link" data-azione="cancella">Cancella il profilo</button>' : ""}</p>`;

  dlg.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.cat;
    if (scelte.has(c)) scelte.delete(c); else scelte.add(c);
    b.classList.toggle("sel", scelte.has(c));
    b.setAttribute("aria-pressed", scelte.has(c));
  }));
  dlg.querySelectorAll(".sw").forEach((b) => b.addEventListener("click", () => {
    tutti = b.dataset.tutti === "1";
    dlg.querySelectorAll(".sw").forEach((x) => {
      const on = (x.dataset.tutti === "1") === tutti;
      x.classList.toggle("sel", on);
      x.setAttribute("aria-pressed", on);
    });
  }));
  dlg.querySelector('[data-azione="salva"]').addEventListener("click", () => {
    scriviProfilo({ cat: [...scelte], tutti });
    dlg.close();
    STATO.riparti = true;
    renderGuida();
  });
  dlg.querySelector('[data-azione="chiudi"]').addEventListener("click", () => dlg.close());
  dlg.querySelector('[data-azione="cancella"]')?.addEventListener("click", () => {
    cancellaProfilo();
    dlg.close();
    STATO.tutti = false;
    STATO.riparti = true;
    renderGuida();
  });

  dlg.showModal();
}

/* L'invito compare finché non c'è un cookie: né profilo né "No grazie". */
function invito() {
  if (STATO.profilo) return "";
  return `<div class="invito">
      <p><b>Fatti la tua guida.</b> Scegli cosa ti interessa e ogni volta che torni la trovi già filtrata.</p>
      <div class="azioni">
        <button type="button" class="bott pieno" data-azione="profilo">Crea il profilo</button>
        <button type="button" class="bott" data-azione="no-profilo">No grazie</button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ render */

let STATO = null;

function selettore() {
  const { valide, inCorso, attiva, cinema } = STATO;
  // La tab del cinema c'è anche quando la guida è una sola: è l'altra linea del
  // sito, non un'alternativa fra guide, e va raggiungibile comunque.
  const alCinema = cinema
    ? `<a class="tab cinema" href="/cinema/">Al cinema · ${esc(etichettaPeriodo(cinema.periodo))}</a>`
    : "";
  if (valide.length < 2) return alCinema ? `<nav class="tabs" aria-label="Sezioni">${alCinema}</nav>` : "";
  // In ordine cronologico da sinistra: la guida in corso si chiama "Adesso", le
  // altre si presentano con il loro periodo — un'etichetta è più utile di "prima/poi".
  // Ci vanno TUTTE le guide valide: se ne mostrassimo solo due, quella aperta
  // potrebbe non avere il suo bottone e non ci si potrebbe più tornare.
  const voce = (g) => {
    const testo = g.id === inCorso?.id ? "Adesso" : etichettaPeriodo(g.periodo);
    return `<button type="button" class="tab${g.id === attiva.id ? " sel" : ""}"
      data-id="${esc(g.id)}" aria-pressed="${g.id === attiva.id}">${esc(testo)}</button>`;
  };
  return `<nav class="tabs" aria-label="Quale guida">${valide.map(voce).join("")}${alCinema}</nav>`;
}

/* I dati strutturati della home sono scritti in pagina da statico.py e stanno
   fuori da #app, quindi il render non li tocca. Se però qui si finisce per
   mostrare una guida diversa da quella pre-renderizzata — la data è cambiata,
   o si è cliccato un altro periodo — quel markup descrive eventi che non sono
   più a schermo, e dati strutturati che non corrispondono alla pagina fanno più
   danno che bene: si buttano. */
function allineaDatiStrutturati(idAttiva) {
  document.querySelectorAll('script[type="application/ld+json"][data-guida]')
    .forEach((s) => { if (s.dataset.guida !== idAttiva) s.remove(); });
}

/* Lo switch in cima: la guida e' quello che si e' scelto, "tutti" quello che si
   e' trovato. Parte da "solo la guida" perche' la selezione e' il prodotto, ma
   l'altra meta' non deve stare dietro a un link d'archivio per vedersi. */
function interruttore(g) {
  const nGuida = g.giorni.reduce((n, d) => n + (d.eventi?.length ?? 0), 0);
  const nTutti = nGuida + g.giorni.reduce((n, d) => n + (d.altri?.length ?? 0), 0);
  if (nTutti === nGuida) return "";
  const b = (tutti, testo, n) =>
    `<button type="button" class="sw${STATO.tutti === tutti ? " sel" : ""}"
      data-tutti="${tutti ? 1 : 0}" aria-pressed="${STATO.tutti === tutti}">${testo} <em>${n}</em></button>`;
  return `<div class="switch" role="group" aria-label="Quanti eventi mostrare"
    >${b(false, "Solo la guida", nGuida)}${b(true, "Tutti gli eventi", nTutti)}</div>`;
}

function renderGuida() {
  const { dati, attiva, inCorso, oggi } = STATO;
  document.documentElement.dataset.tema = attiva.formato;
  allineaDatiStrutturati(attiva.id);

  const futura = attiva.periodo.da > oggi;
  const avviso = futura
    ? `Questa guida vale da ${nomeGiorno(attiva.periodo.da)} ${giornoMese(attiva.periodo.da)}.`
    : null;

  const titolo = esc(attiva.titolo).split(" ");
  const primo = titolo.shift();

  /* I chip coprono anche le categorie del solo secondo livello: in "solo la
     guida" non accenderebbero niente, e applicaFiltri() li nasconde. */
  const catsGuida = new Set(attiva.categorie.map((c) => c.chiave));
  const tutteCat = attiva.categorie_tutte ?? attiva.categorie;
  const chips = tutteCat.map((c) =>
    `<button type="button" class="chip" data-cat="${esc(c.chiave)}" aria-pressed="false"${
      catsGuida.has(c.chiave) ? "" : ' data-extra-cat="1"'}
      ><i>${esc(c.icona)}</i>${esc(c.etichetta)}</button>`).join("");

  const icona = (chiave) => tutteCat.find((c) => c.chiave === chiave)?.icona ?? "✱";

  /* Il secondo filtro: le parole chiave della guida, dalla più frequente. Come
     per i chip, quelle che esistono solo nel secondo livello si marcano e in
     "solo la guida" applicaFiltri() le nasconde. Oltre le prime KW_APERTE
     restano dietro a "tutte le parole": sono decine, e un muro di bottoni
     sopra la guida la spingerebbe sotto lo schermo. */
  const conta = (eventi) => {
    const m = new Map();
    eventi.forEach((e) => (e.keyword ?? []).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)));
    return m;
  };
  const evGuida = attiva.giorni.flatMap((g) => g.eventi ?? []);
  const kwGuida = conta(evGuida);
  const kwTutti = conta(evGuida.concat(attiva.giorni.flatMap((g) => g.altri ?? [])));
  const paroleFiltro = [...kwTutti.keys()]
    .sort((a, b) => (kwGuida.get(b) ?? 0) - (kwGuida.get(a) ?? 0)
                    || kwTutti.get(b) - kwTutti.get(a) || a.localeCompare(b, "it"))
    .map((k) => `<button type="button" data-kw="${esc(k)}" aria-pressed="false"${
      kwGuida.has(k) ? "" : ' data-extra-kw="1"'}>${esc(k)}</button>`).join("");
  const filtroParole = paroleFiltro ? `<div class="filtro" id="filtro-parole">
        <p class="filtro-tit"><b>Filtro 2 · Parola chiave</b>
          <span>Com'è la serata: genere, pubblico, formato. Una parola alla volta.</span></p>
        <div class="kw kw-filtro">${paroleFiltro}</div>
        <button type="button" class="link altre-kw" data-azione="altre-kw" hidden></button>
        <p class="filtro-kw" id="filtro-kw" hidden>Solo gli eventi con «<b></b>»
          <button type="button" class="link" data-azione="togli-kw">togli</button></p>
      </div>` : "";

  let notaProfilo = null;
  if (STATO.riparti) {
    STATO.kw = null;
    notaProfilo = ripartiDalProfilo(catsGuida, tutteCat);
    STATO.riparti = false;
  }

  /* Guida e secondo livello si mescolano in ordine di orario: con lo switch su
     "tutti" uno sta leggendo la serata, e una serata ha un orologio solo. Che
     una riga venga dalla guida resta visibile lo stesso — le altre sono
     smorzate — ma non si spezzano in due elenchi. */
  const giorni = attiva.giorni.map((g) => {
    const eOggi = g.data === oggi;
    const tutte = (g.eventi ?? []).map((e) => [e, false])
      .concat((g.altri ?? []).map((e) => [e, true]))
      .sort((a, b) => (a[0].ora ?? "99:99").localeCompare(b[0].ora ?? "99:99")
                      || (a[0].nome ?? "").localeCompare(b[0].nome ?? ""));
    const righe = tutte.map(([e, extra]) => {
      const p = badgePrezzo(e.prezzo);
      const zona = e.zona ? `<span class="zona">${esc(e.zona)}</span>` : "";
      // Le keyword stanno anche sulla riga, separate da "|": il filtro legge quelle.
      const kw = e.keyword?.length ? ` data-kw="${esc(e.keyword.join("|"))}"` : "";
      return `<li data-cat="${esc(e.categoria)}"${kw}${extra ? ' class="extra" data-extra="1"' : ""}>
        <div class="ora">${esc(e.ora ?? "—")}</div>
        <div class="corpo">
          <div class="nome"><i>${esc(icona(e.categoria))}</i>${esc(e.nome)}</div>
          <div class="dove">${esc(e.luogo ?? "")} ${zona}</div>${parole(e)}
        </div>
        <div class="${p.cls}">${esc(p.testo)}</div>
      </li>`;
    }).join("");

    return `<section class="giorno${eOggi ? " oggi" : ""}" id="g-${g.data}">
      <h2>${esc(g.etichetta)}${eOggi ? '<span class="oggi-bollo">oggi</span>' : ""}</h2>
      <ul class="lista">${righe}</ul>
      ${g.nota ? `<p class="nota">${esc(g.nota)}</p>` : ""}
      ${g.altri?.length ? `<p class="piu" data-solo="1"><a href="${urlGiorno(g.data)}#tutto-il-resto"
        >e altri ${g.altri.length} eventi di ${esc(nomeGiorno(g.data))} →</a></p>` : ""}
    </section>`;
  }).join("");

  const sempre = attiva.sempre_aperte.length ? `<section class="giorno">
      <h2>Aperte tutto il periodo</h2>
      <ul class="lista">${attiva.sempre_aperte.map((v) => `<li data-cat="${esc(v.categoria ?? "")}">
          <div class="corpo">
            <div class="nome"><i>${esc(icona(v.categoria))}</i>${esc(v.nome)}</div>
            <div class="dove">${esc(v.luogo ?? "")}</div>
          </div>
          <div class="quando">${esc(v.quando ?? "")}</div>
        </li>`).join("")}</ul>
    </section>` : "";

  // Se non c'è niente in corso, va detto: senza una riga chi arriva pensa che il
  // sito stia sbagliando data, non che sia in anticipo. Qui la guida aperta è già
  // la prima che comincia, quindi prima di lei non c'è nient'altro da segnalare.
  const anticipo = !inCorso && futura
    ? "Per stasera non c'è niente in programma. Questa è la prossima guida."
    : null;

  $("#app").innerHTML = `
    <header>
      <div class="marchio"><span class="punto"></span><b>${esc(dati.brand.nome)}</b>
        <button type="button" class="bott apri-profilo" data-azione="profilo"
          >${profiloAttivo() ? "Il tuo profilo" : "Profilo"}</button></div>
      ${selettore()}
      ${invito()}
      <div class="occhiello"><span>${attiva.formato === "weekend" ? "Guida del weekend" : "Guida della settimana"}</span></div>
      <h1>${primo}<em>${titolo.join(" ")}</em></h1>
      <div class="pillola">${esc(etichettaPeriodo(attiva.periodo))}</div>
      ${anticipo ? `<p class="anticipo">${esc(anticipo)}</p>` : ""}
      <p class="sommario">${nl(attiva.sottotitolo)}</p>
      <p class="gancio">${nl(attiva.hook)}</p>
      ${interruttore(attiva)}
      <div class="filtri">
        <div class="filtro" id="filtro-cat">
          <p class="filtro-tit"><b>Filtro 1 · Categoria</b>
            <span>Che tipo di evento è: concerti, sagre, teatro… Accendine quante vuoi.</span></p>
          <div class="chips">${chips}</div>
          ${notaProfilo ? `<p class="nota-profilo">${esc(notaProfilo)}</p>` : ""}
        </div>
        ${filtroParole}
        ${filtroParole ? `<p class="filtri-nota">Sono due filtri separati e si sommano: con una categoria
          e una parola accese restano solo gli eventi che hanno tutte e due.</p>` : ""}
      </div>
    </header>
    <p class="vuoto" id="vuoto" hidden>Nessun evento con questi filtri. Togline uno.</p>
    ${giorni}
    ${sempre}
    ${rimandoCinema(STATO.cinema)}
    ${piede(dati, attiva, avviso)}
  `;

  document.querySelectorAll("button.tab").forEach((b) => b.addEventListener("click", () => {
    const g = STATO.valide.find((x) => x.id === b.dataset.id);
    if (!g || g.id === STATO.attiva.id) return;
    STATO.attiva = g;
    STATO.riparti = true;   // le categorie di un'altra guida non sono le stesse
    renderGuida();
    window.scrollTo({ top: 0 });
  }));

  document.querySelector('#app [data-azione="tour"]')?.addEventListener("click", avviaTour);
  document.querySelectorAll('#app [data-azione="profilo"]').forEach((b) =>
    b.addEventListener("click", apriProfilo));
  document.querySelector('#app [data-azione="no-profilo"]')?.addEventListener("click", () => {
    scriviProfilo({ no: 1 });
    document.querySelector("#app .invito")?.remove();
  });

  document.querySelectorAll("#app button.sw").forEach((b) => b.addEventListener("click", () => {
    const tutti = b.dataset.tutti === "1";
    if (tutti === STATO.tutti) return;
    STATO.tutti = tutti;
    /* Un filtro acceso su una categoria che in "solo la guida" non esiste
       lascerebbe la pagina vuota senza che si capisca perché: si spegne. */
    if (!tutti) {
      STATO.filtri = new Set([...STATO.filtri].filter((c) => catsGuida.has(c)));
      if (STATO.kw && !kwGuida.has(STATO.kw)) STATO.kw = null;
    }
    applicaFiltri();
  }));

  document.querySelectorAll("#app .kw button").forEach((b) => b.addEventListener("click", () => {
    STATO.kw = STATO.kw === b.dataset.kw ? null : b.dataset.kw;
    applicaFiltri();
    // Il filtro si spiega in cima: chi ha cliccato in fondo alla pagina ci torna.
    if (STATO.kw && !b.closest(".filtri")) $("#filtro-kw").scrollIntoView({ block: "center" });
  }));
  document.querySelector('#app [data-azione="altre-kw"]')?.addEventListener("click", () => {
    STATO.kwAperte = !STATO.kwAperte;
    applicaFiltri();
  });
  document.querySelector('#app [data-azione="togli-kw"]')?.addEventListener("click", () => {
    STATO.kw = null;
    applicaFiltri();
  });

  document.querySelectorAll("#app .chip").forEach((b) => b.addEventListener("click", () => {
    const c = b.dataset.cat;
    if (STATO.filtri.has(c)) STATO.filtri.delete(c); else STATO.filtri.add(c);
    applicaFiltri();
  }));

  applicaFiltri();

  document.title = `${dati.brand.nome} — ${etichettaPeriodo(attiva.periodo)}`;
}

/* I filtri non rifanno il render: nascondono. Rifare il render rimanderebbe la
   pagina in cima a ogni click, e chi sta leggendo il sabato sera
   perderebbe il segno. Qui si tocca solo l'attributo `hidden`.

   Nessun filtro attivo = tutti gli eventi. Un chip acceso ne lascia passare uno
   solo, due chip due: si somma, non si restringe. Le sezioni che restano senza
   eventi spariscono, altrimenti resterebbe un titolo di giorno con sotto il nulla. */

const KW_APERTE = 14;

function applicaFiltri() {
  const f = STATO.filtri;
  const tutti = STATO.tutti;
  const kw = STATO.kw;

  // La keyword si somma ai chip: categoria E parola, non o.
  const barra = $("#filtro-kw");
  if (barra) {
    barra.hidden = !kw;
    barra.querySelector("b").textContent = kw ?? "";
  }
  document.querySelectorAll("#app .kw button").forEach((b) => {
    const on = b.dataset.kw === kw;
    b.classList.toggle("sel", on);
    b.setAttribute("aria-pressed", on);
  });

  /* Le parole del filtro 2: fuori quelle che in questa modalità non accendono
     niente, e oltre le prime KW_APERTE solo se si è chiesto di vederle tutte.
     Quella accesa resta sempre a vista, sennò non si saprebbe come spegnerla. */
  const visibiliKw = [...document.querySelectorAll("#app .kw-filtro button")]
    .filter((b) => tutti || !b.dataset.extraKw);
  document.querySelectorAll("#app .kw-filtro button").forEach((b) => { b.hidden = true; });
  visibiliKw.forEach((b, i) => {
    b.hidden = !(STATO.kwAperte || i < KW_APERTE || b.dataset.kw === kw);
  });
  const altre = $("#app .altre-kw");
  if (altre) {
    altre.hidden = visibiliKw.length <= KW_APERTE;
    altre.textContent = STATO.kwAperte ? "Meno parole" : `Tutte le parole (${visibiliKw.length})`;
  }

  document.querySelectorAll("#app button.sw").forEach((b) => {
    const on = (b.dataset.tutti === "1") === tutti;
    b.classList.toggle("sel", on);
    b.setAttribute("aria-pressed", on);
  });
  // Il rimando "e altri N eventi di venerdì" serve solo quando quegli N non sono
  // già a schermo.
  document.querySelectorAll("p.piu[data-solo]").forEach((p) => { p.hidden = tutti; });

  document.querySelectorAll("#app .chip").forEach((b) => {
    // Un chip che in questa modalità non accende niente non si mostra.
    if (b.dataset.extraCat && !tutti) { b.hidden = true; return; }
    b.hidden = false;
    const acceso = f.has(b.dataset.cat);
    b.classList.toggle("sel", acceso);
    b.setAttribute("aria-pressed", acceso);
  });

  let visibili = 0;
  document.querySelectorAll("#app .giorno").forEach((sezione) => {
    let n = 0;
    sezione.querySelectorAll("li[data-cat]").forEach((li) => {
      const mostra = (tutti || !li.dataset.extra) && (f.size === 0 || f.has(li.dataset.cat))
        && (!kw || (li.dataset.kw ?? "").split("|").includes(kw));
      li.hidden = !mostra;
      if (mostra) n += 1;
      // Il filo rosso sopra la lista sta sulla prima riga *visibile*, non sulla prima.
      li.classList.toggle("primo", mostra && n === 1);
    });
    sezione.hidden = n === 0;
    visibili += n;
  });

  const vuoto = $("#vuoto");
  if (vuoto) vuoto.hidden = visibili > 0;
}

function renderRiposo(dati, cinema = null) {
  document.documentElement.dataset.tema = "weekend";
  allineaDatiStrutturati(null);
  const r = dati?.riposo ?? {};
  const brand = dati?.brand ?? { nome: "Eventibergamo" };
  const [primo, ...resto] = (r.titolo ?? "Ci vediamo\npresto").split("\n");
  $("#app").innerHTML = `
    <div class="riposo">
      <header>
        <div class="marchio"><span class="punto"></span><b>${esc(brand.nome)}</b></div>
        <div class="occhiello"><span>Niente in programma</span></div>
        <h1>${esc(primo)}<em>${esc(resto.join(" "))}</em></h1>
        <p class="lead">${esc(r.lead ?? "")}</p>
        <p class="cta">${esc(r.cta ?? "")}</p>
      </header>
      ${rimandoCinema(cinema)}
      ${piede(dati, null, null, { minimale: true })}
    </div>`;
  document.title = `${brand.nome} — Bergamo, città e provincia`;
}

function piede(dati, guida, avviso, opz = {}) {
  // Il bottone Instagram porta al carosello di *questa* guida, quando è già uscito:
  // chi arriva dal sito trova il post giusto, non il profilo da cui ripescarlo.
  // La guida è quella aperta, cioè quella in corso o — se non ce n'è — la prossima;
  // senza permalink (post non ancora pubblicato, o pagina di riposo) resta il profilo.
  const post = guida?.permalink || null;
  const contatti = (dati?.contatti ?? []).map((c) => {
    const ig = /instagram\.com/.test(c.url ?? "");
    const url = ig && post ? post : c.url;
    const titolo = ig && post ? ' title="Il carosello di questa guida su Instagram"' : "";
    return `<a href="${esc(url)}" rel="noopener"${titolo}>${esc(c.valore)}</a>`;
  }).join("");
  // Sulla pagina di riposo il piede resta essenziale: citare il periodo di una guida
  // già finita, o spiegare i badge prezzo che nessuno sta vedendo, è solo rumore.
  const minuto = opz.minimale ? "" : `
      ${avviso ? esc(avviso) + "<br>" : ""}
      Guida ${esc(guida.formato)} ${esc(guida.periodo.da)} → ${esc(guida.periodo.a)}.
      Dove c'è scritto <strong>n.d.</strong> il prezzo non è pubblicato dalle fonti: chiedi all'ingresso.
      Gli orari possono cambiare — verifica sempre sul canale dell'organizzatore.`;
  // Il tour vive solo sulla home con una guida: sulla pagina di riposo non ha
  // niente da mostrare.
  const tour = opz.minimale ? ""
    : '<button type="button" class="link" data-azione="tour">Come funziona il sito</button> · ';
  // Il link all'informativa sta su tutte le pagine, anche quella di riposo:
  // statico.py lo mette nel suo piede, e questo lo sostituisce sulla home.
  const legale = `<p class="minuto">${tour}<a href="/privacy/">Privacy e cookie</a></p>`;
  return `<footer class="piede">
    <div class="occhiello"><span>Scrivici</span></div>
    <div class="contatti">${contatti}</div>
    ${minuto ? `<p class="minuto">${minuto}</p>` : ""}
    ${legale}
  </footer>`;
}

/* ------------------------------------------------------------------ tour

   Chi entra per la prima volta vede un giro guidato: la pagina si scurisce, una
   cornice illumina un pezzo alla volta e un riquadro spiega cosa fa. Si salta in
   qualsiasi momento (bottone, Esc o click fuori), e si rivede da "Come funziona
   il sito" nel piede.

   Che sia già stato visto lo ricorda un cookie tecnico, `eb_tour`, come il
   profilo: niente server, e si scrive solo quando lo si chiude — a "Fine" o a
   "Salta" — mai all'arrivo. Chi cancella i cookie lo rivede, ed è giusto così.

   !! TOUR va tenuto allineato al sito. Ogni modifica che aggiunge, toglie o
   cambia una funzione della home — un filtro, un bottone, una sezione, il modo
   in cui si legge una riga — aggiorna anche i passi qui sotto, nella stessa
   modifica. Il controllo meccanico è `python3 tools/prova-tour.py`: apre la home
   e fallisce se un passo non trova più il suo pezzo di pagina. Che un passo
   *manchi* invece non lo vede nessun codice: quello resta un'abitudine, scritta
   anche in CLAUDE.md.

   Ogni passo: `cerca` è una lista di selettori in ordine di preferenza (vince il
   primo con un elemento visibile); senza `cerca` il riquadro sta al centro.
   `facoltativo` vuol dire che quel pezzo può legittimamente mancare — niente
   cinema questa settimana, nessun evento fuori guida — e allora il passo si
   salta invece di fallire. Testi corti: è un tour, non un manuale. */

const TOUR = [
  { titolo: "Benvenuto su Eventibergamo",
    testo: "Ogni settimana scegliamo gli eventi di Bergamo e provincia. Ti mostriamo come usare il sito: ci vogliono trenta secondi." },
  { cerca: [".tabs"], facoltativo: true,
    titolo: "Le guide e il cinema",
    testo: "Quando due guide si sovrappongono le trovi qui. «Al cinema» porta ai film in sala, con orari e prezzi sala per sala." },
  { cerca: [".switch"], facoltativo: true,
    titolo: "Solo la guida, o tutto",
    testo: "La guida è la nostra selezione. «Tutti gli eventi» aggiunge anche quelli che abbiamo trovato e non scelto, più chiari." },
  { cerca: ["#filtro-cat"],
    titolo: "Filtro 1: la categoria",
    testo: "Che tipo di evento è: concerti, sagre, teatro… Tocca una categoria per vedere solo quella; se ne accendi più di una si sommano, ritocca per spegnerla." },
  { cerca: ["#filtro-parole"], facoltativo: true,
    titolo: "Filtro 2: la parola chiave",
    testo: "Com'è la serata: genere, pubblico, formato. Una parola alla volta. È un filtro separato: se usi tutti e due restano gli eventi che hanno sia la categoria sia la parola." },
  { cerca: [".giorno li[data-cat]"],
    titolo: "Come si legge un evento",
    testo: "Ora, nome, luogo e zona. A destra il prezzo: «n.d.» vuol dire che le fonti non lo pubblicano, chiedi all'ingresso." },
  { cerca: [".giorno .kw"], facoltativo: true,
    titolo: "Le parole sotto ogni evento",
    testo: "Sono le stesse del filtro 2: toccane una e il filtro si accende su quella parola. In cima compare «togli» per spegnerlo." },
  { cerca: [".piu a"], facoltativo: true,
    titolo: "Tutto il resto del giorno",
    testo: "Ogni giorno ha la sua pagina, con anche gli eventi rimasti fuori dalla guida." },
  { cerca: [".invito", ".apri-profilo"],
    titolo: "Il tuo profilo",
    testo: "Scegli le categorie che ti interessano: quando torni trovi la guida già filtrata. Resta su questo dispositivo, senza account." },
  { titolo: "Tutto qui",
    testo: "Puoi rivedere questo giro quando vuoi da «Come funziona il sito», in fondo alla pagina. Lì accanto c'è anche cosa facciamo, e non facciamo, con i tuoi dati." },
];

const COOKIE_TOUR = "eb_tour";

function tourVisto() {
  return document.cookie.split("; ").some((c) => c.startsWith(COOKIE_TOUR + "="));
}

function segnaTourVisto() {
  const sicuro = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_TOUR}=1; Max-Age=${UN_ANNO}; Path=/; SameSite=Lax${sicuro}`;
}

/* Il primo elemento *visibile* fra quelli che il passo accetta: una riga
   nascosta da un filtro ha un rettangolo vuoto, e illuminerebbe il nulla. */
function bersaglio(passo) {
  for (const sel of passo.cerca ?? []) {
    const el = [...document.querySelectorAll(`#app ${sel}`)].find((x) => x.getClientRects().length);
    if (el) return el;
  }
  return null;
}

function avviaTour() {
  if (!STATO || document.querySelector(".tour-velo")) return;
  // I passi si decidono adesso, sulla pagina com'è: un pezzo che manca non si
  // illumina a vuoto, si salta.
  const passi = TOUR.filter((p) => !p.cerca || bersaglio(p));
  let i = 0;

  const velo = document.createElement("div");
  velo.className = "tour-velo";
  const luce = document.createElement("div");
  luce.className = "tour-luce";
  const box = document.createElement("div");
  box.className = "tour-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "tour-titolo");
  document.body.append(velo, luce, box);
  const prima = document.activeElement;

  // `behavior: "instant"` perché html ha scroll-behavior: smooth, e con lo
  // scorrimento morbido il rettangolo misurato subito dopo sarebbe quello vecchio.
  function centra(el) {
    const r = el.getBoundingClientRect();
    const y = scrollY + r.top - Math.max(16, (innerHeight - r.height) / 2 - 80);
    scrollTo({ top: Math.max(0, y), behavior: "instant" });
  }

  function posiziona() {
    const el = bersaglio(passi[i]);
    const bw = Math.min(380, innerWidth - 32);
    box.style.width = `${bw}px`;
    if (!el) {
      // Passo senza bersaglio: niente cornice, riquadro al centro.
      luce.style.cssText = `top:${innerHeight / 2}px;left:${innerWidth / 2}px;width:0;height:0;border-width:0`;
      box.style.left = `${(innerWidth - bw) / 2}px`;
      box.style.top = `${Math.max(16, (innerHeight - box.offsetHeight) / 2)}px`;
      return;
    }
    const r = el.getBoundingClientRect();
    const m = 8;
    luce.style.cssText = `top:${r.top - m}px;left:${r.left - m}px;width:${r.width + 2 * m}px;height:${r.height + 2 * m}px`;
    const bh = box.offsetHeight;
    const sotto = innerHeight - r.bottom - m - 14;
    const top = sotto >= bh ? r.bottom + m + 14
      : r.top - m - 14 >= bh ? r.top - m - 14 - bh
      : innerHeight - bh - 16;                        // non ci sta da nessuna parte: in basso
    box.style.top = `${Math.max(16, top)}px`;
    box.style.left = `${Math.min(Math.max(16, r.left), innerWidth - bw - 16)}px`;
  }

  function mostra() {
    const p = passi[i];
    const ultimo = i === passi.length - 1;
    box.innerHTML = `
      <div class="tour-conta">${i + 1} / ${passi.length}</div>
      <h2 id="tour-titolo">${esc(p.titolo)}</h2>
      <p>${esc(p.testo)}</p>
      <div class="azioni">
        ${ultimo ? "" : '<button type="button" class="link" data-tour="salta">Salta il tour</button>'}
        <span class="spinta"></span>
        ${i > 0 ? '<button type="button" class="bott" data-tour="indietro">Indietro</button>' : ""}
        <button type="button" class="bott pieno" data-tour="avanti">${ultimo ? "Fine" : i === 0 ? "Inizia" : "Avanti"}</button>
      </div>`;
    const el = bersaglio(p);
    if (el) centra(el);
    posiziona();
    box.querySelector('[data-tour="avanti"]').focus();
  }

  function chiudi() {
    segnaTourVisto();
    velo.remove(); luce.remove(); box.remove();
    removeEventListener("resize", posiziona);
    removeEventListener("keydown", tasti);
    // Si torna dove si era partiti, cioè in cima: è lì che si arriva sul sito.
    scrollTo({ top: 0, behavior: "instant" });
    prima?.focus?.();
  }

  function tasti(e) {
    if (e.key === "Escape") chiudi();
    else if (e.key === "ArrowRight") vai(1);
    else if (e.key === "ArrowLeft") vai(-1);
  }

  function vai(d) {
    if (i + d >= passi.length) return chiudi();
    i = Math.max(0, i + d);
    mostra();
  }

  box.addEventListener("click", (e) => {
    const a = e.target.closest("[data-tour]")?.dataset.tour;
    if (a === "salta") chiudi();
    else if (a === "avanti") vai(1);
    else if (a === "indietro") vai(-1);
  });
  // Il velo prende i click fuori dal riquadro: durante il tour la pagina non si
  // tocca, e un click fuori vale come "salta".
  velo.addEventListener("click", chiudi);
  addEventListener("resize", posiziona);
  addEventListener("keydown", tasti);
  mostra();
}

/* ------------------------------------------------------------------ avvio */

fetch("/dati/corrente.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
  .then((dati) => {
    const oggi = oggiRoma();
    const { valide, inCorso, attiva } = scegli(dati.guide ?? [], oggi);
    const cinema = scegliCinema(dati.cinema, oggi);
    if (!attiva) return renderRiposo(dati, cinema);
    STATO = { dati, oggi, valide, inCorso, attiva, cinema, filtri: new Set(), tutti: false,
              profilo: leggiProfilo(), riparti: true, kw: null, kwAperte: false };
    renderGuida();
    // Il tour parte a font caricati: con i font di ripiego le misure dei pezzi
    // da illuminare sarebbero altre, e la cornice cadrebbe di traverso.
    if (!tourVisto()) document.fonts.ready.then(() => requestAnimationFrame(avviaTour));
  })
  /* Se il JSON non arriva non si cancella niente: in pagina c'è già la guida
     scritta da statico.py, ed è comunque più utile di un cartello di scuse.
     Solo se davvero non c'è nulla — pagina servita senza pre-render — si ricade
     sulla schermata di riposo. */
  .catch(() => {
    if (!document.querySelector("#app header")) renderRiposo(null);
  });
