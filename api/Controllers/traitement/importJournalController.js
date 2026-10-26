const db = require("../../Models");
require('dotenv').config();
const { Op, Sequelize } = require('sequelize');
const Papa = require("papaparse");
const fs = require("fs");
const crypto = require('crypto');
const { withSSEProgress } = require('../../Middlewares/sseProgressMiddleware');

const fonctionUpdateBalanceSold = require('../../Middlewares/UpdateSolde/updateBalanceAnalytique');

function buildIdEcriture(item) {
  const key = [
    item.JournalCode?.trim(),
    item.EcritureNum,
    item.EcritureDate,
    item.PieceRef?.trim()
  ].join('|');

  return crypto
    .createHash('sha1')
    .update(key)
    .digest('hex')
    .substring(0, 25);
}

const journals = db.journals;
const codejournals = db.codejournals;
const dossierPlanComptable = db.dossierplancomptables;
const caaxes = db.caAxes;
const casections = db.caSections;
const analytiques = db.analytiques;

const createNotExistingCodeJournal = async (req, res) => {
  try {
    const { compteId, fileId, codeJournalToCreate } = req.body;

    let resData = {
      state: false,
      msg: '',
      list: []
    }

    const normalizeCode = (v) => String(v || '').trim().toUpperCase();

    const ranJournal = await codejournals.findOne({
      where: {
        id_compte: Number(compteId),
        id_dossier: Number(fileId),
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn('upper', Sequelize.fn('trim', Sequelize.col('type'))),
            'RAN'
          )
        ]
      }
    });


    if (!ranJournal) {
      resData.state = false;
      resData.msg = "Veuillez créer le code journal RAN avant d'importer.";
      resData.list = null;
      return res.json(resData);
    }

    if (codeJournalToCreate.length > 0) {
      // normaliser, dédoublonner et créer seulement si inexistant
      const entries = codeJournalToCreate.map((item) => ({
        code: normalizeCode(typeof item === 'string' ? item : (item?.code || '')),
        libelle: (typeof item === 'object' && item?.libelle ? String(item.libelle).trim() : 'Libellé à définir')
      })).filter(e => !!e.code && e.code !== 'RAN');

      // set unique by code
      const uniqueByCode = Array.from(new Map(entries.map(e => [e.code, e])).values());

      await Promise.all(uniqueByCode.map(async (e) => {
        const exists = await codejournals.findOne({ where: { id_compte: compteId, id_dossier: fileId, code: e.code } });
        if (!exists) {
          await codejournals.create({ id_compte: compteId, id_dossier: fileId, code: e.code, libelle: e.libelle, type: 'OD' });
        }
      }));

      //récuperer la liste à jour des codes journaux
      const updatedList = await codejournals.findAll({
        where:
        {
          id_compte: compteId,
          id_dossier: fileId
        },
        raw: true,
      });
      resData.state = true;
      resData.list = updatedList;
    } else {
      //récuperer la liste à jour des codes journaux
      const updatedList = await codejournals.findAll({
        where:
        {
          id_compte: compteId,
          id_dossier: fileId
        },
        raw: true,
      });

      resData.state = true;
      resData.list = updatedList;
    }

    return res.json(resData);
  } catch (error) {
  }
}

// const createNotExistingCompte = async (req, res) => {
//   try {
//     const { compteId, fileId, compteToCreateGen, compteToCreateAux } = req.body;

//     let resData = { state: false, msg: '', list: [] };

//     // Dédupliquer les entrées et ne créer que si inexistant
//     const uniqBy = (arr, keyFn) => Array.from(new Map(arr.map(v => [keyFn(v), v])).values());

//     const genList = Array.isArray(compteToCreateGen) ? uniqBy(compteToCreateGen, x => String(x.CompteNum || '').trim()) : [];
//     const auxList = Array.isArray(compteToCreateAux) ? uniqBy(compteToCreateAux, x => String(x.CompAuxNum || '').trim()) : [];

