const express = require('express');
const router = express.Router();
const revueNN1Controller = require('../../Controllers/administration/revueAnalytiqueNN1Controller');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Données calculées en live (aperçu / debug)
router.get('/:id_compte/:id_dossier/:id_exercice', revueNN1Controller.getLive);

// Stats (dashboard) — depuis la table
router.get('/:id_compte/:id_dossier/:id_exercice/stats', revueNN1Controller.getStats);

// Lecture des anomalies enregistrées (table)
router.get('/stored/:id_compte/:id_dossier/:id_exercice', revueNN1Controller.getStored);

// Réviser = recalcule + enregistre (conserve valide/commentaire)
router.post('/save/:id_compte/:id_dossier/:id_exercice', revueNN1Controller.saveRevueNN1);

// Mettre à jour valide / commentaire d'une anomalie
router.put('/anomalie/:id', revueNN1Controller.updateAnomalie);

module.exports = router;
