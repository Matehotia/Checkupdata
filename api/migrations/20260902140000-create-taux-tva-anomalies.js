'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('taux_tva_anomalies', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_compte: { type: Sequelize.BIGINT, allowNull: false },
      id_dossier: { type: Sequelize.BIGINT, allowNull: false },
      id_exercice: { type: Sequelize.BIGINT, allowNull: false },
      id_periode: { type: Sequelize.INTEGER, allowNull: true },

      id_ecriture: { type: Sequelize.STRING(50), allowNull: false },
      piece: { type: Sequelize.STRING(100), allowNull: true },
      id_num_compte: { type: Sequelize.STRING(50), allowNull: true },

      dateecriture: { type: Sequelize.DATEONLY, allowNull: true },
      libelle: { type: Sequelize.STRING(255), allowNull: true },
      type: { type: Sequelize.STRING(20), allowNull: true },

      ht: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      tva: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      ttc: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      taux: { type: Sequelize.DECIMAL(6, 2), allowNull: false, defaultValue: 0 },
      ecart: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

      motifs: { type: Sequelize.TEXT, allowNull: true },

      valide: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      commentaire: { type: Sequelize.TEXT, allowNull: true },

      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('taux_tva_anomalies', ['id_compte', 'id_dossier', 'id_exercice', 'id_periode'], {
      name: 'idx_taux_tva_scope',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('taux_tva_anomalies');
  },
};
