const db = require('../../Models');
const { Op, Sequelize } = require('sequelize');

/**
 * Helper function to insert or update commentaire/validation for an anomaly
 * Uses the new table revision_commentaire_anomalies with id_controle and id_jnl
 */
const insertOrUpdateCommentaire = async ({
  id_compte,
  id_dossier,
  id_exercice,
  id_periode,
  id_controle,
  id_jnl,
  valide,
  commentaire
}) => {
  const finalPeriodeId = (id_periode !== undefined && id_periode !== null && id_periode !== '') ? parseInt(id_periode, 10) : null;
  const finalValide = valide || false;
  const finalCommentaire = commentaire || '';

  // Convertir en nombres
  const idCompteNum = parseInt(id_compte, 10);
  const idDossierNum = parseInt(id_dossier, 10);
  const idExerciceNum = parseInt(id_exercice, 10);

  // Requêtes paramétrées (bind) : plus d'interpolation directe dans le SQL.
  const scopeReplacements = {
    id_compte: idCompteNum,
    id_dossier: idDossierNum,
    id_exercice: idExerciceNum,
    id_controle: String(id_controle),
    id_jnl: String(id_jnl),
    id_periode: finalPeriodeId,
  };
  const periodeCond = finalPeriodeId === null ? 'IS NULL' : '= :id_periode';

  // Vérifier si un enregistrement existe déjà (par id_controle + id_jnl)
  const existing = await db.sequelize.query(`
    SELECT id FROM revision_commentaire_anomalies
    WHERE id_compte = :id_compte
      AND id_dossier = :id_dossier
      AND id_exercice = :id_exercice
      AND id_controle = :id_controle
      AND id_jnl = :id_jnl
      AND id_periode ${periodeCond}
  `, { replacements: scopeReplacements, type: db.Sequelize.QueryTypes.SELECT });

  if (existing.length > 0) {
    // UPDATE
    await db.sequelize.query(`
      UPDATE revision_commentaire_anomalies
      SET valide = :valide,
          commentaire = :commentaire,
          "updatedAt" = NOW()
      WHERE id_compte = :id_compte
        AND id_dossier = :id_dossier
        AND id_exercice = :id_exercice
        AND id_controle = :id_controle
        AND id_jnl = :id_jnl
        AND id_periode ${periodeCond}
    `, { replacements: { ...scopeReplacements, valide: finalValide, commentaire: finalCommentaire } });
  } else {
    // INSERT avec id_controle et id_jnl
    await db.sequelize.query(`
      INSERT INTO revision_commentaire_anomalies (
        id_compte, id_dossier, id_exercice, id_periode, id_controle, id_jnl, valide, commentaire, "createdAt", "updatedAt"
      ) VALUES (
        :id_compte, :id_dossier, :id_exercice, :id_periode, :id_controle, :id_jnl, :valide, :commentaire, NOW(), NOW()
      )
    `, { replacements: { ...scopeReplacements, valide: finalValide, commentaire: finalCommentaire } });
  }
};
const insertLineAnomaly = async ({
  id_compte,
  id_dossier,
  id_exercice,
  line,
  type,
  id_controle,
  message,
  idPeriode = null
}) => {
  try {
    // Use the journal line ID as id_jnl (individual per line)
    const lineId = line.id;
    // Extract the account number from the line (comptegen or compteaux)
    const numCompte = line.comptegen || line.compteaux || '';
    const finalPeriodeId = (idPeriode !== undefined && idPeriode !== null && idPeriode !== 'NULL' && idPeriode !== '') ? parseInt(idPeriode, 10) : null;

    const insertQuery = `
      INSERT INTO table_controle_anomalies (
        id_compte, id_dossier, id_exercice, id_jnl, id_num_compte, "codeCtrl", id_controle, message,
        id_periode, "createdAt", "updatedAt"
      ) VALUES (
        :id_compte, :id_dossier, :id_exercice, :id_jnl, :id_num_compte, :codeCtrl,
        :id_controle, :message,
        :id_periode, NOW(), NOW()
      )
      RETURNING id
    `;

    const result = await db.sequelize.query(insertQuery, {
      replacements: {
        id_compte: parseInt(id_compte, 10),
        id_dossier: parseInt(id_dossier, 10),
        id_exercice: parseInt(id_exercice, 10),
        id_jnl: String(lineId),
        id_num_compte: String(numCompte),
        codeCtrl: String(type),
        id_controle: String(id_controle),
        message: String(message),
        id_periode: finalPeriodeId,
      },
      type: db.Sequelize.QueryTypes.INSERT,
    });
    return result[0]?.id || null;
  } catch (error) {
    console.error(`[insertLineAnomaly] ERROR for line ${line?.id}:`, error.message);
    return null;
  }
};

// Version groupée : insère N anomalies de ligne en UN SEUL INSERT multi-lignes.
// Produit exactement les mêmes valeurs/échappements que insertLineAnomaly (l'id retourné
// n'étant utilisé nulle part). Réduit des centaines d'allers-retours à une seule requête.
const insertLineAnomaliesBatch = async (anomalies) => {
  if (!anomalies || anomalies.length === 0) return;

  const replacements = {};
  const valuesSql = anomalies.map(({
    id_compte, id_dossier, id_exercice, line, type, id_controle, message, idPeriode = null
  }, i) => {
    const numCompte = line.comptegen || line.compteaux || '';
    const finalPeriodeId = (idPeriode !== undefined && idPeriode !== null && idPeriode !== 'NULL' && idPeriode !== '') ? parseInt(idPeriode, 10) : null;
    replacements[`c${i}`] = parseInt(id_compte, 10);
    replacements[`d${i}`] = parseInt(id_dossier, 10);
    replacements[`e${i}`] = parseInt(id_exercice, 10);
    replacements[`jnl${i}`] = String(line.id);
    replacements[`num${i}`] = String(numCompte);
    replacements[`ctrl${i}`] = String(type);
    replacements[`ctl${i}`] = String(id_controle);
    replacements[`msg${i}`] = String(message);
    replacements[`per${i}`] = finalPeriodeId;
    return `(:c${i}, :d${i}, :e${i}, :jnl${i}, :num${i}, :ctrl${i}, :ctl${i}, :msg${i}, :per${i}, NOW(), NOW())`;
  }).join(',\n');

  const insertQuery = `
    INSERT INTO table_controle_anomalies (
      id_compte, id_dossier, id_exercice, id_jnl, id_num_compte, "codeCtrl", id_controle, message,
      id_periode, "createdAt", "updatedAt"
    ) VALUES ${valuesSql}
  `;

  await db.sequelize.query(insertQuery, { replacements, type: db.Sequelize.QueryTypes.INSERT });
};

