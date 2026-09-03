const express = require('express');
const router = express.Router();
const ctrl = require('../../Controllers/parametres/tauxTvaParamController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Liste des taux paramétrés d'un dossier
router.get('/:id_compte/:id_dossier', ctrl.getTauxTva);
// Créer
router.post('/', ctrl.createTauxTva);
// Modifier
router.put('/:id', ctrl.updateTauxTva);
// Supprimer
router.delete('/:id', ctrl.deleteTauxTva);

module.exports = router;
