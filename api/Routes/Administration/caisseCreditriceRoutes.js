const express = require('express');
const router = express.Router();
const caisseCreditriceController = require('../../Controllers/administration/caisseCreditriceController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Données détaillées calculées en live (lignes où la caisse 53x est créditrice)
router.get('/:id_compte/:id_dossier/:id_exercice', caisseCreditriceController.getCaisseCreditrice);

// Stats (dashboard) — depuis la table
router.get('/:id_compte/:id_dossier/:id_exercice/stats', caisseCreditriceController.getStats);

// Lecture des anomalies enregistrées (table)
router.get('/stored/:id_compte/:id_dossier/:id_exercice', caisseCreditriceController.getStored);

// Réviser = recalcule + enregistre
router.post('/save/:id_compte/:id_dossier/:id_exercice', caisseCreditriceController.saveCaisse);

module.exports = router;