// Récupérer les contrôles de révision pour un exercice, et les créer s'ils n'existent pas
exports.getOrCreateRevisionControles = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin, id_periode } = req.query;


    // Rechercher la période correspondante si dates fournies
    let idPeriode = null;
    if (id_periode) {
      // Utiliser l'id_periode fourni explicitement
      idPeriode = parseInt(id_periode, 10);
    } else if (date_debut && date_fin) {
      // Sinon chercher par dates (fallback)
      const debut = date_debut.split('T')[0];
      const fin = date_fin.split('T')[0];

      const periodeQuery = `
        SELECT id, date_debut, date_fin FROM periodes 
        WHERE id_compte = ${id_compte} 
          AND id_dossier = ${id_dossier} 
          AND id_exercice = ${id_exercice}
          AND date_debut <= '${fin}' 
          AND date_fin >= '${debut}'
        ORDER BY date_debut ASC
        LIMIT 1
      `;
      const periodeResult = await db.sequelize.query(periodeQuery, { type: db.Sequelize.QueryTypes.SELECT });
      if (periodeResult.length > 0) {
        idPeriode = periodeResult[0].id;
      }
    }

    // Vérifier si les contrôles existent déjà pour cet exercice (SQL)
    const existingQuery = `
      SELECT 
        c.*,
        m.anomalies as "matrix_anomalies"
      FROM table_revisions_controles c
      LEFT JOIN revisions_controles_matrices m 
        ON c.id_controle = m.id_controle AND c."Type" = m."Type"
      WHERE c.id_compte = ${id_compte} 
        AND c.id_dossier = ${id_dossier} 
        AND c.id_exercice = ${id_exercice}
        ${idPeriode ? `AND c.id_periode = ${idPeriode}` : ''}
    `;
    let existingControles = await db.sequelize.query(existingQuery, { type: db.Sequelize.QueryTypes.SELECT });

    // Recalculer dynamiquement le nombre d'anomalies "cas par cas" pour chaque contrôle
    if (existingControles.length > 0) {
      
      const anomaliesQuery = `
        WITH base AS (
          SELECT
            a.id_controle,
            a."codeCtrl" AS code_ctrl,
            a.id_num_compte,
            a.id_jnl,
            a.id_periode as anomalie_periode,
            c.id_periode as commentaire_periode,
            COALESCE(c.valide, false) AS valide,
            CASE
              WHEN a."codeCtrl" IN ('SENS_ECRITURE', 'SENS_SOLDE') THEN CONCAT(a."codeCtrl", '::COMPTE::', COALESCE(a.id_num_compte, ''))
              WHEN a."codeCtrl" IN ('UTIL_CPT_TVA') THEN CONCAT(a."codeCtrl", '::ECRITURE::', COALESCE(a.id_jnl, ''))
              WHEN a."codeCtrl" IN ('ATYPIQUE', 'IMMO_CHARGE') THEN CONCAT(a."codeCtrl", '::LIGNE::', a.id::text)
              ELSE CONCAT(a."codeCtrl", '::LIGNE::', a.id::text)
            END AS group_key
          FROM table_controle_anomalies a
          LEFT JOIN revision_commentaire_anomalies c
            ON c.id_controle = a.id_controle
            AND c.id_jnl = a.id_jnl
            AND a.id_compte = c.id_compte
            AND a.id_dossier = c.id_dossier
            AND a.id_exercice = c.id_exercice
            AND ((a.id_periode IS NULL AND c.id_periode IS NULL) OR (a.id_periode = c.id_periode))
          WHERE a.id_compte = ${id_compte}
            AND a.id_dossier = ${id_dossier}
            AND a.id_exercice = ${id_exercice}
            ${idPeriode !== null && idPeriode !== undefined ? `AND a.id_periode = ${idPeriode}` : 'AND a.id_periode IS NULL'}
        ), grouped AS (
          SELECT
            id_controle,
            group_key,
            BOOL_AND(valide = true) AS group_valide,
            COUNT(*) as group_count
          FROM base
          GROUP BY id_controle, group_key
        )
        SELECT 
          id_controle,
          COUNT(*) AS total_anomalies,
          SUM(CASE WHEN group_valide = false THEN 1 ELSE 0 END) AS non_valide_anomalies,
          SUM(CASE WHEN group_valide = true THEN 1 ELSE 0 END) AS valide_anomalies
        FROM grouped
        GROUP BY id_controle
      `;
      
      const anomaliesCounts = await db.sequelize.query(anomaliesQuery, { type: db.Sequelize.QueryTypes.SELECT });
      
      // Créer un map pour lookup rapide
      const anomaliesMap = {};
      for (const row of anomaliesCounts) {
        anomaliesMap[row.id_controle] = {
          total: parseInt(row.total_anomalies, 10),
          nonValide: parseInt(row.non_valide_anomalies, 10),
          valide: parseInt(row.valide_anomalies, 10)
        };
      }
      
      
      // Mettre à jour les contrôles avec les compteurs recalculés
      existingControles = existingControles.map(c => ({
        ...c,
        anomalies: anomaliesMap[c.id_controle]?.nonValide || 0,
        total_anomalies: anomaliesMap[c.id_controle]?.total || 0
      }));
      
    }

    // Si aucun contrôle n'existe, les créer à partir des matrices
    if (existingControles.length === 0) {

      // Vérifier qu'une période est sélectionnée (date_debut et date_fin fournis)
      if (!date_debut || !date_fin) {
        return res.json({
          state: true,
          controles: [],
          message: 'Veuillez sélectionner une période pour créer les contrôles de révision'
        });
      }

      // Récupérer toutes les matrices (SQL)
      const matricesQuery = `SELECT * FROM revisions_controles_matrices`;
      const matrices = await db.sequelize.query(matricesQuery, { type: db.Sequelize.QueryTypes.SELECT });

      // Insérer les nouveaux contrôles avec id_periode
      const insertedControles = [];
      for (const matrix of matrices) {
        const insertQuery = `
          INSERT INTO table_revisions_controles (
            id_compte, id_dossier, id_exercice, id_controle, "Type", compte, test, 
            description, anomalies, details, "Valider", "Commentaire", "Affichage", id_periode, "createdAt", "updatedAt"
          ) VALUES (
            ${id_compte}, ${id_dossier}, ${id_exercice}, '${matrix.id_controle}', 
            '${matrix.Type}', '${matrix.compte || ''}', '${matrix.test || ''}', 
            '${(matrix.description || '').replace(/'/g, "''")}', 0, '${(matrix.details || '').replace(/'/g, "''")}', 
            ${false}, '${(matrix.Commentaire || '').replace(/'/g, "''")}', 
            '${matrix.Affichage || 'ligne'}', ${idPeriode || 'NULL'}, NOW(), NOW()
          )
          RETURNING *
        `;
        const [newControle] = await db.sequelize.query(insertQuery, { type: db.Sequelize.QueryTypes.INSERT });
        // Ajouter matrix_anomalies au contrôle retourné
        newControle.matrix_anomalies = matrix.anomalies;
        insertedControles.push(newControle);
      }


      res.json({
        state: true,
        controles: insertedControles,
        message: 'Contrôles créés automatiquement à partir des matrices'
      });
    } else {

      res.json({
        state: true,
        controles: existingControles,
        message: 'Contrôles existants récupérés'
      });
    }
  } catch (error) {
    console.error('Error in getOrCreateRevisionControles:', error);
    res.status(500).json({
      state: false,
      message: 'Erreur lors de la récupération/création des contrôles de révision'
    });
  }
};

// Récupérer les contrôles par Type avec leurs comptes
exports.getControlesByType = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice, type } = req.params;
    const { id_periode } = req.query;


    let controles = await db.sequelize.query(`
      SELECT 
        c.*,
        CASE 
          WHEN c.compte IS NOT NULL AND LENGTH(c.compte) >= 2 
          THEN SUBSTRING(c.compte, 1, 2) 
          ELSE NULL 
        END as "comptePrefix",
        m.anomalies as "matrix_anomalies"
      FROM table_revisions_controles c
      LEFT JOIN revisions_controles_matrices m 
        ON c.id_controle = m.id_controle AND c."Type" = m."Type"
      WHERE c.id_compte = ${id_compte}
        AND c.id_dossier = ${id_dossier}
        AND c.id_exercice = ${id_exercice}
        AND c."Type" = '${type}'
        ${id_periode ? `AND c.id_periode = ${id_periode}` : ''}
    `, { type: db.Sequelize.QueryTypes.SELECT });

    // Recalculer dynamiquement le nombre d'anomalies "cas par cas" pour chaque contrôle
    if (controles.length > 0) {
      const controlesIds = controles.map(c => `'${c.id_controle}'`).join(',');
      
      const anomaliesQuery = `
        WITH base AS (
          SELECT
            a.id_controle,
            a."codeCtrl" AS code_ctrl,
            a.id_num_compte,
            a.id_jnl,
            COALESCE(c.valide, false) AS valide,
            CASE
              WHEN a."codeCtrl" IN ('SENS_ECRITURE', 'SENS_SOLDE') THEN CONCAT(a."codeCtrl", '::COMPTE::', COALESCE(a.id_num_compte, ''))
              WHEN a."codeCtrl" IN ('UTIL_CPT_TVA') THEN CONCAT(a."codeCtrl", '::ECRITURE::', COALESCE(a.id_jnl, ''))
              WHEN a."codeCtrl" IN ('ATYPIQUE', 'IMMO_CHARGE') THEN CONCAT(a."codeCtrl", '::LIGNE::', a.id::text)
              ELSE CONCAT(a."codeCtrl", '::LIGNE::', a.id::text)
            END AS group_key
          FROM table_controle_anomalies a
          LEFT JOIN revision_commentaire_anomalies c
            ON c.id_controle = a.id_controle
            AND c.id_jnl = a.id_jnl
            AND a.id_compte = c.id_compte
            AND a.id_dossier = c.id_dossier
            AND a.id_exercice = c.id_exercice
            AND ((a.id_periode IS NULL AND c.id_periode IS NULL) OR (a.id_periode = c.id_periode))
          WHERE a.id_compte = ${id_compte}
            AND a.id_dossier = ${id_dossier}
            AND a.id_exercice = ${id_exercice}
            AND a.id_controle IN (${controlesIds})
            ${id_periode ? `AND a.id_periode = ${id_periode}` : ''}
        ), grouped AS (
          SELECT
            id_controle,
            group_key,
            BOOL_AND(valide = true) AS group_valide
          FROM base
          GROUP BY id_controle, group_key
        )
        SELECT 
          id_controle,
          COUNT(*) AS total_anomalies,
          SUM(CASE WHEN group_valide = false THEN 1 ELSE 0 END) AS non_valide_anomalies
        FROM grouped
        GROUP BY id_controle
      `;
      
      const anomaliesCounts = await db.sequelize.query(anomaliesQuery, { type: db.Sequelize.QueryTypes.SELECT });
      
      // Créer un map pour lookup rapide
      const anomaliesMap = {};
      for (const row of anomaliesCounts) {
        anomaliesMap[row.id_controle] = {
          total: parseInt(row.total_anomalies, 10),
          nonValide: parseInt(row.non_valide_anomalies, 10)
        };
      }
      
      // Mettre à jour les contrôles avec les compteurs recalculés
      controles = controles.map(c => ({
        ...c,
        anomalies: anomaliesMap[c.id_controle]?.nonValide || 0,
        total_anomalies: anomaliesMap[c.id_controle]?.total || 0
      }));
    }

    res.json({
      state: true,
      controles: controles,
      count: controles.length
    });
  } catch (error) {
    console.error('Error in getControlesByType:', error);
    res.status(500).json({
      state: false,
      message: 'Erreur lors de la récupération des contrôles par type'
    });
  }
};

