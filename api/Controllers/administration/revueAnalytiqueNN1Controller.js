const db = require('../../Models');

/**
 * Contrôle « Revue analytique N/N-1 » — contenu attendu compte par compte.
 * Première règle implémentée : OD de paie (comptes 42 / 43).
 *
 * Détection par SIGNATURE STRUCTURELLE (pas par nom de journal) :
 *   - Constatation de paie = charge 64x au débit + dette 42x/43x au crédit
 *   - Règlement           = dette 42x/43x au débit + trésorerie 5xx au crédit
 * Les à-nouveaux (journaux de type RAN) sont exclus.
 */

const SEVERITE = { BLOQUANT: 'bloquant', MAJEUR: 'majeur', MINEUR: 'mineur' };

const GROUPES = [
  { id: 'REMUNERATION',  prefixes: ['421', '422', '424'], sens: 'C', libelle: 'Rémunérations dues au personnel' },
  { id: 'ACOMPTES',      prefixes: ['425'],               sens: 'D', libelle: 'Avances et acomptes au personnel' },
  { id: 'CHARGES_PAYER', prefixes: ['428'],               sens: 'C', libelle: 'Personnel - charges à payer' },
  { id: 'ORGANISMES',    prefixes: ['431', '437'],        sens: 'C', libelle: 'Organismes sociaux' },
  { id: 'ORG_A_PAYER',   prefixes: ['438'],               sens: 'C', libelle: 'Organismes sociaux - charges à payer' },
];

const PREFIXE_CHARGE = ['64'];   

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const num = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
const moisDe = (d) => iso(d).slice(0, 7);
const commencePar = (compte, liste) => liste.some((p) => String(compte || '').trim().startsWith(p));

