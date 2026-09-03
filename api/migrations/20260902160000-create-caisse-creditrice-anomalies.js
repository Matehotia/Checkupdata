'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('caisse_creditrice_anomalies', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_compte: { type: Sequelize.BIGINT, allowNull: false },
      id_dossier: { type: Sequelize.BIGINT, allowNull: false },
      id_exercice: { type: Sequelize.BIGINT, allowNull: false },
      id_periode: { type: Sequelize.INTEGER, allowNull: true },

      id_journal: { type: Sequelize.BIGINT, allowNull: true },
      id_ecriture: { type: Sequelize.STRING(50), allowNull: true },
      compte: { type: Sequelize.STRING(50), allowNull: true },
      comptegen: { type: Sequelize.STRING(50), allowNull: true },
      piece: { type: Sequelize.STRING(100), allowNull: true },
      libelle: { type: Sequelize.STRING(255), allowNull: true },
      dateecriture: { type: Sequelize.DATEONLY, allowNull: true },

      debit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      credit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      solde_cumule: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

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

    await queryInterface.addIndex('caisse_creditrice_anomalies', ['id_compte', 'id_dossier', 'id_exercice', 'id_periode'], {
      name: 'idx_caisse_cred_scope',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('caisse_creditrice_anomalies');
  },
};
