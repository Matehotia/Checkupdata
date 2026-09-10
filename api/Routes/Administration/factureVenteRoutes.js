const express = require('express');
const router = express.Router();
const factureVenteController = require('../../Controllers/administration/factureVenteController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Données détaillées calculées en live (VENTE, comptes 70x, n° facture extrait)
router.get('/:id_compte/:id_dossier/:id_exercice', factureVenteController.getFactureVente);

// Stats (dashboard) — depuis la table
router.get('/:id_compte/:id_dossier/:id_exercice/stats', factureVenteController.getStats);

// Lecture des résultats enregistrés (table)
router.get('/stored/:id_compte/:id_dossier/:id_exercice', factureVenteController.getStored);

// Réviser = recalcule + enregistre
router.post('/save/:id_compte/:id_dossier/:id_exercice', factureVenteController.saveFactureVente);

module.exports = router;
