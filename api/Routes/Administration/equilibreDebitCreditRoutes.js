const express = require('express');
const router = express.Router();
const equilibreDebitCreditController = require('../../Controllers/administration/equilibreDebitCreditController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Données détaillées calculées en live (global + écritures déséquilibrées)
router.get('/:id_compte/:id_dossier/:id_exercice', equilibreDebitCreditController.getEquilibre);

// Stats (dashboard) — depuis la table
router.get('/:id_compte/:id_dossier/:id_exercice/stats', equilibreDebitCreditController.getStats);

// Lecture des anomalies enregistrées (table)
router.get('/stored/:id_compte/:id_dossier/:id_exercice', equilibreDebitCreditController.getStored);

// Réviser = recalcule + enregistre
router.post('/save/:id_compte/:id_dossier/:id_exercice', equilibreDebitCreditController.saveEquilibre);

module.exports = router;
