module.exports = (sequelize, DataTypes) => {
    // Paramétrage Vente : format du numéro de facture de vente, par dossier (une ligne par dossier).
    const vente = sequelize.define("parametrage_vente", {
        id_compte: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        id_dossier: {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0
        },
        prefixe_facture: {
            type: DataTypes.STRING(50),
            allowNull: true,
            defaultValue: ''
        },
        longueur_facture: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        // true = on retire les lettres du numéro extrait (F26 -> 26, CV016 -> 016)
        retirer_lettres: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        tableName: 'parametrage_vente',
        freezeTableName: true
    });

    return vente;
};
