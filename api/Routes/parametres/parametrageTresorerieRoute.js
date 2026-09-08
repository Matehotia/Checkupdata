const express = require('express');
const router = express.Router();
const ctrl = require('../../Controllers/parametres/parametrageTresorerieController');
const verifyJWT = require('../../Middlewares/verifyJWT');

router.use(verifyJWT);

// Liste des règles d'un dossier
router.get('/:id_compte/:id_dossier', ctrl.getTresorerie);
// Créer
router.post('/', ctrl.createTresorerie);
// Modifier
router.put('/:id', ctrl.updateTresorerie);
// Supprimer
router.delete('/:id', ctrl.deleteTresorerie);

module.exports = router;
