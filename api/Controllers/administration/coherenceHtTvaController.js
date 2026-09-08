const db = require('../../Models');

const computeCoherence = async (id_compte, id_dossier, id_exercice, date_debut, date_fin) => {
  const dateFilter = (date_debut && date_fin)
    ? 'AND dateecriture BETWEEN :date_debut AND :date_fin'
    : '';

  const query = `
    WITH base AS (
      SELECT id_ecriture, dateecriture, piece, libelle,
        COALESCE(debit,0)  AS l_debit,
        COALESCE(credit,0) AS l_credit,
        CASE WHEN LEFT(TRIM(comptegen),1) IN ('6','7')     THEN (COALESCE(debit,0)-COALESCE(credit,0)) ELSE 0 END AS ht,
        CASE WHEN LEFT(TRIM(comptegen),3) = '445'          THEN (COALESCE(debit,0)-COALESCE(credit,0)) ELSE 0 END AS tva,
        CASE WHEN LEFT(TRIM(comptegen),2) IN ('40','41') THEN (COALESCE(debit,0)-COALESCE(credit,0)) ELSE 0 END AS ttc,
        -- Retenue à la source : comptes 44x hors TVA (445). Elle règle la facture au même titre
        -- que le tiers → à intégrer du côté TTC (sinon TTC_tiers < HT+TVA = faux positif).
        CASE WHEN LEFT(TRIM(comptegen),2) = '44' AND LEFT(TRIM(comptegen),3) <> '445'
             THEN (COALESCE(debit,0)-COALESCE(credit,0)) ELSE 0 END AS retenue,
        CASE WHEN LEFT(TRIM(comptegen),1) IN ('6','7')   THEN 1 ELSE 0 END AS is_ht,
        CASE WHEN LEFT(TRIM(comptegen),2) IN ('40','41') THEN 1 ELSE 0 END AS is_tiers,
        CASE WHEN LEFT(TRIM(comptegen),1) = '6' THEN 1 ELSE 0 END AS is_achat,
        CASE WHEN LEFT(TRIM(comptegen),1) = '7' THEN 1 ELSE 0 END AS is_vente
      FROM journals
      WHERE id_compte  = :id_compte
        AND id_dossier = :id_dossier
        AND id_exercice = :id_exercice
        -- On ne contrôle que les journaux ACHAT et VENTE (là où sont les factures)
        AND id_journal IN (SELECT id FROM codejournals WHERE type IN ('ACHAT','VENTE'))
        ${dateFilter}
    ), parEcr AS (
      -- Unité = la FACTURE = (écriture, pièce). Une "écriture" peut être un gros lot (OD/FNP)
      -- qui contient plein de factures distinctes, chacune identifiée par sa pièce.
      -- On ne garde que les lignes AVEC une pièce (les vraies factures) → écarte les OD/primes.
      SELECT id_ecriture, TRIM(piece) AS piece,
        MIN(dateecriture) AS dateecriture,
        MAX(libelle)      AS libelle,
        SUM(l_debit)      AS total_debit,
        SUM(l_credit)     AS total_credit,
        ABS(SUM(ht))      AS ht,
        ABS(SUM(tva))     AS tva,
        ABS(SUM(ttc))     AS ttc,
        ABS(SUM(retenue)) AS retenue,
        SUM(is_ht)        AS n_ht,
        SUM(is_tiers)     AS n_tiers,
        SUM(is_achat)     AS n_achat,
        SUM(is_vente)     AS n_vente
      FROM base
      WHERE piece IS NOT NULL AND TRIM(piece) <> ''
      GROUP BY id_ecriture, TRIM(piece)
    )
    SELECT id_ecriture, dateecriture, piece, libelle, total_debit, total_credit, ht, tva, ttc, retenue, n_achat, n_vente,
           -- TTC réellement réglé = tiers (net) + retenue à la source
           (ttc + retenue)                            AS ttc_reel,
           ROUND(ABS((ttc + retenue) - (ht + tva))::numeric, 2)      AS ecart,
           (ROUND(ABS((ttc + retenue) - (ht + tva))::numeric, 2) > 0) AS ecart_ttc,
           (ROUND((tva - ht)::numeric, 2) > 0)                        AS tva_sup_ht,
           (ROUND((ht - (ttc + retenue))::numeric, 2) > 0)            AS ht_sup_ttc
    FROM parEcr
    WHERE n_ht > 0 AND n_tiers > 0
      AND ( ROUND(ABS((ttc + retenue) - (ht + tva))::numeric, 2) > 0
            OR ROUND((tva - ht)::numeric, 2) > 0
            OR ROUND((ht - (ttc + retenue))::numeric, 2) > 0 )
    ORDER BY dateecriture ASC, id_ecriture ASC
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

  // Lignes détaillées de chaque facture flaguée (toutes ses lignes de journal),
  // pour l'affichage repliable : on voit HT, TVA, tiers, retenue…
  const detailByKey = {};
  const ecritureIds = [...new Set(rows.map((r) => r.id_ecriture))];
  if (ecritureIds.length > 0) {
    const detailRows = await db.sequelize.query(
      `SELECT id_ecriture, TRIM(piece) AS piece, TRIM(comptegen) AS comptegen, compteaux, libelle,
              COALESCE(debit,0) AS debit, COALESCE(credit,0) AS credit
       FROM journals
       WHERE id_compte = :id_compte AND id_dossier = :id_dossier AND id_exercice = :id_exercice
         AND id_journal IN (SELECT id FROM codejournals WHERE type IN ('ACHAT','VENTE'))
         AND id_ecriture IN (:ecritureIds)
         ${dateFilter}
       ORDER BY id_ecriture, id`,
      {
        replacements: { ...replacements, ecritureIds },
        type: db.Sequelize.QueryTypes.SELECT,
      }
    );
    detailRows.forEach((l) => {
      const key = `${l.id_ecriture}||${l.piece}`;
      (detailByKey[key] || (detailByKey[key] = [])).push({
        comptegen: l.comptegen,
        compteaux: l.compteaux,
        libelle: l.libelle,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      });
    });
  }

  const lignes = rows.map((r) => {
    const motifs = [];
    if (r.ecart_ttc) motifs.push('TTC ≠ HT+TVA');
    if (r.tva_sup_ht) motifs.push('TVA > HT');
    if (r.ht_sup_ttc) motifs.push('HT > TTC');
    const nA = Number(r.n_achat) || 0;
    const nV = Number(r.n_vente) || 0;
    const type = (nA > 0 && nV > 0) ? 'Mixte' : (nV > 0 ? 'Vente' : 'Achat');
    const det = detailByKey[`${r.id_ecriture}||${r.piece}`] || [];
    const compte_ht = (det.find((d) => {
      const c = String(d.comptegen || '').trim();
      return c[0] === '6' || c[0] === '7';
    }) || {}).comptegen || null;
    return {
      id_ecriture: r.id_ecriture,
      dateecriture: r.dateecriture,
      piece: r.piece,
      libelle: r.libelle,
      type,
      compte_ht,
      total_debit: Number(r.total_debit) || 0,
      total_credit: Number(r.total_credit) || 0,
      ht: Number(r.ht) || 0,
      tva: Number(r.tva) || 0,
      ttc: Number(r.ttc) || 0,
      retenue: Number(r.retenue) || 0,
      ttc_reel: Number(r.ttc_reel) || 0,
      ecart: Number(r.ecart) || 0,
      motifs,
      detail: detailByKey[`${r.id_ecriture}||${r.piece}`] || [],
    };
  });

  return { lignes, nbEcritures: lignes.length };
};

// Données détaillées (écritures incohérentes).
exports.getCoherenceHtTva = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const result = await computeCoherence(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    return res.status(200).json({ state: true, data: result, count: result.lignes.length });
  } catch (error) {
    console.error('[COHERENCE_HT_TVA] error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Stats pour le dashboard : nombre d'anomalies ENREGISTRÉES (lues depuis la table,
// pas de recalcul). Cohérent avec l'écran Détails qui affiche aussi la table.
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

    const nbEcritures = await db.coherenceHtTvaAnomalies.count({ where: scope });

    return res.json({
      state: true,
      data: {
        total_anomalies: nbEcritures,
        total: nbEcritures,
        restantes: nbEcritures,
        nonValide: nbEcritures,
      },
    });
  } catch (error) {
    console.error('[COHERENCE_HT_TVA] stats error:', error);
    return res.status(500).json({ state: false, msg: 'Erreur serveur', error: error.message });
  }
};

// Lit les anomalies enregistrées (table) + rattache le détail en live via id_ecriture.
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

    const rows = await db.coherenceHtTvaAnomalies.findAll({
      where: scope,
      order: [['dateecriture', 'ASC'], ['id', 'ASC']],
    });

    // Détail (lignes de l'écriture) rattaché en live
    const detailByKey = {};
    const ecritureIds = [...new Set(rows.map((r) => r.id_ecriture))];
    if (ecritureIds.length > 0) {
      const detailRows = await db.sequelize.query(
        `SELECT id_ecriture, TRIM(piece) AS piece, TRIM(comptegen) AS comptegen, compteaux, libelle,
                COALESCE(debit,0) AS debit, COALESCE(credit,0) AS credit
         FROM journals
         WHERE id_compte = :id_compte AND id_dossier = :id_dossier AND id_exercice = :id_exercice
           AND id_journal IN (SELECT id FROM codejournals WHERE type IN ('ACHAT','VENTE'))
           AND id_ecriture IN (:ecritureIds)
         ORDER BY id_ecriture, id`,
        {
          replacements: {
            id_compte: scope.id_compte, id_dossier: scope.id_dossier,
            id_exercice: scope.id_exercice, ecritureIds,
          },
          type: db.Sequelize.QueryTypes.SELECT,
        }
      );
      detailRows.forEach((l) => {
        const key = `${l.id_ecriture}||${l.piece}`;
        (detailByKey[key] || (detailByKey[key] = [])).push({
          comptegen: l.comptegen,
          compteaux: l.compteaux,
          libelle: l.libelle,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        });
      });
    }

    const lignes = rows.map((r) => ({
      id_ecriture: r.id_ecriture,
      dateecriture: r.dateecriture,
      piece: r.piece,
      libelle: r.libelle,
      type: r.type,
      ht: Number(r.ht) || 0,
      tva: Number(r.tva) || 0,
      ttc: Number(r.ttc) || 0,
      ttc_reel: Number(r.ttc) || 0,
      ecart: Number(r.ecart) || 0,
      motifs: r.motifs ? String(r.motifs).split(' | ') : [],
      detail: detailByKey[`${r.id_ecriture}||${r.piece}`] || [],
    }));

    return res.json({ state: true, data: { lignes, nbEcritures: lignes.length }, count: lignes.length });
  } catch (error) {
    console.error('[COHERENCE_HT_TVA] stored error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Enregistre les anomalies dans la table coherence_ht_tva_anomalies.
// Remplace les anomalies existantes du même périmètre (compte/dossier/exercice/période).
exports.saveCoherence = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin, id_periode } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const { lignes } = await computeCoherence(id_compte, id_dossier, id_exercice, date_debut, date_fin);

    const scope = {
      id_compte: parseInt(id_compte, 10),
      id_dossier: parseInt(id_dossier, 10),
      id_exercice: parseInt(id_exercice, 10),
      id_periode: (id_periode !== undefined && id_periode !== '') ? parseInt(id_periode, 10) : null,
    };

    await db.sequelize.transaction(async (t) => {
      await db.coherenceHtTvaAnomalies.destroy({ where: scope, transaction: t });
      if (lignes.length > 0) {
        await db.coherenceHtTvaAnomalies.bulkCreate(
          lignes.map((l) => ({
            ...scope,
            id_ecriture: l.id_ecriture,
            piece: l.piece,
            id_num_compte: l.compte_ht,
            dateecriture: l.dateecriture,
            libelle: l.libelle,
            type: l.type,
            ht: l.ht,
            tva: l.tva,
            ttc: l.ttc_reel,
            ecart: l.ecart,
            motifs: (l.motifs || []).join(' | '),
          })),
          { transaction: t }
        );
      }
    });

    return res.json({ state: true, saved: lignes.length });
  } catch (error) {
    console.error('[COHERENCE_HT_TVA] save error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};
