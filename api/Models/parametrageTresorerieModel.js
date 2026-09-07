module.exports = (sequelize, DataTypes) => {
    // Paramétrage Trésorerie : règles (opérateur + mot-clé) définies par dossier.
    // operateur ∈ { 'contient', 'commence_par', 'egal' }
    const tresorerie = sequelize.define("parametrage_tresorerie", {
        id_compte: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        id_dossier: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        operateur: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'contient'
        },
        mot_cle: {
            type: DataTypes.STRING(255),
            allowNull: false,
            defaultValue: ''
        }
    }, {
        tableName: 'parametrage_tresorerie',
        freezeTableName: true
    });

    return tresorerie;
};
