module.exports = (sequelize, DataTypes) => {
    // Résultats enregistrés du contrôle « Séquence des numéros de chèque ».
    // Une ligne = une écriture BANQUE (hors 512x) dont le libellé matche une règle Trésorerie.
    const seqcheque = sequelize.define("sequence_cheque_anomalies", {
        id_compte: { type: DataTypes.BIGINT, allowNull: false },
        id_dossier: { type: DataTypes.BIGINT, allowNull: false },
        id_exercice: { type: DataTypes.BIGINT, allowNull: false },
        id_periode: { type: DataTypes.INTEGER, allowNull: true },

        id_journal: { type: DataTypes.BIGINT, allowNull: true },
        id_ecriture: { type: DataTypes.STRING(50), allowNull: true },
        code_journal: { type: DataTypes.STRING(20), allowNull: true },
        comptegen: { type: DataTypes.STRING(50), allowNull: true },
        compteaux: { type: DataTypes.STRING(50), allowNull: true },
        piece: { type: DataTypes.STRING(100), allowNull: true },
        libelle: { type: DataTypes.STRING(255), allowNull: true },
        numero_cheque: { type: DataTypes.STRING(50), allowNull: true },
        dateecriture: { type: DataTypes.DATEONLY, allowNull: true },

        debit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
        credit: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

        // Séquence : écart avec le chèque précédent du même journal ; anomalie si écart != 1
        ecart: { type: DataTypes.INTEGER, allowNull: true },
        anomalie: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    }, {
        tableName: 'sequence_cheque_anomalies',
        freezeTableName: true
    });

    return seqcheque;
};
