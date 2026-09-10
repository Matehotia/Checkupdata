'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('parametrage_vente', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_compte: { type: Sequelize.BIGINT, allowNull: false },
      id_dossier: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      prefixe_facture: { type: Sequelize.STRING(50), allowNull: true, defaultValue: '' },
      longueur_facture: { type: Sequelize.INTEGER, allowNull: true },
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

    await queryInterface.addIndex('parametrage_vente', ['id_compte', 'id_dossier'], {
      name: 'idx_param_vente_dossier',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('parametrage_vente');
  },
};