//     if (genList.length > 0) {
//       await Promise.all(
//         genList.map(async (item) => {
//           const compte = String(item.CompteNum || '').trim().slice(0, 150);
//           const natureCompte = item.CompAuxNum !== '' ? 'Collectif' : 'General';
//           if (!compte) return null;
//           const exists = await dossierPlanComptable.findOne({ where: { id_compte: compteId, id_dossier: fileId, compte } });
//           if (!exists) {
//             await dossierPlanComptable.create({
//               id_compte: compteId,
//               id_dossier: fileId,
//               compte,
//               libelle: (item.CompteLib || '').slice(0, 150),
//               nature: natureCompte,
//               typetier: "general",
//               baseaux: compte,
//               pays: 'Madagascar'
//             });
//           }
//           return null;
//         })
//       );
//     }

//     if (auxList.length > 0) {
//       await Promise.all(
//         auxList.map(async (item) => {
//           const aux = String(item.CompAuxNum || '').trim().slice(0, 150);
//           if (!aux) return null;
//           const exists = await dossierPlanComptable.findOne({ where: { id_compte: compteId, id_dossier: fileId, compte: aux } });
//           if (exists) return null;
//           // Trouver le général de rattachement par CompteNum (baseaux)
//           const genCompte = String(item.CompteNum || '').trim().slice(0, 150);
//           const base = await dossierPlanComptable.findOne({ where: { id_compte: compteId, id_dossier: fileId, compte: genCompte, nature: 'Collectif' } });
//           return dossierPlanComptable.create({
//             id_compte: compteId,
//             id_dossier: fileId,
//             compte: aux,
//             libelle: (item.CompAuxLib || '').slice(0, 150),
//             nature: "Aux",
//             typetier: "sans-nif",
//             pays: 'Madagascar',
//             baseaux_id: base?.id,
//             baseaux: base?.compte,
//             typecomptabilite: 'Français'
//           });
//         })
//       );
//     }

//     await db.sequelize.query(
//       `UPDATE dossierplancomptables
//        SET baseaux_id = id, baseaux = compte
//        WHERE compte = baseaux
//        AND id_compte = :compteId
//        AND id_dossier = :fileId`,
//       {
//         replacements: { compteId, fileId },
//         type: db.Sequelize.QueryTypes.UPDATE
//       }
//     );

//     const updatedList = await dossierPlanComptable.findAll({
//       where: { id_compte: compteId, id_dossier: fileId },
//       raw: true
//     });

//     resData.state = true;
//     resData.list = updatedList;

//     return res.json(resData);

//   } catch (error) {
//     return res.status(500).json({ state: false, error: error.message });
//   }
// };


