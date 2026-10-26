import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { 
  Box, Typography, Stack, Divider, IconButton, Paper, Tooltip, Chip, Button, CircularProgress
} from '@mui/material';
import {
  CheckCircleOutline,
  ChatBubbleOutline,
  ErrorOutline,
  AssessmentOutlined,
  QueryStatsOutlined,
  RestartAltOutlined
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import axios from '../../../config/axios';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { jwtDecode } from 'jwt-decode';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';

// ─── Système de design (aligné sur le tableau de bord) ───
const T = {
  ink: '#0E2733', canvas: '#F4F6F5', surface: '#FFFFFF', line: '#E2E6EA', ledger: '#EEF1F3',
  text: '#16202B', muted: '#6A7785', faint: '#9AA6B2',
  accent: '#0E7C86', accentDark: '#0a5d65', pos: '#1F8A70', warn: '#B5791A', neg: '#BE3A2F', accW: '#E2F0F1',
};
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };
const CARD_SHADOW = '0 1px 2px rgba(16,39,51,.04), 0 8px 24px -16px rgba(16,39,51,.18)';
const statLabelSx = { fontSize: '10px', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' };
const MoneyCell = ({ value }) => {
  const v = Number(value) || 0;
  if (value === null || value === undefined || value === '') return <Typography sx={{ ...NUM, fontSize: '12.5px', width: '100%', textAlign: 'right', color: T.faint }}>—</Typography>;
  return (<Typography sx={{ ...NUM, fontSize: '12.5px', width: '100%', textAlign: 'right', color: v < 0 ? T.neg : T.text, fontWeight: 600 }}>
    {v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')}
  </Typography>);
};

const ControleAnalytique = forwardRef(({ id_exercice, id_periode }, ref) => {
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();

  const {
    selectedExerciceId,
    selectedPeriodeId,
    selectedPeriodeDates,
    listePeriodes,
    currentExerciceDates,
  } = useExercicePeriode();

  const effectiveExerciceId = id_exercice ?? selectedExerciceId;
  const effectivePeriodeId = id_periode ?? selectedPeriodeId;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const getIds = () => {
    return {
      id_compte: parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1,
      id_dossier: parseInt(sessionStorage.getItem('fileId')) || 1,
      id_exercice: effectiveExerciceId || parseInt(sessionStorage.getItem('exerciceId')) || 1
    };
  };

  const resolveDates = async () => {
    if (selectedPeriodeDates?.date_debut && selectedPeriodeDates?.date_fin && String(effectivePeriodeId) === String(selectedPeriodeId)) {
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

  const fetchResultats = async () => {
    if (!effectiveExerciceId) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const { id_compte, id_dossier, id_exercice } = getIds();
      const params = new URLSearchParams();
      if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
      const queryString = params.toString();

      const url = `/administration/revisionAnalytique/${id_compte}/${id_dossier}/${id_exercice}${queryString ? `?${queryString}` : ''}`;
      const response = await axiosPrivate.get(url);
      if (response?.data?.state) {
        setRows(response.data.data || []);
      } else {
        setRows([]);
      }
    } catch (error) {
      console.error('Error fetching revision analytique results:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleControler = async () => {
    if (!effectiveExerciceId) return;
    if (!effectivePeriodeId || effectivePeriodeId === 'exercice') return;

    setLoading(true);
    try {
      const { id_compte, id_dossier, id_exercice } = getIds();
      const resolvedDates = await resolveDates();
      if (!resolvedDates?.date_debut || !resolvedDates?.date_fin) {
        setRows([]);
        return;
      }

      const params = new URLSearchParams();
      params.append('date_debut', resolvedDates.date_debut);
      params.append('date_fin', resolvedDates.date_fin);
      if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
      const queryString = params.toString();

      const response = await axiosPrivate.post(`/administration/revisionAnalytique/${id_compte}/${id_dossier}/${id_exercice}?${queryString}`);
      if (response?.data?.state) {
        setRows(response.data.data || []);
      } else {
        setRows([]);
      }
    } catch (error) {
      console.error('Error executing revision analytique control:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAskControler = () => {
    if (!effectiveExerciceId) return;
    if (!effectivePeriodeId || effectivePeriodeId === 'exercice') return;
    setConfirmOpen(true);
  };

  const handleConfirmControler = async () => {
    await handleControler();
    setConfirmOpen(false);
  };

  const handleExportExcel = async () => {
    if (!effectiveExerciceId) return;
    try {
      const { id_compte, id_dossier, id_exercice } = getIds();
      const resolvedDates = await resolveDates();
      const params = new URLSearchParams();
      if (resolvedDates?.date_debut) params.append('date_debut', resolvedDates.date_debut);
      if (resolvedDates?.date_fin) params.append('date_fin', resolvedDates.date_fin);
      if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
      const url = `/administration/revisionAnalytique/${id_compte}/${id_dossier}/${id_exercice}/export/excel?${params.toString()}`;
      const response = await axiosPrivate.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Controle_Analytique_${id_dossier}_${id_exercice}.xlsx`;
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
      const resolvedDates = await resolveDates();
      const params = new URLSearchParams();
      if (resolvedDates?.date_debut) params.append('date_debut', resolvedDates.date_debut);
      if (resolvedDates?.date_fin) params.append('date_fin', resolvedDates.date_fin);
      if (effectivePeriodeId) params.append('id_periode', effectivePeriodeId);
      const url = `/administration/revisionAnalytique/${id_compte}/${id_dossier}/${id_exercice}/export/pdf?${params.toString()}`;
      const response = await axiosPrivate.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Controle_Analytique_${id_dossier}_${id_exercice}.pdf`;
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

  useEffect(() => {
    fetchResultats();
  }, [effectiveExerciceId, effectivePeriodeId]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden', bgcolor: T.canvas }}>

      {/* --- STATISTIQUES GLOBALES --- */}
      <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mx: 2, mt: 2, mb: 1.5, bgcolor: T.surface, flexShrink: 0 }}>
        <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap" alignItems="center">
          <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 } }}>
            <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px', mb: 0.75 }}>Erreurs d&apos;imputation</Typography>
            <Typography sx={{ ...NUM, fontSize: { xs: '20px', md: '24px' }, fontWeight: 800, letterSpacing: '-.4px', lineHeight: 1, color: rows.length > 0 ? T.neg : T.pos }}>{rows.length}</Typography>
          </Box>
          <Box sx={{ flex: 2, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              disableElevation
              startIcon={loading ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RestartAltOutlined />}
              onClick={handleAskControler}
              disabled={!effectiveExerciceId || !effectivePeriodeId || effectivePeriodeId === 'exercice' || loading}
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
              {loading ? 'Contrôle...' : 'Contrôler'}
            </Button>
          </Box>
        </Stack>
      </Box>

      <ConfirmActionDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmControler}
        title="Lancer le contrôle analytique"
        message="Voulez-vous lancer le contrôle analytique pour la période sélectionnée ?"
        confirmText="Lancer"
        cancelText="Annuler"
        loading={loading}
        color={T.accent}
      />

      <Box sx={{ p: 2, flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* --- TABLEAU ANALYTIQUE --- */}
        <Paper
          variant="outlined"
          sx={{
            flexGrow: 1,
            minHeight: 0,
            borderRadius: '12px',
            overflow: 'hidden',
            bgcolor: T.surface,
            border: `1px solid ${T.line}`,
            boxShadow: CARD_SHADOW,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <DataGrid
            rows={rows} // Données avec codes analytiques
            columns={[
              { field: 'date', headerName: 'Date', width: 120, renderCell: (p) => <Typography sx={{ ...NUM, fontSize: '12.5px', color: T.text }}>{p.value}</Typography> },
              { field: 'compte', headerName: 'Compte', width: 150, cellClassName: 'font-bold', renderCell: (p) => <Typography sx={{ ...NUM, fontSize: '13px', fontWeight: 700, color: T.ink }}>{p.value}</Typography> },
              { field: 'libelle', headerName: 'Libellé', flex: 1 },
              { field: 'debit', headerName: 'Débit', width: 130, align: 'right', headerAlign: 'right', renderCell: (p) => <MoneyCell value={p.value} /> },
              { field: 'credit', headerName: 'Crédit', width: 130, align: 'right', headerAlign: 'right', renderCell: (p) => <MoneyCell value={p.value} /> },
            ]}
            density="compact"
            sx={gridSx}
            disableRowSelectionOnClick
            loading={loading}
          />
        </Paper>
      </Box>
    </Box>
  );
});

const gridSx = {
  border: 'none', fontSize: '13px',
  '& .MuiDataGrid-columnHeaders': { bgcolor: T.ledger, borderBottom: `1px solid ${T.line}`,
    '& .MuiDataGrid-columnHeaderTitle': { fontSize: '11px', fontWeight: 700, color: T.muted, letterSpacing: '.3px', textTransform: 'uppercase' } },
  '& .MuiDataGrid-cell': { borderBottom: '1px solid #F1F4F6', color: T.text, '&:focus': { outline: 'none' } },
  '& .MuiDataGrid-row:hover': { bgcolor: '#FAFBFB' },
  '& .font-bold': { fontWeight: 700 },
};

export default ControleAnalytique;