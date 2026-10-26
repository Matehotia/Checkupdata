import React, { useEffect, useMemo, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Divider, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Autocomplete, TextField, Tooltip, Paper, Chip, Tabs, Tab, Badge, CircularProgress
} from '@mui/material';

import {
  CheckCircleOutline, ChatBubbleOutline, ChevronLeft, ChevronRight,
  ErrorOutline, PeopleOutline, ShoppingCartOutlined, WarningAmberRounded,
  TaskAltRounded, RadioButtonUnchecked, ChatBubbleOutlineOutlined
} from '@mui/icons-material';

import {
  Cancel, CheckCircle, Search, RestartAltOutlined
} from '@mui/icons-material';
import CommentIcon from '@mui/icons-material/Comment';
import { DataGrid } from '@mui/x-data-grid';
import axios from '../../../config/axios';

import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { jwtDecode } from 'jwt-decode';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import ExercicePeriodeSelector from '../ExercicePeriodeSelector';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
import CommentDialog from '../../components/commetDialog';

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

const ANOMALIE_TYPES = {
  paiement_sans_facture: {
    label: 'Paiement sans facture',
    color: 'warning',
    description: 'Le paiement a été effectué sans qu’une facture soit enregistrée.'
  },
  facture_3mois_non_reglee: {
    label: 'Factures > 3 mois non réglées',
    color: 'error',
    description: 'Cette facture n’a pas été réglée depuis plus de 3 mois.'
  },
  ajustement_non_traite: {
    label: 'Ajustements non traité',
    color: 'info',
    description: 'Certains ajustements comptables n’ont pas encore été traités.'
  },
  solde_suspens: {
    label: 'Solde en suspens',
    color: 'default',
    description: 'Le compte présente un solde en suspens à vérifier.'
  }
};

