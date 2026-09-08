const db = require('../../Models');

const OPERATEURS = ['cont', 'com_par', '='];
const normOp = (op) => (OPERATEURS.includes(op) ? op : 'contient');

// Liste des règles Trésorerie d'un dossier
exports.getTresorerie = async (req, res) => {
  try {
    const { id_compte, id_dossier } = req.params;
    const rows = await db.parametrageTresorerie.findAll({
      where: { id_compte: parseInt(id_compte, 10), id_dossier: parseInt(id_dossier, 10) },
      order: [['id', 'ASC']],
    });
    return res.json({ state: true, data: rows });
  } catch (error) {
    console.error('[PARAM_TRESORERIE] get error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Créer une règle
exports.createTresorerie = async (req, res) => {
  try {
    const { id_compte, id_dossier, operateur, mot_cle } = req.body;
    if (id_compte == null || id_dossier == null || !mot_cle || !String(mot_cle).trim()) {
      return res.status(400).json({ state: false, message: 'Paramètres manquants' });
    }
    const row = await db.parametrageTresorerie.create({
      id_compte: parseInt(id_compte, 10),
      id_dossier: parseInt(id_dossier, 10),
      operateur: normOp(operateur),
      mot_cle: String(mot_cle).trim(),
    });
    return res.status(201).json({ state: true, data: row });
  } catch (error) {
    console.error('[PARAM_TRESORERIE] create error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Modifier une règle
exports.updateTresorerie = async (req, res) => {
  try {
    const { id } = req.params;
    const { operateur, mot_cle } = req.body;
    const row = await db.parametrageTresorerie.findByPk(id);
    if (!row) return res.status(404).json({ state: false, message: 'Introuvable' });

    if (operateur !== undefined) row.operateur = normOp(operateur);
    if (mot_cle !== undefined) row.mot_cle = String(mot_cle).trim();
    await row.save();

    return res.json({ state: true, data: row });
  } catch (error) {
    console.error('[PARAM_TRESORERIE] update error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};

// Supprimer une règle
exports.deleteTresorerie = async (req, res) => {
  try {
    const { id } = req.params;
    const n = await db.parametrageTresorerie.destroy({ where: { id: parseInt(id, 10) } });
    if (!n) return res.status(404).json({ state: false, message: 'Introuvable' });
    return res.json({ state: true });
  } catch (error) {
    console.error('[PARAM_TRESORERIE] delete error:', error);
    return res.status(500).json({ state: false, message: 'Erreur serveur', error: error.message });
  }
};