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
           -- Taux de TVA = TVA / HT (en %) ; 0 si HT nul pour éviter la division par zéro
           CASE WHEN ht > 0 THEN ROUND((tva / ht * 100)::numeric, 2) ELSE 0 END AS taux,
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
      taux: Number(r.taux) || 0,
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

// Données détaillées (factures avec leur taux de TVA).
exports.getTauxTva = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const result = await computeCoherence(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    return res.status(200).json({ state: true, data: result, count: result.lignes.length });
  } catch (error) {
    console.error('[TAUX_TVA] error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Stats pour le dashboard : compte les anomalies ENREGISTRÉES (table), + restantes (non validées).
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

    const verifiees = await db.tauxTvaAnomalies.count({ where: scope });
    const anomalies = await db.tauxTvaAnomalies.count({ where: { ...scope, anomalie: true } });
    const restantes = await db.tauxTvaAnomalies.count({ where: { ...scope, anomalie: true, valide: false } });

    return res.json({
      state: true,
      data: {
        total_anomalies: anomalies,
        total: verifiees,
        restantes,
        nonValide: restantes,
      },
    });
  } catch (error) {
    console.error('[TAUX_TVA] stats error:', error);
    return res.status(500).json({ state: false, msg: 'Erreur serveur', error: error.message });
  }
};

const detailForEcritures = async (scope, ecritureIds) => {
  const detailByKey = {};
  if (ecritureIds.length === 0) return detailByKey;
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
  return detailByKey;
};

// Lit les anomalies enregistrées (table) + détail live via id_ecriture.
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

    const rows = await db.tauxTvaAnomalies.findAll({
      where: scope,
      order: [['dateecriture', 'ASC'], ['id', 'ASC']],
    });

    const ecritureIds = [...new Set(rows.map((r) => r.id_ecriture))];
    const detailByKey = await detailForEcritures(scope, ecritureIds);

    const lignes = rows.map((r) => ({
      id: r.id,
      id_ecriture: r.id_ecriture,
      dateecriture: r.dateecriture,
      piece: r.piece,
      libelle: r.libelle,
      type: r.type,
      ht: Number(r.ht) || 0,
      tva: Number(r.tva) || 0,
      taux: Number(r.taux) || 0,
      ttc: Number(r.ttc) || 0,
      ecart: Number(r.ecart) || 0,
      motifs: r.motifs ? String(r.motifs).split(' | ') : [],
      anomalie: !!r.anomalie,
      valide: !!r.valide,
      commentaire: r.commentaire || '',
      detail: detailByKey[`${r.id_ecriture}||${r.piece}`] || [],
    }));

    return res.json({ state: true, data: { lignes, nbEcritures: lignes.length }, count: lignes.length });
  } catch (error) {
    console.error('[TAUX_TVA] stored error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Réviser = recalcule + enregistre (en conservant valide/commentaire des anomalies déjà présentes).
exports.saveTauxTva = async (req, res) => {
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

    // Taux paramétrés du dossier (tauxtva) : déductible (achats) vs collectée (ventes)
    const params = await db.tauxtva.findAll({
      where: { id_compte: scope.id_compte, id_dossier: scope.id_dossier },
    });
    const dedTaux = params.filter((p) => p.deductible).map((p) => Number(p.taux));
    const colTaux = params.filter((p) => !p.deductible).map((p) => Number(p.taux));
    const TOL_TAUX = 5; // tolérance en points de % : anomalie si |taux_param − taux_réel| >= 5

    // anomalie = true si le taux réel ne correspond à AUCUN taux attendu du type (écart >= TOL)
    const computeAnomalie = (type, tauxReel) => {
      const tr = Number(tauxReel || 0);
      // Taux 0 % (TVA absente) → toujours une anomalie, peu importe le paramétrage
      if (Math.abs(tr) < 0.005) return true;
      let set;
      if (type === 'Achat') set = dedTaux;
      else if (type === 'Vente') set = colTaux;
      else set = [...dedTaux, ...colTaux]; // Mixte → les deux jeux
      if (!set || set.length === 0) return false; // aucun paramétrage → on ne flague pas
      const match = set.some((tp) => Math.abs(tp - tr) < TOL_TAUX);
      return !match;
    };

    // Conserver valide/commentaire des anomalies existantes (clé = id_ecriture||piece)
    const existing = await db.tauxTvaAnomalies.findAll({ where: scope });
    const keep = {};
    existing.forEach((e) => {
      keep[`${e.id_ecriture}||${e.piece || ''}`] = { valide: e.valide, commentaire: e.commentaire };
    });

    await db.sequelize.transaction(async (t) => {
      await db.tauxTvaAnomalies.destroy({ where: scope, transaction: t });
      if (lignes.length > 0) {
        await db.tauxTvaAnomalies.bulkCreate(
          lignes.map((l) => {
            const prev = keep[`${l.id_ecriture}||${l.piece || ''}`] || {};
            return {
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
              taux: l.taux,
              ecart: l.ecart,
              motifs: (l.motifs || []).join(' | '),
              anomalie: computeAnomalie(l.type, l.taux),
              valide: prev.valide || false,
              commentaire: prev.commentaire || null,
            };
          }),
          { transaction: t }
        );
      }
    });

    return res.json({ state: true, saved: lignes.length });
  } catch (error) {
    console.error('[TAUX_TVA] save error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Met à jour valide / commentaire d'une anomalie.
exports.updateAnomalie = async (req, res) => {
  try {
    const { id } = req.params;
    const { valide, commentaire } = req.body;
    const row = await db.tauxTvaAnomalies.findByPk(id);
    if (!row) return res.status(404).json({ state: false, message: 'Introuvable' });

    if (valide !== undefined) row.valide = valide === true || valide === 'true';
    if (commentaire !== undefined) row.commentaire = commentaire;
    await row.save();

    return res.json({ state: true, data: row });
  } catch (error) {
    console.error('[TAUX_TVA] update error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};
