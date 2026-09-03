module.exports = (sequelize, DataTypes) => {
    // Anomalies enregistrées du contrôle « Cohérence HT / TVA / TTC ».
    // Une ligne = une facture incohérente. Le détail (lignes de l'écriture) n'est PAS stocké,
    // il est affiché en live via id_ecriture. ttc = TTC réel (tiers + retenue déjà inclus).
    const coherence = sequelize.define("coherence_ht_tva_anomalies", {
        id_compte: { type: DataTypes.BIGINT, allowNull: false },
        id_dossier: { type: DataTypes.BIGINT, allowNull: false },
        id_exercice: { type: DataTypes.BIGINT, allowNull: false },
        id_periode: { type: DataTypes.INTEGER, allowNull: true },

        id_ecriture: { type: DataTypes.STRING(50), allowNull: false },   // clé pour afficher le détail
        piece: { type: DataTypes.STRING(100), allowNull: true },          // n° de facture
        id_num_compte: { type: DataTypes.STRING(50), allowNull: true },   // compte HT (6/7) de la ligne principale

        dateecriture: { type: DataTypes.DATEONLY, allowNull: true },
        libelle: { type: DataTypes.STRING(255), allowNull: true },
        type: { type: DataTypes.STRING(20), allowNull: true },            // Achat / Vente / Mixte

        ht: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        tva: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        ttc: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },  // TTC réel (retenue incluse)
        ecart: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

        motifs: { type: DataTypes.TEXT, allowNull: true }                 // ex. "TVA > HT | HT > TTC"
    }, {
        tableName: 'coherence_ht_tva_anomalies',
        freezeTableName: true
    });

    return coherence;
};
