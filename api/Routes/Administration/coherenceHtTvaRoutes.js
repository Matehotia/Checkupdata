const express = require('express');
const router = express.Router();
const coherenceHtTvaController = require('../../Controllers/administration/coherenceHtTvaController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Données détaillées (écritures incohérentes HT/TVA/TTC)
router.get('/:id_compte/:id_dossier/:id_exercice', coherenceHtTvaController.getCoherenceHtTva);

// Enregistre les anomalies dans la base (remplace le périmètre)
router.post('/save/:id_compte/:id_dossier/:id_exercice', coherenceHtTvaController.saveCoherence);

// Lit les anomalies enregistrées (table)
router.get('/stored/:id_compte/:id_dossier/:id_exercice', coherenceHtTvaController.getStored);

// Stats (dashboard)
router.get('/:id_compte/:id_dossier/:id_exercice/stats', coherenceHtTvaController.getStats);

module.exports = router;
