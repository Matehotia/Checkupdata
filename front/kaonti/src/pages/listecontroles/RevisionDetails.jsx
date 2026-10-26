import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Button,
    Chip,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Alert,
    TextField,
    Grid,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Autocomplete,
    IconButton,
    Stack,
    Badge
} from '@mui/material';
import { init } from '../../../init';
import { ArrowBack, Cancel, CheckCircle, ArrowForward, CalendarToday, AccountBalance, Description, PlayArrow, FilterList, PictureAsPdf, TableChart, ChevronLeft, ChevronRight, TaskAltRounded, RadioButtonUnchecked, ChatBubbleOutlineOutlined } from '@mui/icons-material';
import CloseIcon from '@mui/icons-material/Close';
import DoneAllIcon from '@mui/icons-material/DoneAll'
import useAxiosPrivate from "../../hooks/useAxiosPrivate";
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
import CommentDialog from '../../components/commetDialog';
import { DataGrid } from '@mui/x-data-grid';
import axios from '../../../config/axios'
import CommentIcon from '@mui/icons-material/Comment';

// Helper pour créer un DataGrid standardisé
const StandardDataGrid = ({ rows, columns, pageSize = 10, height, ...props }) => {
    return (
        <Box sx={{ width: '100%', bgcolor: '#ffffffff' }}>
            <DataGrid
                autoHeight
                rows={rows}
                columns={columns}
                pageSize={pageSize}
                rowsPerPageOptions={[5, 10, 25, 50]}
                checkboxSelection={false}
                disableSelectionOnClick
                density="compact"
                sx={{
                    border: 'none',
                    '& .MuiDataGrid-columnHeaders': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' },
                    '& .MuiDataGrid-cell': { fontSize: '0.8rem', borderBottom: '1px solid #F1F5F9' },
                    '& .font-bold': { fontWeight: 700 }
                }}
                {...props}
            />
        </Box>
    );
};

const formatMontant = (value, options = {}) => {
    const number = parseFloat(value) || 0;
    const formatted = number.toLocaleString('fr-FR', {
        minimumFractionDigits: options.fractions || 2,
        maximumFractionDigits: options.fractions || 2
    });
    // Remplacer toutes les espaces (U+00A0, U+202F...) par un espace normal visible
    return formatted.replace(/\s/g, ' ');
};