// Récupérer les écritures du journal par préfixes de compte
exports.getJournalEcrituresByComptePrefix = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { prefixes } = req.query; // Tableau de préfixes: ["53", "60", "40"]


    if (!prefixes || prefixes.length === 0) {
      return res.json({
        state: true,
        ecritures: [],
        message: 'Aucun préfixe fourni'
      });
    }

    // Construire les conditions LIKE pour chaque préfixe (SQL)
    const prefixArray = Array.isArray(prefixes) ? prefixes : [prefixes];
    const likeConditions = prefixArray.map(prefix =>
      `(comptegen LIKE '${prefix}%' OR compteaux LIKE '${prefix}%')`
    ).join(' OR ');

    const query = `
      SELECT * FROM journals
      WHERE id_compte = ${id_compte}
        AND id_dossier = ${id_dossier}
        AND id_exercice = ${id_exercice}
        AND (${likeConditions})
      ORDER BY dateecriture ASC
    `;

    const ecritures = await db.sequelize.query(query, { type: db.Sequelize.QueryTypes.SELECT });

    res.json({
      state: true,
      ecritures: ecritures,
      count: ecritures.length
    });
  } catch (error) {
    console.error('Error in getJournalEcrituresByComptePrefix:', error);
    res.status(500).json({
      state: false,
      message: 'Erreur lors de la récupération des écritures du journal'
    });
  }
};

// Exécuter le contrôle pour un Type (lier les écritures aux contrôles)
exports.executeControle = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice, type } = req.params;


    // 1. Récupérer tous les contrôles de ce Type (SQL)
    const controlesQuery = `
      SELECT * FROM table_revisions_controles
      WHERE id_compte = ${id_compte}
        AND id_dossier = ${id_dossier}
        AND id_exercice = ${id_exercice}
        AND "Type" = '${type}'
    `;
    const controles = await db.sequelize.query(controlesQuery, { type: db.Sequelize.QueryTypes.SELECT });

    if (controles.length === 0) {
      return res.status(404).json({
        state: false,
        message: 'Aucun contrôle trouvé pour ce type'
      });
    }

    // 2. Extraire les préfixes de compte uniques
    const prefixes = [...new Set(
      controles
        .filter(c => c.compte && c.compte.length >= 2)
        .map(c => c.compte.substring(0, 2))
    )];

    if (prefixes.length === 0) {
      return res.json({
        state: true,
        message: 'Aucun compte associé à ces contrôles',
        ecrituresLiees: 0
      });
    }

    // 3. Chercher les écritures du journal correspondant aux préfixes (SQL)
    const likeConditions = prefixes.map(prefix =>
      `(comptegen LIKE '${prefix}%' OR compteaux LIKE '${prefix}%')`
    ).join(' OR ');

    const ecrituresQuery = `
      SELECT * FROM journals
      WHERE id_compte = ${id_compte}
        AND id_dossier = ${id_dossier}
        AND id_exercice = ${id_exercice}
        AND (${likeConditions})
    `;
    const ecritures = await db.sequelize.query(ecrituresQuery, { type: db.Sequelize.QueryTypes.SELECT });

    // 4. Lier chaque écriture au bon contrôle
    let ecrituresLiees = 0;
    for (const ecriture of ecritures) {
      // Trouver le contrôle correspondant (par préfixe de compte)
      const compteEcriture = ecriture.comptegen || ecriture.compteaux || '';
      const prefixEcriture = compteEcriture.substring(0, 2);

      const controleCorrespondant = controles.find(c =>
        c.compte && c.compte.substring(0, 2) === prefixEcriture
      );

      if (controleCorrespondant) {
        const updateQuery = `
          UPDATE journals
          SET id_revision_controle = ${controleCorrespondant.id}
          WHERE id = ${ecriture.id}
        `;
        await db.sequelize.query(updateQuery, { type: db.Sequelize.QueryTypes.UPDATE });
        ecrituresLiees++;
      }
    }

    // 5. Mettre à jour le nombre d'anomalies pour chaque contrôle (SQL)
    for (const controle of controles) {
      const countQuery = `
        SELECT COUNT(*) as count FROM journals
        WHERE id_revision_controle = ${controle.id}
      `;
      const [result] = await db.sequelize.query(countQuery, { type: db.Sequelize.QueryTypes.SELECT });
      const countEcritures = parseInt(result.count, 10);

      const updateControleQuery = `
        UPDATE table_revisions_controles
        SET anomalies = ${countEcritures}
        WHERE id = ${controle.id}
      `;
      await db.sequelize.query(updateControleQuery, { type: db.Sequelize.QueryTypes.UPDATE });
    }

    // 6. Récupérer les écritures liées pour affichage (SQL)
    const controlesIds = controles.map(c => c.id).join(',');
    const ecrituresLieesQuery = `
      SELECT * FROM journals
      WHERE id_compte = ${id_compte}
        AND id_dossier = ${id_dossier}
        AND id_exercice = ${id_exercice}
        AND id_revision_controle IN (${controlesIds})
      ORDER BY dateecriture ASC
    `;
    const ecrituresLieesData = await db.sequelize.query(ecrituresLieesQuery, { type: db.Sequelize.QueryTypes.SELECT });

    res.json({
      state: true,
      message: 'Contrôle exécuté avec succès',
      ecrituresLiees: ecrituresLiees,
      controlesCount: controles.length,
      prefixesUtilises: prefixes,
      ecritures: ecrituresLieesData
    });
  } catch (error) {
    console.error('Error in executeControle:', error);
    res.status(500).json({
      state: false,
      message: 'Erreur lors de l\'exécution du contrôle'
    });
  }
};

