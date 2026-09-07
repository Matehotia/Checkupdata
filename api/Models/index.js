//importing modules
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

//Database connection with dialect of postgres specifying the database we are using
//port for my database is 5433
//database name is discover
const DB_ConnexionString = `postgresql://${process.env.NODE_API_USER}:${process.env.NODE_API_PWD}@${process.env.NODE_API_URL}:${process.env.DB_PORT}/${process.env.NODE_API_DBNAME}`;
const sequelize = new Sequelize(
    DB_ConnexionString,
    {
        dialect: "postgres",
        logging: false
    }

)
//const sequelize = new Sequelize(`postgresql://postgres:admin@localhost:5432/kaonty`, {dialect: "postgres"})

//checking if connection is done
sequelize.authenticate().then(() => {
}).catch((err) => {
})

const db = {}
db.Sequelize = Sequelize
db.sequelize = sequelize

//connecting to model
db.users = require('./userModel')(sequelize, DataTypes);
db.userscomptes = require('./compteModel')(sequelize, DataTypes);
db.resetToken = require('./resetTokenModel')(sequelize, DataTypes);

db.dossierPasswordAccess = require('./dossiersMotDePasseAcces')(sequelize, DataTypes);

//Gsetion rôle et permission
db.roles = require('./rolesModel')(sequelize, DataTypes);
db.permissions = require('./permissionsModel')(sequelize, DataTypes);
db.userPermission = require('./userPermissionsModel')(sequelize, DataTypes);
db.rolePermission = require('./rolePermissionsModel')(sequelize, DataTypes);

//gestion des membres
// db.membres = require('./membreIdentiteModel')(sequelize, DataTypes);
// db.membres_updates = require("./membreUpdateModel")(sequelize, Sequelize);

//paramétres - exercice
db.exercices = require('./exerciceModel')(sequelize, DataTypes);
db.periodes = require('./periodesModel')(sequelize, DataTypes);

//paramétres - taux de TVA par dossier
db.tauxtva = require('./tauxTvaModel')(sequelize, DataTypes);

//paramétres - Trésorerie (règles opérateur + mot-clé) par dossier
db.parametrageTresorerie = require('./parametrageTresorerieModel')(sequelize, DataTypes);

//anomalies enregistrées - contrôle cohérence HT/TVA/TTC
db.coherenceHtTvaAnomalies = require('./coherenceHtTvaAnomaliesModel')(sequelize, DataTypes);

//anomalies enregistrées - contrôle taux de TVA (avec valider/commentaire)
db.tauxTvaAnomalies = require('./tauxTvaAnomaliesModel')(sequelize, DataTypes);

//anomalies enregistrées - contrôle caisse créditrice
db.caisseCreditriceAnomalies = require('./caisseCreditriceAnomaliesModel')(sequelize, DataTypes);

//anomalies enregistrées - contrôle équilibre débit=crédit
db.equilibreDcAnomalies = require('./equilibreDcAnomaliesModel')(sequelize, DataTypes);

//résultats enregistrés - contrôle séquence des numéros de chèque
db.sequenceChequeAnomalies = require('./sequenceChequeAnomaliesModel')(sequelize, DataTypes);
// db.grille_tarifaires = require('./grilleTarifaire')(sequelize, Sequelize);

// Compte
db.compteDossiers = require('./compteDossierModel')(sequelize, DataTypes);
db.comptePortefeuilles = require('./comptePortefeuilleModel')(sequelize, DataTypes);

db.revision = require('./revisionModel')(sequelize, DataTypes);
db.revisionControle = require('./revisionControleModel')(sequelize, DataTypes);
db.revisionControleMatrix = require('./revisionControleMatrixModel')(sequelize, DataTypes);
db.tableControleAnomalies = require('./tableControleAnomaliesModel')(sequelize, DataTypes);
db.revisionCommentaireAnomalies = require('./revisionCommentaireAnomaliesModel')(sequelize, DataTypes);
//paramétres - revision controle
//db.revisionControleMatrix = require('./revisionControleMatrixModel')(sequelize, DataTypes);
//db.revisionControle = require('./revisionControleModel')(sequelize, DataTypes);

