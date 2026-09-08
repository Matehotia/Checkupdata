const db = require('../../Models');

const computeSequence = async (id_compte, id_dossier, id_exercice, date_debut, date_fin) => {
  // Règles Trésorerie du dossier
  const regles = await db.parametrageTresorerie.findAll({
    where: { id_compte: parseInt(id_compte, 10), id_dossier: parseInt(id_dossier, 10) },
  });

  // Aucune règle → rien à afficher (on ne montre pas tout le journal de banque).
  if (regles.length === 0) {
    return { lignes: [], nbRegles: 0 };
  }

  // Construit les conditions LIKE (OU) à partir des règles, en paramétré.
  const replacements = {
    id_compte: parseInt(id_compte, 10),
    id_dossier: parseInt(id_dossier, 10),
    id_exercice: parseInt(id_exercice, 10),
  };
  const conds = [];
  regles.forEach((r, i) => {
    const key = `kw${i}`;
    const mot = String(r.mot_cle || '').trim();
    if (!mot) return;
    if (r.operateur === 'com_par') {
      replacements[key] = `${mot}%`;
    } else if (r.operateur === '=') {
      replacements[key] = mot; // ILIKE sans joker = égalité insensible à la casse
    } else {
      replacements[key] = `%${mot}%`; // 'cont' par défaut
    }
    conds.push(`TRIM(libelle) ILIKE :${key}`);
  });

  if (conds.length === 0) {
    return { lignes: [], nbRegles: regles.length };
  }

  const dateFilter = (date_debut && date_fin)
    ? 'AND dateecriture BETWEEN :date_debut AND :date_fin'
    : '';
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
      AND id_journal IN (SELECT id FROM codejournals WHERE type = 'BANQUE')
      -- On exclut la ligne du compte banque lui-même (512x) : on ne garde que la contrepartie.
      AND LEFT(TRIM(comptegen), 3) <> '512'
      ${dateFilter}
      AND ( ${conds.join(' OR ')} )
    ORDER BY dateecriture ASC, id ASC
  `;

  const rows = await db.sequelize.query(query, {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT,
  });

  // Extrait le 1er token après « CHQ » dans le libellé = le numéro de chèque.
  // Ex. "CHQ 7305401 Randrianarisoa…" -> "7305401"
  const extractNumero = (lib) => {
    const m = String(lib || '').match(/CHQ\s+(\S+)/i);
    return m ? m[1] : '';
  };

  const lignes = rows.map((r) => ({
    id: r.id,
    id_ecriture: r.id_ecriture,
    dateecriture: r.dateecriture,
    comptegen: r.comptegen,
    compteaux: r.compteaux,
    piece: r.piece,
    libelle: r.libelle,
    code_journal: r.code_journal,
    numero_cheque: extractNumero(r.libelle),
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
  }));

  return { lignes, nbRegles: regles.length };
};

// Calcule l'écart de séquence + le flag anomalie par ligne.
// Tri par code journal puis n° de chèque croissant ; anomalie si écart (n − n précédent) != 1.
const withSequenceFlags = (lignes) => {
  const toNum = (s) => {
    const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
    return isNaN(n) ? null : n;
  };
  const sorted = [...lignes].sort((a, b) => {
    const ca = String(a.code_journal || '');
    const cb = String(b.code_journal || '');
    if (ca !== cb) return ca.localeCompare(cb);
    return (toNum(a.numero_cheque) ?? Number.MAX_SAFE_INTEGER) - (toNum(b.numero_cheque) ?? Number.MAX_SAFE_INTEGER);
  });
  let prevNum = null;
  let prevGroup = null;
  sorted.forEach((r) => {
    const grp = String(r.code_journal || '');
    const num = toNum(r.numero_cheque);
    let ecart = null;
    let anomalie = false;
    if (grp === prevGroup && prevNum != null && num != null) {
      ecart = num - prevNum;
      anomalie = ecart !== 1;
    }
    r.ecart = ecart;
    r.anomalie = anomalie;
    prevNum = num;
    prevGroup = grp;
  });
  return sorted;
};

// Données détaillées (écritures de banque dont le libellé matche les règles Trésorerie).
exports.getSequenceCheque = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const result = await computeSequence(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    return res.status(200).json({ state: true, data: result, count: result.lignes.length });
  } catch (error) {
    console.error('[SEQUENCE_CHEQUE] error:', error);
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

    const total = await db.sequenceChequeAnomalies.count({ where: scope });
    const anomalies = await db.sequenceChequeAnomalies.count({ where: { ...scope, anomalie: true } });

    return res.json({
      state: true,
      data: { total_anomalies: anomalies, total, restantes: anomalies, nonValide: anomalies },
    });
  } catch (error) {
    console.error('[SEQUENCE_CHEQUE] stats error:', error);
    return res.status(500).json({ state: false, msg: 'Erreur serveur', error: error.message });
  }
};

// Lit les résultats enregistrés (table) + le nb de règles Trésorerie (live, pour l'info).
exports.getStored = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    const rows = await db.sequenceChequeAnomalies.findAll({
      where: scope,
      order: [['dateecriture', 'ASC'], ['id_journal', 'ASC']],
    });

    const nbRegles = await db.parametrageTresorerie.count({
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
      numero_cheque: r.numero_cheque,
      ecart: r.ecart,
      anomalie: !!r.anomalie,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
    }));

    return res.json({ state: true, data: { lignes, nbRegles, revised: rows.length > 0 }, count: lignes.length });
  } catch (error) {
    console.error('[SEQUENCE_CHEQUE] stored error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Réviser = recalcule + enregistre (remplace le périmètre).
exports.saveSequence = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin, id_periode } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const { lignes } = await computeSequence(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    const lignesFlags = withSequenceFlags(lignes);
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    await db.sequelize.transaction(async (t) => {
      await db.sequenceChequeAnomalies.destroy({ where: scope, transaction: t });
      if (lignesFlags.length > 0) {
        await db.sequenceChequeAnomalies.bulkCreate(
          lignesFlags.map((l) => ({
            ...scope,
            id_journal: l.id,
            id_ecriture: l.id_ecriture,
            code_journal: l.code_journal,
            comptegen: l.comptegen,
            compteaux: l.compteaux,
            piece: l.piece,
            libelle: l.libelle,
            numero_cheque: l.numero_cheque,
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
    console.error('[SEQUENCE_CHEQUE] save error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};
