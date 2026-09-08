const db = require('../../Models');
const { Op } = require('sequelize');

// Tolérance d'arrondi : en deçà, on considère l'écart comme nul (bruit de calcul flottant).
const TOL = 0.005;

const computeEquilibre = async (id_compte, id_dossier, id_exercice, date_debut, date_fin) => {
  const dateFilter = (date_debut && date_fin)
    ? 'AND dateecriture BETWEEN :date_debut AND :date_fin'
    : '';

  const query = `
    WITH par_ecriture AS (
      SELECT id_ecriture,
             SUM(COALESCE(debit,0))  AS td,
             SUM(COALESCE(credit,0)) AS tc,
             SUM(COALESCE(debit,0)) - SUM(COALESCE(credit,0)) AS ecart
      FROM journals
      WHERE id_compte  = :id_compte
        AND id_dossier = :id_dossier
        AND id_exercice = :id_exercice
        ${dateFilter}
      GROUP BY id_ecriture
    )
    SELECT * FROM (
      SELECT 'GLOBAL' AS type,
             NULL::text AS id_ecriture,
             COALESCE(SUM(td),0)    AS total_debit,
             COALESCE(SUM(tc),0)    AS total_credit,
             COALESCE(SUM(ecart),0) AS ecart
      FROM par_ecriture
      UNION ALL
      SELECT 'ECRITURE' AS type,
             id_ecriture::text,
             td, tc, ecart
      FROM par_ecriture
      WHERE ABS(ecart) > :tol
    ) u
    ORDER BY u.type, ABS(u.ecart) DESC
  `;

  const replacements = {
    id_compte: parseInt(id_compte, 10),
    id_dossier: parseInt(id_dossier, 10),
    id_exercice: parseInt(id_exercice, 10),
    tol: TOL,
  };
  if (date_debut && date_fin) {
    replacements.date_debut = date_debut;
    replacements.date_fin = date_fin;
  }

  const rows = await db.sequelize.query(query, {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT,
  });

  const globalRow = rows.find((r) => r.type === 'GLOBAL') || { total_debit: 0, total_credit: 0, ecart: 0 };
  const ecartGlobal = Number(globalRow.ecart) || 0;

  const ecritures = rows
    .filter((r) => r.type === 'ECRITURE')
    .map((r) => ({
      id_ecriture: r.id_ecriture,
      total_debit: Number(r.total_debit) || 0,
      total_credit: Number(r.total_credit) || 0,
      ecart: Number(r.ecart) || 0,
    }));

  return {
    global: {
      total_debit: Number(globalRow.total_debit) || 0,
      total_credit: Number(globalRow.total_credit) || 0,
      ecart: ecartGlobal,
      equilibre: Math.abs(ecartGlobal) <= TOL,
    },
    ecritures,
  };
};

// Données complètes (global + liste des écritures déséquilibrées) — pour l'affichage détaillé.
exports.getEquilibre = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const result = await computeEquilibre(id_compte, id_dossier, id_exercice, date_debut, date_fin);

    // Lignes détaillées (toutes les colonnes) des écritures déséquilibrées.
    let lignes = [];
    const ecritureIds = result.ecritures
      .map((e) => e.id_ecriture)
      .filter((v) => v !== null && v !== undefined && v !== '');
    if (ecritureIds.length > 0) {
      const whereClause = {
        id_compte: parseInt(id_compte, 10),
        id_dossier: parseInt(id_dossier, 10),
        id_exercice: parseInt(id_exercice, 10),
        id_ecriture: { [Op.in]: ecritureIds },
      };
      if (date_debut && date_fin) {
        whereClause.dateecriture = { [Op.between]: [date_debut, date_fin] };
      }
      lignes = await db.journals.findAll({
        where: whereClause,
        attributes: ['id', 'id_ecriture', 'dateecriture', 'comptegen', 'compteaux', 'piece', 'libelle', 'debit', 'credit', 'lettrage'],
        order: [['id_ecriture', 'ASC'], ['id', 'ASC']],
        raw: true,
      });
    }

    return res.status(200).json({ state: true, data: { ...result, lignes }, count: result.ecritures.length });
  } catch (error) {
    console.error('[EQUILIBRE_DC] error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

const scopeOf = (id_compte, id_dossier, id_exercice, id_periode) => ({
  id_compte: parseInt(id_compte, 10),
  id_dossier: parseInt(id_dossier, 10),
  id_exercice: parseInt(id_exercice, 10),
  id_periode: (id_periode !== undefined && id_periode !== '') ? parseInt(id_periode, 10) : null,
});

// Stats pour le dashboard : anomalies ENREGISTRÉES (table), pas de recalcul.
exports.getStats = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    const nbEcritures = await db.equilibreDcAnomalies.count({ where: { ...scope, type: 'ECRITURE' } });
    const globalRow = await db.equilibreDcAnomalies.findOne({ where: { ...scope, type: 'GLOBAL' } });
    const globalEquilibre = globalRow ? globalRow.equilibre : true;

    // Cas limite : global déséquilibré alors qu'aucune écriture ne dépasse la tolérance -> 1 anomalie.
    const nb = nbEcritures + ((!globalEquilibre && nbEcritures === 0) ? 1 : 0);

    return res.json({
      state: true,
      data: {
        total_anomalies: nb,
        total: nb,
        restantes: nb,
        nonValide: nb,
        nbEcrituresDesequilibrees: nbEcritures,
        global_ecart: globalRow ? Number(globalRow.ecart) || 0 : 0,
        global_equilibre: globalEquilibre,
      },
    });
  } catch (error) {
    console.error('[EQUILIBRE_DC] stats error:', error);
    return res.status(500).json({ state: false, msg: 'Erreur serveur', error: error.message });
  }
};