//paramétres - codes journaux
db.codejournals = require('./codejournalsModel')(sequelize, DataTypes);

//paramétres - comptabilité analytique
db.caAxes = require('./caAxesModel')(sequelize, DataTypes);
db.caSections = require('./caSectionsModel')(sequelize, DataTypes);

//paramétres - comptabilité
db.dossierplancomptables = require('./dossierPCModel')(sequelize, DataTypes);
db.tvaComptesNature = require('./tvaCompteNatureModel')(sequelize, DataTypes);
db.dossierpcdetailcptchg = require('./dossierPCDetailCptChgModel')(sequelize, DataTypes);
db.dossierpcdetailcpttva = require('./dossierPCDetailCptTvaModel')(sequelize, DataTypes);
db.localites = require('./localites')(sequelize, DataTypes);
db.consolidationDossier = require('./consolidationDossierModel')(sequelize, DataTypes);
db.journals = require('./journalsModel')(sequelize, DataTypes);

//paramètres cotisation
db.appels = require("./appelModel")(sequelize, Sequelize);
db.ajustementappels = require("./ajustementappel")(sequelize, Sequelize);

//
db.abonnements = require('./abonnementModel')(sequelize, DataTypes);
db.paiements = require('./paiementModel')(sequelize, DataTypes);
//


//paramètres crm
// db.dossierassocies = require('./dossierassociesModel')(sequelize, DataTypes);
// db.dossierfiliales = require('./dossierfilialesModel')(sequelize, DataTypes);
// db.dombancaires = require('./dombancairesModel')(sequelize, DataTypes);
// db.pays = require('./paysModel')(sequelize, DataTypes);
// db.dossierplancomptable = require('./dossierplancomptableModel')(sequelize, DataTypes);

db.devises = require('./deviseModel')(sequelize, DataTypes);

// home / dossiers
db.dossiers = require('./dossiersModel')(sequelize, DataTypes);

// parametres / portefeuille
db.portefeuille = require('./portefeuilleModel')(sequelize, DataTypes);

db.journals = require('./journalsModel')(sequelize, DataTypes);
db.balanceimportees = require('./balanceimporteesModel')(sequelize, DataTypes);
db.balances = require('./balanceModel')(sequelize, DataTypes);

// Dossier Revision Matrice (cycles de révision)
db.dossierRevisionMatrice = require('./dossierRevisionMatriceModel')(sequelize, DataTypes);
db.dossierRevision = require('./dossierRevisionModel')(sequelize, DataTypes);
db.dossierRevisionSynthese = require('./dossierRevisionSyntheseModel')(sequelize, DataTypes);
db.dossierRevisionCommentaire = require('./dossierRevisionCommentaireModel')(sequelize, DataTypes);

db.dossierRevisionAnalytique = require('./dossierRevisionAnalytiqueModel')(sequelize, DataTypes);
db.commentaireAnalytique = require('./commentaireAnalytiqueModel')(sequelize, DataTypes);
db.revuAnalytique = require('./revuAnalytiqueModel')(sequelize, DataTypes);
db.commentaireAnalytiqueMensuelle = require('./commentaireAnalytiqueMensuelleModel.js')(sequelize, DataTypes);

// Lignes analytiques (ventilation par axe/section des écritures)
db.analytiques = require('./analytiqueModel')(sequelize, DataTypes);

Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.devises.belongsTo(db.userscomptes, { foreignKey: 'id_compte', targetKey: 'id' });
db.userscomptes.hasMany(db.devises, { foreignKey: 'id_compte', sourceKey: 'id' });

// Rôle et permission
db.roles.hasMany(db.rolePermission, { foreignKey: 'role_id', sourceKey: 'id' });
db.rolePermission.belongsTo(db.roles, { foreignKey: 'role_id', targetKey: 'id' });

db.permissions.hasMany(db.rolePermission, { foreignKey: 'permission_id', sourceKey: 'id' });
db.rolePermission.belongsTo(db.permissions, { foreignKey: 'permission_id', targetKey: 'id' });

