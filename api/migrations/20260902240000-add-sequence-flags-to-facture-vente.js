'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('facture_vente_anomalies', 'ecart', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('facture_vente_anomalies', 'anomalie', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('facture_vente_anomalies', 'anomalie');
    await queryInterface.removeColumn('facture_vente_anomalies', 'ecart');
  },
};