// Exécuter le contrôle global (reset + recopie + détecter anomalies)
exports.executeAll = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;
    const { date_debut, date_fin, id_periode, type: reqType } = req.query;

    // Révision scopée à UN seul type de contrôle (depuis une entrée séparée de la page Détails).
    // Whitelist stricte -> interpolation SQL sûre. Sans type -> révision globale (comportement historique).
    const VALID_TYPES = ['ATYPIQUE', 'SENS_SOLDE', 'SENS_ECRITURE', 'IMMO_CHARGE', 'UTIL_CPT_TVA', 'EXISTENCE'];
    const scopeType = (reqType && VALID_TYPES.includes(reqType)) ? reqType : null;
    const typeCtrlCond = scopeType ? `AND "Type" = '${scopeType}'` : '';        // table_revisions_controles / matrices
    const typeAnoCond = scopeType ? `AND "codeCtrl" = '${scopeType}'` : '';      // table_controle_anomalies


    let idPeriode = null;
    if (id_periode) {
      idPeriode = parseInt(id_periode, 10);
    } else if (date_debut && date_fin) {
      // Fallback: chercher par dates
      const debut = date_debut.split('T')[0];
      const fin = date_fin.split('T')[0];

      const periodeQuery = `
        SELECT id, date_debut, date_fin FROM periodes 
        WHERE id_compte = ${id_compte} 
          AND id_dossier = ${id_dossier} 
          AND id_exercice = ${id_exercice}
          AND date_debut <= '${fin}' 
          AND date_fin >= '${debut}'
        ORDER BY date_debut ASC
        LIMIT 1
      `;
      const periodeResult = await db.sequelize.query(periodeQuery, { type: db.Sequelize.QueryTypes.SELECT });
      if (periodeResult.length > 0) {
        idPeriode = periodeResult[0].id;
      }
    }

    // Construire la condition de date pour les requêtes SQL
    let dateCondition = '';
    if (date_debut && date_fin) {
      dateCondition = `AND dateecriture >= '${date_debut}' AND dateecriture <= '${date_fin}'`;
    }

    // 2. Sauvegarder les anomalies existantes (STRICTEMENT pour la période courante)
    const existingCommentairesQuery = `
      SELECT id_controle, id_jnl, valide, commentaire, id_periode
      FROM revision_commentaire_anomalies
      WHERE id_compte = ${id_compte}
        AND id_dossier = ${id_dossier}
        AND id_exercice = ${id_exercice}
        AND id_periode ${idPeriode === null ? 'IS NULL' : `= ${idPeriode}`}
    `;
    const existingCommentaires = await db.sequelize.query(existingCommentairesQuery, { type: db.Sequelize.QueryTypes.SELECT });
    const anomaliesMap = {};
    for (const item of existingCommentaires) {
      const key = `${item.id_periode || 'NULL'}_${item.id_jnl}_${item.id_controle}`;
      anomaliesMap[key] = {
        valide: item.valide,
        commentaire: item.commentaire,
        id_periode: item.id_periode
      };
    }

    // 2. Supprimer les anciens contrôles pour cette période seulement (SQL)
    await db.sequelize.query(`
      DELETE FROM table_revisions_controles
      WHERE id_compte = ${id_compte}
        AND id_dossier = ${id_dossier}
        AND id_exercice = ${id_exercice}
        AND id_periode ${idPeriode === null ? 'IS NULL' : `= ${idPeriode}`}
        ${typeCtrlCond}
    `, { type: db.Sequelize.QueryTypes.DELETE });

    // Supprimer UNIQUEMENT les anomalies de la période courante (pas les autres périodes)
    // Pour éviter le bug multi-onglets ou les anomalies d'un autre onglet disparaissent
    if (idPeriode !== null) {
      await db.sequelize.query(`
        DELETE FROM table_controle_anomalies
        WHERE id_compte = ${id_compte}
          AND id_dossier = ${id_dossier}
          AND id_exercice = ${id_exercice}
          AND id_periode = ${idPeriode}
          ${typeAnoCond}
      `, { type: db.Sequelize.QueryTypes.DELETE });
    } else {
      // Si pas de période spécifiée, supprimer uniquement les anomalies sans période
      await db.sequelize.query(`
        DELETE FROM table_controle_anomalies
        WHERE id_compte = ${id_compte}
          AND id_dossier = ${id_dossier}
          AND id_exercice = ${id_exercice}
          AND id_periode IS NULL
          ${typeAnoCond}
      `, { type: db.Sequelize.QueryTypes.DELETE });
    }  // console.log('Deleted anomalies without period (preserving anomalies with any period)');

    // 2. Recopier depuis la matrice (avec Affichage et id_periode) (SQL) - SEULEMENT les contrôles validés
    const matricesQuery = `SELECT * FROM revisions_controles_matrices WHERE "Valider" = true ${typeCtrlCond}`;
    const matrices = await db.sequelize.query(matricesQuery, { type: db.Sequelize.QueryTypes.SELECT });

    const newControles = [];
    for (const matrix of matrices) {
      const insertQuery = `
        INSERT INTO table_revisions_controles (
          id_compte, id_dossier, id_exercice, id_controle, "Type", compte, test,
          description, anomalies, details, "Valider", "Commentaire", "Affichage", id_periode, "createdAt", "updatedAt"
        ) VALUES (
          ${id_compte}, ${id_dossier}, ${id_exercice}, '${matrix.id_controle}',
          '${matrix.Type}', '${matrix.compte || ''}', '${matrix.test || ''}',
          '${(matrix.description || '').replace(/'/g, "''")}', 0, '${(matrix.details || '').replace(/'/g, "''")}',
          ${false}, '${(matrix.Commentaire || '').replace(/'/g, "''")}',
          '${matrix.Affichage || 'ligne'}', ${idPeriode || 'NULL'}, NOW(), NOW()
        )
        RETURNING *
      `;
      const [newControle] = await db.sequelize.query(insertQuery, { type: db.Sequelize.QueryTypes.INSERT });
      newControles.push(newControle);
    }

    // Si aucun contrôle n'a été créé, ne pas continuer (sinon Object.keys(undefined) => 500)
    // Cela arrive notamment quand aucune matrice n'est "Valider" = true.
    if (newControles.length === 0) {
      return res.status(400).json({
        message: 'Aucun contrôle n\'a été créé depuis la matrice (aucune ligne matrice validée).',
        matricesCount: matrices.length,
        id_compte,
        id_dossier,
        id_exercice,
      });
    }

    // 2b. Remettre Valider à false dans la matrice après copie
    // SUPPRIMÉ: L'utilisateur veut que Valider reste à true dans la matrice
    // if (matrices.length > 0) {
    //   const matrixIds = matrices.map(m => m.id).join(',');
    //   await db.sequelize.query(`
    //     UPDATE revisions_controles_matrices 
    //     SET "Valider" = false 
    //     WHERE id IN (${matrixIds})
    //   `, { type: db.Sequelize.QueryTypes.UPDATE });
    // }

    // 3. Grouper les contrôles par Type
    const controlesByType = {};
    for (const controleWrapper of newControles) {
      // Le résultat de la requête SQL est un tableau, prendre le premier élément
      const controle = Array.isArray(controleWrapper) ? controleWrapper[0] : controleWrapper;
      const type = controle["Type"];
      if (!controlesByType[type]) {
        controlesByType[type] = [];
      }
      controlesByType[type].push(controle);
    }

    // 4. Exécuter le contrôle pour chaque Type
    const resultsByType = {};

    for (const [type, controles] of Object.entries(controlesByType)) {

      let anomaliesDetectees = [];

      // ===== CONTRÔLE EXISTENCE =====
      if (type === 'EXISTENCE') {
        // Préfixes (3 car.) à vérifier, rattachés à leur contrôle
        const prefixInfos = controles
          .map(c => ({ controle: c, prefix: c.compte ? c.compte.substring(0, 3) : null }))
          .filter(x => x.prefix);

        const distinctPrefixes = [...new Set(prefixInfos.map(x => x.prefix))];

        // UNE seule requête : quels préfixes ont au moins une écriture (au lieu d'un SELECT par contrôle)
        let existsPrefixes = new Set();
        if (distinctPrefixes.length > 0) {
          const valuesList = distinctPrefixes.map(p => `('${p.replace(/'/g, "''")}')`).join(',');
          const existQuery = `
            WITH prefixes(p) AS (VALUES ${valuesList})
            SELECT pr.p AS p
            FROM prefixes pr
            WHERE EXISTS (
              SELECT 1 FROM journals
              WHERE id_compte = ${id_compte}
                AND id_dossier = ${id_dossier}
                AND id_exercice = ${id_exercice}
                AND (comptegen LIKE pr.p || '%' OR compteaux LIKE pr.p || '%')
                ${dateCondition}
            )
          `;
          const rows = await db.sequelize.query(existQuery, { type: db.Sequelize.QueryTypes.SELECT });
          existsPrefixes = new Set(rows.map(r => r.p));
        }

        const existenceAnomalies = [];   // insertion groupée
        const commentairesToCopy = [];    // recopie conditionnelle
        const updateTuples = [];          // mise à jour groupée des contrôles

        for (const { controle, prefix } of prefixInfos) {
          if (existsPrefixes.has(prefix)) {
            // Compte existant : pas d'anomalie
            const detailsJson = JSON.stringify([{ message: 'Compte existant - pas d\'anomalie' }]).replace(/'/g, "''");
            updateTuples.push(`(${controle.id}, 0, '${detailsJson}')`);
          } else {
            const messageAnomalie = `Le compte ${controle.compte} n'existe pas - Aucune écriture trouvée`;
            anomaliesDetectees.push({
              controleId: controle.id,
              compte: controle.compte,
              message: messageAnomalie
            });

            const key = `${idPeriode || 'NULL'}_${controle.compte}_${controle.id_controle}`;
            const savedData = anomaliesMap[key] || {};

            // Pour EXISTENCE : id_jnl = compte, id_num_compte = compte (via faux objet "line")
            existenceAnomalies.push({
              id_compte,
              id_dossier,
              id_exercice,
              line: { id: controle.compte, comptegen: controle.compte },
              type,
              id_controle: controle.id_controle,
              message: messageAnomalie,
              idPeriode
            });

            if (savedData.valide !== undefined) {
              commentairesToCopy.push({
                id_compte,
                id_dossier,
                id_exercice,
                id_periode: savedData.id_periode || idPeriode,
                id_controle: controle.id_controle,
                id_jnl: controle.compte,
                valide: savedData.valide,
                commentaire: savedData.commentaire
              });
            }

            const detailsJson = JSON.stringify([{ anomalie: messageAnomalie }]).replace(/'/g, "''");
            updateTuples.push(`(${controle.id}, 1, '${detailsJson}')`);
          }
        }

        // Insertion groupée des anomalies EXISTENCE
        await insertLineAnomaliesBatch(existenceAnomalies);

        // Recopie des commentaires sauvegardés (rare, conditionnel)
        for (const c of commentairesToCopy) {
          await insertOrUpdateCommentaire(c);
        }

        // Mise à jour groupée de tous les contrôles en UNE requête
        if (updateTuples.length > 0) {
          await db.sequelize.query(`
            UPDATE table_revisions_controles AS t
            SET anomalies = v.anomalies::int,
                details = v.details::text
            FROM (VALUES ${updateTuples.join(',')}) AS v(id, anomalies, details)
            WHERE t.id = v.id::int
          `, { type: db.Sequelize.QueryTypes.UPDATE });
        }
      }
      // ===== CONTRÔLE SENS_SOLDE =====
      else if (type === 'SENS_SOLDE') {
        const sensSoldeAnomalies = []; // collecte pour insertion groupée
        // Récupérer toutes les écritures pour les comptes concernés (SQL)
        const comptesPrefixes = [...new Set(
          controles
            .filter(c => c.compte && c.compte.length >= 2)
            .map(c => c.compte.substring(0, 2))
        )];

        if (comptesPrefixes.length === 0) continue;

        // Construire les conditions pour chercher les écritures (SQL)
        const likeConditions = comptesPrefixes.map(prefix =>
          `(comptegen LIKE '${prefix}%' OR compteaux LIKE '${prefix}%')`
        ).join(' OR ');

        const ecrituresQuery = `
          SELECT id, comptegen, compteaux, debit, credit FROM journals
          WHERE id_compte = ${id_compte}
            AND id_dossier = ${id_dossier}
            AND id_exercice = ${id_exercice}
            AND (${likeConditions})
            ${dateCondition}
        `;
        const ecritures = await db.sequelize.query(ecrituresQuery, { type: db.Sequelize.QueryTypes.SELECT });

        // Log des dates pour vérifier le filtre
        if (ecritures.length > 0) {
          const dates = ecritures.map(e => e.dateecriture).sort();
        }

        // Grouper les écritures par compte complet (4-6 caractères)
        const ecrituresByCompte = {};
        for (const ecriture of ecritures) {
          const compte = ecriture.comptegen || ecriture.compteaux;
          if (!compte) continue;

          if (!ecrituresByCompte[compte]) {
            ecrituresByCompte[compte] = [];
          }
          ecrituresByCompte[compte].push(ecriture);
        }

        // Calculer le solde pour chaque compte et vérifier les anomalies
        for (const [compte, ecrituresCompte] of Object.entries(ecrituresByCompte)) {
          const totalDebit = ecrituresCompte.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
          const totalCredit = ecrituresCompte.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
          const solde = totalDebit - totalCredit;

          // Trouver le contrôle correspondant (par préfixe)
          const comptePrefix = compte.substring(0, 2);
          const controle = controles.find(c =>
            c.compte && c.compte.substring(0, 2) === comptePrefix
          );

          if (!controle) continue;

          const testType = controle.test ? controle.test.toUpperCase() : null;
          let anomalieMessage = null;

          // Normaliser le solde pour éviter -0.00
          const soldeNormalise = Math.abs(solde) < 0.01 ? 0 : solde;

          // anomalies - utiliser soldeNormalise pour les conditions aussi
          if (testType === 'DEBITEUR' && soldeNormalise < 0) {
            anomalieMessage = `Le compte "${compte}" doit avoir un solde débiteur (solde actuel: ${soldeNormalise.toFixed(2)})`;
          } else if (testType === 'CREDITEUR' && soldeNormalise > 0) {
            anomalieMessage = `Le compte "${compte}" doit avoir un solde créditeur (solde actuel: ${soldeNormalise.toFixed(2)})`;
          } else if (testType === 'NULL' && soldeNormalise !== 0) {
            anomalieMessage = `Le compte "${compte}" doit avoir un solde nul (solde actuel: ${soldeNormalise.toFixed(2)})`;
          }

          if (anomalieMessage) {
            // Créer une anomalie individuelle pour CHAQUE ligne du compte
            for (const ligne of ecrituresCompte) {
              const key = `${idPeriode || 'NULL'}_${ligne.id}_${controle.id_controle}`;
              const savedData = anomaliesMap[key] || {};


              // Collecter l'anomalie pour insertion groupée (cf. flush après la boucle)
              sensSoldeAnomalies.push({
                id_compte,
                id_dossier,
                id_exercice,
                line: ligne,
                type,
                id_controle: controle.id_controle,
                message: anomalieMessage,
                idPeriode
              });

              // Si une anomalie a été créée et qu'il existe des données sauvegardées, les recopier (par id_controle + id_jnl)
              if (savedData.valide !== undefined) {
                await insertOrUpdateCommentaire({
                  id_compte,
                  id_dossier,
                  id_exercice,
                  id_periode: savedData.id_periode || idPeriode,
                  id_controle: controle.id_controle,
                  id_jnl: ligne.id, // id_jnl = ID de la ligne journal
                  valide: savedData.valide,
                  commentaire: savedData.commentaire
                });
              }

            }

            // Ajouter au résultat (une seule entrée pour l'affichage)
            anomaliesDetectees.push({
              controleId: controle.id,
              compte: compte,
              test: testType,
              solde: solde,
              soldeNormalise: soldeNormalise,
              message: anomalieMessage,
              nbLignes: ecrituresCompte.length
            });
          }
        }

        // Insertion groupée de toutes les anomalies SENS_SOLDE (1 requête au lieu de N)
        await insertLineAnomaliesBatch(sensSoldeAnomalies);

        // Mettre à jour les contrôles avec les anomalies (SQL)
        for (const controle of controles) {
          const anomaliesControle = anomaliesDetectees.filter(a => a.controleId === controle.id);
          // SENS_SOLDE: compter par compte (une anomalie = un compte avec solde anormal)
          const anomaliesCount = anomaliesControle.length;
          const detailsJson = anomaliesControle.length > 0
            ? JSON.stringify(anomaliesControle).replace(/'/g, "''")
            : JSON.stringify([{ message: 'Pas d\'anomalie détectée' }]).replace(/'/g, "''");

          const updateQuery = `
            UPDATE table_revisions_controles
            SET anomalies = ${anomaliesCount},
                details = '${detailsJson}'
            WHERE id = ${controle.id}
          `;
          await db.sequelize.query(updateQuery, { type: db.Sequelize.QueryTypes.UPDATE });
        }
      }

      // ===== CONTRÔLE SENS_ECRITURE =====
      else if (type === 'SENS_ECRITURE') {
        const sensEcritureAnomalies = []; // collecte pour insertion groupée
        // Récupérer les préfixes de comptes concernés
        const comptesPrefixes = [...new Set(
          controles
            .filter(c => c.compte && c.compte.length >= 2)
            .map(c => c.compte.substring(0, 2))
        )];

        if (comptesPrefixes.length === 0) continue;

        // Construire les conditions pour chercher les écritures (SQL)
        const likeConditions = comptesPrefixes.map(prefix =>
          `(comptegen LIKE '${prefix}%' OR compteaux LIKE '${prefix}%')`
        ).join(' OR ');

        const ecrituresQuery = `
          SELECT id, comptegen, compteaux, debit, credit FROM journals
          WHERE id_compte = ${id_compte}
            AND id_dossier = ${id_dossier}
            AND id_exercice = ${id_exercice}
            AND (${likeConditions})
            ${dateCondition}
        `;
        const ecritures = await db.sequelize.query(ecrituresQuery, { type: db.Sequelize.QueryTypes.SELECT });

        // Log des dates pour vérifier le filtre
        if (ecritures.length > 0) {
          const dates = ecritures.map(e => e.dateecriture).sort();
        }

        // Grouper les écritures par compte complet
        const ecrituresByCompte = {};
        for (const ecriture of ecritures) {
          const compte = ecriture.comptegen || ecriture.compteaux;
          if (!compte) continue;

          if (!ecrituresByCompte[compte]) {
            ecrituresByCompte[compte] = [];
          }
          ecrituresByCompte[compte].push(ecriture);
        }

        // Vérifier chaque compte - une anomalie par ligne anormale
        for (const [compte, ecrituresCompte] of Object.entries(ecrituresByCompte)) {
          // Trouver le contrôle correspondant
          const comptePrefix = compte.substring(0, 2);
          const controle = controles.find(c =>
            c.compte && c.compte.substring(0, 2) === comptePrefix
          );

          if (!controle) continue;

          const testType = controle.test ? controle.test.toUpperCase() : null;

          // Trouver les lignes anormales selon le test
          let lignesAnormales = [];
          if (testType === 'CREDIT') {
            lignesAnormales = ecrituresCompte.filter(e => (parseFloat(e.credit) || 0) > 0);
          } else if (testType === 'DEBIT') {
            lignesAnormales = ecrituresCompte.filter(e => (parseFloat(e.debit) || 0) > 0);
          }

          if (lignesAnormales.length > 0) {
          }

          // Créer une anomalie individuelle pour CHAQUE ligne anormale
          for (const ligne of lignesAnormales) {
            const key = `${idPeriode || 'NULL'}_${ligne.id}_${controle.id_controle}`;
            const savedData = anomaliesMap[key] || {};
            const messageSimple = controle.message || `Anomalie de sens d'imputation pour le compte ${compte}`;


            // Collecter l'anomalie pour insertion groupée (cf. flush après la boucle)
            sensEcritureAnomalies.push({
              id_compte,
              id_dossier,
              id_exercice,
              line: ligne,
              type,
              id_controle: controle.id_controle,
              message: messageSimple,
              idPeriode
            });

            // Recopier les données sauvegardées si elles existent (par id_controle + id_jnl)
            if (savedData.valide !== undefined) {
              await insertOrUpdateCommentaire({
                id_compte,
                id_dossier,
                id_exercice,
                id_periode: savedData.id_periode || idPeriode,
                id_controle: controle.id_controle,
                id_jnl: ligne.id,
                valide: savedData.valide,
                commentaire: savedData.commentaire
              });
            }

          }

          // Ajouter au résultat si des lignes anormales existent
          if (lignesAnormales.length > 0) {
            const messageSimple = controle.message || `Anomalie de sens d'imputation pour le compte ${compte}`;

            anomaliesDetectees.push({
              controleId: controle.id,
              compte: compte,
              test: testType,
              nbLignesAnormales: lignesAnormales.length,
              message: messageSimple
            });
          }
        }

        // Insertion groupée de toutes les anomalies SENS_ECRITURE (1 requête au lieu de N)
        await insertLineAnomaliesBatch(sensEcritureAnomalies);

        // Mettre à jour les contrôles avec les anomalies (SQL)
        for (const controle of controles) {
          const anomaliesControle = anomaliesDetectees.filter(a => a.controleId === controle.id);
          // SENS_ECRITURE: compter par compte (une anomalie = un compte avec au moins une ligne anormale)
          const anomaliesCount = anomaliesControle.length;
          const detailsJsonEcriture = anomaliesControle.length > 0
            ? JSON.stringify(anomaliesControle).replace(/'/g, "''")
            : JSON.stringify([{ message: 'Pas d\'anomalie détectée' }]).replace(/'/g, "''");

          const updateQueryEcriture = `
            UPDATE table_revisions_controles
            SET anomalies = ${anomaliesCount},
                details = '${detailsJsonEcriture}'
            WHERE id = ${controle.id}
          `;
          await db.sequelize.query(updateQueryEcriture, { type: db.Sequelize.QueryTypes.UPDATE });
        }
      }

      // ===== CONTRÔLE IMMO_CHARGE =====
      else if (type === 'IMMO_CHARGE') {
        const immoChargeAnomalies = []; // collecte pour insertion groupée
        const SEUIL_CAPITALISATION = 500;
        const messageAnomalie = "Non-conformité dans l'application des règles de capitalisation des immobilisations";

        // Récupérer les écritures pour les comptes 20xx, 21xx (immobilisations)
        const immoQuery = `
          SELECT j.*
          FROM journals j
          WHERE j.id_compte = ${id_compte}
            AND j.id_dossier = ${id_dossier}
            AND j.id_exercice = ${id_exercice}
            AND (j.comptegen LIKE '20%' OR j.comptegen LIKE '21%' OR j.compteaux LIKE '20%' OR j.compteaux LIKE '21%')
            ${dateCondition}
        `;
        const ecrituresImmo = await db.sequelize.query(immoQuery, { type: db.Sequelize.QueryTypes.SELECT });

        // Récupérer les écritures pour les comptes 60xx-63xx (charges)
        const chargesQuery = `
          SELECT j.*
          FROM journals j
          WHERE j.id_compte = ${id_compte}
            AND j.id_dossier = ${id_dossier}
            AND j.id_exercice = ${id_exercice}
            AND (j.comptegen LIKE '60%' OR j.comptegen LIKE '61%' OR j.comptegen LIKE '62%' OR j.comptegen LIKE '63%'
                 OR j.compteaux LIKE '60%' OR j.compteaux LIKE '61%' OR j.compteaux LIKE '62%' OR j.compteaux LIKE '63%')
            ${dateCondition}
        `;
        const ecrituresCharges = await db.sequelize.query(chargesQuery, { type: db.Sequelize.QueryTypes.SELECT });

        // Vérifier les immobilisations avec montants < 500 (solde débiteur)
        const ecrituresImmoAnormales = ecrituresImmo.filter(e => {
          const montant = (parseFloat(e.debit) || 0) - (parseFloat(e.credit) || 0);
          return montant > 0 && montant < SEUIL_CAPITALISATION;
        });

        // Vérifier les charges avec débit > 500
        const ecrituresChargesAnormales = ecrituresCharges.filter(e => {
          const debit = parseFloat(e.debit) || 0;
          return debit > SEUIL_CAPITALISATION;
        });


        // Charger en UNE seule requête toutes les lignes des écritures concernées (au lieu d'un SELECT par ligne)
        const idsEcritures = [...new Set(
          [...ecrituresImmoAnormales, ...ecrituresChargesAnormales]
            .map(e => e.id_ecriture)
            .filter(v => v !== null && v !== undefined && v !== '')
        )];

        const ecrituresCompletesMap = new Map();
        if (idsEcritures.length > 0) {
          const inList = idsEcritures.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',');
          const completesRows = await db.sequelize.query(`
            SELECT j.*
            FROM journals j
            WHERE j.id_compte = ${id_compte}
              AND j.id_dossier = ${id_dossier}
              AND j.id_exercice = ${id_exercice}
              AND j.id_ecriture IN (${inList})
            ORDER BY j.id_ecriture, j.id
          `, { type: db.Sequelize.QueryTypes.SELECT });

          for (const row of completesRows) {
            const k = String(row.id_ecriture);
            if (!ecrituresCompletesMap.has(k)) ecrituresCompletesMap.set(k, []);
            ecrituresCompletesMap.get(k).push(row);
          }
        }

        // Traiter les anomalies d'immobilisations (une anomalie par ligne individuelle)
        for (const ecriture of ecrituresImmoAnormales) {
          const compte = ecriture.comptegen || ecriture.compteaux;
          const key = `${idPeriode || 'NULL'}_${ecriture.id}_${controles[0]?.id_controle || 'IMMO_CHARGE'}`;
          const savedData = anomaliesMap[key] || {};

          // Récupérer l'écriture complète depuis la Map pré-chargée (plus de requête par ligne)
          const ecritureComplete = ecrituresCompletesMap.get(String(ecriture.id_ecriture)) || [];

          anomaliesDetectees.push({
            controleId: controles[0]?.id,
            compte: compte,
            montant: (parseFloat(ecriture.debit) || 0) - (parseFloat(ecriture.credit) || 0),
            type: 'IMMO_INSUFFISANT',
            message: `${messageAnomalie} - Immobilisation ${compte} inf a ${SEUIL_CAPITALISATION}`,
            ecritureComplete: ecritureComplete,
            ligneAnormale: ecriture
          });

          // Collecter l'anomalie pour insertion groupée (cf. flush après les boucles)
          immoChargeAnomalies.push({
            id_compte,
            id_dossier,
            id_exercice,
            line: ecriture,
            type,
            id_controle: controles[0]?.id_controle || 'IMMO_CHARGE',
            message: `${messageAnomalie} - Immobilisation ${compte}: inf a ${SEUIL_CAPITALISATION}`,
            idPeriode
          });

          // Recopier les données sauvegardées si elles existent (par id_controle + id_jnl)
          if (savedData.valide !== undefined) {
            await insertOrUpdateCommentaire({
              id_compte,
              id_dossier,
              id_exercice,
              id_periode: savedData.id_periode || idPeriode,
              id_controle: controles[0]?.id_controle || 'IMMO_CHARGE',
              id_jnl: ecriture.id,
              valide: savedData.valide,
              commentaire: savedData.commentaire
            });
          }
        }

        // Traiter les anomalies de charges (une anomalie par ligne individuelle)
        for (const ecriture of ecrituresChargesAnormales) {
          const compte = ecriture.comptegen || ecriture.compteaux;
          const key = `${idPeriode || 'NULL'}_${ecriture.id}_${controles[0]?.id_controle || 'IMMO_CHARGE'}`;
          const savedData = anomaliesMap[key] || {};

          // Récupérer l'écriture complète depuis la Map pré-chargée (plus de requête par ligne)
          const ecritureComplete = ecrituresCompletesMap.get(String(ecriture.id_ecriture)) || [];

          anomaliesDetectees.push({
            controleId: controles[0]?.id,
            compte: compte,
            montant: parseFloat(ecriture.debit) || 0,
            type: 'CHARGE_A_CAPITALISER',
            message: `${messageAnomalie} - Charge ${compte} débit suppérieur à ${SEUIL_CAPITALISATION}`,
            ecritureComplete: ecritureComplete,
            ligneAnormale: ecriture
          });

          // Collecter l'anomalie pour insertion groupée (cf. flush après les boucles)
          immoChargeAnomalies.push({
            id_compte,
            id_dossier,
            id_exercice,
            line: ecriture,
            type,
            id_controle: controles[0]?.id_controle || 'IMMO_CHARGE',
            message: `${messageAnomalie} - Charge ${compte}: débit suppérieur à ${SEUIL_CAPITALISATION}`,
            idPeriode
          });

          // Recopier les données sauvegardées si elles existent (par id_controle + id_jnl)
          if (savedData.valide !== undefined) {
            await insertOrUpdateCommentaire({
              id_compte,
              id_dossier,
              id_exercice,
              id_periode: savedData.id_periode || idPeriode,
              id_controle: controles[0]?.id_controle || 'IMMO_CHARGE',
              id_jnl: ecriture.id,
              valide: savedData.valide,
              commentaire: savedData.commentaire
            });
          }
        }

        // Insertion groupée de toutes les anomalies IMMO_CHARGE (1 requête au lieu de N)
        await insertLineAnomaliesBatch(immoChargeAnomalies);

        // Mettre à jour les contrôles avec les anomalies
        for (const controle of controles) {
          const anomaliesControle = anomaliesDetectees.filter(a => a.controleId === controle.id);
          const detailsJson = anomaliesControle.length > 0
            ? JSON.stringify(anomaliesControle.map(a => ({
              compte: a.compte,
              montant: a.montant,
              type: a.type,
              message: a.message
            }))).replace(/'/g, "''")
            : JSON.stringify([{ message: 'Pas d\'anomalie détectée' }]).replace(/'/g, "''");

          const updateQuery = `
            UPDATE table_revisions_controles
            SET anomalies = ${anomaliesControle.length},
                details = '${detailsJson}'
            WHERE id = ${controle.id}
          `;
          await db.sequelize.query(updateQuery, { type: db.Sequelize.QueryTypes.UPDATE });
        }
      }

      // ===== CONTRÔLE UTIL_CPT_TVA =====
      else if (type === 'UTIL_CPT_TVA') {

        // 1. Récupérer les comptes TVA immobilisation depuis la liste CRM (tva_comptes_nature, nature = IMMO)
        //    Saisie manuelle dans le CRM : comptes TVA (445...) tagués IMMO. On récupère le compte
        //    depuis dossierplancomptables via id_compte (comme la logique d'origine).
        const paramTvaQuery = `
          SELECT dpc.compte as compte_tva
          FROM tva_comptes_nature tcn
          JOIN dossierplancomptables dpc ON tcn.id_compte = dpc.id
          WHERE tcn.id_dossier = ${id_dossier}
            AND tcn.nature = 'IMMO'
        `;
        const paramTvaImmo = await db.sequelize.query(paramTvaQuery, { type: db.Sequelize.QueryTypes.SELECT });

        // Créer un Set des comptes TVA immobilisation pour recherche rapide
        const comptesTvaImmo = new Set(paramTvaImmo.map(p => p.compte_tva).filter(Boolean));

        // Construire la condition pour récupérer les écritures (classe 2 OU comptes TVA immo)
        let tvaConditions = [];
        if (comptesTvaImmo.size > 0) {
          tvaConditions = [...comptesTvaImmo].map(c => `comptegen LIKE '${c}%' OR compteaux LIKE '${c}%'`);
        }
        const classe2Condition = "comptegen LIKE '2%' OR compteaux LIKE '2%'";
        const allConditions = tvaConditions.length > 0
          ? `(${classe2Condition} OR ${tvaConditions.join(' OR ')})`
          : `(${classe2Condition})`;

        // 2. Récupérer les IDs des journaux de type RAN
        const ranJournalsQuery = `
          SELECT id FROM codejournals 
          WHERE id_compte = ${id_compte} 
            AND id_dossier = ${id_dossier} 
            AND type = 'RAN'
        `;
        const ranJournals = await db.sequelize.query(ranJournalsQuery, { type: db.Sequelize.QueryTypes.SELECT });
        const ranJournalIds = ranJournals.map(j => j.id).filter(Boolean);

        // Construire la condition d'exclusion RAN
        const ranExcludeCondition = ranJournalIds.length > 0
          ? `AND id_journal NOT IN (${ranJournalIds.join(',')})`
          : '';

        // 3. Récupérer les écritures concernées (exclure les journaux RAN)
        const ecrituresQuery = `
          SELECT * FROM journals
          WHERE id_compte = ${id_compte}
            AND id_dossier = ${id_dossier}
            AND id_exercice = ${id_exercice}
            AND ${allConditions}
            ${ranExcludeCondition}
            ${dateCondition}
        `;
        const ecritures = await db.sequelize.query(ecrituresQuery, { type: db.Sequelize.QueryTypes.SELECT });

        // Grouper les lignes par id_ecriture
        const ecrituresById = {};
        for (const ligne of ecritures) {
          const idEcriture = ligne.id_ecriture;
          if (!idEcriture) continue;

          if (!ecrituresById[idEcriture]) {
            ecrituresById[idEcriture] = [];
          }
          ecrituresById[idEcriture].push(ligne);
        }


        // 3. Vérifier chaque écriture
        for (const [idEcriture, lignes] of Object.entries(ecrituresById)) {
          // Vérifier si l'écriture contient un compte de classe 2
          const hasClasse2 = lignes.some(l => {
            const compte = l.comptegen || l.compteaux || '';
            return compte.startsWith('2');
          });

          // Vérifier si l'écriture contient un compte TVA immobilisation (de ParamTVA)
          const hasTvaImmo = lignes.some(l => {
            const compte = l.comptegen || l.compteaux || '';
            // Vérifier si le compte commence par l'un des comptes TVA immo
            for (const tvaCompte of comptesTvaImmo) {
              if (compte.startsWith(tvaCompte)) return true;
            }
            return false;
          });

          // Détecter l'anomalie
          let anomalieType = null;
          let anomalieMessage = '';

          if (hasClasse2 && !hasTvaImmo) {
            anomalieType = 'CLASSE2_SANS_TVA_IMMO';
            anomalieMessage = `Écriture avec compte classe 2 mais sans compte TVA immobilisation`;
          } else if (!hasClasse2 && hasTvaImmo) {
            anomalieType = 'TVA_IMMO_SANS_CLASSE2';
            anomalieMessage = `Écriture avec compte TVA immobilisation mais sans compte classe 2`;
          }

          if (anomalieType) {
            // Récupérer les données sauvegardées si elles existent
            const key = `${idPeriode || 'NULL'}_${idEcriture}_${controles[0]?.id_controle || 'UTIL_CPT_TVA'}`;
            const savedData = anomaliesMap[key] || {};

            // Stocker l'anomalie
            anomaliesDetectees.push({
              controleId: controles[0]?.id,
              idEcriture: idEcriture,
              type: anomalieType,
              message: anomalieMessage,
              ecritureComplete: lignes,
              hasClasse2,
              hasTvaImmo
            });

            // Insérer dans table_controle_anomalies - UTIL_CPT_TVA utilise id_ecriture comme id_jnl
            // et on met le compte de la première ligne dans id_num_compte
            const firstLineCompte = lignes[0]?.comptegen || lignes[0]?.compteaux || '';
            const insertQuery = `
              INSERT INTO table_controle_anomalies (
                id_compte, id_dossier, id_exercice, id_jnl, id_num_compte, "codeCtrl", id_controle, message, 
                id_periode, "createdAt", "updatedAt"
              ) VALUES (
                ${id_compte}, ${id_dossier}, ${id_exercice}, '${idEcriture}', '${firstLineCompte.replace(/'/g, "''")}', '${type}', 
                '${controles[0]?.id_controle || 'UTIL_CPT_TVA'}', '${anomalieMessage.replace(/'/g, "''")}', 
                ${idPeriode || 'NULL'}, NOW(), NOW()
              )
            `;
            const result = await db.sequelize.query(insertQuery, { type: db.Sequelize.QueryTypes.INSERT });
            const idAnomalie = result[0]?.id || null;

            // Recopier les données sauvegardées si elles existent (par id_controle + id_jnl)
            if (savedData.valide !== undefined) {
              await insertOrUpdateCommentaire({
                id_compte,
                id_dossier,
                id_exercice,
                id_periode: savedData.id_periode || idPeriode,
                id_controle: controles[0]?.id_controle || 'UTIL_CPT_TVA',
                id_jnl: idEcriture,
                valide: savedData.valide,
                commentaire: savedData.commentaire
              });
            }
          }
        }

        // Mettre à jour les contrôles avec les anomalies
        for (const controle of controles) {
          const anomaliesControle = anomaliesDetectees.filter(a => a.controleId === controle.id);
          // UTIL_CPT_TVA: compter par ecriture (une anomalie = une ecriture anormale)
          const detailsJson = anomaliesControle.length > 0
            ? JSON.stringify(anomaliesControle.map(a => ({
              idEcriture: a.idEcriture,
              type: a.type,
              message: a.message
            }))).replace(/'/g, "''")
            : JSON.stringify([{ message: 'Pas d\'anomalie détectée' }]).replace(/'/g, "''");

          const updateQuery = `
            UPDATE table_revisions_controles
            SET anomalies = ${anomaliesControle.length},
                details = '${detailsJson}'
            WHERE id = ${controle.id}
          `;
          await db.sequelize.query(updateQuery, { type: db.Sequelize.QueryTypes.UPDATE });
        }
      }

      // ===== CONTRÔLE ATYPIQUE =====
      else if (type === 'ATYPIQUE') {
        const atypiqueAnomalies = []; // collecte pour insertion groupée
        const MIN_N = 4; // taille d'échantillon minimale par compte (évite les cas dégénérés 1-3 lignes)

        // Traiter chaque contrôle individuellement avec son propre paramUn
        for (const controle of controles) {
          // Lire K depuis la matrice
          const kQuery = `
            SELECT
              COALESCE(
                (SELECT rcm."paramUn" FROM revisions_controles_matrices rcm WHERE rcm.id_controle = '${controle.id_controle}' LIMIT 1),
                (SELECT trc."paramUn" FROM table_revisions_controles trc WHERE trc.id = ${controle.id} LIMIT 1)
              ) AS "paramUn"
          `;
          const kRows = await db.sequelize.query(kQuery, { type: db.Sequelize.QueryTypes.SELECT });
          const paramUnDb = kRows?.[0]?.paramUn;
          const K = (paramUnDb === null || paramUnDb === undefined || paramUnDb === '' || isNaN(Number(paramUnDb))) ? 3 : Number(paramUnDb);

          // Détection ROBUSTE : médiane + K·MAD (MAD normalisé ×1,4826 pour rester comparable à un
          // écart-type). Par compteaux, seulement sur les comptes avec au moins MIN_N lignes, borne haute.
          // Les colonnes de sortie gardent les noms "moyenne"/"ecart_type" pour compat avec l'aval
          // (moyenne = médiane, ecart_type = MAD normalisé).
          const atypiqueQuery = `
            WITH base AS (
              SELECT
                j.id,
                j.id_ecriture,
                j.dateecriture,
                j.comptegen,
                j.compteaux,
                j.piece,
                j.libelle,
                COALESCE(j.debit, 0)::numeric AS debit,
                COALESCE(j.credit, 0)::numeric AS credit,
                (COALESCE(j.debit, 0)::numeric + COALESCE(j.credit, 0)::numeric) AS montant
              FROM journals j
              WHERE j.id_compte = ${id_compte}
                AND j.id_dossier = ${id_dossier}
                AND j.id_exercice = ${id_exercice}
                ${dateCondition}
                AND j.compteaux IS NOT NULL
                AND TRIM(j.compteaux) <> ''
            ), med AS (
              SELECT
                compteaux,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY montant) AS mediane,
                COUNT(*) AS n
              FROM base
              GROUP BY compteaux
            ), dev AS (
              SELECT b.*, m.mediane, m.n, ABS(b.montant - m.mediane) AS abs_dev
              FROM base b
              JOIN med m ON m.compteaux = b.compteaux
            ), mad AS (
              SELECT
                compteaux,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY abs_dev) AS mad
              FROM dev
              GROUP BY compteaux
            )
            SELECT
              d.id, d.id_ecriture, d.dateecriture, d.comptegen, d.compteaux, d.piece, d.libelle,
              d.debit, d.credit, d.montant,
              d.mediane AS moyenne,
              (1.4826 * mad.mad) AS ecart_type,
              (d.mediane + (${K} * 1.4826 * mad.mad)) AS seuil
            FROM dev d
            JOIN mad ON mad.compteaux = d.compteaux
            WHERE d.n >= ${MIN_N}
              AND mad.mad > 0
              AND (d.montant - d.mediane - (${K} * 1.4826 * mad.mad)) > 0
            ORDER BY d.compteaux ASC, d.dateecriture ASC, d.id ASC
          `;

          const rows = await db.sequelize.query(atypiqueQuery, { type: db.Sequelize.QueryTypes.SELECT });

          for (const row of rows) {
            const compte = row.compteaux;
            const montant = parseFloat(row.montant) || 0;
            const moyenne = parseFloat(row.moyenne) || 0;
            const ecartType = parseFloat(row.ecart_type) || 0;
            const seuil = parseFloat(row.seuil) || (moyenne + (K * ecartType));

            const messageAnomalie = `Compte ${compte} (K=${K})`;

            const key = `${idPeriode || 'NULL'}_${row.id}_${controle.id_controle}`;
            const savedData = anomaliesMap[key] || {};

            anomaliesDetectees.push({
              controleId: controle.id,
              idEcriture: row.id_ecriture,
              idJournalLine: row.id,
              compte,
              montant,
              moyenne,
              ecartType,
              seuil,
              k: K, // Ajouter le K utilisé pour info
              message: messageAnomalie
            });

            // Collecter l'anomalie pour insertion groupée (cf. flush après la boucle)
            atypiqueAnomalies.push({
              id_compte,
              id_dossier,
              id_exercice,
              line: row,
              type,
              id_controle: controle.id_controle,
              message: messageAnomalie,
              idPeriode
            });

            // Recopier les données sauvegardées si elles existent (par id_controle + id_jnl)
            if (savedData.valide !== undefined) {
              await insertOrUpdateCommentaire({
                id_compte,
                id_dossier,
                id_exercice,
                id_periode: savedData.id_periode || idPeriode,
                id_controle: controle.id_controle,
                id_jnl: row.id,
                valide: savedData.valide,
                commentaire: savedData.commentaire
              });
            }
          }
        }

        // Insertion groupée de toutes les anomalies ATYPIQUE (1 requête au lieu de N)
        await insertLineAnomaliesBatch(atypiqueAnomalies);

        // Mettre à jour les contrôles
        for (const controle of controles) {
          const anomaliesControle = anomaliesDetectees.filter(a => a.controleId === controle.id);
          const detailsJson = anomaliesControle.length > 0
            ? JSON.stringify(anomaliesControle.map(a => ({
              idJournalLine: a.idJournalLine,
              idEcriture: a.idEcriture,
              compte: a.compte,
              montant: a.montant,
              moyenne: a.moyenne,
              ecartType: a.ecartType,
              seuil: a.seuil,
              k: a.k, // Afficher le K utilisé
              message: a.message
            }))).replace(/'/g, "''")
            : JSON.stringify([{ message: 'Pas d\'anomalie atypique détectée' }]).replace(/'/g, "''");

          const updateQuery = `
            UPDATE table_revisions_controles
            SET anomalies = ${anomaliesControle.length},
                details = '${detailsJson}'
            WHERE id = ${controle.id}
          `;
          await db.sequelize.query(updateQuery, { type: db.Sequelize.QueryTypes.UPDATE });
        }

      }

      resultsByType[type] = {
        controlesCount: controles.length,
        anomaliesCount: anomaliesDetectees.length,
        anomalies: anomaliesDetectees
      };

    }

    const totalEcritures = await db.tableControleAnomalies.count({
      where: {
        id_compte: id_compte,
        id_dossier: id_dossier,
        id_exercice: id_exercice,
        id_periode: id_periode
      }
    });

    res.json({
      state: true,
      message: 'Contrôle global exécuté avec succès',
      totalControles: newControles.length,
      totalTypes: Object.keys(controlesByType).length,
      totalEcritures,
      resultsByType
    });
  } catch (error) {
    console.error('Error in executeAll:', error);
    res.status(500).json({
      state: false,
      message: 'Erreur lors de l\'exécution du contrôle global',
      error: error.message
    });
  }
};

// Sauvegarder ou mettre à jour un commentaire/validation pour une anomalie
exports.saveCommentaireAnomalie = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice, id_anomalie } = req.params;
    const { valide = false, commentaire = '', id_periode } = req.body;

    // 🔥 LOGS IMPORTANTS

    if (!id_anomalie) {
      return res.status(400).json({
        state: false,
        message: 'id_anomalie est requis'
      });
    }

    const anomalie = await db.sequelize.query(`
      SELECT id, id_controle, id_jnl
      FROM table_controle_anomalies
      WHERE id = ${id_anomalie}
        AND id_compte = ${id_compte}
        AND id_dossier = ${id_dossier}
        AND id_exercice = ${id_exercice}
      LIMIT 1
    `, { type: db.Sequelize.QueryTypes.SELECT });

    // 🔥 LOG

    if (anomalie.length === 0) {
      return res.status(404).json({
        state: false,
        message: 'Anomalie non trouvée'
      });
    }

    const { id_controle, id_jnl } = anomalie[0];

    await insertOrUpdateCommentaire({
      id_compte,
      id_dossier,
      id_exercice,
      id_periode,
      id_controle,
      id_jnl,
      valide,
      commentaire
    });


    return res.json({
      state: true,
      message: 'Mise à jour réussie',
      data: {
        id_anomalie,
        valide,
        commentaire
      }
    });

  } catch (error) {
    console.error("❌ ERROR UPDATE:", error);
    return res.status(500).json({
      state: false,
      message: 'Erreur serveur'
    });
  }
};

// Récupérer les commentaires/validations pour les anomalies d'un exercice
exports.getCommentairesAnomalies = async (req, res) => {
  try {
    const { id_compte, id_dossier, id_exercice } = req.params;

    const query = `
      SELECT 
        c.id,
        c.id_controle,
        c.id_jnl,
        c.valide,
        c.commentaire,
        c.id_periode
      FROM revision_commentaire_anomalies c
      WHERE c.id_compte = ${id_compte}
        AND c.id_dossier = ${id_dossier}
        AND c.id_exercice = ${id_exercice}
    `;

    const commentaires = await db.sequelize.query(query, { type: db.Sequelize.QueryTypes.SELECT });

    res.json({
      state: true,
      commentaires,
      count: commentaires.length
    });
  } catch (error) {
    console.error('Error in getCommentairesAnomalies:', error);
    res.status(500).json({
      state: false,
      message: 'Erreur lors de la récupération des commentaires',
      error: error.message
    });
  }
};