db.users.hasMany(db.userPermission, { foreignKey: 'user_id', sourceKey: 'id' });
db.userPermission.belongsTo(db.users, { foreignKey: 'user_id', targetKey: 'id' });

db.permissions.hasMany(db.userPermission, { foreignKey: 'permission_id', sourceKey: 'id' });
db.userPermission.belongsTo(db.permissions, { foreignKey: 'permission_id', targetKey: 'id' });

db.roles.hasMany(db.users, { foreignKey: 'role_id', sourceKey: 'id' });
db.users.belongsTo(db.roles, { foreignKey: 'role_id', targetKey: 'id' });

// // Définir la relation (Pour le JOIN)
// db.membres.hasMany(db.membres_updates, { foreignKey: 'membre_id' });
// db.membres_updates.belongsTo(db.membres, { foreignKey: 'membre_id', as: 'membre_info' });

db.balances.belongsTo(db.dossierplancomptables, { as: 'infosCompte', foreignKey: 'id_numcompte', targetKey: 'id' });


db.dossierplancomptables.hasMany(db.journals, { foreignKey: 'id_numcpt', sourceKey: 'id' });
db.codejournals.hasMany(db.journals, { foreignKey: 'id_journal', sourceKey: 'id' });
db.dossiers.hasMany(db.journals, { foreignKey: 'id_dossier', sourceKey: 'id' });

db.journals.belongsTo(db.dossierplancomptables, { foreignKey: 'id_numcpt', targetKey: 'id' });
db.journals.belongsTo(db.dossierplancomptables, { foreignKey: 'id_numcptcentralise', targetKey: 'id', as: 'compteCentralise' });
db.journals.belongsTo(db.codejournals, { foreignKey: 'id_journal', targetKey: 'id' });
db.journals.belongsTo(db.dossiers, { foreignKey: 'id_dossier', targetKey: 'id' });

db.dossierRevisionSynthese = require('./dossierRevisionSyntheseModel')(sequelize, DataTypes);
db.dossierRevisionCommentaire = require('./dossierRevisionCommentaireModel')(sequelize, DataTypes);
db.dossierRevisionAnalytique = require('./dossierRevisionAnalytiqueModel')(sequelize, DataTypes);

// Compte dossier
db.users.belongsToMany(db.dossiers, { through: db.compteDossiers, foreignKey: 'user_id', otherKey: 'id_dossier' });
db.dossiers.belongsToMany(db.users, { through: db.compteDossiers, foreignKey: 'id_dossier', otherKey: 'user_id' });

db.compteDossiers.belongsTo(db.users, { foreignKey: 'user_id' });
db.compteDossiers.belongsTo(db.dossiers, { foreignKey: 'id_dossier' });

// Compte portefeuille
db.users.belongsToMany(db.portefeuille, { through: db.comptePortefeuilles, foreignKey: 'user_id', otherKey: 'id_portefeuille' });
db.portefeuille.belongsToMany(db.users, { through: db.comptePortefeuilles, foreignKey: 'id_portefeuille', otherKey: 'user_id' });

db.comptePortefeuilles.belongsTo(db.users, { foreignKey: 'user_id' });
db.comptePortefeuilles.belongsTo(db.portefeuille, { foreignKey: 'id_portefeuille' });

// Analyse Fournisseur/Client
db.analyseFournisseurLignes = require('./analyseFournisseurLigneModel')(sequelize, DataTypes);
db.analyseFournisseurAnomalies = require('./analyseFournisseurAnomalieModel')(sequelize, DataTypes);

// Analyse Client
db.analyseClientLignes = require('./analyseClientLigneModel')(sequelize, DataTypes);
db.analyseClientAnomalies = require('./analyseClientAnomalieModel')(sequelize, DataTypes);

// Analyse Fournisseur associations
db.analyseFournisseurLignes.hasMany(db.analyseFournisseurAnomalies, { foreignKey: 'id_ligne', sourceKey: 'id_ligne', as: 'anomalies' });
db.analyseFournisseurAnomalies.belongsTo(db.analyseFournisseurLignes, { foreignKey: 'id_ligne', targetKey: 'id_ligne', as: 'ligne' });