// Lit les anomalies enregistrées (table) + détail des lignes en live via id_ecriture.
exports.getStored = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { id_periode } = req.query;
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    const rows = await db.equilibreDcAnomalies.findAll({
      where: scope,
      order: [['type', 'ASC'], ['id', 'ASC']],
    });

    const globalRow = rows.find((r) => r.type === 'GLOBAL');
    const global = {
      total_debit: globalRow ? Number(globalRow.total_debit) || 0 : 0,
      total_credit: globalRow ? Number(globalRow.total_credit) || 0 : 0,
      ecart: globalRow ? Number(globalRow.ecart) || 0 : 0,
      equilibre: globalRow ? globalRow.equilibre : true,
    };

    const ecritures = rows
      .filter((r) => r.type === 'ECRITURE')
      .map((r) => ({
        id_ecriture: r.id_ecriture,
        total_debit: Number(r.total_debit) || 0,
        total_credit: Number(r.total_credit) || 0,
        ecart: Number(r.ecart) || 0,
      }));

    // Lignes détaillées (live) des écritures déséquilibrées
    let lignes = [];
    const ecritureIds = ecritures.map((e) => e.id_ecriture).filter((v) => v !== null && v !== undefined && v !== '');
    if (ecritureIds.length > 0) {
      lignes = await db.journals.findAll({
        where: {
          id_compte: scope.id_compte,
          id_dossier: scope.id_dossier,
          id_exercice: scope.id_exercice,
          id_ecriture: { [Op.in]: ecritureIds },
        },
        attributes: ['id', 'id_ecriture', 'dateecriture', 'comptegen', 'compteaux', 'piece', 'libelle', 'debit', 'credit', 'lettrage'],
        order: [['id_ecriture', 'ASC'], ['id', 'ASC']],
        raw: true,
      });
    }

    return res.json({ state: true, data: { global, ecritures, lignes, revised: !!globalRow }, count: ecritures.length });
  } catch (error) {
    console.error('[EQUILIBRE_DC] stored error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Réviser = recalcule + enregistre (remplace le périmètre).
exports.saveEquilibre = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin, id_periode } = req.query;

    if (!id_compte || !id_dossier || !id_exercice) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }

    const { global, ecritures } = await computeEquilibre(id_compte, id_dossier, id_exercice, date_debut, date_fin);
    const scope = scopeOf(id_compte, id_dossier, id_exercice, id_periode);

    await db.sequelize.transaction(async (t) => {
      await db.equilibreDcAnomalies.destroy({ where: scope, transaction: t });
      const records = [{
        ...scope,
        type: 'GLOBAL',
        id_ecriture: null,
        total_debit: global.total_debit,
        total_credit: global.total_credit,
        ecart: global.ecart,
        equilibre: global.equilibre,
      }];
      ecritures.forEach((e) => {
        records.push({
          ...scope,
          type: 'ECRITURE',
          id_ecriture: e.id_ecriture,
          total_debit: e.total_debit,
          total_credit: e.total_credit,
          ecart: e.ecart,
          equilibre: false,
        });
      });
      await db.equilibreDcAnomalies.bulkCreate(records, { transaction: t });
    });

    return res.json({ state: true, saved: ecritures.length });
  } catch (error) {
    console.error('[EQUILIBRE_DC] save error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};