// ─── Système de design (aligné sur le tableau de bord) ───
const T = {
  ink: '#0E2733', canvas: '#F4F6F5', surface: '#FFFFFF', line: '#E2E6EA', ledger: '#EEF1F3',
  text: '#16202B', muted: '#6A7785', faint: '#9AA6B2',
  accent: '#0E7C86', accentDark: '#0a5d65', pos: '#1F8A70', warn: '#B5791A', neg: '#BE3A2F', info: '#3A6EA5', accW: '#E2F0F1', negW: '#F7E7E4', warnW: '#FBF3E2',
};
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };
const CARD_SHADOW = '0 1px 2px rgba(16,39,51,.04), 0 8px 24px -16px rgba(16,39,51,.18)';
const statLabelSx = { fontSize: '10px', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' };
const gridSx = {
  border: 'none', fontSize: '13px',
  '& .MuiDataGrid-columnHeaders': { bgcolor: T.ledger, borderBottom: `1px solid ${T.line}`,
    '& .MuiDataGrid-columnHeaderTitle': { fontSize: '11px', fontWeight: 700, color: T.muted, letterSpacing: '.3px', textTransform: 'uppercase' } },
  '& .MuiDataGrid-cell': { borderBottom: '1px solid #F1F4F6', color: T.text, '&:focus': { outline: 'none' }, '&:focus-within': { outline: 'none' } },
  '& .MuiDataGrid-row:hover': { bgcolor: '#FAFBFB' },
  '& .font-bold': { fontWeight: 700 },
};
const MoneyCell = ({ value }) => {
  const v = Number(value) || 0;
  if (!value) return <Typography sx={{ ...NUM, fontSize: '12.5px', width: '100%', textAlign: 'right', color: T.faint }}>—</Typography>;
  return (<Typography sx={{ ...NUM, fontSize: '12.5px', width: '100%', textAlign: 'right', color: v < 0 ? T.neg : T.text, fontWeight: 600 }}>
    {v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')}
  </Typography>);
};

const AnalyseTiers = forwardRef(({ id_exercice, id_periode }, ref) => {
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
    loading: contextLoading,
    getApiParams
  } = useExercicePeriode();

  const [openConfirmDialog, setOpenConfirmDialog] = useState(false);

  const [activeTab, setActiveTab] = useState(0);

  const [openConfirmValidationDialog, setOpenConfirmValidationDialog] = useState(false);
  const [pendingValidation, setPendingValidation] = useState(null);

  const [fileInfos, setFileInfos] = useState(null);
  const [loading, setLoading] = useState(false);
  const [noFile, setNoFile] = useState(false);
  const [fileId, setFileId] = useState(0);

  // === Résultats séparés par onglet ===
  const [resultatsFournisseur, setResultatsFournisseur] = useState([]);
  const [resultatsClient, setResultatsClient] = useState([]);
  const [selectedCompte, setSelectedCompte] = useState(null);

  // === Dialog validation ===
  const [openValidationDialog, setOpenValidationDialog] = useState(false);
  const [selectedAnomalie, setSelectedAnomalie] = useState(null);
  const [validationCommentaire, setValidationCommentaire] = useState('');

  // === Dialog commentaire ===
  const [openCommentDialog, setOpenCommentDialog] = useState(false);
  const [selectedCommentAnomalie, setSelectedCommentAnomalie] = useState(null);
  const [commentaireText, setCommentaireText] = useState('');

  // === Dialog confirmation analyse ===

  const [periodeErrorPopup, setPeriodeErrorPopup] = useState({ open: false, message: '' });

  const handleOpenCommentDialog = (anomalie, sourceType) => {
    setSelectedCommentAnomalie({
      ...anomalie,
      sourceType
    });
    setCommentaireText(anomalie?.commentaire_validation || '');
    setOpenCommentDialog(true);
  };

  const handleCloseCommentDialog = () => {
    setOpenCommentDialog(false);
    setSelectedCommentAnomalie(null);
    setCommentaireText('');
  };

  const handleCloseConfirmDialog = () => {
    setOpenConfirmDialog(false);
  };

  const effectiveExerciceId = id_exercice ?? selectedExerciceId;
  const effectivePeriodeId = id_periode ?? selectedPeriodeId;

  const handleAnalyserClick = () => {
    if (!effectivePeriodeId || effectivePeriodeId === 'exercice') {
      setPeriodeErrorPopup({
        open: true,
        message: 'Veuillez sélectionner une période spécifique avant de lancer l\'analyse.'
      });
      return;
    }
    setOpenConfirmDialog(true);
  };

  const handleConfirmAnalyser = async () => {
    setOpenConfirmDialog(false);
    await handleAnalyser();
  };

  const handleRequestValidationChange = (anomalie, valider) => {
    setPendingValidation({ anomalie, valider });
    setOpenConfirmValidationDialog(true);
  };

  const handleCloseConfirmValidationDialog = () => {
    setOpenConfirmValidationDialog(false);
    setPendingValidation(null);
  };

  const handleConfirmValidationChange = async () => {
    if (!pendingValidation?.anomalie) return;
    setOpenConfirmValidationDialog(false);
    const { anomalie, valider } = pendingValidation;
    setPendingValidation(null);
    await handleValiderAnomalie(anomalie, valider);
  };

  const getIds = () => {
    const pathParts = window.location.pathname.split('/');
    const idIndex = pathParts.indexOf('revisionFournisseurClient') + 1;
    return {
      id_compte: parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1,
      id_dossier: parseInt(sessionStorage.getItem('fileId')) || parseInt(pathParts[idIndex]) || 1,
      id_exercice: effectiveExerciceId || parseInt(sessionStorage.getItem('exerciceId')) || 1
    };
  };

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

  const getApiBasePath = (type) => {
    return type === 'fournisseur'
      ? '/administration/analyseFournisseurClient'
      : '/administration/analyseClient';
  };

  const resolveDatesForAnalysis = async () => {
    if (selectedPeriodeDates?.date_debut && selectedPeriodeDates?.date_fin) {
      return {
        date_debut: selectedPeriodeDates.date_debut,
        date_fin: selectedPeriodeDates.date_fin
      };
    }

    if (effectivePeriodeId && effectivePeriodeId !== 'exercice') {
      const periodeFromContext = (listePeriodes || []).find(p => String(p.id) === String(effectivePeriodeId));
      if (periodeFromContext?.date_debut && periodeFromContext?.date_fin) {
        return {
          date_debut: periodeFromContext.date_debut,
          date_fin: periodeFromContext.date_fin
        };
      }

      if (effectiveExerciceId) {
        const response = await axios.get(`/paramExercice/listePeriodes/${effectiveExerciceId}`);
        if (response?.data?.state) {
          const periode = (response.data.list || []).find(p => String(p.id) === String(effectivePeriodeId));
          if (periode?.date_debut && periode?.date_fin) {
            return {
              date_debut: periode.date_debut,
              date_fin: periode.date_fin
            };
          }
        }
      }
    }

    if (currentExerciceDates?.date_debut && currentExerciceDates?.date_fin) {
      return {
        date_debut: currentExerciceDates.date_debut,
        date_fin: currentExerciceDates.date_fin
      };
    }

    return null;
  };

  const lastContextKeyRef = useRef('');
  const handleAnalyserRef = useRef();

  const handleExportExcel = async () => {
    if (!effectiveExerciceId) return;
    try {
      const { id_compte, id_dossier, id_exercice } = getIds();
      const resolvedDates = await resolveDatesForAnalysis();
      const params = new URLSearchParams();
      if (resolvedDates?.date_debut) params.append('date_debut', resolvedDates.date_debut);
      if (resolvedDates?.date_fin) params.append('date_fin', resolvedDates.date_fin);
      if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
      const url = `/administration/analyseFournisseurClient/${id_compte}/${id_dossier}/${id_exercice}/export/excel?${params.toString()}`;
      const response = await axiosPrivate.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Analyse_Tiers_${id_dossier}_${id_exercice}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting Excel:', error);
    }
  };

  const handleExportPdf = async () => {
    if (!effectiveExerciceId) return;
    try {
      const { id_compte, id_dossier, id_exercice } = getIds();
      const resolvedDates = await resolveDatesForAnalysis();
      const params = new URLSearchParams();
      if (resolvedDates?.date_debut) params.append('date_debut', resolvedDates.date_debut);
      if (resolvedDates?.date_fin) params.append('date_fin', resolvedDates.date_fin);
      if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
      const url = `/administration/analyseFournisseurClient/${id_compte}/${id_dossier}/${id_exercice}/export/pdf?${params.toString()}`;
      const response = await axiosPrivate.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Analyse_Tiers_${id_dossier}_${id_exercice}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting PDF:', error);
    }
  };

  useImperativeHandle(ref, () => ({
    exportExcel: handleExportExcel,
    exportPdf: handleExportPdf
  }), [effectiveExerciceId, effectivePeriodeId]);

  const handleAnalyser = async () => {
    if (!effectiveExerciceId) return;

    setLoading(true);
    try {
      const { id_compte, id_dossier, id_exercice } = getIds();

      const resolvedDates = await resolveDatesForAnalysis();
      if (!resolvedDates?.date_debut || !resolvedDates?.date_fin) {
        setPeriodeErrorPopup({
          open: true,
          message: 'Dates de période introuvables. Veuillez re-sélectionner la période avant de lancer l\'analyse.'
        });
        return;
      }

      const params = new URLSearchParams();
      params.append('date_debut', resolvedDates.date_debut);
      params.append('date_fin', resolvedDates.date_fin);
      if (effectivePeriodeId) {
        params.append('id_periode', effectivePeriodeId);
      }
      const queryString = params.toString();

      const [fournisseurResponse, clientResponse] = await Promise.all([
        axiosPrivate.post(`/administration/analyseFournisseurClient/${id_compte}/${id_dossier}/${id_exercice}/analyser?${queryString}`),
        axiosPrivate.post(`/administration/analyseClient/${id_compte}/${id_dossier}/${id_exercice}/analyser?${queryString}`)
      ]);

      if (fournisseurResponse.data.state) {
        setResultatsFournisseur(fournisseurResponse.data.resultats || []);
      } else {
        setResultatsFournisseur([]);
      }

      if (clientResponse.data.state) {
        setResultatsClient(clientResponse.data.resultats || []);
      } else {
        setResultatsClient([]);
      }
    } catch (error) {
      console.error('Error executing analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  handleAnalyserRef.current = handleAnalyser;

  useEffect(() => {
    const contextKey = `${effectiveExerciceId}-${effectivePeriodeId}`;
    const contextChanged = contextKey !== lastContextKeyRef.current;

    if (effectiveExerciceId && contextChanged) {
      lastContextKeyRef.current = contextKey;
      handleAnalyserRef.current();
    }
  }, [effectiveExerciceId, effectivePeriodeId]);

  const handleValiderAnomalie = async (anomalie, valider) => {
    if (!anomalie || !anomalie.id) {
      console.error('Anomalie ID is undefined');
      return;
    }
    try {
      const { id_compte, id_dossier, id_exercice } = getIds();
      const basePath = getApiBasePath(anomalie.sourceType);
      const url = `${basePath}/${id_compte}/${id_dossier}/${id_exercice}/anomalies/${anomalie.id}`;

      await axiosPrivate.patch(url, {
        valider,
        commentaire_validation: anomalie.commentaire_validation || ''
      });

      const updateResultats = (prev) => prev.map(compte => ({
        ...compte,
        lignes: compte.lignes.map(ligne => ({
          ...ligne,
          anomalies: ligne.anomalies.map(a =>
            a.id === anomalie.id
              ? { ...a, valider }
              : a
          )
        }))
      }));

      if (anomalie.sourceType === 'fournisseur') {
        setResultatsFournisseur(prevState => updateResultats(prevState));
      } else {
        setResultatsClient(prevState => updateResultats(prevState));
      }
    } catch (error) {
      console.error('Error validating anomaly:', error);
    }
  };

  const handleSaveComment = async (nextComment) => {
    try {
      if (!selectedCommentAnomalie) return;

      const commentToSave = typeof nextComment === 'string' ? nextComment : commentaireText;

      const { id_compte, id_dossier, id_exercice } = getIds();
      const basePath = getApiBasePath(selectedCommentAnomalie.sourceType);
      const url = `${basePath}/${id_compte}/${id_dossier}/${id_exercice}/anomalies/${selectedCommentAnomalie.id}`;

      await axiosPrivate.patch(url, {
        valider: selectedCommentAnomalie.valider,
        commentaire_validation: commentToSave
      });

      const updateResultats = (prev) => prev.map(compte => ({
        ...compte,
        lignes: compte.lignes.map(ligne => ({
          ...ligne,
          anomalies: ligne.anomalies.map(a =>
            a.id === selectedCommentAnomalie.id
              ? { ...a, commentaire_validation: commentToSave }
              : a
          )
        }))
      }));

      if (selectedCommentAnomalie.sourceType === 'fournisseur') {
        setResultatsFournisseur(prevState => updateResultats(prevState));
      } else {
        setResultatsClient(prevState => updateResultats(prevState));
      }

      handleCloseCommentDialog();
    } catch (error) {
      console.error('Error saving comment:', error);
    }
  };

  const flattenResultatsToRows = (res) => {
    const flatRows = [];
    res.forEach((compte, compteIdx) => {
      (compte.lignes || []).forEach((ligne, ligneIdx) => {
        (ligne.anomalies || []).forEach((anomalie, anomalieIdx) => {
          flatRows.push({
            id: `${compteIdx}-${ligneIdx}-${anomalieIdx}`,
            compte: compte.compte,
            id_ligne: ligne.id_ligne_originale || ligne.id,
            date_ecriture: ligne.date_ecriture,
            piece: ligne.piece,
            libelle: ligne.libelle,
            debit: ligne.debit,
            credit: ligne.credit,
            lettrage: ligne.lettrage,
            code_journal: ligne.code_journal,
            type_anomalie: anomalie.type,
            commentaire: anomalie.commentaire,
            commentaire_validation: anomalie.commentaire_validation,
            valider: anomalie.valider,
            anomalie_id: anomalie.id,
          });
        });
      });
    });
    return flatRows;
  };

  const rowsFournisseur = useMemo(
    () => flattenResultatsToRows(resultatsFournisseur),
    [resultatsFournisseur]
  );

  const rowsClient = useMemo(
    () => flattenResultatsToRows(resultatsClient),
    [resultatsClient]
  );

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', bgcolor: T.canvas }}>
      <ConfirmActionDialog
        open={openConfirmDialog}
        onClose={handleCloseConfirmDialog}
        onConfirm={handleConfirmAnalyser}
        title="Lancer l'analyse"
        message="Voulez-vous lancer l'analyse des fournisseurs et clients ?"
        confirmText="Lancer"
        cancelText="Annuler"
        loading={loading}
        color={T.accent}
      />

      <CommentDialog
        open={openCommentDialog}
        onClose={handleCloseCommentDialog}
        onSave={(value) => {
          setCommentaireText(value);
          return handleSaveComment(value);
        }}
        initialValue={commentaireText}
        title="Ajouter un commentaire"
        placeholder="Saisissez votre note ici..."
        loading={loading}
      />

      <ConfirmActionDialog
        open={openConfirmValidationDialog}
        onClose={handleCloseConfirmValidationDialog}
        onConfirm={handleConfirmValidationChange}
        title={pendingValidation?.valider ? 'Validation' : 'Annulation de validation'}
        message={pendingValidation?.valider
          ? 'Voulez-vous valider cette anomalie ?'
          : 'Voulez-vous annuler la validation de cette anomalie ?'
        }
        confirmText={pendingValidation?.valider ? 'Valider' : 'Annuler la validation'}
        cancelText="Annuler"
        loading={loading}
        color={pendingValidation?.valider ? T.accent : T.neg}
      />

      {/* --- RÉCAPITULATIF GLOBAL --- */}
      <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mx: 2, mt: 2, mb: 1.5, bgcolor: T.surface, flexShrink: 0 }}>
        <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap" alignItems="center">
          <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 } }}>
            <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px', mb: 0.75 }}>Anomalies tiers</Typography>
            <Typography sx={{ ...NUM, fontSize: { xs: '20px', md: '24px' }, fontWeight: 800, letterSpacing: '-.4px', lineHeight: 1, color: (rowsFournisseur.length + rowsClient.length) > 0 ? T.neg : T.pos }}>{rowsFournisseur.length + rowsClient.length}</Typography>
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 } }}>
            <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px', mb: 0.75 }}>Restant à valider</Typography>
            {(() => {
              const restant = rowsFournisseur.filter(r => !r.valider).length + rowsClient.filter(r => !r.valider).length;
              return <Typography sx={{ ...NUM, fontSize: { xs: '20px', md: '24px' }, fontWeight: 800, letterSpacing: '-.4px', lineHeight: 1, color: restant > 0 ? T.warn : T.pos }}>{restant}</Typography>;
            })()}
          </Box>
          <Box sx={{ flex: 2, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              disableElevation
              startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RestartAltOutlined />}
              onClick={handleAnalyserClick}
              disabled={!effectiveExerciceId || loading}
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
              {loading ? 'Analyse...' : 'Analyser'}
            </Button>
          </Box>
        </Stack>
      </Box>

      <Box sx={{ p: 2, flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>

        <Paper elevation={0} sx={{ border: `1px solid ${T.line}`, borderRadius: '12px', boxShadow: CARD_SHADOW }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{
              minHeight: 42,
              '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 42, color: T.muted },
              '& .MuiTab-root.Mui-selected': { bgcolor: T.accW, color: T.accentDark },
              '& .MuiTab-root:first-of-type.Mui-selected': { borderTopLeftRadius: '12px' },
              '& .MuiTab-root:last-of-type.Mui-selected': { borderTopRightRadius: '12px' },
              '& .MuiTabs-indicator': { bgcolor: T.accent, height: 3 }
            }}
          >
            <Tab label={`Fournisseurs`} />
            <Tab label={`Clients`} />
          </Tabs>
        </Paper>

        {activeTab === 0 && (
          <SectionTiersUnique
            title="Analyse Fournisseurs"
            icon={<ShoppingCartOutlined sx={{ color: T.accent }} />}
            stats={{
              anomalies: rowsFournisseur.length,
              restants: rowsFournisseur.filter(r => !r.valider).length,
            }}
            rows={rowsFournisseur}
            type="fournisseur"
            handleValiderAnomalie={handleValiderAnomalie}
            handleRequestValidationChange={handleRequestValidationChange}
            handleOpenCommentDialog={handleOpenCommentDialog}
          />
        )}

        {activeTab === 1 && (
          <SectionTiersUnique
            title="Analyse Clients"
            icon={<PeopleOutline sx={{ color: T.pos }} />}
            stats={{
              anomalies: rowsClient.length,
              restants: rowsClient.filter(r => !r.valider).length,
            }}
            rows={rowsClient}
            type="client"
            handleValiderAnomalie={handleValiderAnomalie}
            handleRequestValidationChange={handleRequestValidationChange}
            handleOpenCommentDialog={handleOpenCommentDialog}
          />
        )}

      </Box>
    </Box>
  );
});