const createNotExistingCompte = async (req, res) => {
  try {
    const { compteId, fileId, compteToCreateGen, compteToCreateAux } = req.body;

    const resData = { state: false, msg: '', list: [] };

    const uniqBy = (arr, keyFn) => Array.from(new Map(arr.map(v => [keyFn(v), v])).values());
    const genList = Array.isArray(compteToCreateGen) ? uniqBy(compteToCreateGen, x => String(x.CompteNum || '').trim()) : [];
    const auxList = Array.isArray(compteToCreateAux) ? uniqBy(compteToCreateAux, x => String(x.CompAuxNum || '').trim()) : [];

    await db.sequelize.transaction(async (t) => {
      if (genList.length > 0) {
        await db.sequelize.query(`
                        INSERT INTO dossierplancomptables
                            (id_compte, id_dossier, compte, libelle, nature, typetier, baseaux, pays, "createdAt", "updatedAt")
                            SELECT :compteId, :fileId, c.compte, c.libelle, c.nature, 'general', c.baseaux, 'Madagascar', NOW(), NOW()
                        FROM (VALUES ${genList.map((_, i) => `(:compte${i}, :libelle${i}, :nature${i}, :baseaux${i})`).join(',')}) AS c(compte, libelle, nature, baseaux)
                        WHERE NOT EXISTS (
                            SELECT 1 FROM dossierplancomptables d
                            WHERE d.id_compte = :compteId AND d.id_dossier = :fileId AND d.compte = c.compte
                        )
                    `, {
          replacements: genList.reduce((acc, item, i) => {
            const compte = String(item.CompteNum || '').trim();
            const nature = item.CompAuxNum ? 'Collectif' : 'General';
            const libelle = item.CompteLib ? String(item.CompteLib).trim().slice(0, 150) : '';
            acc[`compte${i}`] = compte;
            acc[`nature${i}`] = nature;
            acc[`libelle${i}`] = libelle;
            acc[`baseaux${i}`] = compte;
            return acc;
          }, { compteId, fileId }),
          transaction: t
        });
      }

      if (auxList.length > 0) {
        await Promise.all(auxList.map(async (item) => {
          const aux = String(item.CompAuxNum || '').trim();
          if (!aux) return null;
          const genCompte = String(item.CompteNum || '').trim();

          const base = await dossierPlanComptable.findOne({
            where: { id_compte: compteId, id_dossier: fileId, compte: genCompte, nature: 'Collectif' },
            transaction: t
          });

          return db.sequelize.query(`
                            INSERT INTO dossierplancomptables
                                (id_compte, id_dossier, compte, libelle, nature, typetier, pays, baseaux_id, baseaux, typecomptabilite, "createdAt", "updatedAt")
                                SELECT :compteId, :fileId, :aux, :libelle, 'Aux', 'sans-nif', 'Madagascar', :baseId, :baseCompte, 'Français', NOW(), NOW()
                            WHERE NOT EXISTS (
                                SELECT 1 FROM dossierplancomptables d
                                WHERE d.id_compte = :compteId AND d.id_dossier = :fileId AND d.compte = :aux
                            )
                        `, {
            replacements: {
              compteId,
              fileId,
              aux,
              libelle: String(item.CompAuxLib).trim().slice(0,150) || '',
              baseId: base?.id || null,
              baseCompte: base?.compte || null
            },
            transaction: t
          });
        }));
      }

      await db.sequelize.query(`
                UPDATE dossierplancomptables
                SET baseaux_id = id, baseaux = compte
                WHERE compte = baseaux
                    AND id_compte = :compteId
                    AND id_dossier = :fileId
            `, {
        replacements: { compteId, fileId },
        transaction: t
      });
    });

    const updatedList = await dossierPlanComptable.findAll({
      where: { id_compte: compteId, id_dossier: fileId },
      raw: true
    });

    resData.state = true;
    resData.list = updatedList;
    return res.json(resData);

  } catch (error) {
    console.error("Erreur createNotExistingCompte :", error);
    return res.status(500).json({ state: false, error: error.message });
  }
};

