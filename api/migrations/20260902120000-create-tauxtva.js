'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('tauxtva', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_compte: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      id_dossier: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      // true = TVA déductible (achats) ; false = TVA collectée (ventes)
      deductible: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // Taux de TVA en pourcentage
      taux: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 0,
      },
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

    // Un seul taux par (dossier, compte, type déductible/collectée)
    await queryInterface.addIndex('tauxtva', ['id_compte', 'id_dossier', 'deductible'], {
      name: 'idx_tauxtva_dossier_type',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('tauxtva');
  },
};
