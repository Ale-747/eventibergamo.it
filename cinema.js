/* Eventibergamo — i filtri delle pagine settimana del cinema (/cinema/ e
   /cinema/<id>/). Il markup lo scrive statico.py (filtri_cinema()), qui si
   accende e basta: nessun dato da fuori, nessun cookie, nessun render.

   Stesso meccanismo di applicaFiltri() in app.js: i filtri non rifanno la
   pagina, nascondono con `hidden`, così chi sta scorrendo non perde il segno.
   I filtri si sommano tra loro (genere E giorno E sala…); dentro il genere i
   chip accesi si sommano come le categorie della home (uno O l'altro).

   Una riga qui è un film con sotto le sue sale. Sala, giorno e fascia filtrano
   le SALE: un film resta finché gliene resta almeno una, e il badge "N sale"
   conta quelle rimaste. Giorno e fascia leggono `data-sp` (data e ora vere, dal
   campo `spettacoli`): una sala che non le pubblica, con quei filtri accesi,
   non compare — non sappiamo quando proietta, e indovinarlo è vietato. */
(function () {
  const blocco = document.getElementById("filtri-cinema");
  if (!blocco) return;
  blocco.hidden = false;

  const S = { gen: new Set(), giorno: null, fascia: null, ver: null, sala: "", q: "" };
  const GG = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const film = [...document.querySelectorAll("ul.lista.cinema > li.film")];
  const $ = (s) => document.querySelector(s);

  // Stessi confini di fascia() in statico.py.
  const fascia = (ora) => {
    const h = parseInt(ora, 10);
    return h < 12 ? "mattina" : h < 18 ? "pomeriggio" : "sera";
  };
  const giornoBreve = (iso) => {
    const [a, m, g] = iso.split("-").map(Number);
    return `${GG[new Date(Date.UTC(a, m - 1, g)).getUTCDay()]} ${g}`;
  };
  // "Città" trova anche "citta": si confronta senza accenti e senza maiuscole.
  const piano = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  film.forEach((li) => { li.dataset.tit = piano(li.querySelector(".nome").textContent); });

  function applica() {
    const perOra = S.giorno || S.fascia;
    let visibili = 0;
    film.forEach((li) => {
      const ver = (li.dataset.ver ?? "").split("|");
      let ok = (S.gen.size === 0 || S.gen.has(li.dataset.gen))
        && (!S.ver || ver.includes(S.ver))
        && (!S.q || li.dataset.tit.includes(S.q));
      let n = 0;
      li.querySelectorAll("ul.sale > li").forEach((v) => {
        const orari = v.querySelector(".orari");
        let vista = !S.sala || v.dataset.sala === S.sala;
        let giuste = [];
        if (vista && perOra) {
          giuste = (v.dataset.sp ?? "").split("|").filter(Boolean)
            .map((x) => x.split("T"))
            .filter(([g, o]) => (!S.giorno || g === S.giorno) && (!S.fascia || fascia(o) === S.fascia));
          vista = giuste.length > 0;
        }
        v.hidden = !vista;
        // Con giorno o fascia accesi la sala dice quali spettacoli li soddisfano:
        // "gio → mer, più orari" da solo non risponde alla domanda che si è fatta.
        if (orari) {
          orari.hidden = !(vista && perOra);
          orari.textContent = vista && perOra
            ? giuste.map(([g, o]) => (S.giorno ? o : `${giornoBreve(g)} ${o}`)).join(" · ")
            : "";
        }
        if (vista) n += 1;
      });
      ok = ok && n > 0;
      li.hidden = !ok;
      const conta = li.querySelector(".conta");
      if (conta) {
        conta.querySelector("b").textContent = n;
        conta.querySelector("span").textContent = n === 1 ? "sala" : "sale";
      }
      if (ok) visibili += 1;
      // Il filo rosso sopra la lista sta sulla prima riga *visibile*.
      li.classList.toggle("primo", ok && visibili === 1);
    });

    blocco.querySelectorAll(".chip[data-gen]").forEach((b) => {
      const on = S.gen.has(b.dataset.gen);
      b.classList.toggle("sel", on);
      b.setAttribute("aria-pressed", on);
    });
    [["giorno", "giorno"], ["fascia", "fascia"], ["ver", "ver"]].forEach(([chiave, attr]) => {
      blocco.querySelectorAll(`button[data-${attr}]`).forEach((b) => {
        const on = b.dataset[attr] === S[chiave];
        b.classList.toggle("sel", on);
        b.setAttribute("aria-pressed", on);
      });
    });

    const attivi = S.gen.size || S.giorno || S.fascia || S.ver || S.sala || S.q;
    const barra = $("#filtri-attivi");
    barra.hidden = !attivi;
    barra.querySelector("span").textContent =
      `${visibili} film su ${film.length}`;
    // Rassegne e serate non hanno genere né orari esatti: con un filtro acceso
    // si tolgono, invece di restare lì come se lo avessero superato.
    const rassegne = document.getElementById("rassegne");
    if (rassegne) rassegne.hidden = !!attivi;
    $("#film").hidden = visibili === 0;
    $("#vuoto").hidden = visibili > 0;
  }

  blocco.querySelectorAll(".chip[data-gen]").forEach((b) => b.addEventListener("click", () => {
    const g = b.dataset.gen;
    if (S.gen.has(g)) S.gen.delete(g); else S.gen.add(g);
    applica();
  }));
  [["giorno", "giorno"], ["fascia", "fascia"], ["ver", "ver"]].forEach(([chiave, attr]) => {
    blocco.querySelectorAll(`button[data-${attr}]`).forEach((b) => b.addEventListener("click", () => {
      S[chiave] = S[chiave] === b.dataset[attr] ? null : b.dataset[attr];
      applica();
    }));
  });
  const sala = $("#scegli-sala");
  sala?.addEventListener("change", () => { S.sala = sala.value; applica(); });
  const cerca = $("#cerca-titolo");
  cerca?.addEventListener("input", () => { S.q = piano(cerca.value); applica(); });
  blocco.querySelector('[data-azione="togli-tutto"]').addEventListener("click", () => {
    S.gen.clear(); S.giorno = S.fascia = S.ver = null; S.sala = S.q = "";
    if (sala) sala.value = "";
    if (cerca) cerca.value = "";
    applica();
  });

  // Tornando indietro il browser rimette i valori nei campi: si riparte da quelli.
  if (sala) S.sala = sala.value;
  if (cerca) S.q = piano(cerca.value);
  applica();
})();
