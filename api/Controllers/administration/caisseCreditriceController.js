const db = require('../../Models');

/**
 * Contrôle « Caisse créditrice » : une caisse (comptes 53x) ne peut jamais être négative.
 * On calcule le SOLDE CUMULÉ par compteaux (ordonné par date), et on signale les lignes
 * où ce cumul devient créditeur (< 0) — c.-à-d. la caisse a été négative à ce moment-là.
 */
const computeCaisse = async (id_compte, id_dossier, id_exercice, date_debut, date_fin) => {
  const dateFilter = (date_debut && date_fin)
    ? 'AND dateecriture BETWEEN :date_debut AND :date_fin'
    : '';

  const query = `
    WITH base AS (
      SELECT
        id, id_ecriture, dateecriture, comptegen, compteaux, piece, libelle,
        COALESCE(debit, 0)::numeric  AS debit,
        COALESCE(credit, 0)::numeric AS credit,
        TRIM(compteaux) AS compte_caisse
      FROM journals
      WHERE id_compte  = :id_compte
        AND id_dossier = :id_dossier
        AND id_exercice = :id_exercice
        AND TRIM(COALESCE(compteaux, '')) LIKE '53%'
        ${dateFilter}
    ), cumule AS (
      SELECT
        b.*,
        SUM(b.debit - b.credit) OVER (
          PARTITION BY b.compte_caisse
          ORDER BY b.dateecriture ASC, b.id ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS solde_cumule
      FROM base b
    )
    -- On ne renvoie QUE les lignes où le solde cumulé est négatif (caisse créditrice).
    SELECT id, id_ecriture, dateecriture, comptegen, compteaux, compte_caisse,
           piece, libelle, debit, credit, solde_cumule
    FROM cumule
    WHERE solde_cumule < 0
    ORDER BY compte_caisse ASC, dateecriture ASC, id ASC
  `;

  const replacements = {
    id_compte: parseInt(id_compte, 10),
    id_dossier: parseInt(id_dossier, 10),
    id_exercice: parseInt(id_exercice, 10),
  };
  if (date_debut && date_fin) {
    replacements.date_debut = date_debut;
    replacements.date_fin = date_fin;
  }

  const rows = await db.sequelize.query(query, {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT,
  });

  const lignes = rows.map((r) => ({
    id: r.id,
    id_ecriture: r.id_ecriture,
    dateecriture: r.dateecriture,
    comptegen: r.comptegen,
    compteaux: r.compteaux,
    compte: r.compte_caisse,
    piece: r.piece,
    libelle: r.libelle,
    debit: Number(r.debit) || 0,
    credit: Number(r.credit) || 0,
    solde_cumule: Number(r.solde_cumule) || 0,
  }));

  const comptes = [...new Set(lignes.map((l) => l.compte))];
  const nbNegatives = lignes.filter((l) => l.solde_cumule < 0).length;

  return { lignes, nbComptes: comptes.length, nbNegatives };
};

// Données détaillées (lignes où la caisse est créditrice).
exports.getCaisseCreditrice = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const result = await computeCaisse(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    return res.status(200).json({ state: true, data: result, count: result.lignes.length });
  } catch (error) {
    console.error('[CAISSE_CREDITRICE] error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Stats pour le dashboard : nombre d'anomalies ENREGISTRÉES (table), pas de recalcul.
exports.getStats = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;

    const scope = {
      id_compte: parseInt(id_compte, 10),
      id_dossier: parseInt(id_dossier, 10),
      id_exercice: parseInt(id_exercice, 10),
      id_periode: (id_periode !== undefined && id_periode !== '') ? parseInt(id_periode, 10) : null,
    };

    const nb = await db.caisseCreditriceAnomalies.count({ where: scope });

    return res.json({
      state: true,
      data: {
        total_anomalies: nb,
        total: nb,
        restantes: nb,
        nonValide: nb,
      },
    });
  } catch (error) {
    console.error('[CAISSE_CREDITRICE] stats error:', error);
    return res.status(500).json({ state: false, msg: 'Erreur serveur', error: error.message });
  }
};

// Lit les anomalies enregistrées (table).
exports.getStored = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;

    const scope = {
      id_compte: parseInt(id_compte, 10),
      id_dossier: parseInt(id_dossier, 10),
      id_exercice: parseInt(id_exercice, 10),
      id_periode: (id_periode !== undefined && id_periode !== '') ? parseInt(id_periode, 10) : null,
    };

    const rows = await db.caisseCreditriceAnomalies.findAll({
      where: scope,
      order: [['compte', 'ASC'], ['dateecriture', 'ASC'], ['id_journal', 'ASC']],
    });

    const lignes = rows.map((r) => ({
      id: r.id_journal,
      id_ecriture: r.id_ecriture,
      dateecriture: r.dateecriture,
      comptegen: r.comptegen,
      compte: r.compte,
      piece: r.piece,
      libelle: r.libelle,
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      solde_cumule: Number(r.solde_cumule) || 0,
    }));

    const comptes = [...new Set(lignes.map((l) => l.compte))];
    return res.json({
      state: true,
      data: { lignes, nbComptes: comptes.length, nbNegatives: lignes.length },
      count: lignes.length,
    });
  } catch (error) {
    console.error('[CAISSE_CREDITRICE] stored error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Réviser = recalcule + enregistre (remplace le périmètre).
exports.saveCaisse = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin, id_periode } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const { lignes } = await computeCaisse(id_compte, id_dossier, id_exercice, date_debut, date_fin);

    const scope = {
      id_compte: parseInt(id_compte, 10),
      id_dossier: parseInt(id_dossier, 10),
      id_exercice: parseInt(id_exercice, 10),
      id_periode: (id_periode !== undefined && id_periode !== '') ? parseInt(id_periode, 10) : null,
    };

    await db.sequelize.transaction(async (t) => {
      await db.caisseCreditriceAnomalies.destroy({ where: scope, transaction: t });
      if (lignes.length > 0) {
        await db.caisseCreditriceAnomalies.bulkCreate(
          lignes.map((l) => ({
            ...scope,
            id_journal: l.id,
            id_ecriture: l.id_ecriture,
            compte: l.compte,
            comptegen: l.comptegen,
            piece: l.piece,
            libelle: l.libelle,
            dateecriture: l.dateecriture,
            debit: l.debit,
            credit: l.credit,
            solde_cumule: l.solde_cumule,
          })),
          { transaction: t }
        );
      }
    });

    return res.json({ state: true, saved: lignes.length });
  } catch (error) {
    console.error('[CAISSE_CREDITRICE] save error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};