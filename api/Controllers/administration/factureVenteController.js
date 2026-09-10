const db = require('../../Models');

const extractNumero = (libelle, formats) => {
  // On découpe sur espace / « / » / « _ » / « - » : « F26_05/2022 » -> [F26, 05, 2022],
  // « CV016/FI-2023 » -> [CV016, FI, 2023]. Ainsi on isole bien le numéro (F26, CV016).
  const words = String(libelle || '').split(/[\s/_-]+/).filter(Boolean);
  for (const w of words) {
    for (const f of formats) {
      if (!f.prefixe || !w.startsWith(f.prefixe)) continue;
      // Un chiffre doit suivre le préfixe (évite « Facture », « FDM »…).
      if (!(w.length > f.prefixe.length && /\d/.test(w[f.prefixe.length]))) continue;
      // Longueur : si renseignée -> exacte ; sinon -> n'importe quelle longueur.
      if (f.longueur && w.length !== f.longueur) continue;

      if (f.retirer_lettres) {
        // On ne garde que les chiffres, sans zéros de tête : F26 -> 26, CV016 -> 16, F01C -> 1
        const digits = w.replace(/\D/g, '');
        if (!digits) return '';
        const noLead = digits.replace(/^0+/, '');
        return noLead === '' ? '0' : noLead;
      }
      return w;
    }
  }
  return '';
};

const computeFactureVente = async (id_compte, id_dossier, id_exercice, date_debut, date_fin) => {
  // Formats paramétrés (préfixe + longueur)
  const params = await db.parametrageVente.findAll({
    where: { id_compte: parseInt(id_compte, 10), id_dossier: parseInt(id_dossier, 10) },
  });
  const formats = params
    .map((p) => ({ prefixe: String(p.prefixe_facture || '').trim(), longueur: p.longueur_facture, retirer_lettres: !!p.retirer_lettres }))
    .filter((f) => f.prefixe); // seul le préfixe est requis ; la longueur est optionnelle

  const dateFilter = (date_debut && date_fin)
    ? 'AND dateecriture BETWEEN :date_debut AND :date_fin'
    : '';

  const replacements = {
    id_compte: parseInt(id_compte, 10),
    id_dossier: parseInt(id_dossier, 10),
    id_exercice: parseInt(id_exercice, 10),
  };
  if (date_debut && date_fin) {
    replacements.date_debut = date_debut;
    replacements.date_fin = date_fin;
  }

  const query = `
    SELECT id, id_ecriture, dateecriture, comptegen, compteaux, piece, libelle,
           (SELECT code FROM codejournals WHERE id = journals.id_journal) AS code_journal,
           COALESCE(debit,0)  AS debit,
           COALESCE(credit,0) AS credit
    FROM journals
    WHERE id_compte  = :id_compte
      AND id_dossier = :id_dossier
      AND id_exercice = :id_exercice
      AND id_journal IN (SELECT id FROM codejournals WHERE type = 'VENTE')
      AND LEFT(TRIM(comptegen), 2) = '70'
      ${dateFilter}
    ORDER BY dateecriture ASC, id ASC
  `;

  const rows = await db.sequelize.query(query, {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT,
  });

  const lignes = rows
    .map((r) => ({
      id: r.id,
      id_ecriture: r.id_ecriture,
      dateecriture: r.dateecriture,
      comptegen: r.comptegen,
      compteaux: r.compteaux,
      piece: r.piece,
      libelle: r.libelle,
      code_journal: r.code_journal,
      numero_facture: extractNumero(r.libelle, formats),
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    }))
    // On ne garde que les lignes dont le libellé contient un numéro valide (préfixe + longueur).
    .filter((l) => l.numero_facture);

  return { lignes, nbFormats: formats.length };
};

