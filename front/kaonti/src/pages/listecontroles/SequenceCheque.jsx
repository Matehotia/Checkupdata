import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Chip, CircularProgress, Button, Tooltip,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TablePagination,
} from '@mui/material';
import { RestartAltOutlined, WarningAmberRounded, CheckCircleOutline } from '@mui/icons-material';
import toast from 'react-hot-toast';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import { jwtDecode } from 'jwt-decode';

const T = {
  ink: '#0E2733', surface: '#FFFFFF', line: '#E2E6EA', ledger: '#EEF1F3',
  text: '#16202B', muted: '#6A7785', faint: '#9AA6B2',
  accent: '#0E7C86', pos: '#1F8A70', warn: '#B5791A', neg: '#BE3A2F', accW: '#E2F0F1', negW: '#F7E7E4',
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

const SequenceCheque = ({ id_exercice, id_periode }) => {
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
  const [data, setData] = useState(null);

  // Lecture des résultats enregistrés (pas de recalcul)
  const fetchStored = useCallback(async () => {
    if (!effectiveExerciceId) return;
    setLoading(true);
    try {
      let url = `/administration/sequenceCheque/stored/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}`;
      if (effectivePeriodeId) url += `?id_periode=${effectivePeriodeId}`;
      const res = await axiosPrivate.get(url);
      if (res.data?.state) setData(res.data.data);
    } catch (e) {
      console.error('Erreur lecture séquence des chèques:', e);
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, ids, effectiveExerciceId, effectivePeriodeId]);

  // Réviser = recalcule + enregistre + rafraîchit
  const handleReviser = async () => {
    if (!effectiveExerciceId) return;
    setRevising(true);
    try {
      const qs = [];
      if (selectedPeriodeDates?.date_debut && selectedPeriodeDates?.date_fin) {
        qs.push(`date_debut=${selectedPeriodeDates.date_debut}`, `date_fin=${selectedPeriodeDates.date_fin}`);
      }
      if (effectivePeriodeId) qs.push(`id_periode=${effectivePeriodeId}`);
      const url = `/administration/sequenceCheque/save/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}${qs.length ? `?${qs.join('&')}` : ''}`;
      const res = await axiosPrivate.post(url);
      const n = res.data?.saved ?? 0;
      await fetchStored();
      toast.success(`Contrôle terminé : ${n} écriture${n > 1 ? 's' : ''}`);
    } catch (e) {
      console.error('Erreur révision séquence des chèques:', e);
      toast.error('Erreur lors de la révision');
    } finally {
      setRevising(false);
    }
  };

  useEffect(() => { fetchStored(); }, [fetchStored]);

  const lignes = data?.lignes || [];
  const rows = useMemo(
    () => lignes.map((l, i) => ({ id: l.id ?? `row-${i}`, ...l })),
    [lignes]
  );

  // Tri par code journal (BFV, BNI…) puis n° de chèque croissant, et calcul de la séquence :
  // écart = n° courant − n° précédent (même journal) ; anomalie si écart ≠ 1.
  const sortedRows = useMemo(() => {
    const toNum = (s) => {
      const n = parseInt(String(s || '').replace(/\D/g, ''), 10);
      return isNaN(n) ? null : n;
    };
    const sorted = [...rows].sort((a, b) => {
      const ca = String(a.code_journal || '');
      const cb = String(b.code_journal || '');
      if (ca !== cb) return ca.localeCompare(cb);
      const na = toNum(a.numero_cheque);
      const nb = toNum(b.numero_cheque);
      return (na ?? Number.MAX_SAFE_INTEGER) - (nb ?? Number.MAX_SAFE_INTEGER);
    });
    let prevNum = null;
    let prevGroup = null;
    return sorted.map((r) => {
      const grp = String(r.code_journal || '');
      const num = toNum(r.numero_cheque);
      let ecart = null;
      let anomalie = false;
      if (grp === prevGroup && prevNum != null && num != null) {
        ecart = num - prevNum;
        anomalie = ecart !== 1;
      }
      prevNum = num;
      prevGroup = grp;
      return { ...r, ecart, anomalie };
    });
  }, [rows]);

  const nbAnomalies = useMemo(() => sortedRows.filter((r) => r.anomalie).length, [sortedRows]);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  useEffect(() => { setPage(0); }, [data]);
  const pagedRows = useMemo(
    () => sortedRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sortedRows, page, rowsPerPage]
  );

  if (loading && !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress size={28} sx={{ color: T.accent }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Bandeau */}
      <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mb: 2.5 }}>
        <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap" alignItems="center">
          <StatCell label="Écritures trouvées" value={rows.length} color={T.ink} />
          <StatCell label="Anomalies de séquence" value={nbAnomalies} color={nbAnomalies > 0 ? T.neg : T.pos} />
          <Box sx={{ flex: 2, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              disableElevation
              startIcon={revising ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RestartAltOutlined />}
              onClick={handleReviser}
              disabled={revising}
              sx={{ bgcolor: T.accent, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#0B6870' } }}
            >
              {revising ? 'Révision…' : 'Réviser'}
            </Button>
          </Box>
        </Stack>
      </Box>

      <Box>
        <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '14px 14px 0 0', maxHeight: 'calc(100vh - 320px)', minHeight: 200, overflow: 'auto' }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '0.8rem', py: 0.6, px: 1.5, borderBottom: `1px solid ${T.ledger}` } }}>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
                <TableCell>Date</TableCell>
                <TableCell>Code journal</TableCell>
                <TableCell>Compte</TableCell>
                <TableCell>Pièce</TableCell>
                <TableCell>Libellé</TableCell>
                <TableCell>N° chèque</TableCell>
                <TableCell align="center">Séquence</TableCell>
                <TableCell align="center">Anomalie</TableCell>
                <TableCell align="right">Débit</TableCell>
                <TableCell align="right">Crédit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedRows.map((l, idx) => {
                const prev = idx > 0 ? pagedRows[idx - 1] : null;
                const showHeader = !prev || (prev.code_journal || '') !== (l.code_journal || '');
                return (
                  <React.Fragment key={l.id}>
                    {showHeader && (
                      <TableRow sx={{ '& td': { bgcolor: '#F1F5F4', fontWeight: 700, borderTop: idx > 0 ? `2px solid ${T.accent}` : undefined } }}>
                        <TableCell colSpan={10} sx={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '.4px', color: T.muted }}>
                          Journal {l.code_journal || '—'}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow hover>
                      <TableCell sx={{ ...NUM, whiteSpace: 'nowrap' }}>{fmtDate(l.dateecriture)}</TableCell>
                      <TableCell sx={{ ...NUM, whiteSpace: 'nowrap' }}>
                        <Chip label={l.code_journal || '—'} size="small" sx={{ bgcolor: T.accW, color: T.accent, fontWeight: 700, fontSize: '11px', height: 20 }} />
                      </TableCell>
                      <TableCell sx={{ ...NUM }}>{l.comptegen || l.compteaux || '—'}</TableCell>
                      <TableCell>{l.piece || '—'}</TableCell>
                      <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.libelle || '—'}</TableCell>
                      <TableCell sx={{ ...NUM, fontWeight: 700, color: T.ink }}>{l.numero_cheque || '—'}</TableCell>
                      <TableCell align="center" sx={{ ...NUM, fontWeight: 700 }}>
                        {l.ecart === null
                          ? <Box component="span" sx={{ color: T.faint }}>début</Box>
                          : <Box component="span" sx={{ color: l.anomalie ? T.neg : T.pos }}>{l.ecart > 0 ? `+${l.ecart}` : l.ecart}</Box>}
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={l.anomalie ? 'Anomalie de séquence' : 'Conforme'} arrow>
                          <Box component="span" sx={{ display: 'inline-flex', color: l.anomalie ? T.warn : T.pos }}>
                            {l.anomalie ? <WarningAmberRounded fontSize="small" /> : <CheckCircleOutline fontSize="small" />}
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={{ ...NUM }}>{fmt(l.debit)}</TableCell>
                      <TableCell align="right" sx={{ ...NUM }}>{fmt(l.credit)}</TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={rows.length}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100, 200]}
          labelRowsPerPage="Lignes par page"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} sur ${count}`}
          sx={{ border: `1px solid ${T.line}`, borderTop: 'none', borderRadius: '0 0 14px 14px', bgcolor: '#FBFCFD' }}
        />
        </Box>
    </Box>
  );
};

export default SequenceCheque;
