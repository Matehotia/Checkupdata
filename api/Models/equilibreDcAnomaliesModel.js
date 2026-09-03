module.exports = (sequelize, DataTypes) => {
    // Anomalies enregistrées du contrôle « Équilibre débit = crédit ».
    // type = 'GLOBAL'  -> une ligne récap (totaux + écart global + équilibre)
    // type = 'ECRITURE' -> une écriture déséquilibrée
    const equilibre = sequelize.define("equilibre_dc_anomalies", {
        id_compte: { type: DataTypes.BIGINT, allowNull: false },
        id_dossier: { type: DataTypes.BIGINT, allowNull: false },
        id_exercice: { type: DataTypes.BIGINT, allowNull: false },
        id_periode: { type: DataTypes.INTEGER, allowNull: true },

        type: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ECRITURE' },
        id_ecriture: { type: DataTypes.STRING(50), allowNull: true },

        total_debit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        total_credit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        ecart: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        equilibre: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    }, {
        tableName: 'equilibre_dc_anomalies',
        freezeTableName: true
    });

    return equilibre;
};
