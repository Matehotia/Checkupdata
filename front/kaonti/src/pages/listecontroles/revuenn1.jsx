import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Box, Typography, Stack, IconButton, Tooltip, Divider, Chip, Badge, alpha,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import {
  CheckCircleOutline, WarningAmberRounded, RadioButtonUnchecked,
  TaskAltRounded, ChatBubbleOutlineOutlined
} from '@mui/icons-material';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { jwtDecode } from 'jwt-decode';
import CommentDialog from '../../components/commetDialog';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';

// ─── Système de design (aligné sur le tableau de bord) ───
const T = {
  ink: '#0E2733', canvas: '#F4F6F5', surface: '#FFFFFF', line: '#E2E6EA', ledger: '#EEF1F3',
  text: '#16202B', muted: '#6A7785', faint: '#9AA6B2',
  accent: '#0E7C86', pos: '#1F8A70', warn: '#B5791A', neg: '#BE3A2F', info: '#3A6EA5', accW: '#E2F0F1',
};
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };
const gridSx = {
  border: 'none',
  fontSize: '13px',
  '& .MuiDataGrid-main': { overflow: 'auto' },
  '& .MuiDataGrid-columnHeaders': {
    bgcolor: T.ledger,
    borderBottom: `1px solid ${T.line}`,
    '& .MuiDataGrid-columnHeaderTitle': { fontSize: '11px', fontWeight: 700, color: T.muted, letterSpacing: '.3px', textTransform: 'uppercase' },
  },
  '& .MuiDataGrid-cell': { borderBottom: '1px solid #F1F4F6', color: T.text, '&:focus': { outline: 'none' } },
  '& .MuiDataGrid-row:hover': { bgcolor: '#FAFBFB' },
};

// Cellule montant : chiffres tabulaires alignés à droite, négatif en rouge (plus de Courier)
const MoneyCell = ({ value }) => {
  const v = Number(value) || 0;
  return (
    <Typography sx={{ ...NUM, fontSize: '12.5px', width: '100%', textAlign: 'right', color: v < 0 ? T.neg : T.text, fontWeight: v !== 0 ? 600 : 400 }}>
      {(value ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' ')}
    </Typography>
  );
};

