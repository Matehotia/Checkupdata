import React, { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import {
  Box, Typography, Stack, Chip, CircularProgress, Button, Tooltip, Badge, Collapse, IconButton,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import {
  CheckCircleOutline, WarningAmberRounded, AddCircleOutline, RemoveCircleOutline,
  RestartAltOutlined, ChatBubbleOutlineOutlined, TaskAltRounded, RadioButtonUnchecked,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
import { jwtDecode } from 'jwt-decode';
import CommentDialog from '../../components/commetDialog';

const T = {
  ink: '#0E2733', surface: '#FFFFFF', line: '#E2E6EA', ledger: '#EEF1F3',
  text: '#16202B', muted: '#6A7785', faint: '#9AA6B2',
  accent: '#0E7C86', pos: '#1F8A70', warn: '#B5791A', neg: '#BE3A2F', accW: '#E2F0F1', negW: '#F7E7E4', posW: '#E8F5EC',
};
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };

const fmt = (v) => Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (val) => {
  if (!val) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

// Classe comptable d'une ligne de détail, pour la coloration
const classeOf = (cg) => {
  const c = String(cg || '').trim();
  if (/^[67]/.test(c)) return 'HT';
  if (/^445/.test(c)) return 'TVA';
  if (/^(40|41)/.test(c)) return 'TIERS';
  if (/^44/.test(c)) return 'RETENUE';
  return 'AUTRE';
};

const StatCell = ({ label, value, color = T.ink }) => (
  <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 } }}>
    <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px', mb: 0.75 }}>
      {label}
    </Typography>
    <Typography sx={{ ...NUM, fontSize: { xs: '20px', md: '24px' }, fontWeight: 800, letterSpacing: '-.4px', lineHeight: 1, color }}>
      {value}
    </Typography>
  </Box>
);

