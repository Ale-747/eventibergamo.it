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

/* ------------------------------------------------------------------ render */

let STATO = null;

function selettore() {
  const { valide, inCorso, attiva } = STATO;
  if (valide.length < 2) return "";
  // In ordine cronologico da sinistra: la guida in corso si chiama "Adesso", le
  // altre si presentano con il loro periodo — un'etichetta è più utile di "prima/poi".
  // Ci vanno TUTTE le guide valide: se ne mostrassimo solo due, quella aperta
  // potrebbe non avere il suo bottone e non ci si potrebbe più tornare.
  const voce = (g) => {
    const testo = g.id === inCorso?.id ? "Adesso" : etichettaPeriodo(g.periodo);
    return `<button type="button" class="tab${g.id === attiva.id ? " sel" : ""}"
      data-id="${esc(g.id)}" aria-pressed="${g.id === attiva.id}">${esc(testo)}</button>`;
  };
  return `<nav class="tabs" aria-label="Quale guida">${valide.map(voce).join("")}</nav>`;
}

function renderGuida() {
  const { dati, attiva, inCorso, oggi } = STATO;
  document.documentElement.dataset.tema = attiva.formato;

  const futura = attiva.periodo.da > oggi;
  const avviso = futura
    ? `Questa guida vale da ${nomeGiorno(attiva.periodo.da)} ${giornoMese(attiva.periodo.da)}.`
    : null;

  const titolo = esc(attiva.titolo).split(" ");
  const primo = titolo.shift();

  const chips = attiva.categorie.map((c) =>
    `<span class="chip"><i>${esc(c.icona)}</i>${esc(c.etichetta)}</span>`).join("");

  const icona = (chiave) => attiva.categorie.find((c) => c.chiave === chiave)?.icona ?? "✱";

  const giorni = attiva.giorni.map((g) => {
    const eOggi = g.data === oggi;
    const righe = g.eventi.map((e) => {
      const p = badgePrezzo(e.prezzo);
      const zona = e.zona ? `<span class="zona">${esc(e.zona)}</span>` : "";
      return `<li>
        <div class="ora">${esc(e.ora ?? "—")}</div>
        <div class="corpo">
          <div class="nome"><i>${esc(icona(e.categoria))}</i>${esc(e.nome)}</div>
          <div class="dove">${esc(e.luogo ?? "")} ${zona}</div>
        </div>
        <div class="${p.cls}">${esc(p.testo)}</div>
      </li>`;
    }).join("");

    return `<section class="giorno${eOggi ? " oggi" : ""}" id="g-${g.data}">
      <h2>${esc(g.etichetta)}${eOggi ? '<span class="oggi-bollo">oggi</span>' : ""}</h2>
      <ul class="lista">${righe}</ul>
      ${g.nota ? `<p class="nota">${esc(g.nota)}</p>` : ""}
    </section>`;
  }).join("");

  const sempre = attiva.sempre_aperte.length ? `<section class="giorno">
      <h2>Aperte tutto il periodo</h2>
      <ul class="lista">${attiva.sempre_aperte.map((v) => `<li>
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
      <div class="marchio"><span class="punto"></span><b>${esc(dati.brand.nome)}</b></div>
      ${selettore()}
      <div class="occhiello"><span>${attiva.formato === "weekend" ? "Guida del weekend" : "Guida della settimana"}</span></div>
      <h1>${primo}<em>${titolo.join(" ")}</em></h1>
      <div class="pillola">${esc(etichettaPeriodo(attiva.periodo))}</div>
      ${anticipo ? `<p class="anticipo">${esc(anticipo)}</p>` : ""}
      <p class="sommario">${nl(attiva.sottotitolo)}</p>
      <p class="gancio">${nl(attiva.hook)}</p>
      <div class="chips">${chips}</div>
    </header>
    ${giorni}
    ${sempre}
    ${piede(dati, attiva, avviso)}
  `;

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
    const g = STATO.valide.find((x) => x.id === b.dataset.id);
    if (!g || g.id === STATO.attiva.id) return;
    STATO.attiva = g;
    renderGuida();
    window.scrollTo({ top: 0 });
  }));

  // Solo sulla guida in corso ha senso saltare a oggi: su quella futura si parte dall'inizio.
  const corrente = document.querySelector(".giorno.oggi");
  if (corrente) corrente.scrollIntoView({ block: "start" });
  document.title = `${dati.brand.nome} — ${etichettaPeriodo(attiva.periodo)}`;
}

function renderRiposo(dati) {
  document.documentElement.dataset.tema = "weekend";
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
      ${piede(dati, null, null, { minimale: true })}
    </div>`;
  document.title = `${brand.nome} — Bergamo, città e provincia`;
}

function piede(dati, guida, avviso, opz = {}) {
  const contatti = (dati?.contatti ?? []).map((c) =>
    `<a href="${esc(c.url)}" rel="noopener">${esc(c.valore)}</a>`).join("");
  // Sulla pagina di riposo il piede resta essenziale: citare il periodo di una guida
  // già finita, o spiegare i badge prezzo che nessuno sta vedendo, è solo rumore.
  const minuto = opz.minimale ? "" : `
      ${avviso ? esc(avviso) + "<br>" : ""}
      Guida ${esc(guida.formato)} ${esc(guida.periodo.da)} → ${esc(guida.periodo.a)}.
      Dove c'è scritto <strong>n.d.</strong> il prezzo non è pubblicato dalle fonti: chiedi all'ingresso.
      Gli orari possono cambiare — verifica sempre sul canale dell'organizzatore.`;
  return `<footer class="piede">
    <div class="occhiello"><span>Scrivici</span></div>
    <div class="contatti">${contatti}</div>
    ${minuto ? `<p class="minuto">${minuto}</p>` : ""}
  </footer>`;
}

/* ------------------------------------------------------------------ avvio */

fetch("dati/corrente.json", { cache: "no-cache" })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
  .then((dati) => {
    const oggi = oggiRoma();
    const { valide, inCorso, attiva } = scegli(dati.guide ?? [], oggi);
    if (!attiva) return renderRiposo(dati);
    STATO = { dati, oggi, valide, inCorso, attiva };
    renderGuida();
  })
  .catch(() => renderRiposo(null));
