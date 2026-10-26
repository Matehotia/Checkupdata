module.exports = (sequelize, DataTypes) => {
    const revueNN1Anomalies = sequelize.define("revue_nn1_anomalies", {
        id_compte: { type: DataTypes.BIGINT, allowNull: false },
        id_dossier: { type: DataTypes.BIGINT, allowNull: false },
        id_exercice: { type: DataTypes.BIGINT, allowNull: false },
        id_periode: { type: DataTypes.INTEGER, allowNull: true },

        code: { type: DataTypes.STRING(20), allowNull: false },
        regle: { type: DataTypes.STRING(120), allowNull: true },
        compte: { type: DataTypes.STRING(50), allowNull: true },
        libelle: { type: DataTypes.STRING(255), allowNull: true },
        severite: { type: DataTypes.STRING(20), allowNull: true },

        motif: { type: DataTypes.TEXT, allowNull: true },
        valeurs: { type: DataTypes.TEXT, allowNull: true },

        anomalie: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

        valide: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        commentaire: { type: DataTypes.TEXT, allowNull: true }
    }, {
        tableName: 'revue_nn1_anomalies',
        freezeTableName: true
    });

    return revueNN1Anomalies;
};
