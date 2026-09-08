const db = require('../../Models');

// Liste des taux de TVA paramétrés pour un dossier
exports.getTauxTva = async (req, res) => {
  try {
    const { id_compte, id_dossier } = req.params;
    const rows = await db.tauxtva.findAll({
      where: { id_compte: parseInt(id_compte, 10), id_dossier: parseInt(id_dossier, 10) },
      order: [['deductible', 'DESC'], ['taux', 'ASC']],
    });
    return res.json({ state: true, data: rows });
  } catch (error) {
    console.error('[TAUX_TVA_PARAM] get error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Créer un taux
exports.createTauxTva = async (req, res) => {
  try {
    const { id_compte, id_dossier, deductible, taux } = req.body;
    if (id_compte == null || id_dossier == null || taux == null) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }
    const row = await db.tauxtva.create({
      id_compte: parseInt(id_compte, 10),
      id_dossier: parseInt(id_dossier, 10),
      deductible: deductible === true || deductible === 'true',
      taux: Number(taux),
    });
    return res.status(201).json({ state: true, data: row });
  } catch (error) {
    console.error('[TAUX_TVA_PARAM] create error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Modifier un taux
exports.updateTauxTva = async (req, res) => {
  try {
    const { id } = req.params;
    const { deductible, taux } = req.body;
    const row = await db.tauxtva.findByPk(id);
    if (!row) return res.status(404).json({ state: false, message: 'Introuvable' });

    if (deductible !== undefined) row.deductible = deductible === true || deductible === 'true';
    if (taux !== undefined) row.taux = Number(taux);
    await row.save();

    return res.json({ state: true, data: row });
  } catch (error) {
    console.error('[TAUX_TVA_PARAM] update error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Supprimer un taux
exports.deleteTauxTva = async (req, res) => {
  try {
    const { id } = req.params;
    const n = await db.tauxtva.destroy({ where: { id: parseInt(id, 10) } });
    if (!n) return res.status(404).json({ state: false, message: 'Introuvable' });
    return res.json({ state: true });
  } catch (error) {
    console.error('[TAUX_TVA_PARAM] delete error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};