// Analyse Client associations
db.analyseClientLignes.hasMany(db.analyseClientAnomalies, { foreignKey: 'id_ligne', sourceKey: 'id_ligne', as: 'anomalies' });
db.analyseClientAnomalies.belongsTo(db.analyseClientLignes, { foreignKey: 'id_ligne', targetKey: 'id_ligne', as: 'ligne' });

//Doublon
db.rechercheDoublons = require('./rechercheDoublonModel')(sequelize, DataTypes);

// Revision analytique
db.revisionAnalytiqueResultats = require('./revisionAnalytiqueResultatModel')(sequelize, DataTypes);

// Revision analytique resultats associations
db.revisionAnalytiqueResultats.belongsTo(db.dossiers, { foreignKey: 'id_dossier', targetKey: 'id' });
db.dossiers.hasMany(db.revisionAnalytiqueResultats, { foreignKey: 'id_dossier', sourceKey: 'id' });

db.revisionAnalytiqueResultats.belongsTo(db.exercices, { foreignKey: 'id_exercice', targetKey: 'id' });
db.exercices.hasMany(db.revisionAnalytiqueResultats, { foreignKey: 'id_exercice', sourceKey: 'id' });

db.revisionAnalytiqueResultats.belongsTo(db.userscomptes, { foreignKey: 'id_compte', targetKey: 'id' });
db.userscomptes.hasMany(db.revisionAnalytiqueResultats, { foreignKey: 'id_compte', sourceKey: 'id' });

db.revisionAnalytiqueResultats.belongsTo(db.journals, { foreignKey: 'id_jnl', targetKey: 'id' });
db.journals.hasMany(db.revisionAnalytiqueResultats, { foreignKey: 'id_jnl', sourceKey: 'id' });

// Dossier password access
db.users.hasMany(db.dossierPasswordAccess, { foreignKey: 'user_id', sourceKey: 'id' });
db.dossierPasswordAccess.belongsTo(db.users, { foreignKey: 'user_id', targetKey: 'id' });

db.dossiers.hasMany(db.dossierPasswordAccess, { foreignKey: 'id_dossier', sourceKey: 'id' });
db.dossierPasswordAccess.belongsTo(db.dossiers, { foreignKey: 'id_dossier', targetKey: 'id' });


// --- DÉFINITION DES RELATIONS ---
// // Un exercice possède plusieurs tarifs
// db.exercices.hasMany(db.grille_tarifaires, { foreignKey: 'exercice_id', as: 'tarifs' });
// Un tarif appartient à un seul exercice
// db.grille_tarifaires.belongsTo(db.exercices, { foreignKey: 'exercice_id' });

// Optionnel : Définir les relations pour faciliter les futures requêtes
db.appels.belongsTo(db.exercices, { foreignKey: "exercice_id" });
// db.appels.belongsTo(db.membres, { foreignKey: "membre_id" });

// // L'appel appartient à un membre
// db.appels.belongsTo(db.membres, {
//     foreignKey: 'membre_id',
//     as: 'membre' // Cet alias DOIT être le même que dans ton include
// });

// Un membre peut avoir plusieurs appels (optionnel mais recommandé)
// db.membres.hasMany(db.appels, {
//     foreignKey: 'membre_id',
//     as: 'appels'
// });


// Compte portefeuille relationships removed - portefeuille references userscomptes via id_compte, not users directly

// // Abonnement
// db.userscomptes.hasMany(db.abonnements, { foreignKey: 'compte_id', sourceKey: 'id' });
// db.abonnements.belongsTo(db.userscomptes, { foreignKey: 'compte_id', targetKey: 'id' });

// db.userscomptes.hasMany(db.paiements, { foreignKey: 'compte_id', sourceKey: 'id', as: 'paiements' });
// db.paiements.belongsTo(db.userscomptes, { foreignKey: 'compte_id', targetKey: 'id', as: 'userscompte' });

// db.membres.hasMany(db.paiements, { foreignKey: 'membre_id', as: 'paiements' });
// db.paiements.belongsTo(db.membres, { foreignKey: 'membre_id', as: 'membre' });

//exporting the module
module.exports = db;