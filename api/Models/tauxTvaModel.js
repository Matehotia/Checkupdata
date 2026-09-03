module.exports = (sequelize, DataTypes) => {
    // deductible = true  -> TVA déductible (achats)
    // deductible = false -> TVA collectée  (ventes)
    const tauxtva = sequelize.define("tauxtva", {
        id_compte: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        id_dossier: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        deductible: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        taux: {
            type: DataTypes.DECIMAL(6, 2),
            allowNull: false,
            defaultValue: 0
        }
    }, {
        tableName: 'tauxtva',
        freezeTableName: true
    });

    return tauxtva;
};
