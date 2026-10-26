import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box,
    Typography,
    Button,
    ButtonGroup,
    Chip,
    Alert,
    Stack,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Paper,
    Collapse,
    Divider,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    CircularProgress,
    Drawer,
    IconButton
} from '@mui/material';

import { init } from '../../../init';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import RevisionDetails from './RevisionDetails';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
// import PopupTestSelectedFile from '../../../componentsTools/popupTestSelectedFile';
import { ErrorOutline, CheckCircle, KeyboardArrowDown, KeyboardArrowUp, WarningAmber, CheckCircleOutline, PictureAsPdf, TableChart, Close, RestartAltOutlined } from '@mui/icons-material';
import ExercicePeriodeSelector from '../ExercicePeriodeSelector';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import axios from '../../../config/axios';
import useAuth from '../../hooks/useAuth';
import { jwtDecode } from 'jwt-decode';

// Format date as dd-mm-yy
const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
};

// Format date as YYYY-MM-DD for API
const formatDateYYYYMMDD = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        // Si c'est déjà une string au format YYYY-MM-DD, la retourner
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
        return '';
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

// ─── Système de design (aligné sur le tableau de bord) ───
const T = {
  ink: '#0E2733', canvas: '#F4F6F5', surface: '#FFFFFF', line: '#E2E6EA', ledger: '#EEF1F3',
  text: '#16202B', muted: '#6A7785', faint: '#9AA6B2',
  accent: '#0E7C86', accentDark: '#0a5d65', pos: '#1F8A70', warn: '#B5791A', neg: '#BE3A2F', accW: '#E2F0F1', negW: '#F7E7E4',
};
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };
const CARD_SHADOW = '0 1px 2px rgba(16,39,51,.04), 0 8px 24px -16px rgba(16,39,51,.18)';
const panelSx = { border: `1px solid ${T.line}`, borderRadius: '16px', bgcolor: T.surface, boxShadow: CARD_SHADOW, overflow: 'hidden' };
const statLabelSx = { fontSize: '10px', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' };

// Libellés lisibles par type de contrôle (pour la confirmation de révision scopée).
const TYPE_LABELS = {
    ATYPIQUE: 'Recherche de montants atypiques',
    SENS_SOLDE: 'Conformité du solde au sens normal des comptes',
    SENS_ECRITURE: "Sens d'enregistrement des factures d'achats et de ventes",
    IMMO_CHARGE: 'Conformité du seuil de capitalisation des immobilisations',
    UTIL_CPT_TVA: 'Utilisation des comptes de TVA',
    EXISTENCE: 'Existence du compte de capital',
};

const Revision = forwardRef(function Revision({ id_exercice, id_periode, filterType }, ref) {
    let initial = init[0];
    const axiosPrivate = useAxiosPrivate();
    const navigate = useNavigate();
    const { auth } = useAuth();

    // Utiliser le contexte global pour exercice et période
    const {
        selectedExerciceId,
        selectedPeriodeId,
        selectedPeriodeDates,
        listePeriodes,
        currentExerciceDates,
        handleChangeExercice,
        handleChangePeriode,
        loading: contextLoading
    } = useExercicePeriode();

    const [activeTab, setActiveTab] = useState(0); // 0 = Fournisseur, 1 = Client
    const [loading, setLoading] = useState(false);

    // Utiliser les props si fournies, sinon utiliser le contexte
    const effectiveExerciceId = id_exercice ?? selectedExerciceId;
    const effectivePeriodeId = id_periode ?? selectedPeriodeId;

    // Résoudre les dates de période synchroniquement (pas de race condition avec le contexte)
    const resolvedPeriodeDates = useMemo(() => {
        if (effectivePeriodeId && effectivePeriodeId !== 'exercice') {
            const periode = (listePeriodes || []).find(p => String(p.id) === String(effectivePeriodeId));
            if (periode?.date_debut && periode?.date_fin) {
                return periode;
            }
        }
        if (selectedPeriodeDates?.date_debut && selectedPeriodeDates?.date_fin) {
            return selectedPeriodeDates;
        }
        if (currentExerciceDates?.date_debut && currentExerciceDates?.date_fin) {
            return currentExerciceDates;
        }
        return null;
    }, [effectivePeriodeId, listePeriodes, selectedPeriodeDates, currentExerciceDates]);

    // Fonction pour résoudre les dates - utilise resolvedPeriodeDates (sync) + fallback API
    const resolveDatesForAnalysis = useCallback(async () => {
        // Priorité 1: dates résolues synchroniquement depuis listePeriodes
        if (resolvedPeriodeDates?.date_debut && resolvedPeriodeDates?.date_fin) {
            return {
                date_debut: formatDateYYYYMMDD(resolvedPeriodeDates.date_debut),
                date_fin: formatDateYYYYMMDD(resolvedPeriodeDates.date_fin)
            };
        }

        // Priorité 2: fallback API si on a un id_periode mais pas de dates
        if (effectivePeriodeId && effectivePeriodeId !== 'exercice' && effectiveExerciceId) {
            try {
                const response = await axios.get(`/paramExercice/listePeriodes/${effectiveExerciceId}`);
                if (response?.data?.state) {
                    const periode = (response.data.list || []).find(p => String(p.id) === String(effectivePeriodeId));
                    if (periode?.date_debut && periode?.date_fin) {
                        return {
                            date_debut: formatDateYYYYMMDD(periode.date_debut),
                            date_fin: formatDateYYYYMMDD(periode.date_fin)
                        };
                    }
                }
            } catch (e) {
                console.error('Error fetching periode dates:', e);
            }
        }

        // Priorité 3: dates de l'exercice
        if (currentExerciceDates?.date_debut && currentExerciceDates?.date_fin) {
            return {
                date_debut: formatDateYYYYMMDD(currentExerciceDates.date_debut),
                date_fin: formatDateYYYYMMDD(currentExerciceDates.date_fin)
            };
        }

        return null;
    }, [resolvedPeriodeDates, effectivePeriodeId, effectiveExerciceId, currentExerciceDates]);

    const [controles, setControles] = useState([]);
    const [showControles, setShowControles] = useState(true);
    const [selectedTypeDetails, setSelectedTypeDetails] = useState('');
    const [loadingControles, setLoadingControles] = useState(false);
    const lastContextKeyRef = useRef('');

    // === Popup de confirmation pour validation ===
    const [confirmPopup, setConfirmPopup] = useState({ open: false, type: null, nextValider: null });
    const [confirmLoading, setConfirmLoading] = useState(false);

    // === Popup d'erreur pour anomalies non validées ===
    const [errorPopup, setErrorPopup] = useState({ open: false, message: '' });

    // === Popup pour résultat de révision ===
    const [reviserPopup, setReviserPopup] = useState({ open: false, message: '', success: true });

    const [confirmReviserPopup, setConfirmReviserPopup] = useState(false);
    const [confirmReviserLoading, setConfirmReviserLoading] = useState(false);

    // === État de chargement pour les détails ===
    const [detailsLoading, setDetailsLoading] = useState(false);

    // === Variables restantes pour logique spécifique ===
    const [searchParams] = useSearchParams();
    const [fileInfos, setFileInfos] = useState(null);

    const [noFile, setNoFile] = useState(false);
    const [fileId, setFileId] = useState(0);

    // Debug multi-onglets: log quand l'onglet reprend le focus
    useEffect(() => {
        const onFocus = () => {
            const ids = getIds();
        };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [effectiveExerciceId, effectivePeriodeId, selectedPeriodeDates]);

    // Lecture des paramètres d'URL pour date_debut et date_fin
    useEffect(() => {
        const dateDebutFromUrl = searchParams.get('date_debut');
        const dateFinFromUrl = searchParams.get('date_fin');
        const idPeriodeFromUrl = searchParams.get('id_periode');

        // La logique URL sera gérée par le contexte maintenant
    }, [searchParams]);

    // Synchroniser l'exercice depuis l'URL
    useEffect(() => {
        const { id_exercice } = getIds();
        if (id_exercice && id_exercice > 0 && id_exercice !== effectiveExerciceId) {
            // Le contexte gérera la synchronisation
        }
    }, []);

    // Logique URL simplifiée - gérée par le contexte
    // useEffect(() => {
    //     if (!listePeriodes || listePeriodes.length === 0) return;
    //     // ... logique déplacée dans le contexte
    // }, [listePeriodes, searchParams]);

    const [periodeErrorPopup, setPeriodeErrorPopup] = useState({ open: false, message: '' });

    const ids = useMemo(() => {
        const pathParts = window.location.pathname.split('/');
        const idIndex = pathParts.indexOf('revision') + 1;
        const dossierFromUrl = parseInt(pathParts[idIndex]);
        const exerciceFromUrl = parseInt(pathParts[idIndex + 1]);
        return {
            id_compte: parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1,
            id_dossier: dossierFromUrl || parseInt(sessionStorage.getItem('fileId')) || 1,
            id_exercice: exerciceFromUrl || effectiveExerciceId || parseInt(sessionStorage.getItem('exerciceId')) || 1
        };
    }, [effectiveExerciceId, auth]);

    const getIds = useCallback(() => ids, [ids]);

    const sendToHome = (value) => {
        setNoFile(!value);
        navigate('/tab/home');
    };

    // Vérifier si un dossier est sélectionné au chargement
    useEffect(() => {
        const idDossier = sessionStorage.getItem('fileId');
        if (!idDossier || idDossier === '0') {
            setNoFile(true);
        } else {
            setFileId(parseInt(idDossier));
            setNoFile(false);
        }
    }, []);

    const fetchControles = useCallback(async (resetTotals = false, silent = false) => {
        if (!effectiveExerciceId) return;

        if (!silent) setLoadingControles(true);
        try {
            const { id_compte, id_dossier } = getIds();
            let url = `/administration/revisionControleAuto/${id_compte}/${id_dossier}/${effectiveExerciceId}`;

            // Ajouter les dates de période si sélectionnée
            const resolvedDates = await resolveDatesForAnalysis();
            if (resolvedDates) {
                const params = new URLSearchParams();
                params.append('date_debut', resolvedDates.date_debut);
                params.append('date_fin', resolvedDates.date_fin);
                if (effectivePeriodeId) {
                    params.append('id_periode', effectivePeriodeId);
                }
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.get(url);

            if (response.data.state) {
                const allControles = response.data.controles || [];
                // Si filterType est fourni, on scope l'affichage à ce seul type de contrôle.
                const newControles = filterType
                    ? allControles.filter((c) => c?.Type === filterType)
                    : allControles;
                setControles(newControles);
                await fetchInitialTotals();
            }
        } catch (error) {
            console.error('Error fetching controles:', error);
        } finally {
            if (!silent) setLoadingControles(false);
        }
    }, [axiosPrivate, effectiveExerciceId, resolvedPeriodeDates, effectivePeriodeId, filterType]);

    // Charger automatiquement les controles quand l'exo et la période changent
    useEffect(() => {
        const contextKey = `${effectiveExerciceId}-${effectivePeriodeId}`;
        const contextChanged = contextKey !== lastContextKeyRef.current;

        if (effectiveExerciceId) {
            if (contextChanged) {
                lastContextKeyRef.current = contextKey;
                fetchControles(true); // resetTotals = true quand le contexte change
            } else {
                fetchControles(false); // sinon on recharge sans reset
            }
        }
    }, [effectiveExerciceId, effectivePeriodeId]);

    const fetchDossierInfos = async () => {
        try {
            const { id_dossier } = getIds();
            const response = await axiosPrivate.get(`/home/FileInfos/${id_dossier}`);
            const resData = response.data;
            if (resData.state && resData.fileInfos && resData.fileInfos.length > 0) {
                setFileInfos(resData.fileInfos[0]);
            }
        } catch (error) {
            console.error('Error fetching dossier infos:', error);
        }
    };

    useEffect(() => {
        fetchDossierInfos();
    }, []);

    const controlesByType = useMemo(() => {
        const byType = new Map();
        for (const c of controles || []) {
            const key = c?.Type || '';
            if (!key) continue;
            const list = byType.get(key) || [];
            list.push(c);
            byType.set(key, list);
        }
        return byType;
    }, [controles]);

    const [initialTotalsByType, setInitialTotalsByType] = useState({});
    const initialTotals = useMemo(() => ({ ...initialTotalsByType }), [initialTotalsByType]);

    const fetchInitialTotals = useCallback(async () => {
        if (!effectiveExerciceId) {
            setInitialTotalsByType({});
            return;
        }
        const { id_compte, id_dossier } = getIds();
        setInitialTotalsByType({});

        try {
            let url = `/administration/revisionControleAuto/${id_compte}/${id_dossier}/${effectiveExerciceId}/stats`;
            const params = new URLSearchParams();
            if (effectivePeriodeId && effectivePeriodeId !== 'exercice') {
                params.append('id_periode', effectivePeriodeId);
            }
            if (params.toString()) {
                url += `?${params.toString()}`;
            }

            const response = await axiosPrivate.get(url);
            if (response?.data?.state && Array.isArray(response.data.data?.details)) {
                const totals = {};
                response.data.data.details.forEach(item => {
                    totals[item.type] = Number(item.total_groups || item.total || 0);
                });
                setInitialTotalsByType(totals);
            }
        } catch (error) {
            console.error('Error fetching initial totals for revision controls:', error);
        }
    }, [axiosPrivate, effectiveExerciceId, effectivePeriodeId]);

    useEffect(() => {
        fetchInitialTotals();
    }, [fetchInitialTotals]);

    const [expandedType, setExpandedType] = useState('');
    
    // État pour le drawer
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedItemForDrawer, setSelectedItemForDrawer] = useState(null);

    const handleToggleExpand = (type) => {
        if (expandedType === type) {
            setExpandedType('');
        } else {
            setExpandedType(type);
        }
    };

    const handleOpenDrawer = (item) => {
        setSelectedItemForDrawer(item);
        setDrawerOpen(true);
    };

    const handleCloseDrawer = () => {
        setDrawerOpen(false);
        setSelectedItemForDrawer(null);
    };

    const executeControler = async () => {
        if (!effectiveExerciceId) return;

        const { id_compte, id_dossier } = getIds();

        setConfirmReviserLoading(true);
        try {
            let url = `/administration/revisionControleAuto/${id_compte}/${id_dossier}/${effectiveExerciceId}/executeAll`;

            const params = new URLSearchParams();
            const resolvedDates = await resolveDatesForAnalysis();
            if (resolvedDates && effectivePeriodeId) {
                params.append('date_debut', resolvedDates.date_debut);
                params.append('date_fin', resolvedDates.date_fin);
                params.append('id_periode', effectivePeriodeId);
            }
            // Entrée séparée (page Détails) -> révision scopée à ce seul type.
            if (filterType) params.append('type', filterType);
            const qs = params.toString();
            if (qs) url += `?${qs}`;

            const response = await axiosPrivate.post(url);

            if (response.data.state) {
                // console.log('Contrôle global exécuté:', response.data);
                await fetchControles();
                setReviserPopup({
                    open: true,
                    message: filterType
                        ? `Révision de « ${TYPE_LABELS[filterType] || filterType} » terminée !`
                        : `Contrôle terminé!`,
                    success: true
                });
            } else {
                setReviserPopup({
                    open: true,
                    message: response.data.message || 'Erreur lors du contrôle',
                    success: false
                });
            }
        } catch (error) {
            console.error('Error executing global controle:', error);
            setReviserPopup({
                open: true,
                message: 'Erreur lors de l\'exécution du contrôle global',
                success: false
            });
        } finally {
            setConfirmReviserLoading(false);
        }
    };

    const handleExportGlobalPdf = async () => {
        if (!effectiveExerciceId) return;
        try {
            let url = `/administration/revisionControleAuto/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}/export/global/pdf`;
            const resolvedDates = await resolveDatesForAnalysis();
            if (resolvedDates) {
                const params = new URLSearchParams();
                params.append('date_debut', resolvedDates.date_debut);
                params.append('date_fin', resolvedDates.date_fin);
                if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
                url += `?${params.toString()}`;
            }
            const response = await axiosPrivate.get(url, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = `Revision_Globale_${ids.id_dossier}_${effectiveExerciceId}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error exporting global PDF:', error);
        }
    };

    const handleExportGlobalExcel = async () => {
        if (!effectiveExerciceId) return;
        try {
            let url = `/administration/revisionControleAuto/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}/export/global/excel`;
            const resolvedDates = await resolveDatesForAnalysis();
            if (resolvedDates) {
                const params = new URLSearchParams();
                params.append('date_debut', resolvedDates.date_debut);
                params.append('date_fin', resolvedDates.date_fin);
                if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
                url += `?${params.toString()}`;
            }
            const response = await axiosPrivate.get(url, { responseType: 'blob' });
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = `Revision_Globale_${ids.id_dossier}_${effectiveExerciceId}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error('Error exporting global Excel:', error);
        }
    };

    // Expose export functions to parent via ref
    useImperativeHandle(ref, () => ({
        exportExcel: handleExportGlobalExcel,
        exportPdf: handleExportGlobalPdf
    }));

    const handleControler = () => {
        if (!effectiveExerciceId) return;

        // Vérifier qu'une période spécifique est sélectionnée
        if (!effectivePeriodeId || effectivePeriodeId === 'exercice') {
            setPeriodeErrorPopup({
                open: true,
                message: 'Veuillez sélectionner une période spécifique avant de lancer la révision.'
            });
            return;
        }

        setConfirmReviserPopup(true);
    };

    const handleConfirmReviser = async (confirmed) => {
        if (!confirmed) {
            setConfirmReviserPopup(false);
            return;
        }

        await executeControler();
        setConfirmReviserPopup(false);
    };

    const handleToggleValidateType = async (type, nextValider) => {
        try {
            const items = (controlesByType.get(type) || []).filter((c) => c?.id);

            // Si on essaie de valider (pas d'annuler), vérifier que toutes les anomalies sont validées
            if (nextValider) {
                const { id_compte, id_dossier, id_exercice } = getIds();

                // Récupérer les dates résolues une seule fois
                const resolvedDates = await resolveDatesForAnalysis();

                // Récupérer toutes les anomalies pour ce type de contrôle
                let hasUnvalidatedAnomalies = false;
                let totalUnvalidated = 0;

                for (const controle of items) {
                    try {
                        let url = `/administration/revisionControleAuto/${id_compte}/${id_dossier}/${id_exercice}/anomalies/controle/${encodeURIComponent(controle.id_controle)}`;
                        if (resolvedDates && effectivePeriodeId) {
                            const params = new URLSearchParams();
                            params.append('date_debut', resolvedDates.date_debut);
                            params.append('date_fin', resolvedDates.date_fin);
                            params.append('id_periode', effectivePeriodeId);
                            url += `?${params.toString()}`;
                        }

                        const response = await axiosPrivate.get(url);
                        if (response.data.state && response.data.anomalies) {
                            const unvalidated = response.data.anomalies.filter(a => !a.valide);
                            if (unvalidated.length > 0) {
                                hasUnvalidatedAnomalies = true;
                                totalUnvalidated += unvalidated.length;
                            }
                        }
                    } catch (err) {
                        console.error('Error fetching anomalies for controle:', controle.id_controle, err);
                    }
                }

                if (hasUnvalidatedAnomalies) {
                    setErrorPopup({
                        open: true,
                        message: `Impossible de valider : il reste ${totalUnvalidated} anomalie(s) non validée(s). Veuillez d'abord valider toutes les anomalies dans les détails.`
                    });
                    return;
                }
            }

            // Ouvrir le popup de confirmation
            setConfirmPopup({ open: true, type, nextValider });
        } catch (error) {
            console.error('Error in handleToggleValidateType:', error);
        }
    };

    const handleConfirmValidation = async (confirmed) => {
        if (!confirmed || !confirmPopup.type) {
            setConfirmPopup({ open: false, type: '', nextValider: false });
            return;
        }

        setConfirmLoading(true);
        try {
            const items = (controlesByType.get(confirmPopup.type) || []).filter((c) => c?.id);
            await Promise.all(
                items.map((c) =>
                    axiosPrivate.put(`/param/revisionControle/validation/${c.id}`, {
                        Valider: confirmPopup.nextValider
                    })
                )
            );
            await fetchControles();
        } catch (error) {
            console.error('Error updating validation for type:', confirmPopup.type, error);
            alert('Erreur lors de la validation');
        } finally {
            setConfirmLoading(false);
            setConfirmPopup({ open: false, type: '', nextValider: false });
        }
    };

    const controlesGrouped = useMemo(() => {
        const byType = new Map();

        for (const c of controles || []) {
            const key = c?.Type || '';
            if (!key) continue;

            const existing = byType.get(key);
            if (!existing) {
                byType.set(key, {
                    Type: key,
                    description: c?.description,
                    anomalies: Number(c?.anomalies) || 0,
                    Valider: Boolean(c?.Valider),
                    _count: 1
                });
            } else {
                existing.anomalies += Number(c?.anomalies) || 0;
                existing.Valider = existing.Valider && Boolean(c?.Valider);
                existing._count += 1;
            }
        }

        return Array.from(byType.values()).sort((a, b) => a.Type.localeCompare(b.Type));
    }, [controles]);

    // Total d'anomalies affiché en "Points critiques".
    // En vue filtrée (entrée séparée), on ne compte QUE le type concerné, pas tous les contrôles.
    const pointsCritiques = filterType
        ? (Number(initialTotals[filterType]) || controlesGrouped.reduce((sum, c) => sum + (Number(c.anomalies) || 0), 0))
        : (Object.values(initialTotals).reduce((sum, v) => sum + (Number(v) || 0), 0) || controlesGrouped.reduce((sum, c) => sum + (Number(c.anomalies) || 0), 0));

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: T.canvas }}>
            <ConfirmActionDialog
                open={confirmReviserPopup}
                onClose={() => setConfirmReviserPopup(false)}
                onConfirm={() => handleConfirmReviser(true)}
                title={filterType ? 'Réviser ce contrôle' : 'Réviser'}
                message={filterType
                    ? `Confirmer la révision de « ${TYPE_LABELS[filterType] || filterType} » ?`
                    : "Confirmer l'exécution de la révision (tous les contrôles) ?"}
                confirmText="Confirmer"
                cancelText="Annuler"
                loading={confirmReviserLoading}
                color={T.accent}
            />
            <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mb: 1.5, bgcolor: T.surface, flexShrink: 0 }}>
                <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap" alignItems="center">
                    <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 } }}>
                        <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px', mb: 0.75 }}>Points critiques</Typography>
                        <Typography sx={{ ...NUM, fontSize: { xs: '20px', md: '24px' }, fontWeight: 800, letterSpacing: '-.4px', lineHeight: 1, color: pointsCritiques > 0 ? T.neg : T.pos }}>{pointsCritiques}</Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 } }}>
                        <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px', mb: 0.75 }}>Restants à valider</Typography>
                        {(() => {
                            const restant = controlesGrouped.reduce((sum, c) => sum + (c.anomalies || 0), 0);
                            return <Typography sx={{ ...NUM, fontSize: { xs: '20px', md: '24px' }, fontWeight: 800, letterSpacing: '-.4px', lineHeight: 1, color: restant > 0 ? T.warn : T.pos }}>{restant}</Typography>;
                        })()}
                    </Box>
                    <Box sx={{ flex: 2, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <Button
                            variant="contained"
                            disableElevation
                            onClick={handleControler}
                            disabled={!effectiveExerciceId || confirmReviserLoading}
                            startIcon={confirmReviserLoading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RestartAltOutlined />}
                            sx={{
                                height: 34,
                                bgcolor: T.accent,
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 3,
                                borderRadius: '10px',
                                boxShadow: 'none',
                                '&:hover': { bgcolor: T.accentDark, boxShadow: 'none' },
                            }}
                        >
                            {confirmReviserLoading ? 'Révision…' : 'Réviser'}
                        </Button>
                    </Box>
                </Stack>
            </Box>

            <Paper elevation={0} sx={{ p: 2, ...panelSx, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {loadingControles ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                        <CircularProgress size={28} />
                    </Box>
                ) : showControles &&
                (controlesGrouped.length === 0 ? (
                    <Alert severity="info">
                        Aucun contrôle trouvé pour cet exercice. Les contrôles seront créés automatiquement.
                    </Alert>
                ) : filterType ? (
                    // Entrée séparée (un seul type) : tableau affiché directement, sans carte ni drawer.
                    <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                        <RevisionDetails
                            type={filterType}
                            controles={controlesByType.get(filterType) || []}
                            onClose={() => {}}
                            idCompte={ids.id_compte}
                            idDossier={ids.id_dossier}
                            idExercice={effectiveExerciceId}
                            idPeriode={effectivePeriodeId}
                            dateDebut={formatDateYYYYMMDD(resolvedPeriodeDates?.date_debut)}
                            dateFin={formatDateYYYYMMDD(resolvedPeriodeDates?.date_fin)}
                            isPeriodeSelected={!!resolvedPeriodeDates && !!effectivePeriodeId && effectivePeriodeId !== 'exercice'}
                            onValidationChange={() => fetchControles(false, true)}
                        />
                    </Box>
                ) : (
                    <Stack spacing={1.5} sx={{ width: '100%', flex: 1, minHeight: 0, overflow: 'auto' }}>
                        {controlesGrouped.map((item) => {
                            const totalInitial = initialTotals[item.Type] || item.anomalies || 0;
                            const restant = item.anomalies || 0;
                            const isAllGood = restant === 0;

                            // console.log(`[Chip] Type: ${item.Type}, totalInitial: ${totalInitial}, restant: ${restant}, stored: ${initialTotals[item.Type]}`);

                            return (
                                <Paper
                                    key={item.Type}
                                    elevation={0}
                                    onClick={() => handleOpenDrawer(item)}
                                    sx={{
                                        border: `1px solid ${T.line}`,
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            boxShadow: CARD_SHADOW,
                                            borderColor: T.accent
                                        }
                                    }}
                                >
                                    <Box
                                        sx={{
                                            position: 'relative',
                                            bgcolor: T.surface,
                                            p: 2,
                                            display: 'flex',
                                            alignItems: 'center',
                                            borderRadius: '12px',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* Bordure latérale */}
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                left: 0,
                                                top: 0,
                                                bottom: 0,
                                                width: '4px',
                                                bgcolor: isAllGood ? T.pos : T.neg
                                            }}
                                        />

                                        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                                            {isAllGood ? (
                                                <CheckCircleOutline sx={{ color: T.pos, fontSize: 24 }} />
                                            ) : (
                                                <WarningAmber sx={{ color: T.warn, fontSize: 24 }} />
                                            )}

                                            <Box sx={{ flexGrow: 1 }}>
                                                <Typography sx={{ fontWeight: 700, fontSize: '13.5px', color: T.text }}>
                                                    {item.description}
                                                </Typography>
                                            </Box>

                                            <Stack direction="row" spacing={1.5} alignItems="center">
                                                <Chip
                                                    label={`${totalInitial} total`}
                                                    sx={{
                                                        bgcolor: totalInitial > 0 ? T.negW : T.accW,
                                                        color: totalInitial > 0 ? T.neg : T.pos,
                                                        fontWeight: 800,
                                                        fontSize: '0.65rem',
                                                        height: 20,
                                                        ...NUM
                                                    }}
                                                />

                                                {totalInitial > 0 && (
                                                    <Chip
                                                        label={`${restant} restant`}
                                                        sx={{ bgcolor: '#FBF3E2', color: T.warn, fontWeight: 800, fontSize: '0.65rem', height: 20, ...NUM }}
                                                    />
                                                )}
                                            </Stack>
                                        </Stack>
                                    </Box>
                                </Paper>
                            );
                        })}
                    </Stack>
                ))}
            </Paper>
            {/* POPUP DE CONFIRMATION POUR VALIDATION */}
            <ConfirmActionDialog
                open={confirmPopup.open}
                onClose={() => setConfirmPopup({ open: false, type: '', nextValider: false })}
                onConfirm={() => handleConfirmValidation(true)}
                title={confirmPopup.nextValider ? 'Valider' : 'Annuler les validations'}
                message={confirmPopup.nextValider
                    ? `Voulez-vous valider tous les contrôles de type "${confirmPopup.type}" ?`
                    : `Voulez-vous annuler la validation de tous les contrôles de type "${confirmPopup.type}" ?`}
                confirmText="Confirmer"
                cancelText="Annuler"
                loading={confirmLoading}
                color={confirmPopup.nextValider ? T.accent : T.neg}
            />

            {/* POPUP D'ERREUR POUR ANOMALIES NON VALIDÉES */}
            <ConfirmActionDialog
                open={errorPopup.open}
                onClose={() => setErrorPopup({ open: false, message: '' })}
                onConfirm={() => setErrorPopup({ open: false, message: '' })}
                title="Validation impossible"
                message={errorPopup.message}
                confirmText="OK"
                cancelText=""
                loading={false}
                color="#EF4444"
                icon={<ErrorOutline />}
            />

            {/* POPUP D'ERREUR POUR PÉRIODE NON SÉLECTIONNÉE */}
            <ConfirmActionDialog
                open={periodeErrorPopup.open}
                onClose={() => setPeriodeErrorPopup({ open: false, message: '' })}
                onConfirm={() => setPeriodeErrorPopup({ open: false, message: '' })}
                title="Période requise"
                message={periodeErrorPopup.message}
                confirmText="OK"
                cancelText=""
                loading={false}
                color="#F59E0B"
                icon={<WarningAmber />}
            />

            {/* POPUP DE RÉSULTAT DE RÉVISION */}
            <ConfirmActionDialog
                open={reviserPopup.open}
                onClose={() => setReviserPopup({ open: false, message: '', success: true })}
                onConfirm={() => setReviserPopup({ open: false, message: '', success: true })}
                title={reviserPopup.success ? 'Contrôle terminé' : 'Erreur'}
                message={reviserPopup.message}
                confirmText="OK"
                cancelText=""
                loading={false}
                color={reviserPopup.success ? '#10B981' : '#EF4444'}
                icon={reviserPopup.success ? <CheckCircleOutline /> : <ErrorOutline />}
            />

            {/* DRAWER POUR LES DÉTAILS */}
            <Drawer
                anchor="bottom"
                open={drawerOpen}
                onClose={handleCloseDrawer}
                sx={{
                    '& .MuiDrawer-paper': {
                        height: '80vh',
                        borderTopLeftRadius: '16px',
                        borderTopRightRadius: '16px'
                    }
                }}
            >
                {selectedItemForDrawer && (
                    <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {selectedItemForDrawer.description}
                            </Typography>
                            <IconButton onClick={handleCloseDrawer}>
                                <CloseIcon />
                            </IconButton>
                        </Stack>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ flex: 1, overflow: 'auto' }}>
                            <RevisionDetails
                                type={selectedItemForDrawer.Type}
                                controles={controlesByType.get(selectedItemForDrawer.Type) || []}
                                onClose={handleCloseDrawer}
                                idCompte={ids.id_compte}
                                idDossier={ids.id_dossier}
                                idExercice={effectiveExerciceId}
                                idPeriode={effectivePeriodeId}
                                dateDebut={formatDateYYYYMMDD(resolvedPeriodeDates?.date_debut)}
                                dateFin={formatDateYYYYMMDD(resolvedPeriodeDates?.date_fin)}
                                isPeriodeSelected={!!resolvedPeriodeDates && !!effectivePeriodeId && effectivePeriodeId !== 'exercice'}
                                onValidationChange={() => fetchControles(false, true)}
                            />
                        </Box>
                    </Box>
                )}
            </Drawer>
        </Box>
    );
});

// GlobalBalance.propTypes = {
//     id_exercice: PropTypes.string.isRequired,
//     id_periode: PropTypes.string.isRequired
// };

export default Revision;