// Calcule l'écart de séquence + le flag anomalie par ligne.
//anomalie si écart != 1.
const withSequenceFlags = (lignes) => {
  const toNum = (s) => {
    const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
  };
  const sorted = [...lignes].sort((a, b) => {
    const ca = String(a.code_journal || '');
    const cb = String(b.code_journal || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return (toNum(a.numero_facture) ?? Number.MAX_SAFE_INTEGER) - (toNum(b.numero_facture) ?? Number.MAX_SAFE_INTEGER);
  });
  let prevNum = null;
  let prevGroup = null;
  sorted.forEach((r) => {
    const grp = String(r.code_journal || '');
    const num = toNum(r.numero_facture);
    let ecart = null;
    let anomalie = false;
    if (grp === prevGroup && prevNum != null && num != null) {
      ecart = num - prevNum;
      // écart 0 = même facture (plusieurs lignes) = normal ; seul un trou (> 1) = anomalie
      anomalie = ecart > 1;
    }
    r.ecart = ecart;
    r.anomalie = anomalie;
    prevNum = num;
    prevGroup = grp;
  });
  return sorted;
};

// Données calculées en live
exports.getFactureVente = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const result = await computeFactureVente(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    return res.status(200).json({ state: true, data: result, count: result.lignes.length });
  } catch (error) {
    console.error('[FACTURE_VENTE] error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

const scopeOf = (id_compte, id_dossier, id_exercice, id_periode) => ({
  id_compte: parseInt(id_compte, 10),
  id_dossier: parseInt(id_dossier, 10),
  id_exercice: parseInt(id_exercice, 10),
  id_periode: (id_periode !== undefined && id_periode !== '') ? parseInt(id_periode, 10) : null,
});

// Stats pour le dashboard : nombre de lignes ENREGISTRÉES (table).
exports.getStats = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    const total = await db.factureVenteAnomalies.count({ where: scope });
    const anomalies = await db.factureVenteAnomalies.count({ where: { ...scope, anomalie: true } });

    return res.json({
      state: true,
      data: { total_anomalies: anomalies, total, restantes: anomalies, nonValide: anomalies },
    });
  } catch (error) {
    console.error('[FACTURE_VENTE] stats error:', error);
    return res.status(500).json({ state: false, msg: 'Erreur serveur', error: error.message });
  }
};

// Lit les résultats enregistrés (table) + le nb de formats paramétrés (live, pour l'info).
exports.getStored = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    const rows = await db.factureVenteAnomalies.findAll({
      where: scope,
      order: [['dateecriture', 'ASC'], ['id_journal', 'ASC']],
    });

    const nbFormats = await db.parametrageVente.count({
      where: { id_compte: scope.id_compte, id_dossier: scope.id_dossier },
    });

    const lignes = rows.map((r) => ({
      id: r.id_journal,
      id_ecriture: r.id_ecriture,
      dateecriture: r.dateecriture,
      comptegen: r.comptegen,
      compteaux: r.compteaux,
      piece: r.piece,
      libelle: r.libelle,
      code_journal: r.code_journal,
      numero_facture: r.numero_facture,
      ecart: r.ecart,
      anomalie: !!r.anomalie,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    }));

    return res.json({ state: true, data: { lignes, nbFormats, revised: rows.length > 0 }, count: lignes.length });
  } catch (error) {
    console.error('[FACTURE_VENTE] stored error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Réviser = recalcule + enregistre (remplace le périmètre).
exports.saveFactureVente = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin, id_periode } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const { lignes } = await computeFactureVente(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    const lignesFlags = withSequenceFlags(lignes);
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    await db.sequelize.transaction(async (t) => {
      await db.factureVenteAnomalies.destroy({ where: scope, transaction: t });
      if (lignesFlags.length > 0) {
        await db.factureVenteAnomalies.bulkCreate(
          lignesFlags.map((l) => ({
            ...scope,
            id_journal: l.id,
            id_ecriture: l.id_ecriture,
            code_journal: l.code_journal,
            comptegen: l.comptegen,
            compteaux: l.compteaux,
            piece: l.piece,
            libelle: l.libelle,
            numero_facture: l.numero_facture,
            dateecriture: l.dateecriture,
            debit: l.debit,
            credit: l.credit,
            ecart: l.ecart,
            anomalie: l.anomalie,
          })),
          { transaction: t }
        );
      }
    });

    const nbAnomalies = lignesFlags.filter((l) => l.anomalie).length;
    return res.json({ state: true, saved: lignesFlags.length, anomalies: nbAnomalies });
  } catch (error) {
    console.error('[FACTURE_VENTE] save error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};