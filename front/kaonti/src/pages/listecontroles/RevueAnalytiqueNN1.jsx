import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Chip, CircularProgress, Button, Tooltip, Badge, IconButton,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import {
  RestartAltOutlined, ChatBubbleOutlineOutlined, TaskAltRounded, RadioButtonUnchecked,
  WarningAmberRounded, ErrorOutline, InfoOutlined, CheckCircleOutline,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import { jwtDecode } from 'jwt-decode';
import CommentDialog from '../../components/commetDialog';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';

// ─── Système de design (aligné sur les autres contrôles) ───
const T = {
  ink: '#0E2733', canvas: '#F4F6F5', surface: '#FFFFFF', line: '#E2E6EA', ledger: '#EEF1F3',
  text: '#16202B', muted: '#6A7785', faint: '#9AA6B2',
  accent: '#0E7C86', accentDark: '#0B6870', pos: '#1F8A70', warn: '#B5791A', neg: '#BE3A2F', info: '#3A6EA5', accW: '#E2F0F1',
};
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };

// Métadonnées de sévérité
const SEV = {
  bloquant: { label: 'Bloquant', color: T.neg, Icon: ErrorOutline },
  majeur: { label: 'Majeur', color: T.warn, Icon: WarningAmberRounded },
  mineur: { label: 'Mineur', color: T.info, Icon: InfoOutlined },
};
const sevRank = { bloquant: 0, majeur: 1, mineur: 2 };

const StatCell = ({ label, value, color }) => (
  <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 } }}>
    <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px', mb: 0.75 }}>
      {label}
    </Typography>
    <Typography sx={{ ...NUM, fontSize: { xs: '20px', md: '24px' }, fontWeight: 800, letterSpacing: '-.4px', lineHeight: 1, color }}>
      {value}
    </Typography>
  </Box>
);

