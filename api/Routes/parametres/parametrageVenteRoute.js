const express = require('express');
const router = express.Router();
const ctrl = require('../../Controllers/parametres/parametrageVenteController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Liste des formats de facture d'un dossier
router.get('/:id_compte/:id_dossier', ctrl.getVente);
// Créer
router.post('/', ctrl.createVente);
// Modifier
router.put('/:id', ctrl.updateVente);
// Supprimer
router.delete('/:id', ctrl.deleteVente);

module.exports = router;
