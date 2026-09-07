'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sequence_cheque_anomalies', 'ecart', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('sequence_cheque_anomalies', 'anomalie', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('sequence_cheque_anomalies', 'anomalie');
    await queryInterface.removeColumn('sequence_cheque_anomalies', 'ecart');
  },
};
