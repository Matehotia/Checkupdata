const db = require('../../Models');

// Liste des formats de numéro de facture d'un dossier
exports.getVente = async (req, res) => {
  try {
    const { id_compte, id_dossier } = req.params;
    const rows = await db.parametrageVente.findAll({
      where: { id_compte: parseInt(id_compte, 10), id_dossier: parseInt(id_dossier, 10) },
      order: [['id', 'ASC']],
    });
    return res.json({ state: true, data: rows });
  } catch (error) {
    console.error('[PARAM_VENTE] get error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Créer un format
exports.createVente = async (req, res) => {
  try {
    const { id_compte, id_dossier, prefixe_facture, longueur_facture, retirer_lettres } = req.body;
    if (id_compte == null || id_dossier == null) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }
    const row = await db.parametrageVente.create({
      id_compte: parseInt(id_compte, 10),
      id_dossier: parseInt(id_dossier, 10),
      prefixe_facture: prefixe_facture != null ? String(prefixe_facture).trim() : '',
      longueur_facture: (longueur_facture !== undefined && longueur_facture !== null && longueur_facture !== '')
        ? parseInt(longueur_facture, 10) : null,
      retirer_lettres: retirer_lettres === true || retirer_lettres === 'true',
    });
    return res.status(201).json({ state: true, data: row });
  } catch (error) {
    console.error('[PARAM_VENTE] create error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Modifier un format
exports.updateVente = async (req, res) => {
  try {
    const { id } = req.params;
    const { prefixe_facture, longueur_facture, retirer_lettres } = req.body;
    const row = await db.parametrageVente.findByPk(id);
    if (!row) return res.status(404).json({ state: false, message: 'Introuvable' });

    if (prefixe_facture !== undefined) row.prefixe_facture = String(prefixe_facture).trim();
    if (longueur_facture !== undefined) {
      row.longueur_facture = (longueur_facture !== null && longueur_facture !== '')
        ? parseInt(longueur_facture, 10) : null;
    }
    if (retirer_lettres !== undefined) row.retirer_lettres = retirer_lettres === true || retirer_lettres === 'true';
    await row.save();

    return res.json({ state: true, data: row });
  } catch (error) {
    console.error('[PARAM_VENTE] update error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Supprimer un format
exports.deleteVente = async (req, res) => {
  try {
    const { id } = req.params;
    const n = await db.parametrageVente.destroy({ where: { id: parseInt(id, 10) } });
    if (!n) return res.status(404).json({ state: false, message: 'Introuvable' });
    return res.json({ state: true });
  } catch (error) {
    console.error('[PARAM_VENTE] delete error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};