const RevueAnalytiqueNN1 = ({ id_exercice, id_periode }) => {
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();
  const { selectedExerciceId, selectedPeriodeId } = useExercicePeriode();

  const effectiveExerciceId = id_exercice ?? selectedExerciceId;
  const effectivePeriodeId = id_periode ?? selectedPeriodeId;

  const ids = useMemo(() => ({
    id_compte: parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1,
    id_dossier: parseInt(sessionStorage.getItem('fileId')) || 1,
  }), [auth]);

  const [loading, setLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [data, setData] = useState(null);
  const mode = 'compte'; // analyse compte par compte (42/43)
  

  const [commentRow, setCommentRow] = useState(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);

  // Popup de confirmation validation / dévalidation
  const [confirmValide, setConfirmValide] = useState({ open: false, row: null, next: false });
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmReviser, setConfirmReviser] = useState(false);

  const fetchStored = useCallback(async () => {
    if (!effectiveExerciceId) return;
    setLoading(true);
    try {
      let url = `/administration/revueAnalytiqueNN1/stored/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}`;
      if (effectivePeriodeId) url += `?id_periode=${effectivePeriodeId}`;
      const res = await axiosPrivate.get(url);
      if (res.data?.state) setData(res.data.data);
    } catch (e) {
      console.error('Erreur lecture revue N/N-1:', e);
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, ids, effectiveExerciceId, effectivePeriodeId]);

  useEffect(() => { fetchStored(); }, [fetchStored]);

  const handleReviser = async () => {
    if (!effectiveExerciceId) return;
    setRevising(true);
    try {
      const qs = [`mode=${mode}`];
      if (effectivePeriodeId) qs.push(`id_periode=${effectivePeriodeId}`);
      const url = `/administration/revueAnalytiqueNN1/save/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}?${qs.join('&')}`;
      const res = await axiosPrivate.post(url);
      const n = res.data?.saved ?? 0;
      await fetchStored();
      toast.success(`Contrôle terminé : ${n} anomalie${n > 1 ? 's' : ''}`);
    } catch (e) {
      console.error('Erreur révision revue N/N-1:', e);
      toast.error('Erreur lors de la révision');
    } finally {
      setRevising(false);
    }
  };

  const patchRow = (id, patch) =>
    setData((prev) => prev ? { ...prev, lignes: prev.lignes.map((x) => x.id === id ? { ...x, ...patch } : x) } : prev);

  // Ouvre le popup de confirmation avant de (dé)valider.
  const handleToggleValide = (row) => {
    setConfirmValide({ open: true, row, next: !row.valide });
  };

  const closeConfirmValide = () => setConfirmValide({ open: false, row: null, next: false });

  const handleConfirmValide = async () => {
    const { row, next } = confirmValide;
    if (!row) return;
    setConfirmLoading(true);
    try {
      await axiosPrivate.put(`/administration/revueAnalytiqueNN1/anomalie/${row.id}`, { valide: next });
      patchRow(row.id, { valide: next });
    } catch (e) {
      toast.error('Erreur mise à jour');
    } finally {
      setConfirmLoading(false);
      closeConfirmValide();
    }
  };

  const openComment = (row) => { setCommentRow(row); setCommentOpen(true); };

  const saveComment = async (text) => {
    if (!commentRow) return;
    setCommentSaving(true);
    try {
      await axiosPrivate.put(`/administration/revueAnalytiqueNN1/anomalie/${commentRow.id}`, { commentaire: text });
      patchRow(commentRow.id, { commentaire: text });
      setCommentOpen(false);
      toast.success('Commentaire enregistré');
    } catch (e) {
      toast.error('Erreur enregistrement commentaire');
    } finally {
      setCommentSaving(false);
    }
  };

  const rows = useMemo(() => {
    const list = data?.lignes || [];
    return [...list].sort((a, b) => (sevRank[a.severite] ?? 9) - (sevRank[b.severite] ?? 9));
  }, [data]);

  const nbAnomalies = rows.length;
  const restantes = rows.filter((l) => !l.valide).length;
  const revised = !!data?.revised;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Bandeau résumé + bouton Réviser */}
      <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mb: 2.5, bgcolor: T.surface }}>
        <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap" alignItems="center">
          <StatCell label="Anomalies détectées" value={nbAnomalies} color={nbAnomalies > 0 ? T.warn : T.pos} />
          <StatCell label="Restantes (non validées)" value={restantes} color={restantes > 0 ? T.neg : T.pos} />
          <Box sx={{ flex: 2, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              disableElevation
              startIcon={revising ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RestartAltOutlined />}
              onClick={() => setConfirmReviser(true)}
              disabled={revising || !effectiveExerciceId}
              sx={{ bgcolor: T.accent, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: T.accentDark } }}
            >
              {revising ? 'Révision…' : 'Réviser'}
            </Button>
          </Box>
        </Stack>
      </Box>

      {/* Contenu */}
      {loading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress size={26} sx={{ color: T.accent }} />
        </Box>
      ) : !revised ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8, textAlign: 'center' }}>
          <Stack alignItems="center" spacing={1}>
            <RestartAltOutlined sx={{ fontSize: 40, color: T.faint }} />
            <Typography sx={{ fontSize: '14px', fontWeight: 700, color: T.muted }}>Aucun contrôle enregistré</Typography>
            <Typography sx={{ fontSize: '12.5px', color: T.faint, maxWidth: 420 }}>
              Cliquez sur « Réviser » pour analyser les OD de paie (comptes 42 / 43) sur N vs N-1.
            </Typography>
          </Stack>
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8, textAlign: 'center' }}>
          <Stack alignItems="center" spacing={1}>
            <CheckCircleOutline sx={{ fontSize: 40, color: T.pos }} />
            <Typography sx={{ fontSize: '14px', fontWeight: 700, color: T.pos }}>Aucune anomalie</Typography>
            <Typography sx={{ fontSize: '12.5px', color: T.faint, maxWidth: 420 }}>
              Les constatations de paie (42 / 43) sont cohérentes sur l'exercice.
            </Typography>
          </Stack>
        </Box>
      ) : (
        <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '12px' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: T.ledger }}>
                {['Code', 'Sévérité', 'Compte', 'Règle', 'Constat', 'Validé', 'Comm.'].map((h, i) => (
                  <TableCell key={h} sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.3px', borderBottom: `1px solid ${T.line}`, ...(i >= 5 ? { textAlign: 'center' } : {}) }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => {
                const sev = SEV[r.severite] || SEV.mineur;
                const SevIcon = sev.Icon;
                const has = r.commentaire && String(r.commentaire).trim();
                return (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontSize: '12.5px', fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>{r.code}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        icon={<SevIcon sx={{ fontSize: 15, color: `${sev.color} !important` }} />}
                        label={sev.label}
                        sx={{ height: 22, fontSize: '11px', fontWeight: 700, color: sev.color, bgcolor: `${sev.color}14`, border: `1px solid ${sev.color}55`, '& .MuiChip-label': { px: 0.75 } }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...NUM, fontSize: '12.5px', fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{r.compte}</TableCell>
                    <TableCell sx={{ fontSize: '12.5px', color: T.text, whiteSpace: 'nowrap' }}>{r.regle}</TableCell>
                    <TableCell sx={{ fontSize: '12.5px', color: T.text, maxWidth: 460 }}>{r.motif}</TableCell>
                    <TableCell align="center">
                      <Tooltip title={r.valide ? 'Validé — cliquer pour dévalider' : 'À valider — cliquer pour valider'} arrow>
                        <IconButton
                          size="small"
                          onClick={() => handleToggleValide(r)}
                          sx={{ p: 0.25, color: r.valide ? T.pos : T.warn, transition: '.15s', '&:hover': { transform: 'scale(1.12)' } }}
                        >
                          {r.valide ? <TaskAltRounded fontSize="small" /> : <RadioButtonUnchecked fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Badge variant={has ? 'dot' : 'standard'} overlap="circular" sx={{ '& .MuiBadge-badge': { backgroundColor: T.warn } }}>
                        <Tooltip title={r.commentaire || 'Ajouter un commentaire'} arrow>
                          <IconButton size="small" onClick={() => openComment(r)} sx={{ color: has ? T.accent : T.faint, '&:hover': { bgcolor: T.accW } }}>
                            <ChatBubbleOutlineOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CommentDialog
        open={commentOpen}
        onClose={() => { setCommentOpen(false); setCommentRow(null); }}
        onSave={saveComment}
        initialValue={commentRow?.commentaire || ''}
        title={`Commentaire - ${commentRow?.code || ''}`}
        placeholder="Saisissez votre commentaire..."
        loading={commentSaving}
      />

      <ConfirmActionDialog
        open={confirmReviser}
        onClose={() => setConfirmReviser(false)}
        onConfirm={async () => { await handleReviser(); setConfirmReviser(false); }}
        title="Réviser ce contrôle"
        message="Lancer le contrôle et enregistrer les résultats ? Les résultats précédents seront remplacés."
        confirmText="Réviser"
        loading={revising}
        color={T.accent}
      />

      <ConfirmActionDialog
        open={confirmValide.open}
        onClose={closeConfirmValide}
        onConfirm={handleConfirmValide}
        title={confirmValide.next ? "Valider l'anomalie" : 'Annuler la validation'}
        message={confirmValide.next
          ? `Voulez-vous valider l'anomalie ${confirmValide.row?.code} (${confirmValide.row?.compte}) ?`
          : `Voulez-vous annuler la validation de ${confirmValide.row?.code} (${confirmValide.row?.compte}) ?`}
        confirmText="Confirmer"
        cancelText="Annuler"
        loading={confirmLoading}
        color={T.accent}
      />
    </Box>
  );
};

export default RevueAnalytiqueNN1;