const TauxTva = ({ id_exercice, id_periode }) => {
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();
  const { selectedExerciceId, selectedPeriodeId, selectedPeriodeDates } = useExercicePeriode();

  const effectiveExerciceId = id_exercice ?? selectedExerciceId;
  const effectivePeriodeId = id_periode ?? selectedPeriodeId;

  const ids = useMemo(() => ({
    id_compte: parseInt(jwtDecode(auth?.accessToken)?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1,
    id_dossier: parseInt(sessionStorage.getItem('fileId')) || 1,
  }), [auth]);

  const [loading, setLoading] = useState(false);
  const [revising, setRevising] = useState(false);
  const [confirmReviser, setConfirmReviser] = useState(false);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState({});

  // Popup commentaire
  const [commentRow, setCommentRow] = useState(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const fetchStored = useCallback(async () => {
    if (!effectiveExerciceId) return;
    setLoading(true);
    try {
      let url = `/administration/tauxTva/stored/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}`;
      if (effectivePeriodeId) url += `?id_periode=${effectivePeriodeId}`;
      const res = await axiosPrivate.get(url);
      if (res.data?.state) setData(res.data.data);
    } catch (e) {
      console.error('Erreur lecture taux TVA:', e);
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, ids, effectiveExerciceId, effectivePeriodeId]);

  const handleReviser = async () => {
    if (!effectiveExerciceId) return;
    setRevising(true);
    try {
      const qs = [];
      if (selectedPeriodeDates?.date_debut && selectedPeriodeDates?.date_fin) {
        qs.push(`date_debut=${selectedPeriodeDates.date_debut}`, `date_fin=${selectedPeriodeDates.date_fin}`);
      }
      if (effectivePeriodeId) qs.push(`id_periode=${effectivePeriodeId}`);
      const url = `/administration/tauxTva/save/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}${qs.length ? `?${qs.join('&')}` : ''}`;
      const res = await axiosPrivate.post(url);
      const n = res.data?.saved ?? 0;
      await fetchStored();
      toast.success(`Contrôle terminé : ${n} facture${n > 1 ? 's' : ''}`);
    } catch (e) {
      console.error('Erreur révision taux TVA:', e);
      toast.error('Erreur lors de la révision');
    } finally {
      setRevising(false);
    }
  };

  useEffect(() => { fetchStored(); }, [fetchStored]);

  const patchRow = (id, patch) => {
    setData((prev) => prev ? { ...prev, lignes: prev.lignes.map((x) => x.id === id ? { ...x, ...patch } : x) } : prev);
  };

  const handleToggleValide = async (row) => {
    const next = !row.valide;
    patchRow(row.id, { valide: next });
    try {
      await axiosPrivate.put(`/administration/tauxTva/anomalie/${row.id}`, { valide: next });
    } catch (e) {
      patchRow(row.id, { valide: !next });
      toast.error('Erreur mise à jour');
    }
  };

  const openComment = (row) => { setCommentRow(row); setCommentOpen(true); };

  const saveComment = async (text) => {
    if (!commentRow) return;
    setCommentSaving(true);
    try {
      await axiosPrivate.put(`/administration/tauxTva/anomalie/${commentRow.id}`, { commentaire: text });
      patchRow(commentRow.id, { commentaire: text });
      setCommentOpen(false);
      toast.success('Commentaire enregistré');
    } catch (e) {
      toast.error('Erreur enregistrement commentaire');
    } finally {
      setCommentSaving(false);
    }
  };

  const lignes = data?.lignes || [];
  const rows = useMemo(
    () => lignes.map((l, i) => ({ ...l, id: l.id ?? l.id_ecriture ?? `row-${i}` })),
    [lignes]
  );
  const nbAnomalies = rows.filter((l) => l.anomalie).length;
  const restantes = rows.filter((l) => l.anomalie && !l.valide).length;

  if (loading && !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress size={28} sx={{ color: T.accent }} />
      </Box>
    );
  }

  const hasRows = rows.length > 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Bandeau */}
      <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mb: 2.5 }}>
        <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap" alignItems="center">
          <StatCell label="Factures vérifiées" value={rows.length} color={T.ink} />
          <StatCell label="Anomalies" value={nbAnomalies} color={nbAnomalies > 0 ? T.warn : T.pos} />
          <StatCell label="Restantes (non validées)" value={restantes} color={restantes > 0 ? T.warn : T.pos} />
          <Box sx={{ flex: 2, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              disableElevation
              startIcon={revising ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RestartAltOutlined />}
              onClick={() => setConfirmReviser(true)}
              disabled={revising}
              sx={{ bgcolor: T.accent, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#0B6870' } }}
            >
              {revising ? 'Révision…' : 'Réviser'}
            </Button>
          </Box>
        </Stack>
      </Box>

      <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflowX: 'auto' }}>
        <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '0.8rem', py: 0.6, px: 1.5, borderBottom: `1px solid ${T.ledger}` } }}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
              <TableCell sx={{ width: 40 }} />
              <TableCell>Type</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Pièce</TableCell>
              <TableCell>Compte (6/7)</TableCell>
              <TableCell>Libellé</TableCell>
              <TableCell align="right">HT</TableCell>
              <TableCell align="right">TVA</TableCell>
              <TableCell align="right">Taux</TableCell>
              <TableCell align="center">Anomalie</TableCell>
              <TableCell align="center">Validé</TableCell>
              <TableCell align="center">Comm.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!hasRows && (
              <TableRow>
                <TableCell colSpan={12} sx={{ textAlign: 'center', color: T.faint, py: 5 }}>
                  {revising
                    ? 'Révision en cours…'
                    : 'Aucune donnée enregistrée. Cliquez sur « Réviser » pour lancer le contrôle.'}
                </TableCell>
              </TableRow>
            )}
            {rows.map((l) => {
              const detail = l.detail || [];
              const compteHt = (detail.find((d) => classeOf(d.comptegen) === 'HT') || {}).comptegen || '—';
              const isOpen = !!open[l.id];
              return (
                <Fragment key={l.id}>
                  <TableRow
                    hover
                    sx={{ bgcolor: l.valide ? '#F3FAF5' : 'transparent', '& > *': { borderBottom: isOpen ? 'unset' : undefined } }}
                  >
                    <TableCell sx={{ width: 40 }}>
                      {detail.length > 0 && (
                        <IconButton size="small" sx={{ p: 0.25 }} onClick={() => toggle(l.id)}>
                          {isOpen ? <RemoveCircleOutline fontSize="small" /> : <AddCircleOutline fontSize="small" />}
                        </IconButton>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={l.type || '—'}
                        size="small"
                        sx={{
                          bgcolor: l.type === 'Vente' ? T.accW : (l.type === 'Mixte' ? T.negW : T.ledger),
                          color: l.type === 'Vente' ? T.accent : (l.type === 'Mixte' ? T.neg : T.muted),
                          fontWeight: 700, fontSize: '10px', height: 18,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...NUM, whiteSpace: 'nowrap' }}>{fmtDate(l.dateecriture)}</TableCell>
                    <TableCell>{l.piece || '—'}</TableCell>
                    <TableCell sx={{ ...NUM, whiteSpace: 'nowrap', fontWeight: 700, color: T.ink }}>{compteHt}</TableCell>
                    <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.libelle || '—'}</TableCell>
                    <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>{fmt(l.ht)}</TableCell>
                    <TableCell align="right" sx={{ ...NUM }}>{fmt(l.tva)}</TableCell>
                    <TableCell align="right" sx={{ ...NUM, fontWeight: 700 }}>{fmt(l.taux)} %</TableCell>
                    <TableCell align="center">
                      <Tooltip title={l.anomalie ? 'Anomalie' : 'Conforme'} arrow>
                        <Box component="span" sx={{ display: 'inline-flex', color: l.anomalie ? T.warn : T.pos }}>
                          {l.anomalie
                            ? <WarningAmberRounded fontSize="small" />
                            : <CheckCircleOutline fontSize="small" />}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={l.valide ? 'Validé — cliquer pour dévalider' : (l.anomalie ? 'À valider — cliquer pour valider' : 'Rien à valider')} arrow>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleToggleValide(l)}
                            disabled={!l.anomalie && !l.valide}
                            sx={{ p: 0.25, color: l.valide ? T.pos : (l.anomalie ? T.warn : T.faint), transition: '.15s', '&:hover': { transform: 'scale(1.12)' } }}
                          >
                            {l.valide ? <TaskAltRounded fontSize="small" /> : <RadioButtonUnchecked fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Badge
                        variant={l.commentaire ? 'dot' : 'standard'}
                        overlap="circular"
                        sx={{ '& .MuiBadge-badge': { backgroundColor: T.warn, color: T.warn } }}
                      >
                        <Tooltip title={l.commentaire || 'Ajouter un commentaire'} arrow>
                          <span>
                            <IconButton size="small" onClick={() => openComment(l)} sx={{ color: l.commentaire ? T.accent : T.faint, '&:hover': { bgcolor: T.accW } }}>
                              <ChatBubbleOutlineOutlined fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Badge>
                    </TableCell>
                  </TableRow>

                  {/* Détail replié = toutes les lignes de l'écriture */}
                  <TableRow>
                    <TableCell colSpan={12} sx={{ py: 0, borderBottom: isOpen ? `1px solid ${T.ledger}` : 'none' }}>
                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ m: 1.5, ml: 5, border: `1px solid ${T.line}`, borderRadius: '10px', overflow: 'hidden' }}>
                          <Table size="small" sx={{ '& td, & th': { fontSize: '0.75rem', py: 0.5, px: 1.5, borderBottom: `1px solid ${T.ledger}` } }}>
                            <TableHead>
                              <TableRow sx={{ '& th': { bgcolor: '#FBFCFD', color: T.muted, fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
                                <TableCell>Compte</TableCell>
                                <TableCell>Compte aux.</TableCell>
                                <TableCell>Nature</TableCell>
                                <TableCell>Libellé</TableCell>
                                <TableCell align="right">Débit</TableCell>
                                <TableCell align="right">Crédit</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {detail.map((d, di) => {
                                const cl = classeOf(d.comptegen);
                                const natColor = cl === 'HT' ? T.accent : cl === 'TVA' ? T.warn : cl === 'RETENUE' ? T.neg : T.muted;
                                const natLabel = cl === 'HT' ? 'HT (charge/produit)' : cl === 'TVA' ? 'TVA' : cl === 'TIERS' ? 'Tiers (TTC)' : cl === 'RETENUE' ? 'Retenue / 44x' : 'Autre';
                                return (
                                  <TableRow key={di} sx={{ bgcolor: cl === 'HT' ? '#F3FAFA' : 'transparent' }}>
                                    <TableCell sx={{ ...NUM, whiteSpace: 'nowrap', fontWeight: 700 }}>{String(d.comptegen || '').trim() || '—'}</TableCell>
                                    <TableCell sx={{ ...NUM, whiteSpace: 'nowrap', color: T.muted }}>{String(d.compteaux || '').trim() || '—'}</TableCell>
                                    <TableCell>
                                      <Chip label={natLabel} size="small" sx={{ bgcolor: 'transparent', color: natColor, border: `1px solid ${natColor}33`, fontWeight: 700, fontSize: '9px', height: 17 }} />
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.libelle || '—'}</TableCell>
                                    <TableCell align="right" sx={{ ...NUM }}>{d.debit ? fmt(d.debit) : ''}</TableCell>
                                    <TableCell align="right" sx={{ ...NUM }}>{d.credit ? fmt(d.credit) : ''}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <CommentDialog
        open={commentOpen}
        onClose={() => setCommentOpen(false)}
        onSave={saveComment}
        initialValue={commentRow?.commentaire || ''}
        title="Commentaire — Taux de TVA"
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
        color="#0E7C86"
      />
    </Box>
  );
};

export default TauxTva;
