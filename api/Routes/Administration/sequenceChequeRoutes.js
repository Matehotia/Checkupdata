const express = require('express');
const router = express.Router();
const sequenceChequeController = require('../../Controllers/administration/sequenceChequeController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Données détaillées calculées en live (écritures BANQUE filtrées par les règles Trésorerie)
router.get('/:id_compte/:id_dossier/:id_exercice', sequenceChequeController.getSequenceCheque);

// Stats (dashboard) — depuis la table
router.get('/:id_compte/:id_dossier/:id_exercice/stats', sequenceChequeController.getStats);

// Lecture des résultats enregistrés (table)
router.get('/stored/:id_compte/:id_dossier/:id_exercice', sequenceChequeController.getStored);

// Réviser = recalcule + enregistre
router.post('/save/:id_compte/:id_dossier/:id_exercice', sequenceChequeController.saveSequence);

module.exports = router;
