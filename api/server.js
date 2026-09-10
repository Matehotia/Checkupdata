const express = require('express');
const compression = require('compression');
const errorHandler = require('./Middlewares/errorHandler');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./Models');
const corsOptions = require('./config/corsOptions');
const verifyJWT = require('./Middlewares/verifyJWT');
const credentials = require('./Middlewares/credentials');

const pg = require('pg');
pg.types.setTypeParser(20, val => parseInt(val));

require('dotenv').config();

const PORT = process.env.NODE_API_PORT || 5100;

//Définition du moteur d'affichage
const app = express();
app.use(compression()); // compresse les réponses (gzip) — réduit fortement les gros payloads JSON
app.use(credentials);
app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }))
app.use(express.json());
app.use(cookieParser());
// app.use(express.static(path.join(__dirname, '/public')));
app.use('/public', express.static(path.join(__dirname, '/public')));
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));

//synchronizing the database and forcing it to false so we dont lose data (ito no ampiasaina ra toa ka executena ny DROP TABLE am sequelize)
//db.sequelize.sync({ force: true }).then(() => {
//})

// Static folder
// app.use('/Uploads', express.static(path.join(__dirname, 'Uploads')));

//synchronizing the database and forcing it to false so we dont lose data
db.sequelize.sync().then(() => {
})

//----------------------------------------------------------------------------------------------------------------
// AUTHENTIFICATION
//----------------------------------------------------------------------------------------------------------------

//register
app.use('/register', require('./Routes/registerRoute'));
//Login
app.use('/', require('./Routes/authRoute'));
//refreshToken
app.use('/refreshToken', require('./Routes/refreshRoute'));
//logout
app.use('/logout', require('./Routes/logoutRoute'));


app.use('/compte', require('./Routes/User/Compte/compteRoutes'));

// Sous compte
app.use('/sous-compte', require('./Routes/User/SousComptes/sousCompteRoutes'));

//placer la vérification pour les routes qui ne nécessite pas de vérification
// app.use(verifyJWT);


//routes pour l'authentification
//app.use('/', userRoutes);

//----------------------------------------------------------------------------------------------------------------
// MENU GESTION DES MEMBRES
//----------------------------------------------------------------------------------------------------------------
// app.use('/api/membres', require('./Routes/gestionMembre/membreRoute'));
// app.use('/api/membres-updates', require('./Routes/gestionMembre/membreUpdateRoute'));
// app.use('/api/membres-situation', require('./Routes/gestionMembre/membreSituationRoute'));

//--------------------------------------------------------------------------------------------------------
//MENU PARAMETRES
//-------------------------------------------------------------------------------------------------------------
// app.use('/api/exercices', require('./Routes/parametres/exerciceRoute'));
app.use('/paramExercice', require('./Routes/parametres/exerciceRoute')); // alias
// app.use('/api/grille-tarifaire', require('./Routes/parametres/grilleTarifaireRoute'));

app.use('/param/revisionControleMatrix', require('./Routes/parametres/revisionControleMatrixRoute'));

// Paramétrage des taux de TVA par dossier
app.use('/paramTauxTva', require('./Routes/parametres/tauxTvaParamRoute'));

// Paramétrage Trésorerie (règles opérateur + mot-clé) par dossier
app.use('/paramTresorerie', require('./Routes/parametres/parametrageTresorerieRoute'));

// Paramétrage Vente (format du numéro de facture) par dossier
app.use('/paramVente', require('./Routes/parametres/parametrageVenteRoute'));

// Codes Journaux
app.use('/param/codejournals', require('./Routes/parametres/codejournalsRoute'));
app.use('/paramCodeJournaux', require('./Routes/parametres/codejournalsRoute')); // alias

// Comptabilité Analytique
app.use('/param/analytique', require('./Routes/parametres/paramAnalytiqueRoute'));
app.use('/paramCa', require('./Routes/parametres/paramAnalytiqueRoute')); // alias

// Portefeuille
app.use('/param/portefeuille', require('./Routes/Portefeuille/portefeuilleRoute'));

// Comptabilité
app.use('/param/comptabilite', require('./Routes/parametres/paramPCRoute'));

// CRM
app.use('/paramCrm', require('./Routes/parametres/crmRoute'));

// Journal

