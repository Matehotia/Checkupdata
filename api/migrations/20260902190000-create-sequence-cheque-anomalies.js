'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sequence_cheque_anomalies', {
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
      code_journal: { type: Sequelize.STRING(20), allowNull: true },
      comptegen: { type: Sequelize.STRING(50), allowNull: true },
      compteaux: { type: Sequelize.STRING(50), allowNull: true },
      piece: { type: Sequelize.STRING(100), allowNull: true },
      libelle: { type: Sequelize.STRING(255), allowNull: true },
      numero_cheque: { type: Sequelize.STRING(50), allowNull: true },
      dateecriture: { type: Sequelize.DATEONLY, allowNull: true },

      debit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      credit: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },

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

    await queryInterface.addIndex('sequence_cheque_anomalies', ['id_compte', 'id_dossier', 'id_exercice', 'id_periode'], {
      name: 'idx_seq_cheque_scope',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('sequence_cheque_anomalies');
  },
};
