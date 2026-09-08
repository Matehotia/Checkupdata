'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('parametrage_tresorerie', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      id_compte: { type: Sequelize.BIGINT, allowNull: false },
      id_dossier: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      operateur: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'contient' },
      mot_cle: { type: Sequelize.STRING(255), allowNull: false, defaultValue: '' },
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

    await queryInterface.addIndex('parametrage_tresorerie', ['id_compte', 'id_dossier'], {
      name: 'idx_param_tresorerie_dossier',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('parametrage_tresorerie');
  },
};