function parseDate(str) {
  if (!str) return null;

  // Si c'est déjà une Date
  if (str instanceof Date) {
    return isNaN(str.getTime()) ? null : str;
  }

  let s = String(str).trim();
  if (!s) return null;

  // Retirer l'heure si présente (ex: "2026-01-22 13:22:53" ou "2026-01-22T13:22:53")
  s = s.replace('T', ' ');
  if (s.includes(' ')) s = s.split(' ')[0];

  // Formats: dd/mm/yyyy ou dd-mm-yyyy
  if (s.includes('/') || s.includes('-')) {
    const separator = s.includes('/') ? '/' : '-';
    const parts = s.split(separator).map(p => p.trim());
    if (parts.length === 3) {
      // Vérifier si c'est format dd/mm/yyyy ou dd-mm-yyyy (jour en premier)
      if (parts[0].length <= 2 && parts[1].length <= 2) {
        const [day, month, year] = parts;
        const d = new Date(`${year}-${month}-${day}`);
        return isNaN(d.getTime()) ? null : d;
      }
    }
  }

  // Formats: yyyy-mm-dd ou yyyy/mm/dd
  if (s.includes('-') || s.includes('/')) {
    const normalized = s.replace(/\//g, '-');
    const d = new Date(normalized);
    return isNaN(d.getTime()) ? null : d;
  }

  // Format: yyyymmdd
  if (/^\d{8}$/.test(s)) {
    const year = s.substring(0, 4);
    const month = s.substring(4, 6);
    const day = s.substring(6, 8);
    // Forcer 12:00 GMT pour éviter le décalage horaire
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}



const parseToDate = (str) => {
  if (!str) return null;
  if (typeof str === "string") str = str.trim();

  let d = null;

  if (typeof str === "string") {
    if (str.includes("/")) {
      const [day, month, year] = str.split("/").map(s => s.trim());
      d = new Date(`${year}-${month}-${day}`);
    } else if (/^\d{8}$/.test(str)) {
      d = new Date(`${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`);
    } else {
      d = new Date(str);
    }
  } else {
    d = new Date(str);
  }

  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
};

const recupListeImporte = async (req, res) => {
  try {
    const { startDate, endDate, fileTypeCSV } = req.body;

    const dStart = parseToDate(startDate);
    const dEnd = parseToDate(endDate);

    const csvFile = fs.readFileSync(req.file.path, "utf8");

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {

        const baseData = fileTypeCSV === "true"
          ? result.data.map((row, index) => ({
            ...row,
            id: index,
            CompteLib: "",
          }))
          : result.data;

        const finalData = [];

        for (const row of baseData) {
          const d = parseToDate(row.EcritureDate);

          if (!d) continue;
          if (dStart && d < dStart) continue;
          if (dEnd && d > dEnd) continue;

          finalData.push(row);
        }

        fs.unlinkSync(req.file.path);

        return res.json({
          success: true,
          data: finalData
        });
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Erreur lors de l'import du fichier"
    });
  }
}
const testIfRanExist = async (req, res) => {
  try {
    const { id_dossier, id_compte } = req.body;

    if (!id_dossier) return res.json({ state: false, exist: false, message: 'Dossier non trouvé' });
    if (!id_compte) return res.json({ state: false, exist: false, message: 'Compte non trouvé' });

    const query = `
      SELECT 1 FROM codejournals
      WHERE id_dossier = :id_dossier
        AND id_compte = :id_compte
        AND type = 'RAN'
      LIMIT 1
    `;

    const [row] = await db.sequelize.query(query, {
      replacements: { id_dossier, id_compte },
      type: db.Sequelize.QueryTypes.SELECT
    });

    return res.json({
      state: true,
      exist: !!row
    });

  } catch (error) {
    return res.json({ exist: false, state: false, message: error.message });
  }
}

const getAllCodeRan = async (req, res) => {
  try {
    const { id_dossier, id_compte } = req.body;
    if (!id_dossier) {
      return res.json({ state: false, exist: false, message: 'Dossier non trouvé' });
    }
    if (!id_compte) {
      return res.json({ state: false, exist: false, message: 'Compte non trouvé' });
    }

    const codeJournalsRan = await codejournals.findAll({
      where: { id_dossier, id_compte, type: 'RAN' },
      attributes: ['code'],
    });

    const codes = codeJournalsRan.map(item => item.code);

    return res.json({ list: codes });

  } catch (error) {
    return res.json({ existe: false, state: false, message: error.message });
  }
}

const importJournalWithProgressLogic = async (req, res, progress) => {
  try {
    const { compteId, userId, fileId, selectedPeriodeId, fileTypeCSV, valSelectCptDispatch, journalData, longeurCompteStd, periodeStart, periodeEnd } = req.body;

    if (!Array.isArray(journalData) || journalData.length === 0) {
      progress.error("Aucune donnée à importer");
      return;
    }

    const totalLines = journalData.length;
    progress.update(0, totalLines, 'Démarrage...', 0);

    progress.step('Préparation de l\'import...', 5);

    if (valSelectCptDispatch === 'ECRASER') {
      // Purger d'abord les tables qui référencent journals par FK sans ON DELETE CASCADE,
      // sinon la suppression des journals échoue (violation de contrainte).
      // Ces données (analytique + caches de contrôles) sont recréées / recalculées ensuite.
      const scopeRepl = { c: Number(compteId), d: Number(fileId), e: Number(selectedPeriodeId) };
      const inScope = 'IN (SELECT id FROM journals WHERE id_compte = :c AND id_dossier = :d AND id_exercice = :e)';
      await db.sequelize.query(`DELETE FROM analytiques WHERE id_ligne_ecriture ${inScope}`, { replacements: scopeRepl });
      await db.sequelize.query(`DELETE FROM analyse_fournisseur_lignes WHERE id_ligne ${inScope}`, { replacements: scopeRepl });
      await db.sequelize.query(`DELETE FROM analyse_client_lignes WHERE id_ligne ${inScope}`, { replacements: scopeRepl });
      await db.sequelize.query(`DELETE FROM recherche_doublons WHERE id_jnl ${inScope}`, { replacements: scopeRepl });
      await db.sequelize.query(`DELETE FROM revision_analytique_resultats WHERE id_jnl ${inScope}`, { replacements: scopeRepl });

      await journals.destroy({
        where: {
          id_compte: Number(compteId),
          id_dossier: Number(fileId),
          id_exercice: Number(selectedPeriodeId),
        }
      });
    }

    progress.step('Vérification des devises...', 10);

    const deviseCodes = [...new Set((journalData || [])
      .map(r => (r.Idevise || '').trim())
      .filter(v => v))];
    if (!deviseCodes.includes('MGA')) deviseCodes.push('MGA');

    for (const code of deviseCodes) {
      const existing = await db.devises.findOne({ where: { id_compte: compteId, id_dossier: fileId, code } });
      if (!existing) await db.devises.create({ id_compte: compteId, id_dossier: fileId, code, libelle: code });
    }

    const allDevises = await db.devises.findAll({ where: { id_compte: compteId, id_dossier: fileId }, raw: true });
    const deviseMap = new Map(allDevises.map(dv => [dv.code, dv.id]));
    const defaultDeviseId = deviseMap.get('MGA');

    progress.step('Traitement des écritures...', 15);

    const grouped = journalData.reduce((acc, item) => {
      const key = item.EcritureNum;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const toMidnight = (d) => { if (!d) return null; const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const debutExo = toMidnight(periodeStart);
    const finExo = toMidnight(periodeEnd);

    let importedCount = 0;
    let skippedCount = 0;
    let skippedNoCompte = 0;
    let skippedNoDate = 0;
    let skippedError = 0;
    const skippedDetails = []; // Pour stocker les détails des lignes ignorées
    const ecritureKeys = Object.keys(grouped);

    const normalizeAnalytiqueDisplay = (v) => String(v || '').trim().replace(/\s+/g, ' ');
    const normalizeAnalytiqueKey = (v) => normalizeAnalytiqueDisplay(v).toUpperCase();

    // Récupérer toutes les sections uniques de la colonne Analytique (insensible à la casse)
    const analytiqueUniqueByKey = new Map();
    for (const row of (journalData || [])) {
      const display = normalizeAnalytiqueDisplay(row.Analytique);
      if (!display) continue;
      const key = normalizeAnalytiqueKey(display);
      if (!analytiqueUniqueByKey.has(key)) {
        analytiqueUniqueByKey.set(key, display);
      }
    }
    const allAnalytiqueValues = Array.from(analytiqueUniqueByKey.values());

    // Créer ou récupérer l'axe analytique par dossier.
    // La base semble avoir une contrainte unique globale sur `code` (ex: caaxes_code_key).
    // Donc on utilise un code unique par dossier/compte.
    const axeCode = `axe1_${Number(compteId)}_${Number(fileId)}`;
    const axeLibelle = 'axe1';

    // IMPORTANT: la contrainte unique est sur caaxes.code (globale), donc on doit chercher par code uniquement.
    let axe = await caaxes.findOne({
      where: {
        code: axeCode,
        id_compte: Number(compteId),
        id_dossier: Number(fileId)
      }
    });

    if (!axe) {
      try {
        axe = await caaxes.create({
          code: axeCode,
          libelle: axeLibelle,
          id_compte: Number(compteId),
          id_dossier: Number(fileId)
        });
      } catch (err) {
        // Si concurrence: relire le même axe
        axe = await caaxes.findOne({
          where: {
            code: axeCode,
            id_compte: Number(compteId),
            id_dossier: Number(fileId)
          }
        });
        if (!axe) throw err;
      }
    }

    // Créer les sections uniques si elles n'existent pas
    // sectionMap est indexé par clé normalisée (upper + trim)
    const sectionMap = new Map();
    const pourcentageParSection = allAnalytiqueValues.length > 0 ? (100 / allAnalytiqueValues.length) : 100;
    let firstCompteFound = null;
    let createdInAxe1 = false;

    for (const analytiqueValue of allAnalytiqueValues) {
      const analytiqueKey = normalizeAnalytiqueKey(analytiqueValue);
      let section = await casections.findOne({
        where: {
          [Op.and]: [
            Sequelize.where(
              Sequelize.fn('upper', Sequelize.col('section')),
              analytiqueKey
            )
          ],
          id_compte: Number(compteId),
          id_dossier: Number(fileId)
        }
      });

      if (!section) {
        section = await casections.create({
          section: analytiqueValue,
          intitule: analytiqueValue,
          compte: firstCompteFound || '', // Utiliser le premier compte trouvé
          pourcentage: pourcentageParSection,
          par_defaut: false,
          fermer: false,
          id_compte: Number(compteId),
          id_dossier: Number(fileId),
          id_axe: axe.id
        });
        createdInAxe1 = true;
      }

      sectionMap.set(analytiqueKey, section);
    }

    // Recalculer les pourcentages sur l'ensemble des sections de axe1
    // uniquement si on a créé au moins une nouvelle section dans axe1 pendant cet import
    if (createdInAxe1) {
      const allSectionsForAxe = await casections.findAll({
        where: {
          id_axe: axe.id,
          id_compte: Number(compteId),
          id_dossier: Number(fileId)
        }
      });

      if (Array.isArray(allSectionsForAxe) && allSectionsForAxe.length > 0) {
        const pct = Number((100 / allSectionsForAxe.length).toFixed(2));
        await Promise.all(
          allSectionsForAxe.map((s) => s.update({ pourcentage: pct }))
        );
      }
    }

    // Traiter par lots d'écritures, mais afficher la progression en lignes
    const batchSize = 20;
    let processedLines = 0;
    let firstLineErrorMessage = null;

    for (let i = 0; i < ecritureKeys.length; i += batchSize) {
      const batch = ecritureKeys.slice(i, i + batchSize);

      for (let ecritureNum of batch) {
        const lines = grouped[ecritureNum];
        const newIdEcriture = buildIdEcriture(lines[0]);

        for (let item of lines) {
          try {
            const rawAux = String(item.CompAuxNum || '').trim();
            const rawGen = String(item.CompteNum || '').trim();

            const normCode = String(item.JournalCode || '').trim().toUpperCase();
            let idCodeJournal = await codejournals.findOne({
              where: { id_compte: compteId, id_dossier: fileId, code: normCode },
            });
            if (!idCodeJournal && normCode) {
              idCodeJournal = await codejournals.create({ id_compte: compteId, id_dossier: fileId, code: normCode, libelle: normCode, type: 'OD' });
            }
            const codeJournalId = idCodeJournal?.id || 0;

            let foundCompte = null;
            let foundAux = null;
            let foundGen = null;

            if (rawAux) {
              foundAux = await dossierPlanComptable.findOne({ where: { id_compte: compteId, id_dossier: fileId, compte: rawAux } });
            }

            foundGen = await dossierPlanComptable.findOne({
              where: {
                id_compte: compteId,
                id_dossier: fileId,
                compte: rawGen
              },
            });
            foundCompte = foundAux || foundGen;

            if (!foundCompte) {
              let genCompte = null;
              if (rawGen) {
                genCompte = await dossierPlanComptable.findOne({ where: { id_compte: compteId, id_dossier: fileId, compte: rawGen } });
                if (!genCompte) {
                  genCompte = await dossierPlanComptable.create({
                    id_compte: compteId,
                    id_dossier: fileId,
                    compte: rawGen,
                    libelle: String(item.CompteLib || '').slice(0, 150),
                    nature: 'General',
                    typetier: 'general',
                    baseaux: rawGen,
                    pays: 'Madagascar',
                  });
                  await db.sequelize.query(
                    `UPDATE dossierplancomptables SET baseaux_id = id WHERE id = :id`,
                    { replacements: { id: genCompte.id }, type: db.Sequelize.QueryTypes.UPDATE }
                  );
                }
              }
              if (rawAux) {
                let createdAux = await dossierPlanComptable.findOne({ where: { id_compte: compteId, id_dossier: fileId, compte: rawAux } });
                if (!createdAux) {
                  createdAux = await dossierPlanComptable.create({
                    id_compte: compteId,
                    id_dossier: fileId,
                    compte: rawAux,
                    libelle: String(item.CompAuxLib || item.CompteLib || '').slice(0, 150),
                    nature: 'Aux',
                    typetier: 'sans-nif',
                    pays: 'Madagascar',
                    baseaux: genCompte?.id || 0,
                  });
                }
                foundCompte = createdAux || genCompte;
              } else if (genCompte) {
                foundCompte = genCompte;
              }
              if (!foundCompte) {
                skippedNoCompte++;
                skippedDetails.push({
                  reason: 'COMPTE_INTRouvable',
                  ecritureNum: item.EcritureNum,
                  compteNum: rawGen,
                  compteAux: rawAux,
                  ligne: item
                });
                continue;
              }
            }

            const compteNumId = foundCompte.id;
            const IdCompAuxNum = foundCompte.baseaux_id || foundCompte.id;

            const normalizeAmount = (val) => {
              if (val == null) return 0;
              let s = String(val).trim();
              if (!s) return 0;
              s = s.replace(/\s+/g, '');
              if (s.includes(',') && s.includes('.')) {
                s = s.replace(/\./g, '').replace(/,/g, '.');
              } else if (s.includes(',')) {
                s = s.replace(/,/g, '.');
              }
              const n = parseFloat(s);
              return isNaN(n) ? 0 : n;
            };

            const debit = normalizeAmount(item.Debit);
            const credit = normalizeAmount(item.Credit);

            let dateEcriture = null;
            let vraiedate = null;

            // Helper function to parse dates in multiple formats
            const parseEcritureDate = (dateStr) => {
              if (!dateStr) return null;
              const s = String(dateStr).trim();

              // Format: dd/mm/yyyy or dd-mm-yyyy
              if (s.includes('/')) {
                const [day, month, year] = s.split('/');
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              }

              // Format: yyyymmdd (8 digits)
              if (/^\d{8}$/.test(s)) {
                const year = s.substring(0, 4);
                const month = s.substring(4, 6);
                const day = s.substring(6, 8);
                return `${year}-${month}-${day}`;
              }

              // Format: yyyy-mm-dd
              if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                return s;
              }

              return null;
            };

            if (idCodeJournal && idCodeJournal.type === 'RAN') {
              // Pour RAN: dateEcriture = exerciceStart, vraiedate = EcritureDate
              dateEcriture = parseEcritureDate(item.exerciceStart);
              vraiedate = parseEcritureDate(item.EcritureDate);
            }
            else {
              // Pour non-RAN: les deux dates = EcritureDate
              dateEcriture = parseEcritureDate(item.EcritureDate);
              vraiedate = dateEcriture;
            }

            if (!dateEcriture) {
              skippedNoDate++;
              skippedDetails.push({
                reason: 'DATE_INVALIDE',
                ecritureNum: item.EcritureNum,
                compteNum: rawGen,
                ecritureDate: item.EcritureDate,
                exerciceStart: item.exerciceStart,
                isRAN: idCodeJournal?.type === 'RAN',
                ligne: item
              });
              skippedCount++;
              processedLines++;
              continue;
            }

            const datePiece = toMidnight(parseDate(item.PieceDate));
            const datelettrage = toMidnight(parseDate(item.DateLet));
            const devCode = String(item.Idevise || '').trim() || 'MGA';
            const devId = deviseMap.get(devCode) || defaultDeviseId || 0;

            const rawAuxToAdd = (rawAux === '' || rawAux === null) ? rawGen : rawAux;

            const journalEntry = await journals.create({
              id_compte: Number(compteId),
              id_dossier: Number(fileId),
              id_exercice: Number(selectedPeriodeId),
              id_ecriture: newIdEcriture,
              dateecriture: dateEcriture,
              id_journal: codeJournalId,
              id_numcpt: compteNumId,
              id_numcptcentralise: IdCompAuxNum,
              piece: item.PieceRef || '',
              piecedate: datePiece,
              libelle: String(item.EcritureLib || '').substring(0, 50),
              debit: debit,
              credit: credit,
              id_devise: devId || 0,
              devise: devCode,
              lettrage: item.EcritureLet || null,
              lettragedate: datelettrage || null,
              saisiepar: Number(userId),
              modifierpar: Number(userId) || 0,
              datesaisie: new Date(),
              comptegen: rawGen,
              compteaux: rawAuxToAdd,
              libelleaux: rawGen === rawAuxToAdd ? String(foundGen?.libelle).substring(0, 50) || String(item.EcritureLib || '').substring(0, 50) : String(foundAux?.libelle).substring(0, 50) || String(item.EcritureLib || '').substring(0, 50),
              libellecompte: foundGen?.libelle || String(item.EcritureLib || '').substring(0, 50),
              vraiedate: vraiedate
            });

            // Gestion de la colonne analytique
            const analytiqueValue = normalizeAnalytiqueDisplay(item.Analytique);
            if (analytiqueValue && (debit !== 0 || credit !== 0)) {
              // Récupérer la section existante dans le sectionMap
              const section = sectionMap.get(normalizeAnalytiqueKey(analytiqueValue));
              // Insérer dans analytiques en utilisant l'ID de la section existante
              await analytiques.create({
                id_compte: Number(compteId),
                id_exercice: Number(selectedPeriodeId),
                id_dossier: Number(fileId),
                id_axe: section.id_axe,
                id_section: section.id,
                id_ligne_ecriture: journalEntry.id,
                debit: debit,
                credit: credit,
                pourcentage: 100
              });
            }

            importedCount++;
            processedLines++;
          } catch (error) {
            skippedError++;
            skippedDetails.push({
              reason: 'ERREUR',
              ecritureNum: item?.EcritureNum,
              compteNum: item?.CompteNum,
              message: error?.message,
              error: String(error),
              ligne: item
            });
            console.error('Erreur ligne:', error);
            skippedCount++;
            if (!firstLineErrorMessage) {
              firstLineErrorMessage = error?.message ? String(error.message) : String(error);
            }
            processedLines++;
          }
        }
      }

      const batchProgress = 15 + Math.floor((processedLines / totalLines) * 70);
      progress.update(processedLines, totalLines, 'Importation des écritures...', batchProgress);
    }
    progress.step('Finalisation...', 95);

    const finalMsg = skippedCount > 0
      ? `${importedCount} lignes importées, ${skippedCount} ignorées (Compte:${skippedNoCompte}, Date:${skippedNoDate}, Erreur:${skippedError})`
      : `${importedCount} lignes ont été importées avec succès`;


    progress.complete(
      finalMsg,
      { nbrligne: importedCount, ignored: skippedCount, skippedNoCompte, skippedNoDate, skippedError, skippedDetails: skippedDetails.slice(0, 20) }
    );

  } catch (error) {
    console.error("Erreur import journal :", error);
    const msg = error?.message
      ? `Erreur lors de l'import du journal: ${error.message}`
      : "Erreur lors de l'import du journal";
    progress.error(msg, error);
  }
};

const importJournalWithProgress = withSSEProgress(importJournalWithProgressLogic, {
  batchSize: 20
});

module.exports = {
  createNotExistingCodeJournal,
  createNotExistingCompte,
  testIfRanExist,
  getAllCodeRan,
  importJournalWithProgress,
  recupListeImporte
};