app.use('/traitement/ImportJournal', require('./Routes/traitement/importJournalRoute'));
app.use('/traitement/ImportBalance', require('./Routes/traitement/importBalanceRoute'));
app.use('/traitement/exportBalance', require('./Routes/traitement/exportBalanceRoute'));
app.use('/administration/exportGrandLivre', require('./Routes/traitement/exportGrandLivreRoute'));
app.use('/traitement/exportJournal', require('./Routes/traitement/exportJournalRoute'));

app.use('/administration/revision', require('./Routes/revision/revisionRoutes'));
app.use('/administration/dossierRevision', require('./Routes/traitement/dossierRevisionRoutes'));
app.use('/administration/revisionControleAuto', require('./Routes/revision/revisionControleAutoRoutes'));

//--------------------------------------------------------------------------------------------------------
//MENU COTISATION
//-------------------------------------------------------------------------------------------------------------
// app.use("/api/cotisations", require('./Routes/cotisation/appelRoute'));
// app.use('/api/paiements', require('./Routes/cotisation/paiementRoute'));

//routes pour home
app.use('/home', require('./Routes/Home/homeRoute'));

app.use('/devises/devise', require('./Routes/parametres/Devises/deviseRoutes'));
app.use('/administration/traitementSaisie', require('./Routes/traitement/saisieRoute'));

app.use('/commentaireAnalytique', require('./Routes/Administration/Dashboard/commentaireAnalytiqueRoutes'));
app.use('/commentaireAnalytiqueMensuelle', require('./Routes/dashboard/commentaireAnalytiqueMensuelleRoute'));

app.use('/dashboard', require('./Routes/dashboard/revuAnalytiqueRoutes'));
app.use('/revuAnalytiqueStats', require('./Routes/Administration/Dashboard/revuAnalytiqueStatsRoutes'));

app.use('/dashboard', require('./Routes/dashboard/dashboardRoutes'));

app.use('/administration/revisionFournisseurClient', require('./Routes/Administration/analyseFournisseurRoutes'));
app.use('/administration/analyseFournisseurClient', require('./Routes/Administration/analyseFournisseurRoutes'));

// Routes pour l'analyse client
app.use('/administration/analyseClient', require('./Routes/Administration/analyseClientRoutes'));

// Routes pour la recherche de doublons
app.use('/administration/rechercheDoublon', require('./Routes/Administration/rechercheDoublonRoute'));

// Routes pour les écritures en suspens
app.use('/administration/ecrituresSuspense', require('./Routes/Administration/ecrituresSuspenseRoutes'));

// Route pour le contrôle Équilibre débit = crédit (global + par écriture)
app.use('/administration/equilibreDebitCredit', require('./Routes/Administration/equilibreDebitCreditRoutes'));

// Route pour le contrôle Caisse créditrice (comptes 53x, solde cumulé négatif)
app.use('/administration/caisseCreditrice', require('./Routes/Administration/caisseCreditriceRoutes'));

// Route pour le contrôle Cohérence HT / TVA / TTC
app.use('/administration/coherenceHtTva', require('./Routes/Administration/coherenceHtTvaRoutes'));

// Route pour le contrôle Séquence des numéros de chèque (journaux BANQUE + règles Trésorerie)
app.use('/administration/sequenceCheque', require('./Routes/Administration/sequenceChequeRoutes'));

// Route pour le contrôle Numéro facture de vente (journaux VENTE, comptes 70x, formats Vente)
app.use('/administration/factureVente', require('./Routes/Administration/factureVenteRoutes'));

// Route pour le contrôle Taux de TVA (copie de cohérence, affichage centré sur le taux)
app.use('/administration/tauxTva', require('./Routes/Administration/tauxTvaRoutes'));

// Routes pour la révision analytique
app.use('/administration/revisionAnalytique', require('./Routes/Administration/revisionAnalytiqueRoute'));

// Route pour l'export global de tous les contrôles (Détails des contrôles)
app.use('/administration/detailsControles', require('./Routes/Administration/detailsControlesRoutes'));

/*app.all('*', (req,res) => {
    res.status(404);
    if(req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'views', '404.html'));
    }else if (req.accepts('json')){
        res.json({error: '404 Not Found'});
    }else{
        res.type('txt').send('404 Not Found');
    }
});*/

//app.use(errorHandler);

app.get('/', function (req, res) {
    res.send('hello');
})

app.listen(PORT, () => {
});
