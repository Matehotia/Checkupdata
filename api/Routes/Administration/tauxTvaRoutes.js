const express = require('express');
const router = express.Router();
const tauxTvaController = require('../../Controllers/administration/tauxTvaController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Données détaillées calculées en live (factures avec leur taux de TVA)
router.get('/:id_compte/:id_dossier/:id_exercice', tauxTvaController.getTauxTva);

// Stats (dashboard) — depuis la table
router.get('/:id_compte/:id_dossier/:id_exercice/stats', tauxTvaController.getStats);

// Lecture des anomalies enregistrées (table)
router.get('/stored/:id_compte/:id_dossier/:id_exercice', tauxTvaController.getStored);

// Réviser = recalcule + enregistre (conserve valide/commentaire)
router.post('/save/:id_compte/:id_dossier/:id_exercice', tauxTvaController.saveTauxTva);

// Mettre à jour valide / commentaire d'une anomalie
router.put('/anomalie/:id', tauxTvaController.updateAnomalie);

module.exports = router;
