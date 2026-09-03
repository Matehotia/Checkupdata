module.exports = (sequelize, DataTypes) => {
    // Anomalies enregistrées du contrôle « Caisse créditrice ».
    // Une ligne = une écriture où le solde cumulé de la caisse (53x) est négatif.
    const caisse = sequelize.define("caisse_creditrice_anomalies", {
        id_compte: { type: DataTypes.BIGINT, allowNull: false },
        id_dossier: { type: DataTypes.BIGINT, allowNull: false },
        id_exercice: { type: DataTypes.BIGINT, allowNull: false },
        id_periode: { type: DataTypes.INTEGER, allowNull: true },

        id_journal: { type: DataTypes.BIGINT, allowNull: true },        // journals.id source
        id_ecriture: { type: DataTypes.STRING(50), allowNull: true },
        compte: { type: DataTypes.STRING(50), allowNull: true },        // compte caisse (53x)
        comptegen: { type: DataTypes.STRING(50), allowNull: true },
        piece: { type: DataTypes.STRING(100), allowNull: true },
        libelle: { type: DataTypes.STRING(255), allowNull: true },
        dateecriture: { type: DataTypes.DATEONLY, allowNull: true },

        debit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        credit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        solde_cumule: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 }
    }, {
        tableName: 'caisse_creditrice_anomalies',
        freezeTableName: true
    });

    return caisse;
};