// --- COMPOSANT DE SECTION UNIQUE (SANS ONGLETS) ---
const SectionTiersUnique = ({ title, icon, stats, rows, type, handleValiderAnomalie, handleRequestValidationChange, handleOpenCommentDialog }) => {

  const [selectedCompte, setSelectedCompte] = useState(null);

  const comptesOptions = useMemo(() => {
    const unique = Array.from(new Set((rows || []).map(r => r.compte).filter(Boolean))).sort();
    return unique;
  }, [rows]);

  const compteIndex = useMemo(() => {
    if (!selectedCompte) return -1;
    return (comptesOptions || []).findIndex(c => c === selectedCompte);
  }, [comptesOptions, selectedCompte]);

  const handlePrevCompte = () => {
    if (!comptesOptions?.length) return;
    if (compteIndex <= 0) return;
    setSelectedCompte(comptesOptions[compteIndex - 1]);
  };

  const handleNextCompte = () => {
    if (!comptesOptions?.length) return;
    if (compteIndex === -1) {
      setSelectedCompte(comptesOptions[0]);
      return;
    }
    if (compteIndex >= comptesOptions.length - 1) return;
    setSelectedCompte(comptesOptions[compteIndex + 1]);
  };

  const filteredRows = useMemo(() => {
    if (!selectedCompte) return rows;
    return (rows || []).filter(r => r.compte === selectedCompte);
  }, [rows, selectedCompte]);

  // Fonction pour styliser les labels d'anomalies
  const renderAnomalieLabel = (type) => {
    const config = {
      "Solde en suspens": { color: "#EF4444", bg: "#FEF2F2" },
      "Paiement sans facture": { color: "#F59E0B", bg: "#FFFBEB" },
      "Ajustement non traité": { color: "#6366F1", bg: "#EEF2FF" },
      "Facture non réglée": { color: "#64748B", bg: "#F8FAFC" }
    };
    const style = config[type] || config["Facture non réglée"];
    return (
      <Chip
        label={type}
        size="small"
        sx={{ bgcolor: style.bg, color: style.color, fontWeight: 700, fontSize: '0.65rem', borderRadius: '4px' }}
      />
    );
  };

  const columns = [
    {
      field: 'compte',
      headerName: 'Compte',
      width: 90,
      cellClassName: 'font-bold',
      renderCell: (params) => (
        <Typography variant="body2" fontWeight="bold">
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'date_ecriture',
      headerName: 'Date',
      width: 100,
      renderCell: (params) => formatDate(params.value),
    },
    {
      field: 'code_journal',
      headerName: 'Jour.',
      width: 60
    },
    {
      field: 'piece',
      headerName: 'Pièce',
      width: 110
    },
    {
      field: 'libelle',
      headerName: 'Libellé',
      width: 350
    },
    {
      field: 'debit',
      headerName: 'Débit',
      width: 110,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => <MoneyCell value={params.value} />,
    },
    {
      field: 'credit',
      headerName: 'Crédit',
      width: 110,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => <MoneyCell value={params.value} />,
    },
    {
      field: 'lettrage',
      headerName: 'Let.',
      width: 56,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        params.value
          ? <Chip label={params.value} size="small" sx={{ height: 20, bgcolor: T.accW, color: T.accentDark, fontWeight: 700, fontSize: '0.65rem' }} />
          : <Typography sx={{ color: T.faint, fontSize: '12px' }}>—</Typography>
      ),
    },
    {
      field: 'type_anomalie',
      headerName: 'Type d\'anomalie',
      width: 180,
      renderCell: (params) => {
        const config = ANOMALIE_TYPES[params.value] || { label: params.value, color: 'default' };
        return <Chip label={config.label} color={config.color} size="small" />;
      },
    },
    {
      field: 'commentaire_validation',
      headerName: 'Commentaire',
      width: 250,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '12.5px', fontStyle: params.value ? 'normal' : 'italic', color: params.value ? T.text : T.faint }}>
          {params.value || '—'}
        </Typography>
      ),
    },
    {
      field: 'valide',
      headerName: 'Validé',
      width: 70,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      renderCell: (params) => (
        <Tooltip title={params.row.valider ? "Annuler la validation" : "Valider l'anomalie"}>
          <IconButton
            size="small"
            onClick={() => handleRequestValidationChange({
              id: params.row.anomalie_id,
              valider: params.row.valider,
              commentaire_validation: params.row.commentaire_validation,
              sourceType: type
            }, !params.row.valider)}
          >
            {params.row.valider
              ? <TaskAltRounded sx={{ fontSize: 20, color: T.pos }} />
              : <RadioButtonUnchecked sx={{ fontSize: 20, color: T.warn }} />}
          </IconButton>
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      headerName: 'Note',
      width: 64,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      renderCell: (params) => {
        const has = !!params.row.commentaire_validation;
        return (
          <Tooltip title="Ajouter / modifier un commentaire">
            <IconButton
              size="small"
              onClick={() => handleOpenCommentDialog({
                id: params.row.anomalie_id,
                valider: params.row.valider,
                commentaire_validation: params.row.commentaire_validation
              }, type)}
            >
              <Badge variant="dot" invisible={!has} sx={{ '& .MuiBadge-dot': { bgcolor: T.warn } }}>
                <ChatBubbleOutlineOutlined sx={{ fontSize: 18, color: has ? T.accent : T.faint }} />
              </Badge>
            </IconButton>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Box>
      {/* Header de Section avec stats */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          {icon}
          <Typography variant="subtitle2" sx={{ fontWeight: 800, color: T.ink }}>{title}</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Chip label={`${stats.anomalies} anomalies`} size="small" sx={{ height: 20, bgcolor: T.negW, color: T.neg, fontWeight: 800, fontSize: '0.6rem', ...NUM }} />
          <Chip label={`${stats.restants} à valider`} size="small" sx={{ height: 20, bgcolor: T.warnW, color: T.warn, fontWeight: 800, fontSize: '0.6rem', ...NUM }} />
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${T.line}`, boxShadow: CARD_SHADOW }}>
        {/* Navigateur de compte intégré */}
        <Box sx={{ p: 1, bgcolor: T.ledger, borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Autocomplete
            size="small"
            options={comptesOptions}
            value={selectedCompte}
            onChange={(e, value) => setSelectedCompte(value)}
            renderInput={(params) => (
              <TextField {...params} placeholder="Navigateur de compte..." sx={{ width: 250, '& .MuiInputBase-root': { fontSize: '0.75rem', height: 30, bgcolor: T.surface } }} />
            )}
          />
          <IconButton
            size="small"
            onClick={handlePrevCompte}
            disabled={compteIndex <= 0}
            sx={{ border: `1px solid ${T.line}`, bgcolor: T.surface, borderRadius: '8px' }}
          >
            <ChevronLeft fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={handleNextCompte}
            disabled={!comptesOptions?.length || compteIndex >= comptesOptions.length - 1}
            sx={{ border: `1px solid ${T.line}`, bgcolor: T.surface, borderRadius: '8px' }}
          >
            <ChevronRight fontSize="small" />
          </IconButton>
        </Box>

        {/* Tableau Unique */}
        <Box sx={{ height: 350, width: '100%' }}>
          <DataGrid
            rows={filteredRows || []}
            columns={columns}
            density="compact"
            disableRowSelectionOnClick
            sx={gridSx}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default AnalyseTiers;