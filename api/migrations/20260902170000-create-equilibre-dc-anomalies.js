'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('equilibre_dc_anomalies', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_compte: { type: Sequelize.BIGINT, allowNull: false },
      id_dossier: { type: Sequelize.BIGINT, allowNull: false },
      id_exercice: { type: Sequelize.BIGINT, allowNull: false },
      id_periode: { type: Sequelize.INTEGER, allowNull: true },

      type: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'ECRITURE' },
      id_ecriture: { type: Sequelize.STRING(50), allowNull: true },

      total_debit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      total_credit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      ecart: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      equilibre: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

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

    await queryInterface.addIndex('equilibre_dc_anomalies', ['id_compte', 'id_dossier', 'id_exercice', 'id_periode'], {
      name: 'idx_equilibre_dc_scope',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('equilibre_dc_anomalies');
  },
};
