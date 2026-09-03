module.exports = (sequelize, DataTypes) => {
    // Anomalies enregistrées du contrôle « Taux de TVA ».
    // Une ligne = une facture. Le détail est affiché en live via id_ecriture.
    // taux = TVA / HT (en %). valide/commentaire = workflow de révision.
    const tauxtvaAnomalies = sequelize.define("taux_tva_anomalies", {
        id_compte: { type: DataTypes.BIGINT, allowNull: false },
        id_dossier: { type: DataTypes.BIGINT, allowNull: false },
        id_exercice: { type: DataTypes.BIGINT, allowNull: false },
        id_periode: { type: DataTypes.INTEGER, allowNull: true },

        id_ecriture: { type: DataTypes.STRING(50), allowNull: false },
        piece: { type: DataTypes.STRING(100), allowNull: true },
        id_num_compte: { type: DataTypes.STRING(50), allowNull: true },

        dateecriture: { type: DataTypes.DATEONLY, allowNull: true },
        libelle: { type: DataTypes.STRING(255), allowNull: true },
        type: { type: DataTypes.STRING(20), allowNull: true },

        ht: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        tva: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        ttc: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        taux: { type: DataTypes.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
        ecart: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

        motifs: { type: DataTypes.TEXT, allowNull: true },

        // Résultat de la comparaison taux réel vs taux paramétré : true = non conforme
        anomalie: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

        valide: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        commentaire: { type: DataTypes.TEXT, allowNull: true }
    }, {
        tableName: 'taux_tva_anomalies',
        freezeTableName: true
    });

    return tauxtvaAnomalies;
};