const RevisionDetails = React.memo(function RevisionDetails({ type, controles, onClose, onSaveComment, idCompte, idDossier, idExercice, idPeriode, dateDebut, dateFin, isPeriodeSelected, onValidationChange }) {
    const initial = init[0];
    const axiosPrivate = useAxiosPrivate();

    const emitAnomaliesUpdated = () => {
        try {
            const payload = {
                id_compte: idCompte,
                id_dossier: idDossier,
                id_exercice: idExercice,
                id_periode: idPeriode,
                timestamp: Date.now()
            };

            // 1. Event local (même onglet)
            window.dispatchEvent(new CustomEvent('anomalies:updated', {
                detail: payload
            }));

            // 2. localStorage (communication entre onglets)
            localStorage.setItem('anomalies:updated', JSON.stringify(payload));

        } catch (e) {
            console.error('[RevisionDetails] Erreur émission event:', e);
        }
    };

    // === STYLES STANDARDISÉS POUR LES TABLEAUX ===
    const tableStyles = {
        headRow: { bgcolor: '#F8FAFC' },
        headCell: { fontWeight: 700, fontSize: '0.85rem', py: 1.5 },
        bodyCell: { fontSize: '0.85rem', py: 1 },
        cellRight: { textAlign: 'right' },
        cellCenter: { textAlign: 'center' },
        montant: { fontWeight: 800 }
    };

    const [currentIndex, setCurrentIndex] = useState(0);
    const isValidatingRef = useRef(false);
    const [comment, setComment] = useState('');
    const [originalComment, setOriginalComment] = useState('');
    const [ecritures, setEcritures] = useState([]);
    const [loading, setLoading] = useState(false);
    const [executed, setExecuted] = useState(false);

    const [anomalies, setAnomalies] = useState([]);
    const [anomaliesLoading, setAnomaliesLoading] = useState(false);

    // Popup de confirmation pour validation
    const [confirmPopup, setConfirmPopup] = useState({ open: false, anomalie: null, action: null });
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Dialog pour commentaire
    const [commentDialog, setCommentDialog] = useState({ open: false, anomalie: null, line: null });

    // Filtres
    const [filterCompte, setFilterCompte] = useState('');
    const [filterIdControle, setFilterIdControle] = useState('');

    // Pagination pour les anomalies
    const [anomaliesPage, setAnomaliesPage] = useState(0);
    const ANOMALIES_PER_PAGE = 5;

    // Pagination spécifique ATYPIQUE (par compte)
    const [atypiqueCompteIndex, setAtypiqueCompteIndex] = useState(0);

    // Pagination spécifique SENS_SOLDE (par compte)
    const [soldeCompteIndex, setSoldeCompteIndex] = useState(0);
    const pendingSoldeIdControleRef = useRef(null);

    // Pagination spécifique SENS_ECRITURE (par compte)
    const [ecritureCompteIndex, setEcritureCompteIndex] = useState(0);
    const pendingEcritureIdControleRef = useRef(null);

    // Pagination spécifique IMMOB (par compte) - indépendante
    const [immobCompteIndex, setImmobCompteIndex] = useState(0);

    // Navigation spécifique UTIL_CPT_TVA (par écriture)
    const [tvaEcritureIndex, setTvaEcritureIndex] = useState(0);

    const items = useMemo(() => controles || [], [controles]);

    // Ref to track previous type and reset state when type changes
    const prevTypeRef = useRef(type);
    useEffect(() => {
        if (prevTypeRef.current !== type) {
            prevTypeRef.current = type;
            setCurrentIndex(0);
            setAnomalies([]);
            setEcritures([]);
            setExecuted(false);
        }
    }, [type]);
    const total = items.length;

    // S'assurer que currentIndex est toujours valide
    const safeCurrentIndex = Math.min(Math.max(0, currentIndex), Math.max(0, total - 1));
    const currentItem = items[safeCurrentIndex] || null;

    // Extraction des comptes uniques pour SENS_SOLDE (depuis journalLines)
    const soldeComptesList = useMemo(() => {
        const comptes = new Set();
        anomalies.forEach(a => {
            if (Array.isArray(a.journalLines)) {
                a.journalLines.forEach(l => {
                    const c = l?.compteaux;
                    if (c) comptes.add(c);
                });
            }
        });
        const result = Array.from(comptes).sort();
        // console.log('DEBUG SENS_SOLDE - soldeComptesList:', result);
        return result;
    }, [anomalies]);


    // Extraction des comptes uniques pour SENS_ECRITURE (depuis journalLines)
    const ecritureComptesList = useMemo(() => {
        const comptes = new Set();
        anomalies.forEach(a => {
            if (Array.isArray(a.journalLines)) {
                a.journalLines.forEach(l => {
                    const c = l?.compteaux;
                    if (c) comptes.add(c);
                });
            }
        });
        return Array.from(comptes).sort();
    }, [anomalies]);

    // Index calculé - clampé aux bornes valides
    const ecritureSafeCompteIndex = useMemo(() => {
        if (ecritureComptesList.length === 0) return 0;
        // Ne pas changer l'index, juste le clamp si hors bornes
        return Math.min(Math.max(0, ecritureCompteIndex), ecritureComptesList.length - 1);
    }, [ecritureComptesList.length, ecritureCompteIndex]);

    const ecritureCurrentCompte = useMemo(() => {
        if (ecritureComptesList.length === 0) return null;
        return ecritureComptesList[ecritureSafeCompteIndex];
    }, [ecritureComptesList, ecritureSafeCompteIndex]);

    // Réinitialiser la pagination quand les anomalies ou le contrôle changent
    useEffect(() => {
        setAnomaliesPage(0);
    }, [anomalies.length, currentItem?.id_controle]);

    // Réinitialiser l'index de compte ATYPIQUE quand les anomalies ou le contrôle changent
    useEffect(() => {
        setAtypiqueCompteIndex(0);
    }, [anomalies.length, currentItem?.id_controle]);

    // Réinitialiser l'index de compte SENS_SOLDE quand le contrôle change
    // mais restaurer vers le compte sauvegardé si on vient d'une action
    useEffect(() => {
        const pendingIdControle = pendingSoldeIdControleRef.current;
        if (pendingIdControle && currentItem?.id_controle !== pendingIdControle) {
            // On est en train de restaurer vers un autre contrôle, chercher son index
            const idx = items.findIndex(item => item.id_controle === pendingIdControle);
            if (idx >= 0 && idx !== safeCurrentIndex) {
                // Trouvé - restaurer vers ce contrôle
                setCurrentIndex(idx);
            }
        }
        pendingSoldeIdControleRef.current = null;
        setSoldeCompteIndex(0);
    }, [currentItem?.id_controle]);

    // Réinitialiser l'index de compte SENS_ECRITURE quand le contrôle change
    // mais restaurer vers le compte sauvegardé si on vient d'une action
    useEffect(() => {
        const pendingIdControle = pendingEcritureIdControleRef.current;
        if (pendingIdControle && currentItem?.id_controle !== pendingIdControle) {
            // On est en train de restaurer vers un autre contrôle, chercher son index
            const idx = items.findIndex(item => item.id_controle === pendingIdControle);
            if (idx >= 0 && idx !== safeCurrentIndex) {
                // Trouvé - restaurer vers ce contrôle
                setCurrentIndex(idx);
            }
        }
        pendingEcritureIdControleRef.current = null;
        setEcritureCompteIndex(0);
    }, [currentItem?.id_controle]);

    // Réinitialiser l'index de compte IMMOB quand les anomalies ou le contrôle changent
    useEffect(() => {
        setImmobCompteIndex(0);
    }, [anomalies.length, currentItem?.id_controle]);

    // Réinitialiser l'index d'écriture TVA quand les anomalies ou le contrôle changent
    useEffect(() => {
        setTvaEcritureIndex(0);
    }, [anomalies.length, currentItem?.id_controle]);

    const atypiqueGroupedByCompte = useMemo(() => {
        const groupedByCompte = {};
        anomalies.forEach((anomalie) => {
            // Pour chaque anomalie, regrouper ses lignes par compte individuel
            if (Array.isArray(anomalie.journalLines)) {
                anomalie.journalLines.forEach((line) => {
                    const compte = line?.compteaux || 'N/A';
                    if (!groupedByCompte[compte]) {
                        groupedByCompte[compte] = {
                            anomalies: [],
                            allLines: []
                        };
                    }
                    // Ajouter l'anomalie une seule fois par compte
                    if (!groupedByCompte[compte].anomalies.includes(anomalie)) {
                        groupedByCompte[compte].anomalies.push(anomalie);
                    }
                    // Ajouter cette ligne spécifique au compte (éviter les doublons)
                    if (!groupedByCompte[compte].allLines.some(l => l.id === line.id)) {
                        groupedByCompte[compte].allLines.push(line);
                    }
                });
            } else {
                // Fallback si pas de journalLines
                const compte = anomalie.compteNum || 'N/A';
                if (!groupedByCompte[compte]) {
                    groupedByCompte[compte] = {
                        anomalies: [],
                        allLines: []
                    };
                }
                if (!groupedByCompte[compte].anomalies.includes(anomalie)) {
                    groupedByCompte[compte].anomalies.push(anomalie);
                }
            }
        });
        return groupedByCompte;
    }, [anomalies]);

    const atypiqueComptesList = useMemo(() => {
        const comptes = new Set();
        anomalies.forEach(a => {
            if (Array.isArray(a.journalLines)) {
                a.journalLines.forEach(l => {
                    const c = l?.compteaux;
                    if (c) comptes.add(c);
                });
            }
        });
        return Array.from(comptes).sort();
    }, [anomalies]);

    // Index calculé - clampé aux bornes valides
    const soldeSafeCompteIndex = useMemo(() => {
        if (soldeComptesList.length === 0) return 0;
        // Ne pas changer l'index, juste le clamp si hors bornes
        const result = Math.min(Math.max(0, soldeCompteIndex), soldeComptesList.length - 1);
        // console.log('DEBUG SENS_SOLDE - soldeCompteIndex:', soldeCompteIndex, 'list.length:', soldeComptesList.length, 'result:', result);
        return result;
    }, [soldeComptesList.length, soldeCompteIndex]);

    const soldeCurrentCompte = useMemo(() => {
        if (soldeComptesList.length === 0) return null;
        return soldeComptesList[soldeSafeCompteIndex];
    }, [soldeComptesList, soldeSafeCompteIndex]);


    // Extraction des comptes uniques pour IMMOB (tous les comptes des anomalies, y compris ecritureComplete)
    const immobComptesList = useMemo(() => {
        const comptes = new Set();
        anomalies.forEach(a => {
            // Priorité 1: utiliser compteNum (pour SENS_SOLDE, SENS_ECRITURE, IMMO_CHARGE)
            if (a.compteNum) {
                comptes.add(a.compteNum);
            }
            // Priorité 2: utiliser compte (si disponible)
            if (a.compte) {
                comptes.add(a.compte);
            }
            // Priorité 3: chercher dans ecritureComplete
            if (Array.isArray(a.ecritureComplete)) {
                a.ecritureComplete.forEach(l => {
                    const c = l?.compteaux;
                    if (c) comptes.add(c);
                });
            }
            // Priorité 4: chercher dans journalLines
            if (Array.isArray(a.journalLines)) {
                a.journalLines.forEach(l => {
                    const c = l?.compteaux;
                    if (c) comptes.add(c);
                });
            }
        });
        return Array.from(comptes).sort();
    }, [anomalies]);

    const immobSafeCompteIndex = useMemo(() => {
        if (immobComptesList.length === 0) return 0;
        return Math.min(Math.max(0, immobCompteIndex), immobComptesList.length - 1);
    }, [immobComptesList.length, immobCompteIndex]);

    const immobCurrentCompte = useMemo(() => {
        if (immobComptesList.length === 0) return null;
        return immobComptesList[immobSafeCompteIndex];
    }, [immobComptesList, immobSafeCompteIndex]);

    // Navigation TVA par écriture
    const handlePrevTvaEcriture = () => {
        setTvaEcritureIndex(prev => Math.max(0, prev - 1));
    };
    const handleNextTvaEcriture = () => {
        setTvaEcritureIndex(prev => Math.min(tvaFilteredAnomalies.length - 1, prev + 1));
    };

    // Calculer les anomalies filtrées pour TVA (exclure compte 28)
    const tvaFilteredAnomalies = useMemo(() => {
        return anomalies.filter(a => {
            const lines = a.journalLines || [];
            return lines.some(l => {
                const cpt = l.compteaux || '';
                return !cpt.startsWith('28');
            });
        }).map(a => ({
            ...a,
            journalLines: (a.journalLines || []).filter(l => {
                const cpt = l.compteaux || '';
                return !cpt.startsWith('28');
            })
        })).filter(a => a.journalLines.length > 0);
    }, [anomalies]);

    // Index sécurisé pour TVA
    const tvaSafeEcritureIndex = useMemo(() => {
        if (tvaFilteredAnomalies.length === 0) return 0;
        return Math.min(Math.max(0, tvaEcritureIndex), tvaFilteredAnomalies.length - 1);
    }, [tvaFilteredAnomalies.length, tvaEcritureIndex]);

    // Écriture courante TVA
    const tvaCurrentEcriture = useMemo(() => {
        if (tvaFilteredAnomalies.length === 0) return null;
        return tvaFilteredAnomalies[tvaSafeEcritureIndex];
    }, [tvaFilteredAnomalies, tvaSafeEcritureIndex]);

    const atypiqueSafeCompteIndex = useMemo(() => {
        if (atypiqueComptesList.length === 0) return 0;
        return Math.min(Math.max(0, atypiqueCompteIndex), atypiqueComptesList.length - 1);
    }, [atypiqueComptesList.length, atypiqueCompteIndex]);

    const atypiqueCurrentCompte = useMemo(() => {
        if (atypiqueComptesList.length === 0) return null;
        return atypiqueComptesList[atypiqueSafeCompteIndex];
    }, [atypiqueComptesList, atypiqueSafeCompteIndex]);

    const atypiqueCurrentData = useMemo(() => {
        if (!atypiqueCurrentCompte) return null;
        return atypiqueGroupedByCompte[atypiqueCurrentCompte] || null;
    }, [atypiqueGroupedByCompte, atypiqueCurrentCompte]);

    // Calculer les anomalies paginées
    const paginatedAnomalies = useMemo(() => {
        const start = anomaliesPage * ANOMALIES_PER_PAGE;
        const end = start + ANOMALIES_PER_PAGE;
        return anomalies.slice(start, end);
    }, [anomalies, anomaliesPage]);

    // Calculer le nombre total de pages
    const totalAnomaliesPages = useMemo(() => {
        return Math.ceil(anomalies.length / ANOMALIES_PER_PAGE);
    }, [anomalies.length]);

    // Fonctions de navigation pagination
    const handlePrevAnomaliesPage = () => {
        setAnomaliesPage(prev => Math.max(0, prev - 1));
    };

    const handleNextAnomaliesPage = () => {
        setAnomaliesPage(prev => Math.min(totalAnomaliesPages - 1, prev + 1));
    };

    // Réinitialiser l'index quand les contrôles changent significativement (changement de type ou nombre)
    useEffect(() => {
        // console.log('DEBUG useEffect controles - items.length:', items.length);
        // console.log('DEBUG useEffect controles - currentIndex:', currentIndex);

        // Toujours reset à 0 si les contrôles changent (nouveau type)
        // ou si l'index actuel est hors limites
        if (items.length > 0) {
            if (currentIndex >= items.length) {
                // console.log('DEBUG - currentIndex hors limites, reset à 0');
                setCurrentIndex(0);
            } else if (currentIndex === 0) {
                // Déjà à 0, pas besoin de changer
                // console.log('DEBUG - currentIndex déjà à 0');
            }
        }
    }, [controles, items.length]);

    // Affichage mode vient directement de l'API (première anomalie ou défaut 'ligne')
    const affichageMode = useMemo(() => {
        if (anomalies.length > 0 && anomalies[0]?.affichage) {
            return anomalies[0].affichage;
        }
        return currentItem?.Affichage || 'ligne';
    }, [anomalies, currentItem]);

    useEffect(() => {
        if (currentItem) {
            setComment(currentItem.Commentaire || '');
            setOriginalComment(currentItem.Commentaire || '');
        }
    }, [currentItem]);

    const updateAnomaly = async (row) => {
        try {
            // console.log("===== FRONT UPDATE =====");
            // console.log("ID CONTROLE:", row.id_controle);
            // console.log("ID JNL:", row.id_jnl);

            const payload = {
                id_controle: row.id_controle,
                id_jnl: row.id_jnl,
                valide: Boolean(row.valide),
                id_periode: idPeriode || undefined,
            };

            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/anomalies/by-key`;

            // Ajouter les paramètres de période si disponibles
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            // console.log("URL:", url);
            // console.log("PAYLOAD:", payload);

            const res = await axios.patch(url, payload); // 🔥 FIX ICI
            // console.log("SUCCESS:", res.data);

            return res.data;

        } catch (error) {
            console.error("❌ ERROR FRONT:", error);
        }
    };

    const handleOpenBatchConfirm = (anomaliesToValidate, valide) => {
        if (!anomaliesToValidate || anomaliesToValidate.length === 0) return;

        setConfirmPopup({
            open: true,
            action: valide ? 'valider_tout' : 'annuler_tout',
            anomalies: anomaliesToValidate.map(row => ({
                id: row.id,
                id_controle: row.id_controle,
                id_jnl: row.id_jnl
            })),
            count: anomaliesToValidate.length
        });
    };
    const handleToggleValidateAnomaly = (anomalie) => {
        if (!anomalie) return;
        setConfirmPopup({ open: true, anomalie, action: anomalie.valide ? 'annuler' : 'valider' });
    };

    // Validation batch pour Tout valider le comptees les anomalies en une seule requête
    const handleValidateAllBatch = async (anomaliesToValidate, valide = true) => {
        if (!anomaliesToValidate || anomaliesToValidate.length === 0) return;

        setConfirmLoading(true);

        try {
            await Promise.all(
                anomaliesToValidate.map(row =>
                    updateAnomaly({
                        id_controle: row.id_controle,
                        id_jnl: row.id_jnl,
                        valide: valide
                    })
                )
            );

            // Optimistic update: mettre à jour toutes les anomalies localement
            setAnomalies(prev => prev.map(a =>
                anomaliesToValidate.some(row => row.id === a.id)
                    ? { ...a, valide: valide }
                    : a
            ));

            if (onValidationChange) {
                await onValidationChange();
            }

            emitAnomaliesUpdated();

        } catch (error) {
            console.error('Error batch validating anomalies:', error);
            alert('Erreur lors de la validation de toutes les anomalies');
        } finally {
            setConfirmLoading(false);
        }
    };

    // Validation groupée pour ATYPIQUE - Tout valider le comptees les anomalies du compte courant
    const handleValidateAllAtypiqueForCompte = () => {
        if (!atypiqueCurrentData || !atypiqueCurrentData.anomalies || atypiqueCurrentData.anomalies.length === 0) return;

        // Ouvrir popup de confirmation pour validation groupée
        setConfirmPopup({
            open: true,
            anomalie: null,
            action: 'valider_tout_le_compte',
            compte: atypiqueCurrentCompte,
            anomalies: atypiqueCurrentData.anomalies
        });
    };

    // Annulation groupée pour ATYPIQUE - Tout annuler le comptees les validations du compte courant
    const handleCancelAllAtypiqueForCompte = () => {
        if (!atypiqueCurrentData || !atypiqueCurrentData.anomalies || atypiqueCurrentData.anomalies.length === 0) return;

        // Ouvrir popup de confirmation pour annulation groupée
        setConfirmPopup({
            open: true,
            anomalie: null,
            action: 'annuler_tout_le_compte',
            compte: atypiqueCurrentCompte,
            anomalies: atypiqueCurrentData.anomalies
        });
    };

    const handleConfirmValidation = async (confirmed) => {
        if (!confirmed) {
            setConfirmPopup({ open: false, anomalie: null, action: null, anomalies: null, line: null });
            return;
        }

        // Validation batch (Tout valider le compte / Tout annuler le compte)
        if (confirmPopup.action === 'valider_tout' || confirmPopup.action === 'annuler_tout' ||
            confirmPopup.action === 'valider_tout_le_compte' || confirmPopup.action === 'annuler_tout_le_compte') {
            setConfirmLoading(true);
            try {
                const valide = confirmPopup.action === 'valider_tout' || confirmPopup.action === 'valider_tout_le_compte';
                await handleValidateAllBatch(confirmPopup.anomalies, valide);
            } finally {
                setConfirmLoading(false);
                setConfirmPopup({ open: false, anomalie: null, action: null, anomalies: null, line: null });
            }
            return;
        }

        // Validation de ligne (valider_ligne / annuler_ligne)
        if (confirmPopup.action === 'valider_ligne' || confirmPopup.action === 'annuler_ligne') {
            setConfirmLoading(true);
            try {
                const valide = confirmPopup.action === 'valider_ligne';
                await executeValidateLine(confirmPopup.line, confirmPopup.anomalie, valide);
            } finally {
                setConfirmLoading(false);
                setConfirmPopup({ open: false, anomalie: null, action: null, anomalies: null, line: null });
            }
            return;
        }

        // Validation simple (une seule anomalie)
        if (!confirmPopup.anomalie) {
            setConfirmPopup({ open: false, anomalie: null, action: null, line: null });
            return;
        }

        setConfirmLoading(true);
        try {
            const newValide = !confirmPopup.anomalie.valide;
            await updateAnomaly({
                id_controle: confirmPopup.anomalie.id_controle,
                id_jnl: confirmPopup.anomalie.id_jnl,
                valide: newValide
            });
            // Optimistic update: mettre à jour l'anomalie localement
            setAnomalies(prev => prev.map(a =>
                String(a.id) === String(confirmPopup.anomalie.id)
                    ? { ...a, valide: newValide }
                    : a
            ));
            if (onValidationChange) {
                await onValidationChange();
            }
        } finally {
            setConfirmLoading(false);
            setConfirmPopup({ open: false, anomalie: null, action: null, line: null });
        }
    };

    const handleCommentAnomaly = (anomalie) => {
        if (!anomalie) return;
        setCommentDialog({ open: true, anomalie });
    };

    // Valider une ligne spécifique - Ouvrir popup de confirmation
    const handleValidateLine = (line, anomalie) => {
        if (!line || !anomalie) return;
        setConfirmPopup({
            open: true,
            anomalie: anomalie,
            line: line,
            action: anomalie.valide ? 'annuler_ligne' : 'valider_ligne'
        });
    };

    // Exécuter la validation de ligne après confirmation
    const executeValidateLine = async (line, anomalie, valide) => {
        // console.log('DEBUG executeValidateLine - Type:', currentItem?.Type, 'current soldeCompteIndex:', soldeCompteIndex);
        try {
            // Sauvegarder l'id_controle actuel avant l'action pour pouvoir restaurer après le refresh
            if (currentItem?.Type === 'SENS_SOLDE') {
                pendingSoldeIdControleRef.current = currentItem?.id_controle;
            }
            if (currentItem?.Type === 'SENS_ECRITURE') {
                pendingEcritureIdControleRef.current = currentItem?.id_controle;
            }

            // Determiner quel id_jnl utiliser selon le type
            let idJnl;
            if (currentItem?.Type === 'SENS_SOLDE' || currentItem?.Type === 'SENS_ECRITURE' || currentItem?.Type === 'IMMO_CHARGE') {
                idJnl = line.id;
            } else if (currentItem?.Type === 'UTIL_CPT_TVA') {
                idJnl = line.id_ecriture;
            } else if (currentItem?.Type === 'ATYPIQUE') {
                idJnl = line.id;
            } else {
                idJnl = line.id;
            }

            const payload = {
                id_ligne_journal: String(line.id),
                id_jnl: String(idJnl),
                valide: valide,
                codeCtrl: currentItem.Type,
                message: `Validation ligne ${line.id}`
            };

            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/controle/${encodeURIComponent(currentItem.id_controle)}/validateLine`;

            // Ajouter les paramètres de période si disponibles
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.post(url, payload);

            if (response.data.state) {
                // Optimistic update: mettre à jour l'anomalie localement immédiatement
                if (anomalie && anomalie.id) {
                    setAnomalies(prev => prev.map(a =>
                        String(a.id) === String(anomalie.id)
                            ? { ...a, valide: valide }
                            : a
                    ));
                }

                // Pour SENS_SOLDE et SENS_ECRITURE, ne pas fetchAnomalies ici car onValidationChange
                // va rafraichir le parent et declencher un nouveau fetch automatiquement
                // Pour ATYPIQUE et autres types, ne pas fetch non plus pour éviter l'effet de fermeture/ouverture
                // L'optimistic update suffit pour l'affichage
                if (currentItem?.Type === 'SENS_SOLDE' || currentItem?.Type === 'SENS_ECRITURE') {
                    // Ces types nécessitent un rafraîchissement via onValidationChange
                }
                if (onValidationChange) {
                    await onValidationChange();
                }
            }
        } catch (error) {
            console.error('Error validating line:', error);
            alert('Erreur lors de la validation de la ligne');
            pendingSoldeIdControleRef.current = null;
            pendingEcritureIdControleRef.current = null;
        }
    };

    // Commenter une ligne spécifique - Ouvrir dialog
    // Dans handleCommentLine (ligne ~566)
    const handleCommentLine = (line, anomalie) => {
        // console.log('=== handleCommentLine called ===');
        // console.log('line:', line);
        // console.log('anomalie:', anomalie);
        if (!line) {
            // console.log('ERROR: line is null/undefined');
            return;
        }

        setCommentDialog({ open: true, anomalie: anomalie, line: line });
    };

    // Sauvegarder le commentaire de ligne
    const handleSaveLineComment = async (commentText) => {
        if (!commentDialog.line) return;

        const line = commentDialog.line;
        const anomalie = commentDialog.anomalie;

        try {
            // Sauvegarder l'id_controle actuel avant l'action pour pouvoir restaurer après le refresh
            if (currentItem?.Type === 'SENS_SOLDE') {
                pendingSoldeIdControleRef.current = currentItem?.id_controle;
            }
            if (currentItem?.Type === 'SENS_ECRITURE') {
                pendingEcritureIdControleRef.current = currentItem?.id_controle;
            }

            // Determiner quel id_jnl utiliser selon le type
            let idJnl;
            if (currentItem?.Type === 'SENS_SOLDE' || currentItem?.Type === 'SENS_ECRITURE' || currentItem?.Type === 'IMMO_CHARGE') {
                idJnl = line.id;
            } else if (currentItem?.Type === 'UTIL_CPT_TVA') {
                idJnl = line.id_ecriture;
            } else if (currentItem?.Type === 'ATYPIQUE') {
                idJnl = line.id;
            } else {
                idJnl = line.id;
            }

            const payload = {
                id_ligne_journal: String(line.id),
                id_jnl: String(idJnl),
                codeCtrl: currentItem.Type,
                message: `Commentaire ligne ${line.id}`,
                commentaire: commentText,
                id_periode: idPeriode || undefined,
            };

            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/controle/${encodeURIComponent(currentItem.id_controle)}/validateLine`;

            // Ajouter les paramètres de période si disponibles
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.post(url, payload);

            if (response.data.state) {
                // Optimistic update: mettre à jour le commentaire localement
                if (anomalie && anomalie.id) {
                    setAnomalies(prev => prev.map(a =>
                        String(a.id) === String(anomalie.id)
                            ? { ...a, commentaire: commentText }
                            : a
                    ));
                }
                if (onValidationChange) {
                    await onValidationChange();
                }
                emitAnomaliesUpdated();
            }
        } catch (error) {
            console.error('Error commenting line:', error);
            alert('Erreur lors de l\'ajout du commentaire');
            pendingSoldeIdControleRef.current = null;
            pendingEcritureIdControleRef.current = null;
        } finally {
            // Fermer le dialog dans tous les cas
            setCommentDialog({ open: false, anomalie: null, line: null });
        }
    };

    const handleSaveCommentDialog = async (commentText) => {
        if (!commentDialog.anomalie) return;

        const anomalie = commentDialog.anomalie;

        const payload = {
            id_controle: anomalie.id_controle,
            id_jnl: anomalie.id_jnl,
            valide: Boolean(anomalie.valide),
            commentaire: commentText,
            id_periode: idPeriode || undefined,
        };

        let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/anomalies/by-key`;

        // Ajouter les paramètres de période si disponibles
        if (dateDebut && dateFin) {
            const params = new URLSearchParams();
            params.append('date_debut', dateDebut);
            params.append('date_fin', dateFin);
            if (idPeriode) {
                params.append('id_periode', idPeriode);
            }
            url += `?${params.toString()}`;
        }

        await axios.patch(url, payload);

        // Optimistic update: mettre à jour le commentaire localement
        setAnomalies(prev => prev.map(a =>
            String(a.id) === String(anomalie.id)
                ? { ...a, commentaire: commentText }
                : a
        ));

        setCommentDialog({ open: false, anomalie: null });
    };

    const handleCloseCommentDialog = () => {
        setCommentDialog({ open: false, anomalie: null, line: null });
    };

    const getAnomalyForLine = (line) => {
        if (!line) return null;
        if (currentItem?.Type === 'SENS_SOLDE' || currentItem?.Type === 'SENS_ECRITURE') {
            return anomalies.find(a => String(a.id_jnl) === String(line.id)) || null;
        }
        if (currentItem?.Type === 'UTIL_CPT_TVA' || affichageMode === 'ecriture') {
            // Pour UTIL_CPT_TVA, rechercher par id_ecriture pour afficher le statut sur chaque ligne de l'écriture
            return anomalies.find(a => String(a.id_jnl) === String(line.id_ecriture)) || null;
        }
        return anomalies.find(a => String(a.id_jnl) === String(line.id)) || null;
    };

    // Rendu icône "Validé" cliquable (style Revue Analytique)
    const renderValideCell = (isValid, onToggle, enabled = true) => (
        <Tooltip title={isValid ? 'Validé — cliquer pour dévalider' : (enabled ? 'À valider — cliquer pour valider' : 'Rien à valider')} arrow>
            <span>
                <IconButton size="small" onClick={onToggle} disabled={!enabled}
                    sx={{ p: 0.25, color: isValid ? '#1F8A70' : (enabled ? '#B5791A' : '#9AA6B2'), transition: '.15s', '&:hover': { transform: 'scale(1.12)' } }}>
                    {isValid ? <TaskAltRounded fontSize="small" /> : <RadioButtonUnchecked fontSize="small" />}
                </IconButton>
            </span>
        </Tooltip>
    );

    // Rendu icône "Commentaire" cliquable (style Revue Analytique)
    const renderCommentCell = (comment, onComment, enabled = true) => {
        const has = comment && String(comment).trim();
        return (
            <Badge variant={has ? 'dot' : 'standard'} overlap="circular" sx={{ '& .MuiBadge-badge': { backgroundColor: '#B5791A' } }}>
                <Tooltip title={comment || 'Ajouter un commentaire'} arrow>
                    <span>
                        <IconButton size="small" onClick={onComment} disabled={!enabled} sx={{ color: has ? '#0E7C86' : '#9AA6B2' }}>
                            <ChatBubbleOutlineOutlined fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Badge>
        );
    };

    // Fonctions d'export
    const handleExportPdf = async () => {
        if (!currentItem?.id_controle) return;
        try {
            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/export/pdf/${encodeURIComponent(currentItem.id_controle)}`;

            // Ajouter les dates de période si fournies
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.get(url, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = `Revision_${currentItem.id_controle}_${idDossier}_${idExercice}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error exporting PDF:', error);
        }
    };

    const handleExportExcel = async () => {
        if (!currentItem?.id_controle) return;
        try {
            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/export/excel/${encodeURIComponent(currentItem.id_controle)}`;

            // Ajouter les dates de période si fournies
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.get(url, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = `Revision_${currentItem.id_controle}_${idDossier}_${idExercice}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error exporting Excel:', error);
        }
    };

    // Charger les anomalies depuis table_controle_anomalies
    useEffect(() => {
        // console.log('DEBUG useEffect - currentItem:', currentItem);
        // console.log('DEBUG useEffect - id_controle:', currentItem?.id_controle);
        if (currentItem?.id_controle && idCompte && idDossier && idExercice) {
            fetchAnomalies();
        }
    }, [currentItem?.id_controle, idCompte, idDossier, idExercice, idPeriode, dateDebut, dateFin, type]);

    const fetchAnomalies = async () => {
        if (!currentItem?.id_controle) return;
        setAnomaliesLoading(true);
        try {
            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/anomalies/controle/${encodeURIComponent(currentItem.id_controle)}`;

            // Ajouter les dates de période si fournies
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.get(url);


            if (response.data.state) {
                // console.log('DEBUG fetchAnomalies - anomalies count:', response.data.anomalies?.length);
                // console.log('DEBUG fetchAnomalies - anomalies:', response.data.anomalies);
                setAnomalies(response.data.anomalies);
            } else {
                // console.log('DEBUG fetchAnomalies - no state in response');
            }
        } catch (error) {
            console.error('Error fetching anomalies:', error);
        } finally {
            setAnomaliesLoading(false);
        }
    };
    useEffect(() => {
        if (type && idCompte && idDossier && idExercice && !executed) {
            fetchEcritures();
        }
    }, [type, idCompte, idDossier, idExercice, idPeriode]);

    const fetchEcritures = async () => {
        try {
            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/type/${encodeURIComponent(type)}`;

            // Ajouter les paramètres de période si disponibles
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.get(url);
            if (response.data.state && response.data.controles) {
                // Vérifier si des écritures sont déjà liées
                const hasEcritures = response.data.controles.some(c => parseInt(c.anomalies) > 0);
                if (hasEcritures) {
                    // Récupérer les écritures liées
                    let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/journal/ecritures`;
                    const params = { prefixes: extractPrefixes(response.data.controles) };

                    // Ajouter les paramètres de période si disponibles
                    if (dateDebut && dateFin) {
                        params.date_debut = dateDebut;
                        params.date_fin = dateFin;
                        if (idPeriode) {
                            params.id_periode = idPeriode;
                        }
                    }

                    const ecrituresResponse = await axiosPrivate.get(url, { params });
                    if (ecrituresResponse.data.state) {
                        setEcritures(ecrituresResponse.data.ecritures);
                        setExecuted(true);
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching ecritures:', error);
        }
    };

    const extractPrefixes = (controlesList) => {
        const prefixes = controlesList
            .filter(c => c.compte && c.compte.length >= 2)
            .map(c => c.compte.substring(0, 2));
        return [...new Set(prefixes)];
    };

    const handleExecuteControle = async () => {
        if (!idCompte || !idDossier || !idExercice || !type) {
            alert('Paramètres manquants pour exécuter le contrôle');
            return;
        }

        setLoading(true);
        try {
            let url = `/administration/revisionControleAuto/${idCompte}/${idDossier}/${idExercice}/execute/${encodeURIComponent(type)}`;

            // Ajouter les paramètres de période si disponibles
            if (dateDebut && dateFin) {
                const params = new URLSearchParams();
                params.append('date_debut', dateDebut);
                params.append('date_fin', dateFin);
                if (idPeriode) {
                    params.append('id_periode', idPeriode);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.post(url);

            if (response.data.state) {
                setEcritures(response.data.ecritures);
                setExecuted(true);
                alert(`Contrôle exécuté avec succès! ${response.data.ecrituresLiees} écritures liées.`);
            } else {
                alert(response.data.message || 'Erreur lors de l\'exécution du contrôle');
            }
        } catch (error) {
            console.error('Error executing controle:', error);
            alert('Erreur lors de l\'exécution du contrôle');
        } finally {
            setLoading(false);
        }
    };

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : total - 1));
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : 0));
    };

    const handleSaveComment = () => {
        if (onSaveComment && currentItem) {
            onSaveComment(currentItem.id, comment);
            setOriginalComment(comment);
        }
    };

    const handleCancelComment = () => {
        setComment(originalComment);
    };

    const hasCommentChanged = comment !== originalComment;

    // Extraire les options uniques pour les filtres
    const compteOptions = useMemo(() => {
        if (!ecritures || ecritures.length === 0) return [];
        const comptes = [...new Set(ecritures.map(e => e.compteaux).filter(Boolean))];
        return comptes.sort();
    }, [ecritures]);

    const idControleOptions = useMemo(() => {
        if (!ecritures || ecritures.length === 0) return [];
        const ids = [...new Set(ecritures.map(e => e.id_revision_controle).filter(Boolean))];
        return ids.sort((a, b) => a - b);
    }, [ecritures]);

    // Normaliser les lignes de journal depuis l'API anomalies
    const anomaliesJournalLines = useMemo(() => {
        const lines = [];
        anomalies.forEach(a => {
            if (Array.isArray(a.journalLines) && a.journalLines.length > 0) {
                lines.push(...a.journalLines);
            }
        });
        return lines;
    }, [anomalies]);

    // Grouper par anomalie (chaque anomalie avec ses journalLines)
    const anomaliesWithLines = useMemo(() => {
        const result = anomalies.filter(a => Array.isArray(a.journalLines) && a.journalLines.length > 0);
        // console.log('DEBUG anomaliesWithLines:', result.length, 'anomalies avec lignes sur', anomalies.length, 'total');
        // console.log('DEBUG anomalies:', anomalies.map(a => ({ id: a.id, valide: a.valide, linesCount: a.journalLines?.length })));
        return result;
    }, [anomalies]);

    // Grouper les lignes de journal par compte pour affichage 'ligne'
    const anomaliesByCompte = useMemo(() => {
        const grouped = {};
        anomaliesJournalLines.forEach(l => {
            const compte = l?.compteaux || 'N/A';
            if (!grouped[compte]) {
                grouped[compte] = [];
            }
            grouped[compte].push(l);
        });
        return grouped;
    }, [anomaliesJournalLines]);

    const tableData = useMemo(() => {
        // Si on a des écritures du journal, les utiliser
        let data = [];
        if (ecritures && ecritures.length > 0) {
            data = ecritures.map(e => ({
                id: e.id,
                date: e.dateecriture ? new Date(e.dateecriture).toLocaleDateString('fr-FR') : '-',
                journal: e.id_journal || '-',
                piece: e.piece || '-',
                libelle: e.libelle || '-',
                compte: e.compteaux || '-',
                lettrage: e.lettrage || '-',
                analytique: e.analytique || '-',
                debit: e.debit || 0,
                credit: e.credit || 0,
                id_controle: e.id_revision_controle
            }));
        } else if (currentItem?.details) {
            try {
                const parsed = JSON.parse(currentItem.details);
                if (Array.isArray(parsed)) data = parsed;
            } catch (e) {
            }
        }

        // Filtrer par le compte du contrôle actuel (ex: compte 63)
        if (currentItem?.compte && data.length > 0) {
            const comptePrefix = currentItem.compte.substring(0, 2);
            data = data.filter(row => row.compte && row.compte.startsWith(comptePrefix));
        }

        // Appliquer les filtres additionnels (sélecteurs)
        return data.filter(row => {
            const matchCompte = !filterCompte || row.compte === filterCompte;
            const matchIdControle = !filterIdControle || row.id_controle === filterIdControle;
            return matchCompte && matchIdControle;
        });
    }, [currentItem, ecritures, filterCompte, filterIdControle]);

    const journalLinesCount = useMemo(() => {
        return (anomalies || []).reduce((sum, a) => sum + (Array.isArray(a?.journalLines) ? a.journalLines.length : 0), 0);
    }, [anomalies]);

    if (!currentItem) {
        return (
            <Paper sx={{ mt: 2, p: 2, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h7" sx={{ fontWeight: 700, color: '#333' }}>
                        Détail de l'Anomalie
                    </Typography>
                    <Button variant="outlined" size="small" onClick={onClose}>
                        Fermer
                    </Button>
                </Box>
                <Alert severity="info" sx={{ mt: 2 }}>
                    Aucun détail disponible
                </Alert>
            </Paper>
        );
    }
    const buttonStyle = {
        minWidth: 120,
        height: 32,
        px: 2,
        textTransform: 'none',
        fontSize: '0.85rem',
        borderRadius: '6px',
        boxShadow: 'none',
        '& .MuiTouchRipple-root': {
            display: 'none',
        },
        '&:focus': {
            outline: 'none',
        },
        '&.Mui-focusVisible': {
            outline: 'none',
            boxShadow: 'none',
        },
        '&:hover': {
            boxShadow: 'none',
            backgroundColor: 'action.hover',
            border: 'none',
        },
        '&.Mui-disabled': {
            opacity: 0.4
        },
    };

    return (
        <Paper sx={{ mt: -2, p: 1.5, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* HEADER - FIGÉ */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexShrink: 0, mt: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f5f5f5ff' }}>
                    <Typography variant="h7" sx={{ fontWeight: 700, color: "#2c3e50" }}>
                        Détails - compte : {currentItem.compte && currentItem.compte !== '0' && currentItem.compte !== 0 ? currentItem.compte : 'n/a'}
                    </Typography>
                    {/* Pagination de page déplacée ici */}
                    {total > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderRadius: 1 }}>
                            <Button variant="outlined" size="small" onClick={handlePrev} disabled={total <= 1} sx={{ minWidth: '30px', px: 0.5, fontSize: '0.75rem' }}>
                                {"<"}
                            </Button>
                            <Typography variant="caption" sx={{ color: '#666', fontSize: '0.75rem' }}>
                                {currentIndex + 1} / {total}
                            </Typography>
                            <Button variant="outlined" size="small" onClick={handleNext} disabled={total <= 1} sx={{ minWidth: '30px', px: 0.5, fontSize: '0.75rem' }}>
                                {">"}
                            </Button>
                        </Box>
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<PictureAsPdf />}
                        onClick={handleExportPdf}
                        sx={{ color: '#d32f2f', borderColor: '#d32f2f' }}
                    >
                        PDF
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<TableChart />}
                        onClick={handleExportExcel}
                        sx={{ color: '#2e7d32', borderColor: '#2e7d32' }}
                    >
                        Excel
                    </Button>
                </Box>
            </Box>


            {/* NAVIGATEUR - FIXÉ */}
            <Box sx={{ flexShrink: 0 }}>

                {/* Navigation TVA par écriture (Autocomplete) */}
                {currentItem?.Type === 'UTIL_CPT_TVA' && tvaFilteredAnomalies.length > 1 && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{
                            mb: 1,
                            bgcolor: '#F8FAFC',
                            p: 1,
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0'
                        }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#64748B', mr: 1 }}>NAVIGATEUR :</Typography>
                            <Stack direction="row" spacing={3} alignItems="center">
                                <Autocomplete
                                    size="small"
                                    options={tvaFilteredAnomalies}
                                    value={tvaCurrentEcriture}

                                    onChange={(e, newValue) => {
                                        if (newValue) {
                                            const idx = tvaFilteredAnomalies.findIndex(a => a.id === newValue.id);
                                            if (idx >= 0) setTvaEcritureIndex(idx);
                                        }
                                    }}
                                    getOptionLabel={(option) =>
                                        `Écriture ${tvaFilteredAnomalies.findIndex(e => e.id === option.id) + 1}`
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Écriture"
                                            variant="outlined"
                                            sx={{ width: 220, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 32 } }}
                                        />
                                    )}
                                    sx={{
                                        width: 200,
                                        bgcolor: 'white',
                                        borderRadius: '8px',
                                        '& .MuiOutlinedInput-root': {
                                            fontWeight: 800,
                                            color: '#1976d2'
                                        }
                                    }}
                                />

                                <Stack direction="row" spacing={0.5}>
                                    <IconButton
                                        size="small"
                                        disabled={tvaSafeEcritureIndex === 0}
                                        onClick={handlePrevTvaEcriture}
                                        sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}

                                    >
                                        <ChevronLeft fontSize="small" />
                                    </IconButton>

                                    <IconButton
                                        size="small"
                                        disabled={tvaSafeEcritureIndex >= tvaFilteredAnomalies.length - 1}
                                        onClick={handleNextTvaEcriture}
                                        sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}

                                    >
                                        <ChevronRight fontSize="small" />
                                    </IconButton>
                                </Stack>
                                {(() => {
                                    const allValidated = tvaCurrentEcriture && tvaCurrentEcriture.valide;
                                    const hasAnomalies = !!tvaCurrentEcriture;

                                    return hasAnomalies && (
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={allValidated ? <CloseIcon /> : <DoneAllIcon />}

                                            sx={{
                                                bgcolor: allValidated ? '#d32f2f' : '#10B981',
                                                textTransform: 'none',
                                                fontWeight: 700,
                                                ml: 1,
                                                height: 32
                                            }}
                                            onClick={() => handleOpenBatchConfirm([tvaCurrentEcriture], !tvaCurrentEcriture.valide)}                                                >
                                            {allValidated ? 'Tout annuler le compte' : 'Tout valider le compte'}
                                        </Button>
                                    );
                                })()}
                            </Stack>
                        </Box>

                        {/* <Typography
                                    variant="body2"
                                    sx={{ color: '#64748B', fontWeight: 800 }}
                                >
                                    {tvaSafeEcritureIndex + 1} / {tvaFilteredAnomalies.length} ÉCRITURES
                                </Typography> */}

                    </Stack>
                )}
                {/* Navigation compte SENS_SOLDE */}
                {currentItem?.Type === 'SENS_SOLDE' && soldeComptesList.length > 0 && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{
                            mb: 1,
                            bgcolor: '#F8FAFC',
                            p: 1,
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0'
                        }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#64748B', mr: 1 }}>NAVIGATEUR :</Typography>

                            <Stack direction="row" spacing={1} alignItems="center">
                                <Autocomplete
                                    size="small"
                                    value={soldeCurrentCompte || null}
                                    onChange={(event, newValue) => {
                                        const index = soldeComptesList.findIndex(c => c === newValue);
                                        if (index !== -1) setSoldeCompteIndex(index);
                                    }}
                                    options={soldeComptesList}
                                    sx={{
                                        width: 220,
                                        '& .MuiOutlinedInput-root': {
                                            fontWeight: 700,
                                            color: '#1976d2'
                                        }
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            placeholder="Choisir un compte"
                                            size="small"
                                            sx={{ width: 220, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 32 } }}
                                        />
                                    )}
                                />

                                {soldeComptesList.length > 1 && (
                                    <Stack direction="row" spacing={0.5}>
                                        <IconButton
                                            size="small"
                                            disabled={soldeSafeCompteIndex === 0}
                                            onClick={() =>
                                                setSoldeCompteIndex(prev => Math.max(0, prev - 1))
                                            }
                                            sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                        >
                                            <ChevronLeft fontSize="small" />
                                        </IconButton>

                                        <IconButton
                                            size="small"
                                            disabled={soldeSafeCompteIndex === soldeComptesList.length - 1}
                                            onClick={() =>
                                                setSoldeCompteIndex(prev =>
                                                    Math.min(soldeComptesList.length - 1, prev + 1)
                                                )
                                            }
                                            sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                        >
                                            <ChevronRight fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                )}
                                {(() => {
                                    const compteAnomalies = anomalies.filter(a =>
                                        a.journalLines?.some(l => (l.compteaux) === soldeCurrentCompte)
                                    );
                                    const allValidated = compteAnomalies.length > 0 && compteAnomalies.every(a => a.valide);
                                    const hasAnomalies = compteAnomalies.length > 0;
                                    return hasAnomalies && (
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={allValidated ? <CloseIcon /> : <DoneAllIcon />}
                                            sx={{
                                                bgcolor: allValidated ? '#d32f2f' : '#10B981',
                                                textTransform: 'none',
                                                fontWeight: 700,
                                                ml: 1,
                                                height: 32
                                            }}
                                            onClick={() => handleOpenBatchConfirm(allValidated ? compteAnomalies : compteAnomalies.filter(a => !a.valide), !allValidated)}
                                        >
                                            {allValidated ? 'Tout annuler le compte' : 'Tout valider le compte'}
                                        </Button>
                                    );
                                })()}
                            </Stack>
                        </Box>

                        {soldeComptesList.length > 1 && (
                            <Typography
                                variant="body2"
                                sx={{ color: '#64748B', fontWeight: 800 }}
                            >
                                {soldeSafeCompteIndex + 1} / {soldeComptesList.length} COMPTES
                            </Typography>
                        )}

                    </Stack>
                )}
                {/* Navigation compte SENS_ECRITURE */}
                {currentItem?.Type === 'SENS_ECRITURE' && ecritureComptesList.length > 1 && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{
                            mb: 1,
                            bgcolor: '#F8FAFC',
                            p: 1,
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0'
                        }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#64748B', mr: 1 }}>NAVIGATEUR :</Typography>

                            <Stack direction="row" spacing={1} alignItems="center">
                                <Autocomplete
                                    size="small"
                                    value={ecritureCurrentCompte || null}
                                    options={ecritureComptesList}
                                    onChange={(event, newValue) => {
                                        const index = ecritureComptesList.findIndex(c => c === newValue);
                                        if (index !== -1) setEcritureCompteIndex(index);
                                    }}
                                    sx={{
                                        width: 220,
                                        bgcolor: 'white',
                                        borderRadius: '8px',
                                        '& .MuiOutlinedInput-root': {
                                            fontWeight: 800,
                                            color: '#1976d2'
                                        }
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            size="small"
                                            placeholder="Compte écriture"
                                            sx={{ width: 220, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 32 } }}

                                        />
                                    )}
                                />

                                <Stack direction="row" spacing={0.5}>
                                    <IconButton
                                        size="small"
                                        disabled={ecritureSafeCompteIndex === 0}
                                        onClick={() =>
                                            setEcritureCompteIndex(prev => Math.max(0, prev - 1))
                                        }
                                        sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                    >
                                        <ChevronLeft fontSize="small" />
                                    </IconButton>

                                    <IconButton
                                        size="small"
                                        disabled={ecritureSafeCompteIndex === ecritureComptesList.length - 1}
                                        onClick={() =>
                                            setEcritureCompteIndex(prev =>
                                                Math.min(ecritureComptesList.length - 1, prev + 1)
                                            )
                                        }
                                        sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                    >
                                        <ChevronRight fontSize="small" />
                                    </IconButton>
                                </Stack>
                                {(() => {
                                    const compteAnomalies = anomalies.filter(a =>
                                        a.journalLines?.some(l => (l.compteaux) === ecritureCurrentCompte)
                                    );
                                    const allValidated = compteAnomalies.length > 0 && compteAnomalies.every(a => a.valide);
                                    const hasAnomalies = compteAnomalies.length > 0;
                                    return hasAnomalies && (
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={allValidated ? <CloseIcon /> : <DoneAllIcon />}

                                            sx={{
                                                bgcolor: allValidated ? '#d32f2f' : '#10B981',
                                                textTransform: 'none',
                                                fontWeight: 700,
                                                ml: 1,
                                                height: 32
                                            }}
                                            onClick={() => handleOpenBatchConfirm(allValidated ? compteAnomalies : compteAnomalies.filter(a => !a.valide), !allValidated)}
                                        >
                                            {allValidated ? 'Tout annuler le compte' : 'Tout valider le compte'}
                                        </Button>
                                    );
                                })()}
                            </Stack>
                        </Box>
                        {/* 
                                <Typography
                                    variant="body2"
                                    sx={{ color: '#64748B', fontWeight: 800 }}
                                >
                                    {ecritureSafeCompteIndex + 1} / {ecritureComptesList.length} COMPTES
                                </Typography> */}

                    </Stack>
                )}
                {/* Navigation compte ATYPIQUE - centrée au milieu (cachée pour IMMO, SENS_SOLDE et UTIL_CPT_TVA) */}
                {atypiqueComptesList.length > 1 &&
                    !(currentItem?.Type && String(currentItem.Type).toUpperCase().includes('IMMO')) &&
                    currentItem?.Type !== 'UTIL_CPT_TVA' &&
                    currentItem?.Type !== 'SENS_SOLDE' &&
                    currentItem?.Type !== 'SENS_ECRITURE' && (


                        <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{
                                mb: 1,
                                bgcolor: '#F8FAFC',
                                p: 1,
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0'
                            }}
                        >
                            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#64748B', mr: 1 }}>NAVIGATEUR :</Typography>
                                <Stack direction="row" spacing={3} alignItems="center">

                                    <Autocomplete
                                        size="small"
                                        value={atypiqueCurrentCompte || null}
                                        options={atypiqueComptesList}
                                        onChange={(event, newValue) => {
                                            const index = atypiqueComptesList.findIndex(c => c === newValue);
                                            if (index !== -1) setAtypiqueCompteIndex(index);
                                        }}
                                        sx={{
                                            width: 200,
                                            bgcolor: 'white',
                                            borderRadius: '8px',
                                            '& .MuiOutlinedInput-root': {
                                                fontWeight: 800,
                                                color: '#1976d2'
                                            }
                                        }}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                size="small"
                                                placeholder="Compte"
                                                sx={{ width: 220, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 32 } }}
                                            />
                                        )}
                                    />

                                    <Stack direction="row" spacing={0.5}>
                                        <IconButton
                                            size="small"
                                            disabled={atypiqueSafeCompteIndex === 0}
                                            onClick={() =>
                                                setAtypiqueCompteIndex(prev => Math.max(0, prev - 1))
                                            }
                                            sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                        >
                                            <ChevronLeft fontSize="small" />
                                        </IconButton>

                                        <IconButton
                                            size="small"
                                            disabled={atypiqueSafeCompteIndex === atypiqueComptesList.length - 1}
                                            onClick={() =>
                                                setAtypiqueCompteIndex(prev =>
                                                    Math.min(atypiqueComptesList.length - 1, prev + 1)
                                                )
                                            }
                                            sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                        >
                                            <ChevronRight fontSize="small" />
                                        </IconButton>
                                    </Stack>
                                    {(() => {
                                        const compteAnomalies = anomalies.filter(a =>
                                            a.journalLines?.some(l => (l.compteaux) === atypiqueCurrentCompte)
                                        );
                                        const allValidated = compteAnomalies.length > 0 && compteAnomalies.every(a => a.valide);
                                        const hasAnomalies = compteAnomalies.length > 0;
                                        return hasAnomalies && (
                                            <Button
                                                variant="contained"
                                                size="small"
                                                startIcon={allValidated ? <CloseIcon /> : <DoneAllIcon />}
                                                sx={{
                                                    bgcolor: allValidated ? '#d32f2f' : '#10B981',
                                                    textTransform: 'none',
                                                    fontWeight: 700,
                                                    ml: 1,
                                                    height: 32
                                                }}
                                                onClick={() => handleOpenBatchConfirm(allValidated ? compteAnomalies : compteAnomalies.filter(a => !a.valide), !allValidated)}
                                            >
                                                {allValidated ? 'Tout annuler le compte' : 'Tout valider le compte'}
                                            </Button>
                                        );
                                    })()}
                                </Stack>
                            </Box>
                        </Stack>

                        // <Typography
                        //     variant="body2"
                        //     sx={{ color: '#64748B', fontWeight: 800 }}
                        // >
                        //     {atypiqueSafeCompteIndex + 1} / {atypiqueComptesList.length} COMPTES
                        // </Typography>


                    )}
                {/* Navigation compte IMMO */}
                {currentItem?.Type && String(currentItem.Type).toUpperCase().includes('IMMO') && immobComptesList.length > 1 && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{
                            mb: 1,
                            bgcolor: '#F8FAFC',
                            p: 1,
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0'
                        }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <Typography variant="caption" sx={{ fontWeight: 800, color: '#64748B', mr: 1 }}>NAVIGATEUR :</Typography>

                            <Stack direction="row" spacing={1} alignItems="center">
                                <Autocomplete
                                    size="small"
                                    value={immobCurrentCompte || null}
                                    options={immobComptesList}
                                    onChange={(event, newValue) => {
                                        const index = immobComptesList.findIndex(c => c === newValue);
                                        if (index !== -1) setImmobCompteIndex(index);
                                    }}
                                    sx={{
                                        width: 220,
                                        bgcolor: 'white',
                                        borderRadius: '8px',
                                        '& .MuiOutlinedInput-root': {
                                            fontWeight: 800,
                                            color: '#1976d2',
                                            px: 1
                                        }
                                    }}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            size="small"
                                            placeholder="Compte immobilisation"
                                            sx={{ width: 220, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 32 } }}

                                        />
                                    )}
                                />

                                <Stack direction="row" spacing={0.5}>
                                    <IconButton
                                        size="small"
                                        disabled={immobSafeCompteIndex === 0}
                                        onClick={() =>
                                            setImmobCompteIndex(prev => Math.max(0, prev - 1))
                                        }
                                        sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                    >
                                        <ChevronLeft fontSize="small" />
                                    </IconButton>

                                    <IconButton
                                        size="small"
                                        disabled={immobSafeCompteIndex === immobComptesList.length - 1}
                                        onClick={() =>
                                            setImmobCompteIndex(prev =>
                                                Math.min(immobComptesList.length - 1, prev + 1)
                                            )
                                        }
                                        sx={{ border: '1px solid #E2E8F0', borderRadius: '4px' }}
                                    >
                                        <ChevronRight fontSize="small" />
                                    </IconButton>
                                </Stack>
                                {(() => {
                                    const compteAnomalies = anomalies.filter(a =>
                                        a.journalLines?.some(l => (l.compteaux) === immobCurrentCompte)
                                    );
                                    const allValidated = compteAnomalies.length > 0 && compteAnomalies.every(a => a.valide);
                                    const hasAnomalies = compteAnomalies.length > 0;
                                    return hasAnomalies && (
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={allValidated ? <CloseIcon /> : <DoneAllIcon />}
                                            sx={{
                                                bgcolor: allValidated ? '#d32f2f' : '#10B981',
                                                textTransform: 'none',
                                                fontWeight: 700,
                                                ml: 1,
                                                height: 32
                                            }}
                                            onClick={() => handleOpenBatchConfirm(allValidated ? compteAnomalies : compteAnomalies.filter(a => !a.valide), !allValidated)}
                                        >
                                            {allValidated ? 'Tout annuler le compte' : 'Tout valider le compte'}
                                        </Button>
                                    );
                                })()}
                            </Stack>
                        </Box>

                        {/* <Typography
                                    variant="body2"
                                    sx={{ color: '#64748B', fontWeight: 800 }}
                                >
                                    {immobSafeCompteIndex + 1} / {immobComptesList.length} COMPTES
                                </Typography> */}

                    </Stack>
                )}
            </Box>

            {/* MAIN CONTENT - zone scrollable (le DataGrid est en autoHeight et grandit avec le contenu) */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
                <Grid container spacing={3} alignItems="flex-start">
                    {/* LEFT SIDE - INFOS + TABLE */}
                    <Grid item xs={12} md={12}>

                        {anomaliesLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                                <CircularProgress size={24} />
                            </Box>
                        ) : currentItem?.Type === 'EXISTENCE' ? (
                            // Mode EXISTENCE - avec filtre par compte
                            anomalies.length > 0 ? (
                                <Box>
                                    {paginatedAnomalies
                                        .filter(a => !atypiqueCurrentCompte ||
                                            (a.journalLines?.[0]?.comptegen === atypiqueCurrentCompte ||
                                                a.journalLines?.[0]?.compteaux === atypiqueCurrentCompte))
                                        .map((anomalie, idx) => (
                                            <Box key={idx} sx={{ mb: 3 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                                    <Alert severity="warning" sx={{ flex: 1, fontSize: '0.9rem' }}>
                                                        {anomalie.message || 'Anomalie d\'existence'}
                                                    </Alert>
                                                </Box>
                                                {anomalie.journalLines?.length > 0 ? (
                                                    <StandardDataGrid
                                                        height={350}
                                                        rows={anomalie.journalLines.map((line, idx) => ({
                                                            id: line?.id || idx,
                                                            ...line,
                                                            _anomalie: anomalie
                                                        }))}
                                                        columns={[
                                                            {
                                                                field: 'dateecriture', headerName: 'Date', width: 100, valueFormatter: (params) => params.value || '-'
                                                            },
                                                            { field: 'comptegen', headerName: 'Compte', width: 100, valueGetter: p => p.row.compteaux || '-' },
                                                            { field: 'piece', headerName: 'Pièce', width: 90, valueGetter: p => p.row.piece || '-' },
                                                            { field: 'libelle', headerName: 'Libellé', width: 180, valueGetter: p => p.row.libelle || '-' },
                                                            {
                                                                field: 'debit', headerName: 'Débit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                    params.value !== null && params.value !== undefined
                                                                        ? formatMontant(params.value)
                                                                        : '-'
                                                            },
                                                            {
                                                                field: 'credit', headerName: 'Crédit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                    params.value !== null && params.value !== undefined
                                                                        ? formatMontant(params.value)
                                                                        : '-'
                                                            },
                                                            { field: 'lettrage', headerName: 'Lettrage', width: 90, valueGetter: p => p.row.lettrage || '-' },
                                                            { field: 'analytique', headerName: 'Analytique', width: 100, valueGetter: p => p.row.analytique || '-' },
                                                            { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderValideCell(!!p.row._anomalie?.valide, () => handleValidateLine(p.row, p.row._anomalie), !!p.row._anomalie) },
                                                            { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderCommentCell(p.row._anomalie?.commentaire, () => handleCommentAnomaly(p.row._anomalie), !!p.row._anomalie) },
                                                        ]}
                                                    />
                                                ) : (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Aucune ligne de journal pour ce compte
                                                    </Typography>
                                                )}
                                            </Box>
                                        ))}
                                </Box>
                            ) : (
                                // Fallback: afficher depuis details si pas d'anomalies dans table_controle_anomalies
                                (() => {
                                    let details = [];
                                    if (currentItem?.details) {
                                        try {
                                            details = JSON.parse(currentItem.details);
                                        } catch (e) {
                                            // Not JSON
                                        }
                                    }
                                    const anomalie = details.find(d => d.anomalie || d.message?.includes('Absence'));
                                    if (anomalie?.anomalie) {
                                        return <Alert severity="warning">{anomalie.anomalie}</Alert>;
                                    } else if (anomalie?.message) {
                                        return <Alert severity="success">{anomalie.message}</Alert>;
                                    }
                                    return <Alert severity="info">Aucune information</Alert>;
                                })()
                            )) : currentItem?.Type === 'SENS_SOLDE' ? (
                                // Mode SENS_SOLDE - Regroupé par compte avec navigation
                                anomalies.length > 0 && soldeCurrentCompte ? (
                                    <Box>
                                        {(() => {
                                            // Regrouper les anomalies par compte (depuis journalLines)
                                            const groupedByCompte = {};
                                            anomalies.forEach(anomalie => {
                                                if (!Array.isArray(anomalie.journalLines)) return;

                                                anomalie.journalLines.forEach(line => {
                                                    const compte = line?.compteaux;
                                                    if (!compte) return;

                                                    if (!groupedByCompte[compte]) {
                                                        groupedByCompte[compte] = {
                                                            anomalies: [],
                                                            allLines: [],
                                                            allValidated: true
                                                        };
                                                    }
                                                    // Ajouter l'anomalie une seule fois par compte
                                                    if (!groupedByCompte[compte].anomalies.includes(anomalie)) {
                                                        groupedByCompte[compte].anomalies.push(anomalie);
                                                    }
                                                    // Ajouter cette ligne
                                                    groupedByCompte[compte].allLines.push(line);
                                                });

                                                // Mettre à jour allValidated
                                                Object.keys(groupedByCompte).forEach(compte => {
                                                    if (groupedByCompte[compte].anomalies.includes(anomalie) && !anomalie.valide) {
                                                        groupedByCompte[compte].allValidated = false;
                                                    }
                                                });
                                            });

                                            const testType = currentItem?.test?.toUpperCase();
                                            const data = groupedByCompte[soldeCurrentCompte];

                                            if (!data) return <Alert severity="info">Aucune anomalie pour le compte {soldeCurrentCompte}</Alert>;

                                            const lines = data.allLines;
                                            const anomaliesForCompte = data.anomalies;
                                            const allValidated = data.allValidated;

                                            const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
                                            const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
                                            const solde = totalDebit - totalCredit;
                                            const soldeNormalise = Math.abs(solde) < 0.01 ? 0 : solde;

                                            let detailMessage = `Le compte "${soldeCurrentCompte}" doit avoir un solde `;
                                            if (testType === 'DEBITEUR') {
                                                detailMessage += 'débiteur';
                                            } else if (testType === 'CREDITEUR') {
                                                detailMessage += 'créditeur';
                                            } else if (testType === 'NULL') {
                                                detailMessage += 'nul';
                                            } else {
                                                detailMessage = `Anomalie de sens de solde pour le compte "${soldeCurrentCompte}"`;
                                            }

                                            const anomaliesToProcess = allValidated
                                                ? anomaliesForCompte
                                                : anomaliesForCompte.filter(a => !a.valide);

                                            return (
                                                <Box sx={{ mb: 3 }}>
                                                    {/* Boutons et message */}
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                                        <Alert severity="warning" sx={{ flex: 1, fontSize: '0.9rem' }}>
                                                            {detailMessage}
                                                        </Alert>
                                                    </Box>

                                                    {lines.length > 0 ? (
                                                        <Box>
                                                            <StandardDataGrid
                                                                height={350}
                                                                rows={lines.map((line, idx) => ({
                                                                    id: line?.id || idx,
                                                                    ...line,
                                                                    _anomalies: anomaliesForCompte
                                                                }))}
                                                                columns={[
                                                                    {
                                                                        field: 'dateecriture', headerName: 'Date', width: 100, valueFormatter: (params) => {
                                                                            if (!params.value) return '-';

                                                                            const parts = params.value.split('/'); // "21/04/2025"

                                                                            if (parts.length === 3) {
                                                                                const [day, month, year] = parts;
                                                                                const date = new Date(`${day}-${month}-${year}`);

                                                                                return isNaN(date.getTime())
                                                                                    ? params.value
                                                                                    : date.toLocaleDateString('fr-FR');
                                                                            }

                                                                            return params.value;
                                                                        }
                                                                    },
                                                                    { field: 'comptegen', headerName: 'Compte', width: 120, valueGetter: p => p.row.compteaux || '-' },
                                                                    { field: 'piece', headerName: 'Pièce', width: 150, valueGetter: p => p.row.piece || '-' },
                                                                    { field: 'libelle', headerName: 'Libellé', width: 350, valueGetter: p => p.row.libelle || '-' },
                                                                    {
                                                                        field: 'debit', headerName: 'Débit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                            params.value !== null && params.value !== undefined
                                                                                ? formatMontant(params.value)
                                                                                : '-'
                                                                    },
                                                                    {
                                                                        field: 'credit', headerName: 'Crédit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                            params.value !== null && params.value !== undefined
                                                                                ? formatMontant(params.value)
                                                                                : '-'
                                                                    },
                                                                    { field: 'lettrage', headerName: 'Lettrage', width: 90, valueGetter: p => p.row.lettrage || '-' },
                                                                    { field: 'analytique', headerName: 'Analytique', width: 100, valueGetter: p => p.row.analytique || '-' },
                                                                    { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => { const a = getAnomalyForLine(p.row); return renderValideCell(!!a?.valide, () => handleValidateLine(p.row, a || p.row._anomalies[0]), !!a); } },
                                                                    { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => { const a = getAnomalyForLine(p.row); return renderCommentCell(a?.commentaire, () => handleCommentLine(p.row, a || p.row._anomalies[0]), !!a); } },
                                                                ]}
                                                            />
                                                            <Stack direction="row" alignItems="center" sx={{ mt: 1, borderTop: '2px solid #1976d2', backgroundColor: '#EEF2F7', px: 1, py: 1 }}>
                                                                <Box sx={{ width: 120, flexShrink: 0 }} />
                                                                <Box sx={{ width: 150, flexShrink: 0 }} />
                                                                <Box sx={{ width: 350, flexShrink: 0, textAlign: 'right', pr: 1 }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 800 }}>Total</Typography>
                                                                </Box>
                                                                <Box sx={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 800 }}>{totalDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }).replace(/\u00A0/g, ' ')}</Typography>
                                                                </Box>
                                                                <Box sx={{ width: 110, flexShrink: 0, textAlign: 'right' }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 800 }}>{totalCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2 }).replace(/\u00A0/g, ' ')}</Typography>
                                                                </Box>
                                                                <Box sx={{ width: 90 + 100 + 80 + 120, flexShrink: 0, pl: 1 }}>
                                                                    <Typography variant="caption" sx={{ fontWeight: 800, color: soldeNormalise > 0 ? '#1565c0' : soldeNormalise < 0 ? '#e65100' : 'text.secondary' }}>
                                                                        Solde : {soldeNormalise > 0 ? `Débiteur ${soldeNormalise.toFixed(2)}` : soldeNormalise < 0 ? `Créditeur ${Math.abs(soldeNormalise).toFixed(2)}` : 'nul'}
                                                                    </Typography>
                                                                </Box>
                                                            </Stack>
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="caption" color="text.secondary">
                                                            Aucune ligne pour ce compte
                                                        </Typography>
                                                    )}
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                ) : (
                                    <Alert severity="success">Aucun compte avec anomalie de sens de solde</Alert>
                                )
                            ) : currentItem?.Type === 'SENS_ECRITURE' ? (
                                // Mode SENS_ECRITURE - Regroupé par compte avec navigation
                                anomalies.length > 0 && ecritureCurrentCompte ? (
                                    <Box>
                                        {(() => {
                                            const groupedByCompte = {};
                                            anomalies.forEach(anomalie => {
                                                if (!Array.isArray(anomalie.journalLines)) return;
                                                anomalie.journalLines.forEach(line => {
                                                    const compte = line?.compteaux;
                                                    if (!compte) return;
                                                    if (!groupedByCompte[compte]) {
                                                        groupedByCompte[compte] = { anomalies: [], allLines: [], allValidated: true };
                                                    }
                                                    if (!groupedByCompte[compte].anomalies.includes(anomalie)) {
                                                        groupedByCompte[compte].anomalies.push(anomalie);
                                                    }
                                                    groupedByCompte[compte].allLines.push(line);
                                                });
                                                Object.keys(groupedByCompte).forEach(compte => {
                                                    if (groupedByCompte[compte].anomalies.includes(anomalie) && !anomalie.valide) {
                                                        groupedByCompte[compte].allValidated = false;
                                                    }
                                                });
                                            });

                                            const testType = currentItem?.test?.toUpperCase();
                                            const data = groupedByCompte[ecritureCurrentCompte];
                                            if (!data) return <Alert severity="info">Aucune anomalie pour le compte {ecritureCurrentCompte}</Alert>;

                                            const lines = data.allLines.filter(line => {
                                                const debit = parseFloat(line.debit) || 0;
                                                const credit = parseFloat(line.credit) || 0;
                                                if (testType === 'CREDIT') return credit > 0;
                                                if (testType === 'DEBIT') return debit > 0;
                                                return true;
                                            });

                                            const anomaliesForCompte = data.anomalies;
                                            const allValidated = data.allValidated;
                                            const anomaliesToProcess = allValidated ? anomaliesForCompte : anomaliesForCompte.filter(a => !a.valide);

                                            return (
                                                <Box sx={{ mb: 3 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                                        <Alert severity="warning" sx={{ flex: 1, fontSize: '0.9rem' }}>
                                                            Anomalie de sens d&apos;écriture pour le compte &quot;{ecritureCurrentCompte}&quot;
                                                        </Alert>
                                                    </Box>

                                                    {lines.length > 0 ? (
                                                        <Box>
                                                            <StandardDataGrid
                                                                height={350}
                                                                rows={lines.map((line, idx) => ({
                                                                    id: line?.id ? `${line.id}-${idx}` : idx,
                                                                    ...line,
                                                                    _anomalie: anomalies
                                                                }))}
                                                                columns={[
                                                                    {
                                                                        field: 'dateecriture', headerName: 'Date', width: 100, valueFormatter: (params) => {
                                                                            if (!params.value) return '-';

                                                                            const parts = params.value.split('/'); // "21/04/2025"

                                                                            if (parts.length === 3) {
                                                                                const [day, month, year] = parts;
                                                                                const date = new Date(`${day}-${month}-${year}`);

                                                                                return isNaN(date.getTime())
                                                                                    ? params.value
                                                                                    : date.toLocaleDateString('fr-FR');
                                                                            }

                                                                            return params.value;
                                                                        }
                                                                    },
                                                                    { field: 'comptegen', headerName: 'Compte', width: 120, valueGetter: p => p.row.compteaux || '-' },
                                                                    { field: 'piece', headerName: 'Pièce', width: 150, valueGetter: p => p.row.piece || '-' },
                                                                    { field: 'libelle', headerName: 'Libellé', width: 350, valueGetter: p => p.row.libelle || '-' },
                                                                    {
                                                                        field: 'debit', headerName: 'Débit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                            params.value !== null && params.value !== undefined
                                                                                ? formatMontant(params.value)
                                                                                : '-'
                                                                    },
                                                                    {
                                                                        field: 'credit', headerName: 'Crédit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                            params.value !== null && params.value !== undefined
                                                                                ? formatMontant(params.value)
                                                                                : '-'
                                                                    },
                                                                    { field: 'lettrage', headerName: 'Lettrage', width: 90, valueGetter: p => p.row.lettrage || '-' },
                                                                    { field: 'analytique', headerName: 'Analytique', width: 100, valueGetter: p => p.row.analytique || '-' },
                                                                    { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => { const a = getAnomalyForLine(p.row); return renderValideCell(!!a?.valide, () => handleValidateLine(p.row, a || p.row._anomalies[0]), !!a); } },
                                                                    { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => { const a = getAnomalyForLine(p.row); return renderCommentCell(a?.commentaire, () => handleCommentLine(p.row, a || p.row._anomalies[0]), !!a); } },
                                                                ]}
                                                            />
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1, p: 1, backgroundColor: '#e3f2fd' }}>
                                                                <Typography variant="caption" sx={{ fontWeight: 600 }}>Total Débit: {lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 }).replace(/\u00A0/g, ' ')}</Typography>
                                                                <Typography variant="caption" sx={{ fontWeight: 600 }}>Total Crédit: {lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 }).replace(/\u00A0/g, ' ')}</Typography>
                                                            </Box>
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="caption" color="text.secondary">Aucune ligne de journal pour ce compte</Typography>
                                                    )}
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                ) : (
                                    <Alert severity="success">Aucun compte avec anomalie de sens d&apos;écriture</Alert>
                                )
                            ) : currentItem?.Type === 'UTIL_CPT_TVA' ? (
                                // Mode UTIL_CPT_TVA - Affichage par écriture avec navigation, exclure compte 28
                                tvaFilteredAnomalies.length > 0 ? (
                                    <Box>
                                        {/* Afficher uniquement l'écriture courante */}
                                        {(() => {
                                            const anomalie = tvaCurrentEcriture;
                                            if (!anomalie) return null;
                                            const lines = anomalie.journalLines || [];
                                            return (
                                                <Box sx={{ mb: 3 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                                        <Alert severity="warning" sx={{ flex: 1 }}>
                                                            <strong>Écriture</strong> - {anomalie.message}
                                                        </Alert>
                                                    </Box>

                                                    <StandardDataGrid
                                                        height={350}
                                                        rows={lines.map((line, idx) => ({
                                                            id: line?.id || idx,
                                                            ...line,
                                                            _anomalie: anomalie
                                                        }))}
                                                        columns={[
                                                            {
                                                                field: 'dateecriture', headerName: 'Date', width: 100, valueFormatter: (params) => params.value || '-'
                                                            },
                                                            {
                                                                field: 'comptegen', headerName: 'Compte', width: 120, renderCell: p => (
                                                                    <Box sx={{ fontWeight: (p.row.comptegen?.startsWith('2') || p.row.compteaux?.startsWith('2')) ? 700 : 400, color: (p.row.comptegen?.startsWith('2') || p.row.compteaux?.startsWith('2')) ? 'primary.main' : 'inherit' }}>
                                                                        {p.row.compteaux || '-'}
                                                                        {((p.row.comptegen?.startsWith('4456') || p.row.compteaux?.startsWith('4456')) && <Chip label="TVA" size="small" color="info" sx={{ ml: 1, fontSize: '0.7rem' }} />)}
                                                                    </Box>
                                                                )
                                                            },
                                                            { field: 'piece', headerName: 'Pièce', width: 150, valueGetter: p => p.row.piece || '-' },
                                                            { field: 'libelle', headerName: 'Libellé', width: 350, valueGetter: p => p.row.libelle || '-' },
                                                            {
                                                                field: 'debit', headerName: 'Débit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                    params.value !== null && params.value !== undefined
                                                                        ? formatMontant(params.value)
                                                                        : '-'
                                                            },
                                                            {
                                                                field: 'credit', headerName: 'Crédit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                    params.value !== null && params.value !== undefined
                                                                        ? formatMontant(params.value)
                                                                        : '-'
                                                            },
                                                            { field: 'lettrage', headerName: 'Lettrage', width: 90, valueGetter: p => p.row.lettrage || '-' },
                                                            { field: 'analytique', headerName: 'Analytique', width: 100, valueGetter: p => p.row.analytique || '-' },
                                                            { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderValideCell(!!p.row._anomalie?.valide, () => handleToggleValidateAnomaly(p.row._anomalie), !!p.row._anomalie) },
                                                            { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderCommentCell(p.row._anomalie?.commentaire, () => handleCommentAnomaly(p.row._anomalie), !!p.row._anomalie) },
                                                        ]}
                                                    />
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                ) : (
                                    <Alert severity="success">Aucune anomalie de TVA détectée</Alert>
                                )
                            ) : (currentItem?.Type && String(currentItem.Type).toUpperCase().includes('IMMO')) ? (
                                // Mode IMMO (IMMOB, IMMO_CHARGE, etc.) - Afficher une seule anomalie par compte avec navigation
                                anomalies.length > 0 ? (
                                    <Box>
                                        {(() => {
                                            // Récupérer toutes les anomalies pour le compte courant
                                            const currentCompte = immobComptesList[immobSafeCompteIndex];
                                            const currentAnomalies = anomalies.filter(a =>
                                                a.compteNum === currentCompte ||
                                                a.journalLines?.[0]?.comptegen === currentCompte ||
                                                a.compte === currentCompte
                                            );

                                            if (currentAnomalies.length === 0) return <Alert severity="info">Aucune anomalie pour le compte {currentCompte}</Alert>;

                                            const isImmoCharge = String(currentItem?.Type).toUpperCase() === 'IMMO_CHARGE';
                                            const allValidatedForCompte = currentAnomalies.every(a => a.valide);

                                            return (
                                                <Box>

                                                    {isImmoCharge && (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                                            <Alert severity="warning" sx={{ flex: 1, fontSize: '0.85rem', py: 0.5 }}>
                                                                Actions pour le compte {currentCompte}
                                                            </Alert>
                                                        </Box>
                                                    )}

                                                    {isImmoCharge ? (
                                                        // Mode IMMO_CHARGE - Un seul tableau avec toutes les lignes comme ATYPIQUE
                                                        (() => {
                                                            // Construire la liste de toutes les lignes avec leur anomalie associée
                                                            const allLinesWithAnomaly = [];
                                                            currentAnomalies.forEach(anomaly => {
                                                                if (Array.isArray(anomaly.journalLines)) {
                                                                    anomaly.journalLines.forEach(line => {
                                                                        allLinesWithAnomaly.push({
                                                                            ...line,
                                                                            _anomaly: anomaly
                                                                        });
                                                                    });
                                                                }
                                                            });

                                                            if (allLinesWithAnomaly.length === 0) {
                                                                return <Alert severity="info">Aucune ligne pour ce compte</Alert>;
                                                            }

                                                            return (
                                                                <StandardDataGrid
                                                                    rows={allLinesWithAnomaly.map((line, idx) => ({
                                                                        id: line?.id || idx,
                                                                        ...line,
                                                                        _anomaly: line._anomaly
                                                                    }))}
                                                                    columns={[
                                                                        { field: 'dateecriture', headerName: 'Date', width: 110, valueGetter: p => p.row.dateecriture ? new Date(p.row.dateecriture).toLocaleDateString('fr-FR') : '-' },
                                                                        { field: 'comptegen', headerName: 'Compte', width: 120, valueGetter: p => p.row.compteaux || '-' },
                                                                        { field: 'piece', headerName: 'Pièce', width: 150, valueGetter: p => p.row.piece || '-' },
                                                                        { field: 'libelle', headerName: 'Libellé', width: 350, valueGetter: p => p.row.libelle || '-' },
                                                                        { field: 'debit', headerName: 'Débit', width: 110, align: 'right', valueGetter: p => p.row.debit ? formatMontant(p.row.debit) : '-' },
                                                                        { field: 'credit', headerName: 'Crédit', width: 110, align: 'right', valueGetter: p => p.row.credit ? formatMontant(p.row.credit) : '-' },
                                                                        { field: 'lettrage', headerName: 'Lettrage', width: 90, valueGetter: p => p.row.lettrage || '-' },
                                                                        { field: 'analytique', headerName: 'Analytique', width: 100, valueGetter: p => p.row.analytique || '-' },
                                                                        { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderValideCell(!!p.row._anomaly?.valide, () => p.row._anomaly && handleToggleValidateAnomaly(p.row._anomaly), !!p.row._anomaly) },
                                                                        { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderCommentCell(p.row._anomaly?.commentaire, () => p.row._anomaly && handleCommentAnomaly(p.row._anomaly), !!p.row._anomaly) },
                                                                    ]}
                                                                />
                                                            );
                                                        })()
                                                    ) : (
                                                        // Mode IMMO standard - Affichage par anomalie
                                                        currentAnomalies.map((currentAnomaly, idx) => (
                                                            <Box key={currentAnomaly.id || idx} sx={{ mb: 3 }}>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                                                    <Alert severity="warning" sx={{ flex: 1, fontSize: '0.9rem' }}>
                                                                        {currentAnomaly.message || 'Anomalie'}
                                                                    </Alert>
                                                                    <>
                                                                        <Tooltip title={currentAnomaly.valide ? "Annuler la validation" : "Valider"}>
                                                                            <IconButton
                                                                                size="small"
                                                                                onClick={() => handleToggleValidateAnomaly(currentAnomaly)}
                                                                                color={currentAnomaly.valide ? "error" : "success"}
                                                                            >
                                                                                {currentAnomaly.valide ? (
                                                                                    <Cancel fontSize="small" />
                                                                                ) : (
                                                                                    <CheckCircle fontSize="small" />
                                                                                )}
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                        <Tooltip title="Ajouter/Modifier commentaire">
                                                                            <IconButton
                                                                                variant="outlined"
                                                                                size="small"
                                                                                onClick={() => handleCommentAnomaly(currentAnomaly)}
                                                                                color="primary"
                                                                            >
                                                                                <CommentIcon fontSize="small" />
                                                                            </IconButton>
                                                                        </Tooltip>
                                                                    </>
                                                                </Box>

                                                                {/* Tableau des lignes de l'anomalie courante */}
                                                                {currentAnomaly.journalLines?.length > 0 ? (
                                                                    <StandardDataGrid
                                                                        height={350}
                                                                        rows={currentAnomaly.journalLines.map((line, idx) => ({
                                                                            id: line?.id || idx,
                                                                            ...line,
                                                                            _anomalie: currentAnomaly
                                                                        }))}
                                                                        columns={[
                                                                            {
                                                                                field: 'dateecriture', headerName: 'Date', width: 100, renderCell: (params) =>
                                                                                    params.row?.dateecriture
                                                                                        ? new Date(params.row.dateecriture).toLocaleDateString('fr-FR')
                                                                                        : '-'
                                                                            },
                                                                            { field: 'comptegen', headerName: 'Compte', width: 100, valueGetter: p => p.row.compteaux || '-' },
                                                                            { field: 'piece', headerName: 'Pièce', width: 90, valueGetter: p => p.row.piece || '-' },
                                                                            { field: 'libelle', headerName: 'Libellé', width: 180, valueGetter: p => p.row.libelle || '-' },
                                                                            {
                                                                                field: 'debit', headerName: 'Débit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                                    params.value !== null && params.value !== undefined
                                                                                        ? formatMontant(params.value)
                                                                                        : '-'
                                                                            },
                                                                            {
                                                                                field: 'credit', headerName: 'Crédit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                                    params.value !== null && params.value !== undefined
                                                                                        ? formatMontant(params.value)
                                                                                        : '-'
                                                                            },
                                                                            { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderValideCell(!!p.row._anomalie?.valide, () => handleValidateLine(p.row, p.row._anomalie), !!p.row._anomalie) },
                                                                            { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderCommentCell(p.row._anomalie?.commentaire, () => handleCommentAnomaly(p.row._anomalie), !!p.row._anomalie) },
                                                                        ]}
                                                                    />
                                                                ) : (
                                                                    <Alert severity="info">Aucune ligne pour cette anomalie</Alert>
                                                                )}
                                                            </Box>
                                                        ))
                                                    )}
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                ) : (
                                    <Alert severity="success">Aucune anomalie détectée pour ce contrôle</Alert>
                                )
                            ) : String(currentItem?.Type || '').trim().toUpperCase() === 'ATYPIQUE' ? (
                                // Mode ATYPIQUE - Affichage paginé par compte avec tableau unique
                                anomalies.length > 0 ? (
                                    <Box>
                                        {!atypiqueCurrentData ? (
                                            <Alert severity="info">Aucune donnée à afficher pour ce contrôle</Alert>
                                        ) : (
                                            <Box>
                                                {(() => {
                                                    const globalAnomaly = atypiqueCurrentData.anomalies?.[0];
                                                    if (!globalAnomaly) return null;
                                                    return (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                                            <Alert severity="warning" sx={{ flex: 1, fontSize: '0.85rem', py: 0.5 }}>
                                                                {globalAnomaly.message || `Anomalie atypique (${atypiqueCurrentData.anomalies.length})`}
                                                            </Alert>

                                                        </Box>
                                                    );
                                                })()}

                                                {atypiqueCurrentData.allLines?.length > 0 ? (
                                                    <StandardDataGrid
                                                        height={350}
                                                        rows={atypiqueCurrentData.allLines.map((line, idx) => ({
                                                            id: line?.id !== undefined ? `${line.id}-${idx}` : idx,
                                                            ...line,
                                                            _relatedAnomaly: atypiqueCurrentData.anomalies.find(a => a.journalLines?.some(jl => jl.id === line.id))
                                                        }))}
                                                        columns={[
                                                            {
                                                                field: 'dateecriture', headerName: 'Date', width: 100, renderCell: (params) =>
                                                                    params.row?.dateecriture
                                                                        ? new Date(params.row.dateecriture).toLocaleDateString('fr-FR')
                                                                        : '-'
                                                            },
                                                            { field: 'comptegen', headerName: 'Compte', width: 120, valueGetter: p => p.row.compteaux || '-' },
                                                            { field: 'piece', headerName: 'Pièce', width: 150, valueGetter: p => p.row.piece || '-' },
                                                            { field: 'libelle', headerName: 'Libellé', width: 350, valueGetter: p => p.row.libelle || '-' },
                                                            {
                                                                field: 'debit', headerName: 'Débit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                    params.value !== null && params.value !== undefined
                                                                        ? formatMontant(params.value)
                                                                        : '-'
                                                            },
                                                            {
                                                                field: 'credit', headerName: 'Crédit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                    params.value !== null && params.value !== undefined
                                                                        ? formatMontant(params.value)
                                                                        : '-'
                                                            },
                                                            { field: 'lettrage', headerName: 'Lettrage', width: 90, valueGetter: p => p.row.lettrage || '-' },
                                                            { field: 'analytique', headerName: 'Analytique', width: 100, valueGetter: p => p.row.analytique || '-' },
                                                            { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderValideCell(!!p.row._relatedAnomaly?.valide, () => p.row._relatedAnomaly && handleToggleValidateAnomaly(p.row._relatedAnomaly), !!p.row._relatedAnomaly) },
                                                            { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderCommentCell(p.row._relatedAnomaly?.commentaire, () => p.row._relatedAnomaly && handleCommentAnomaly(p.row._relatedAnomaly), !!p.row._relatedAnomaly) },
                                                        ]}
                                                    />
                                                ) : (
                                                    <Alert severity="info">Aucune ligne pour ce compte</Alert>
                                                )}
                                            </Box>
                                        )}
                                    </Box>
                                ) : (
                                    <Alert severity="success">Aucun montant atypique détecté</Alert>
                                )
                            ) : anomalies.length > 0 ? (
                                // Mode par défaut (autres types)
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {anomalies.map((anomalie) => (
                                        <Box key={anomalie.id}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                                                <Alert severity="warning" sx={{ flex: 1, fontSize: '0.9rem' }}>
                                                    {anomalie.message || 'Anomalie'}
                                                </Alert>
                                            </Box>

                                            {anomalie.journalLines?.length > 0 ? (
                                                <StandardDataGrid
                                                    height={350}
                                                    rows={anomalie.journalLines.map((line, idx) => ({
                                                        id: line?.id || idx,
                                                        ...line,
                                                        _anomalie: anomalie
                                                    }))}
                                                    columns={[
                                                        {
                                                            field: 'dateecriture', headerName: 'Date', width: 100, renderCell: (params) =>
                                                                params.row?.dateecriture
                                                                    ? new Date(params.row.dateecriture).toLocaleDateString('fr-FR')
                                                                    : '-'
                                                        },
                                                        { field: 'comptegen', headerName: 'Compte', width: 100, valueGetter: p => p.row.compteaux || '-' },
                                                        { field: 'piece', headerName: 'Pièce', width: 90, valueGetter: p => p.row.piece || '-' },
                                                        { field: 'libelle', headerName: 'Libellé', width: 180, valueGetter: p => p.row.libelle || '-' },
                                                        {
                                                            field: 'debit', headerName: 'Débit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                params.value !== null && params.value !== undefined
                                                                    ? formatMontant(params.value)
                                                                    : '-'
                                                        },
                                                        {
                                                            field: 'credit', headerName: 'Crédit', width: 110, type: 'number', headerAlign: 'right', align: 'right', valueFormatter: (params) =>
                                                                params.value !== null && params.value !== undefined
                                                                    ? formatMontant(params.value)
                                                                    : '-'
                                                        },
                                                        { field: 'valide', headerName: 'Validé', width: 80, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderValideCell(!!p.row._anomalie?.valide, () => handleValidateLine(p.row, p.row._anomalie), !!p.row._anomalie) },
                                                        { field: 'commentaire', headerName: 'Commentaire', width: 120, align: 'center', headerAlign: 'center', sortable: false, renderCell: p => renderCommentCell(p.row._anomalie?.commentaire, () => handleCommentAnomaly(p.row._anomalie), !!p.row._anomalie) },
                                                    ]}
                                                />
                                            ) : null}
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                            <Alert severity="success">Aucune anomalie détectée pour ce contrôle</Alert>
                        )}
                    </Grid>
                </Grid>
            </Box>

            {/* POPUP DE CONFIRMATION POUR VALIDATION */}
            <ConfirmActionDialog
                open={confirmPopup.open || !!confirmPopup.action}
                onClose={() => handleConfirmValidation(false)}
                onConfirm={() => handleConfirmValidation(true)}
                title={
                    confirmPopup.action === 'valider_tout'
                        ? `Valider toutes les anomalies`
                        : confirmPopup.action === 'annuler_tout'
                            ? `Annuler toutes les validations`
                            : confirmPopup.action === 'valider_ligne'
                                ? `Valider la ligne`
                                : confirmPopup.action === 'annuler_ligne'
                                    ? `Annuler la validation de la ligne`
                                    : confirmPopup.action === 'valider'
                                        ? `Valider l'anomalie`
                                        : `Annuler la validation`
                }
                message={
                    confirmPopup.action === 'valider_tout'
                        ? `Voulez-vous vraiment valider toutes les anomalies ?`
                        : confirmPopup.action === 'annuler_tout'
                            ? `Voulez-vous vraiment annuler la validation de toutes les anomalies ?`
                            : confirmPopup.action === 'valider_ligne'
                                ? `Voulez-vous valider cette ligne ?`
                                : confirmPopup.action === 'annuler_ligne'
                                    ? `Voulez-vous annuler la validation de cette ligne ?`
                                    : confirmPopup.action === 'valider'
                                        ? `Voulez-vous valider cette anomalie ?`
                                        : `Voulez-vous annuler la validation de cette anomalie ?`
                }
                confirmText="Confirmer"
                cancelText="Annuler"
                loading={confirmLoading}
                color={
                    confirmPopup.action?.startsWith('valider')
                        ? '#06b6d4'
                        : '#EF4444'
                }
            />

            {/* DIALOG POUR COMMENTAIRE */}
            <CommentDialog
                open={commentDialog.open}
                onClose={handleCloseCommentDialog}
                onSave={commentDialog.line ? handleSaveLineComment : handleSaveCommentDialog}
                initialValue={
                    commentDialog.line
                        ? (commentDialog.line.commentaire || commentDialog.anomalie?.commentaire || '')
                        : (commentDialog.anomalie?.commentaire || '')
                }
                title={commentDialog.line ? 'Commentaire ligne' : 'Commentaire anomalie'}
            />
        </Paper >
    );
});

export default RevisionDetails;