/** Liste des mois comptables de l'exercice, au format YYYY-MM. */
function moisExercice(debut, fin) {
  const out = [];
  let [a, m] = iso(debut).slice(0, 7).split('-').map(Number);
  const [af, mf] = iso(fin).slice(0, 7).split('-').map(Number);
  if (!a || !af) return out;
  while (a < af || (a === af && m <= mf)) {
    out.push(`${a}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

function distanceMois(a, b) {
  const [aa, am] = a.split('-').map(Number);
  const [ba, bm] = b.split('-').map(Number);
  return (ba - aa) * 12 + (bm - am);
}

/** Déduit la cadence réelle à partir des mois servis (mensuelle / trimestrielle / …). */
function inferePeriodicite(moisServis, nbMois) {
  const n = moisServis.length;
  if (n === 0) return 'aucune';
  const idx = moisServis.slice().sort();
  // Trimestrielle : 3 à 5 occurrences espacées d'environ 3 mois.
  if (n >= 3 && n <= 5) {
    const ecarts = [];
    for (let i = 1; i < idx.length; i++) ecarts.push(distanceMois(idx[i - 1], idx[i]));
    if (ecarts.length && ecarts.every((e) => e >= 2 && e <= 4)) return 'trimestrielle';
  }
  // Mensuelle : au moins ~60% des mois servis (tolère quelques trous à signaler).
  if (nbMois > 0 && n / nbMois >= 0.6) return 'mensuelle';
  if (n <= 2) return 'annuelle';
  return 'irreguliere';
}

/* ------------------------------------------------------------------ */
/* Calcul principal (live)                                             */
/* ------------------------------------------------------------------ */

const computeRevueNN1 = async (id_compte, id_dossier, id_exercice, mode = 'famille', date_debut = null, date_fin = null) => {
  const base = {
    id_compte: parseInt(id_compte, 10),
    id_dossier: parseInt(id_dossier, 10),
    id_exercice: parseInt(id_exercice, 10),
  };

  const exN = await db.exercices.findOne({ where: { id: base.id_exercice } });
  if (!exN) return { anomalies: [], id_exerciceN1: null };

  const exN1 = await db.exercices.findOne({
    where: { id_dossier: base.id_dossier, rang: (exN.rang || 0) - 1 },
  });
  const id_exerciceN1 = exN1 ? exN1.id : null;

  const params = { toleranceMontant: 1, ratioSoldeMax: 2 };

  // Période : si des dates sont fournies, on analyse la fenêtre [date_debut, date_fin]
  // (revue intermédiaire) ; sinon l'exercice complet.
  const hasPeriode = !!(date_debut && date_fin);
  const borneFin = hasPeriode ? iso(date_fin) : iso(exN.date_fin);       // pour les soldes cumulés
  const borneDebut = hasPeriode ? iso(date_debut) : iso(exN.date_debut); // pour la fenêtre de mouvements
  const periodes = moisExercice(borneDebut, borneFin);

  // Ne pas "attendre" une paie sur un dernier mois seulement partiellement couvert :
  // si la période se termine avant la fin d'un mois (ex. 01/06), la paie de ce mois
  // (saisie en fin de mois) est hors fenêtre → on retire ce mois des mois attendus.
  if (hasPeriode && periodes.length > 0) {
    const [fy, fm, fd] = borneFin.split('-').map(Number);
    const dernierJour = new Date(fy, fm, 0).getDate();
    const moisFin = `${fy}-${String(fm).padStart(2, '0')}`;
    if (fd < dernierJour && periodes[periodes.length - 1] === moisFin) periodes.pop();
  }

  // Lignes N pertinentes (dettes 42/43 + charges 64) sur la FENÊTRE de la période
  // (ou tout l'exercice si aucune période) : sert à la régularité et aux crédits mensuels.
  const dateFiltreFenetre = hasPeriode ? 'AND dateecriture BETWEEN :d1 AND :d2' : '';
  const lignesN = await db.sequelize.query(
    `SELECT id_ecriture,
            TRIM(comptegen) AS comptegen,
            dateecriture,
            COALESCE(debit,0)  AS debit,
            COALESCE(credit,0) AS credit,
            (SELECT type FROM codejournals WHERE id = journals.id_journal) AS journal_type,
            (SELECT code FROM codejournals WHERE id = journals.id_journal) AS journal_code
     FROM journals
     WHERE id_compte = :id_compte
       AND id_dossier = :id_dossier
       AND id_exercice = :id_exercice
       AND LEFT(TRIM(comptegen),2) IN ('42','43','64')
       ${dateFiltreFenetre}
     ORDER BY id_ecriture ASC, id ASC`,
    { replacements: hasPeriode ? { ...base, d1: borneDebut, d2: borneFin } : base, type: db.Sequelize.QueryTypes.SELECT }
  );

  // Neutralisation « aucun salarié » : pas de charge 64x en N ni en N-1.
  const aPersoN = lignesN.some((l) => commencePar(l.comptegen, PREFIXE_CHARGE));
  let aPersoN1 = false;
  if (id_exerciceN1) {
    const chk = await db.sequelize.query(
      `SELECT 1 FROM journals
       WHERE id_compte = :id_compte AND id_dossier = :id_dossier AND id_exercice = :ex
         AND LEFT(TRIM(comptegen),2) = '64' LIMIT 1`,
      { replacements: { id_compte: base.id_compte, id_dossier: base.id_dossier, ex: id_exerciceN1 }, type: db.Sequelize.QueryTypes.SELECT }
    );
    aPersoN1 = chk.length > 0;
  }
  if (!aPersoN && !aPersoN1) return { anomalies: [], id_exerciceN1 };

  // Soldes 42/43 par compte. Le solde N est CUMULÉ jusqu'à la fin de période
  // (à-nouveaux RAN inclus) : c'est ce qui fait ressortir un solde anormal en cours d'année.
  const balanceCumul = async (ex, dateMax) => {
    if (!ex) return [];
    const filtreDate = dateMax ? 'AND dateecriture <= :dateMax' : '';
    return db.sequelize.query(
      `SELECT TRIM(comptegen) AS compte, SUM(COALESCE(debit,0) - COALESCE(credit,0)) AS solde
       FROM journals
       WHERE id_compte = :id_compte AND id_dossier = :id_dossier AND id_exercice = :ex
         AND LEFT(TRIM(comptegen),2) IN ('42','43')
         ${filtreDate}
       GROUP BY TRIM(comptegen)`,
      { replacements: { id_compte: base.id_compte, id_dossier: base.id_dossier, ex, ...(dateMax ? { dateMax } : {}) }, type: db.Sequelize.QueryTypes.SELECT }
    );
  };
  const balN = await balanceCumul(base.id_exercice, hasPeriode ? borneFin : null);
  const balN1 = await balanceCumul(id_exerciceN1, null); // clôture N-1 complète
  const soldeDe = (bal, prefixes) => bal
    .filter((l) => commencePar(String(l.compte), prefixes))
    .reduce((s, l) => s + num(l.solde), 0);

  // Lignes hors à-nouveaux (RAN) : base de tous les mouvements analysés.
  const lignesUtiles = lignesN.filter((l) => String(l.journal_type || '').toUpperCase() !== 'RAN');

  // ── Régularité ancrée sur la CHARGE 64x ──────────────────────────
  // L'événement « la paie a été faite ce mois-ci » = la charge de salaire (64x)
  // apparaît. Le 42/43 est un compte mixte (constatation + règlements + virements
  // individuels) : mauvais repère pour la régularité. On compte donc les mois de charge.
  const chargeParMois = new Map(); // mois -> total débit 64x
  for (const l of lignesUtiles) {
    if (commencePar(l.comptegen, PREFIXE_CHARGE) && num(l.debit) > 0) {
      const m = moisDe(l.dateecriture);
      chargeParMois.set(m, (chargeParMois.get(m) || 0) + num(l.debit));
    }
  }
  const moisCharge = [...chargeParMois.keys()].sort();

  // Comptes de charge 64x réellement utilisés (pour afficher le vrai compte, pas le préfixe).
  const comptesCharge = [...new Set(lignesUtiles
    .filter((l) => commencePar(l.comptegen, PREFIXE_CHARGE))
    .map((l) => String(l.comptegen).trim()))].sort();
  const compteCharge = comptesCharge.length ? comptesCharge.join(', ').slice(0, 50) : '64';

  // Mois où une dette 42/43 est créée (crédit, hors RAN) — contrepartie de la charge.
  const moisDette = new Set();
  for (const l of lignesUtiles) {
    const c = String(l.comptegen || '').trim();
    if ((c.startsWith('42') || c.startsWith('43')) && num(l.credit) > 0) moisDette.add(moisDe(l.dateecriture));
  }

  const anomalies = [];
  const push = (code, regle, compte, libelle, severite, motif, valeurs = {}) =>
    anomalies.push({ code, regle, compte, libelle, severite, motif, valeurs });

  /* ===== Régularité (globale, ancrée sur la charge 64x) ============= */
  const cadence = inferePeriodicite(moisCharge, periodes.length);

  if (cadence === 'aucune') {
    push('PAI-01', 'Régularité de la paie', compteCharge, 'Charges de personnel', SEVERITE.BLOQUANT,
      'Aucune charge de personnel constatée en N alors que le poste existait (N-1).',
      { moisCharge });
  } else if (cadence === 'mensuelle') {
    const manquants = periodes.filter((m) => !chargeParMois.has(m));
    if (manquants.length > 0) {
      push('PAI-02', 'Régularité de la paie', compteCharge, 'Charges de personnel', SEVERITE.MAJEUR,
        `Cadence mensuelle observée, ${manquants.length} mois sans charge de paie : ${manquants.join(', ')}.`,
        { cadence, manquants, moisCharge });
    }
  } else if (cadence === 'trimestrielle') {
    const trous = [];
    for (let i = 1; i < moisCharge.length; i++) {
      if (distanceMois(moisCharge[i - 1], moisCharge[i]) > 4) trous.push(`${moisCharge[i - 1]} -> ${moisCharge[i]}`);
    }
    if (trous.length > 0) {
      push('PAI-03', 'Régularité de la paie', compteCharge, 'Charges de personnel', SEVERITE.MAJEUR,
        `Cadence trimestrielle observée, rupture sur : ${trous.join(' ; ')}.`,
        { cadence, trous, moisCharge });
    }
  } else if (cadence === 'irreguliere') {
    push('PAI-04', 'Régularité de la paie', compteCharge, 'Charges de personnel', SEVERITE.MINEUR,
      `Périodicité de la paie non identifiable : ${moisCharge.length} mois de charge répartis irrégulièrement.`,
      { cadence, moisCharge });
  }

  /* ===== PAI-09 — charge de personnel sans dette en contrepartie ==== */
  const orphelins = moisCharge.filter((m) => !moisDette.has(m));
  if (orphelins.length > 0) {
    push('PAI-09', 'Charge sans dette sociale', compteCharge, 'Charges de personnel', SEVERITE.BLOQUANT,
      `Charge de personnel comptabilisée sans contrepartie 42x/43x sur : ${orphelins.join(', ')}.`,
      { orphelins });
  }

  /* ===== Analyse des comptes de dette 42/43 (sens / continuité / solde) ===== */
  // Crédit mensuel par compte 42/43 (hors RAN) : sert à la continuité et au ratio de solde.
  const creditParCompteMois = new Map(); // compte -> Map(mois -> total crédit)
  for (const l of lignesUtiles) {
    const c = String(l.comptegen || '').trim();
    if ((c.startsWith('42') || c.startsWith('43')) && num(l.credit) > 0) {
      if (!creditParCompteMois.has(c)) creditParCompteMois.set(c, new Map());
      const mm = creditParCompteMois.get(c);
      const m = moisDe(l.dateecriture);
      mm.set(m, (mm.get(m) || 0) + num(l.credit));
    }
  }
  const creditUnite = (prefixes) => {
    const parMois = new Map();
    for (const [c, mm] of creditParCompteMois.entries()) {
      if (!commencePar(c, prefixes)) continue;
      for (const [m, v] of mm.entries()) parMois.set(m, (parMois.get(m) || 0) + v);
    }
    return parMois;
  };

  // Unités d'analyse :
  //  - mode 'famille' : familles (421/422/424 ensemble, etc.)
  //  - mode 'compte'  : chaque compte réel (421100, 421200…) séparément
  let unites;
  if (mode === 'compte') {
    const comptes4243 = [...new Set([...balN, ...balN1]
      .map((l) => String(l.compte))
      .filter((c) => c.startsWith('42') || c.startsWith('43')))].sort();
    unites = comptes4243.map((c) => ({
      id: c, prefixes: [c], sens: c.startsWith('425') ? 'D' : 'C', libelle: c,
      isRemuneration: /^(421|422|424)/.test(c),
    }));
  } else {
    unites = GROUPES.map((g) => ({ ...g, isRemuneration: g.id === 'REMUNERATION' }));
  }

  for (const groupe of unites) {
    const soldeN = soldeDe(balN, groupe.prefixes);
    const soldeN1 = soldeDe(balN1, groupe.prefixes);
    const actifN1 = Math.abs(soldeN1) > params.toleranceMontant;

    const parMoisCredit = creditUnite(groupe.prefixes);
    const moisCredit = [...parMoisCredit.keys()].sort();

    // Comptes réels (complets) trouvés pour ce groupe.
    const comptesGrp = [...new Set([...balN, ...balN1]
      .map((l) => String(l.compte))
      .filter((c) => commencePar(c, groupe.prefixes)))].sort();
    const compteGrp = comptesGrp.length ? comptesGrp.join(', ').slice(0, 50) : groupe.prefixes[0];

    // Unité totalement inactive (N et N-1) : on saute.
    if (moisCredit.length === 0 && Math.abs(soldeN) <= params.toleranceMontant && !actifN1) continue;

    /* PAI-06 — sens du solde */
    const horsSens = groupe.sens === 'C' ? soldeN > params.toleranceMontant : soldeN < -params.toleranceMontant;
    if (horsSens) {
      push('PAI-06', 'Sens du solde', compteGrp, groupe.libelle, SEVERITE.MAJEUR,
        `Solde ${soldeN > 0 ? 'débiteur' : 'créditeur'} alors que le sens normal est ${groupe.sens === 'C' ? 'créditeur' : 'débiteur'}.`,
        { soldeN: round2(soldeN) });
    }

    /* PAI-07 — continuité N-1 / N */
    if (actifN1 && moisCredit.length === 0) {
      push('PAI-07', 'Continuité N-1 / N', compteGrp, groupe.libelle, SEVERITE.MAJEUR,
        'Compte de dette mouvementé en N-1 et non crédité en N.',
        { soldeN1: round2(soldeN1), soldeN: round2(soldeN) });
    }

    /* PAI-08 — solde de clôture disproportionné (rémunérations 421) */
    if (groupe.isRemuneration && moisCredit.length > 0) {
      const totalCredit = [...parMoisCredit.values()].reduce((s, v) => s + v, 0);
      const creditMoyen = totalCredit / moisCredit.length;
      const ratio = creditMoyen > 0 ? Math.abs(soldeN) / creditMoyen : 0;
      if (creditMoyen > 0 && ratio > params.ratioSoldeMax) {
        push('PAI-08', 'Solde de clôture', compteGrp, groupe.libelle, SEVERITE.MAJEUR,
          `Le solde représente ${ratio.toFixed(1)} mois de paie : reliquat probablement non réglé.`,
          { soldeN: round2(soldeN), creditMoyen: round2(creditMoyen), ratio: round2(ratio) });
      }
    }
  }

  return { anomalies, id_exerciceN1 };
};

/* ------------------------------------------------------------------ */
/* Handlers HTTP                                                       */
/* ------------------------------------------------------------------ */

const scopeOf = (id_compte, id_dossier, id_exercice, id_periode) => ({
  id_compte: parseInt(id_compte, 10),
  id_dossier: parseInt(id_dossier, 10),
  id_exercice: parseInt(id_exercice, 10),
  id_periode: (id_periode !== undefined && id_periode !== '') ? parseInt(id_periode, 10) : null,
});

// Résout les dates de la période : depuis les dates fournies, sinon depuis id_periode.
const resolvePeriodeDates = async (id_periode, date_debut, date_fin) => {
  if (date_debut && date_fin) return { date_debut, date_fin };
  if (id_periode !== undefined && id_periode !== '' && id_periode !== null && id_periode !== 'exercice') {
    const p = await db.periodes.findOne({ where: { id: parseInt(id_periode, 10) } });
    if (p) return { date_debut: p.date_debut, date_fin: p.date_fin };
  }
  return { date_debut: null, date_fin: null };
};

const mapRow = (r) => ({
  id: r.id,
  code: r.code,
  regle: r.regle,
  compte: r.compte,
  libelle: r.libelle,
  severite: r.severite,
  motif: r.motif,
  valeurs: r.valeurs ? safeParse(r.valeurs) : {},
  valide: !!r.valide,
  commentaire: r.commentaire || '',
});

const safeParse = (s) => { try { return JSON.parse(s); } catch (e) { return {}; } };

// Données live (non stockées) — utile pour debug/aperçu.
exports.getLive = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const mode = req.query.mode === 'compte' ? 'compte' : 'famille';
    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }
    const { date_debut, date_fin } = await resolvePeriodeDates(req.query.id_periode, req.query.date_debut, req.query.date_fin);
    const result = await computeRevueNN1(id_compte, id_dossier, id_exercice, mode, date_debut, date_fin);
    return res.status(200).json({ state: true, data: result, count: result.anomalies.length });
  } catch (error) {
    console.error('[REVUE_NN1] error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Stats (dashboard) — depuis la table.
exports.getStats = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    const total = await db.revueNN1Anomalies.count({ where: scope });
    const restantes = await db.revueNN1Anomalies.count({ where: { ...scope, valide: false } });

    return res.json({
      state: true,
      data: { total_anomalies: total, total, restantes, nonValide: restantes },
    });
  } catch (error) {
    console.error('[REVUE_NN1] stats error:', error);
    return res.status(500).json({ state: false, msg: 'Erreur serveur', error: error.message });
  }
};

// Lecture des anomalies enregistrées (table).
exports.getStored = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    const rows = await db.revueNN1Anomalies.findAll({
      where: scope,
      order: [['severite', 'ASC'], ['code', 'ASC'], ['compte', 'ASC']],
    });

    const lignes = rows.map(mapRow);
    return res.json({ state: true, data: { lignes, nbAnomalies: lignes.length, revised: rows.length > 0 }, count: lignes.length });
  } catch (error) {
    console.error('[REVUE_NN1] stored error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Réviser = recalcule + enregistre (conserve valide/commentaire par code||compte).
exports.saveRevueNN1 = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const mode = req.query.mode === 'compte' ? 'compte' : 'famille';

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const { date_debut, date_fin } = await resolvePeriodeDates(id_periode, req.query.date_debut, req.query.date_fin);
    const { anomalies } = await computeRevueNN1(id_compte, id_dossier, id_exercice, mode, date_debut, date_fin);
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    // Conserver valide/commentaire des anomalies existantes (clé = code||compte).
    const existing = await db.revueNN1Anomalies.findAll({ where: scope });
    const keep = {};
    existing.forEach((e) => { keep[`${e.code}||${e.compte}`] = { valide: e.valide, commentaire: e.commentaire }; });

    await db.sequelize.transaction(async (t) => {
      await db.revueNN1Anomalies.destroy({ where: scope, transaction: t });
      if (anomalies.length > 0) {
        await db.revueNN1Anomalies.bulkCreate(
          anomalies.map((a) => {
            const prev = keep[`${a.code}||${a.compte}`] || {};
            return {
              ...scope,
              code: a.code,
              regle: a.regle,
              compte: a.compte,
              libelle: a.libelle,
              severite: a.severite,
              motif: a.motif,
              valeurs: JSON.stringify(a.valeurs || {}),
              anomalie: true,
              valide: prev.valide || false,
              commentaire: prev.commentaire || null,
            };
          }),
          { transaction: t }
        );
      }
    });

    return res.json({ state: true, saved: anomalies.length });
  } catch (error) {
    console.error('[REVUE_NN1] save error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Mettre à jour valide / commentaire d'une anomalie.
exports.updateAnomalie = async (req, res) => {
  try {
    const { id } = req.params;
    const { valide, commentaire } = req.body;
    const row = await db.revueNN1Anomalies.findByPk(id);
    if (!row) return res.status(404).json({ state: false, message: 'Introuvable' });

    if (valide !== undefined) row.valide = valide === true || valide === 'true';
    if (commentaire !== undefined) row.commentaire = commentaire;
    await row.save();

    return res.json({ state: true, data: row });
  } catch (error) {
    console.error('[REVUE_NN1] update error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

module.exports.SEVERITE = SEVERITE;
module.exports.GROUPES = GROUPES;