const RevueAnalytiqueTable = forwardRef(function RevueAnalytiqueTable({ id_exercice, id_periode }, ref) {

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmDialogData, setConfirmDialogData] = useState({ row: null, checked: false });
  const [openCommentDialog, setOpenCommentDialog] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();

  const handleExportExcel = async () => {
    if (!id_exercice) return;
    try {
      const id_compte = parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1;
      const id_dossier = parseInt(sessionStorage.getItem('fileId')) || 1;
      let url = `/dashboard/revuAnalytiqueNN1/${id_compte}/${id_dossier}/${id_exercice}/export/excel`;
      if (id_periode) url += `?id_periode=${id_periode}`;
      const response = await axiosPrivate.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Revue_Analytique_${id_dossier}_${id_exercice}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting Excel:', error);
    }
  };

  const handleExportPdf = async () => {
    if (!id_exercice) return;
    try {
      const id_compte = parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1;
      const id_dossier = parseInt(sessionStorage.getItem('fileId')) || 1;
      let url = `/dashboard/revuAnalytiqueNN1/${id_compte}/${id_dossier}/${id_exercice}/export/pdf`;
      if (id_periode) url += `?id_periode=${id_periode}`;
      const response = await axiosPrivate.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Revue_Analytique_${id_dossier}_${id_exercice}.pdf`;
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
  }));

  const fetchRevuAnalytique = useCallback(async () => {
    try {
      setLoading(true);
      const id_compte = parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1;
      const id_dossier = parseInt(sessionStorage.getItem('fileId')) || 1;

      if (!id_exercice) {
        setRows([]);
        return;
      }

      let url = `/dashboard/revuAnalytiqueNN1/${id_compte}/${id_dossier}/${id_exercice}`;
      if (id_periode) {
        url += `?id_periode=${id_periode}`;
      }

      const response = await axiosPrivate.get(url);

      if (response.data.state) {
        const formattedRows = response.data.data.map((row, index) => ({
          id: index,
          compte: row.compte,
          libelle: row.libelle,
          soldeN: row.soldeN,
          soldeN1: row.soldeN1,
          var: row.var,
          varPourcent: row.varPourcent,
          anomalies: row.anomalies,
          commentaire: row.commentaire,
          valide_anomalie: row.valide_anomalie
        }));
        setRows(formattedRows);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, id_exercice, id_periode]);

  useEffect(() => {
    if (id_exercice) {
      fetchRevuAnalytique();
    } else {
      setRows([]);
    }
  }, [fetchRevuAnalytique, id_exercice, id_periode]);

  // === Validation toggle avec confirmation ===
  const handleToggleValide = useCallback((row, checked) => {
    setConfirmDialogData({ row, checked });
    setConfirmDialogOpen(true);
  }, []);

  const handleConfirmValidation = async () => {
    const { row, checked } = confirmDialogData;
    if (!row) return;

    try {
      const id_compte = parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1;
      const id_dossier = parseInt(sessionStorage.getItem('fileId')) || 1;

      await axiosPrivate.post('/revuAnalytiqueStats/validateAnomaly', {
        id_compte,
        id_dossier,
        id_exercice,
        id_periode: id_periode || null,
        compte: row.compte,
        type_revue: 'analytiqueNN1',
        validated: checked
      });

      await axiosPrivate.post('/commentaireAnalytique/addOrUpdate', {
        id_compte,
        id_dossier,
        id_exercice,
        id_periode: id_periode || null,
        compte: row.compte,
        commentaire: row.commentaire || '',
        valide_anomalie: checked
      });

      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, valide_anomalie: checked } : r)));
    } catch (error) {
      console.error('Erreur lors de la validation anomalie:', error);
    } finally {
      setConfirmDialogOpen(false);
      setConfirmDialogData({ row: null, checked: false });
    }
  };

  // === Commentaire ===
  const handleSaveCommentaire = async (comment) => {
    if (!selectedRow) return;
    try {
      setCommentLoading(true);
      const id_compte = parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1;
      const id_dossier = parseInt(sessionStorage.getItem('fileId')) || 1;

      const response = await axiosPrivate.post('/commentaireAnalytique/addOrUpdate', {
        id_compte,
        id_dossier,
        id_exercice,
        id_periode: id_periode || null,
        compte: selectedRow.compte,
        commentaire: comment,
        valide_anomalie: selectedRow.valide_anomalie || false
      });

      if (response.data.state) {
        setRows((prevRows) =>
          prevRows.map((row) =>
            row.compte === selectedRow.compte
              ? { ...row, commentaire: comment }
              : row
          )
        );
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du commentaire:', error);
    } finally {
      setCommentLoading(false);
      setOpenCommentDialog(false);
      setSelectedRow(null);
    }
  };

  // === Statistiques calculées ===
  const totalAnomalies = rows.filter(r => r.anomalies).length;
  const restantAValider = rows.filter(r => r.anomalies && !r.valide_anomalie).length;

  const columns = [
    {
      field: 'compte',
      headerName: 'Compte',
      width: 130,
      renderCell: (p) => <Typography sx={{ ...NUM, fontSize: '12.5px', fontWeight: 700, color: T.ink }}>{p.value}</Typography>,
    },
    {
      field: 'libelle',
      headerName: 'Libellé',
      flex: 1,
      minWidth: 260,
      renderCell: (p) => <Typography noWrap title={p.value || ''} sx={{ fontSize: '12.5px', color: T.text }}>{p.value}</Typography>,
    },
    { field: 'soldeN1', headerName: 'Solde N-1', width: 130, type: 'number', align: 'right', headerAlign: 'right', renderCell: (p) => <MoneyCell value={p.value} /> },
    { field: 'soldeN', headerName: 'Solde N', width: 130, type: 'number', align: 'right', headerAlign: 'right', renderCell: (p) => <MoneyCell value={p.value} /> },
    { field: 'var', headerName: 'Variation', width: 120, type: 'number', align: 'right', headerAlign: 'right', renderCell: (p) => <MoneyCell value={p.value} /> },
    {
      field: 'varPourcent',
      headerName: 'Variation %',
      width: 120,
      type: 'number',
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const value = params.value;
        if (value === null || value === undefined) {
          return <Box sx={{ color: T.faint }}>—</Box>;
        }
        const c = value > 0 ? T.info : value < 0 ? T.neg : T.muted;
        return (
          <Chip
            label={`${value > 0 ? '+' : ''}${value}%`}
            size="small"
            variant="outlined"
            sx={{
              ...NUM, height: 22, minWidth: 56, fontSize: '11px', fontWeight: 700,
              color: c, borderColor: alpha(c, 0.5), bgcolor: alpha(c, 0.06),
              '& .MuiChip-label': { px: 0.75 },
            }}
          />
        );
      }
    },
    {
      field: 'anomalies',
      headerName: 'Anomalie',
      width: 95,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const hasAnomaly = !!params.value;
        return (
          <Tooltip title={hasAnomaly ? 'Anomalie détectée (variation ≥ seuil du dossier)' : 'Conforme — aucune anomalie'} arrow>
            <Box sx={{ display: 'flex', width: '100%', justifyContent: 'center', color: hasAnomaly ? T.warn : T.pos }}>
              {hasAnomaly ? <WarningAmberRounded fontSize="small" /> : <CheckCircleOutline fontSize="small" />}
            </Box>
          </Tooltip>
        );
      }
    },
    {
      field: 'valide_anomalie',
      headerName: 'Validé',
      width: 80,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const isValid = !!params.value;
        const isAnomaly = !!params.row.anomalies;
        return (
          <Tooltip title={isValid ? 'Validé — cliquer pour dévalider' : (isAnomaly ? 'À valider — cliquer pour valider' : 'Rien à valider')} arrow>
            <span>u
              <IconButton
                size="small"
                onClick={() => handleToggleValide(params.row, !isValid)}
                disabled={!isAnomaly && !isValid}
                sx={{ p: 0.25, color: isValid ? T.pos : (isAnomaly ? T.warn : T.faint), transition: '.15s', '&:hover': { transform: 'scale(1.12)' } }}
              >
                {isValid ? <TaskAltRounded fontSize="small" /> : <RadioButtonUnchecked fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        );
      }
    },
    {
      field: 'commentaire',
      headerName: 'Commentaire',
      width: 130,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => {
        const has = params.value && String(params.value).trim();
        return (
          <Box sx={{ display: 'flex', width: '100%', justifyContent: 'center' }}>
            <Badge
              variant={has ? 'dot' : 'standard'}
              overlap="circular"
              sx={{ '& .MuiBadge-badge': { backgroundColor: T.warn } }}
            >
              <Tooltip
                title={params.value || 'Ajouter un commentaire'}
                arrow
                componentsProps={{
                  tooltip: { sx: { backgroundColor: '#fff', color: T.text, fontSize: '12px', border: `1px solid ${T.line}`, boxShadow: '0 4px 12px rgba(16,39,51,.12)', maxWidth: 260 } },
                  arrow: { sx: { color: '#fff' } }
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => { setSelectedRow(params.row); setOpenCommentDialog(true); }}
                  sx={{ color: has ? T.accent : T.faint, '&:hover': { bgcolor: T.accW } }}
                >
                  <ChatBubbleOutlineOutlined fontSize="small" />
                </IconButton>
              </Tooltip>
            </Badge>
          </Box>
        );
      }
    }
  ];

  return (
    <Box sx={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* STATISTIQUES */}
      <Stack direction="row" spacing={3} alignItems="center" sx={{ px: 2.5, py: 1.5, bgcolor: T.canvas, borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
        <Box>
          <Typography sx={{ fontSize: '10px', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Anomalies détectées</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Typography sx={{ ...NUM, color: T.warn, fontWeight: 800, fontSize: '20px', lineHeight: 1 }}>{totalAnomalies}</Typography>
            <WarningAmberRounded sx={{ color: T.warn, fontSize: 16 }} />
          </Stack>
        </Box>
        <Divider orientation="vertical" flexItem sx={{ borderColor: T.line }} />
        <Box>
          <Typography sx={{ fontSize: '10px', color: T.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Restant à valider</Typography>
          <Typography sx={{ ...NUM, color: restantAValider > 0 ? T.neg : T.pos, fontWeight: 800, fontSize: '20px', lineHeight: 1 }}>{restantAValider}</Typography>
        </Box>
      </Stack>

      {/* TABLEAU */}
      <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, overflow: 'hidden' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          density="compact"
          disableRowSelectionOnClick
          sx={gridSx}
        />
      </Box>

      {/* Dialog de confirmation pour validation */}
      <ConfirmActionDialog
        open={confirmDialogOpen}
        onClose={() => { setConfirmDialogOpen(false); setConfirmDialogData({ row: null, checked: false }); }}
        onConfirm={handleConfirmValidation}
        title={confirmDialogData.checked ? 'Valider l\'anomalie' : 'Annuler la validation'}
        message={confirmDialogData.checked
          ? `Voulez-vous valider l'anomalie du compte ${confirmDialogData.row?.compte} ?`
          : `Voulez-vous annuler la validation du compte ${confirmDialogData.row?.compte} ?`}
        confirmText="Confirmer"
        cancelText="Annuler"
      />

      {/* Dialog commentaire */}
      <CommentDialog
        open={openCommentDialog}
        onClose={() => { setOpenCommentDialog(false); setSelectedRow(null); }}
        onSave={handleSaveCommentaire}
        initialValue={selectedRow?.commentaire || ''}
        title={`Commentaire - ${selectedRow?.compte || ''}`}
        placeholder="Saisissez votre commentaire..."
        loading={commentLoading}
      />
    </Box>
  );
});

export default RevueAnalytiqueTable;