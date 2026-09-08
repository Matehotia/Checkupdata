import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Chip, CircularProgress, Alert, Button, Select, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import { CheckCircleOutline, WarningAmberOutlined, RestartAltOutlined } from '@mui/icons-material';
import toast from 'react-hot-toast';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import { jwtDecode } from 'jwt-decode';

// ─── Design (aligné sur DetailsControles / RevisionRecap) ───
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

const EquilibreDebitCredit = ({ id_exercice, id_periode }) => {
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
  const [selectedEcriture, setSelectedEcriture] = useState('');

  // Lecture des anomalies enregistrées (pas de recalcul)
  const fetchStored = useCallback(async () => {
    if (!effectiveExerciceId) return;
    setLoading(true);
    try {
      let url = `/administration/equilibreDebitCredit/stored/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}`;
      if (effectivePeriodeId) url += `?id_periode=${effectivePeriodeId}`;
      const res = await axiosPrivate.get(url);
      if (res.data?.state) setData(res.data.data);
    } catch (e) {
      console.error('Erreur lecture équilibre débit/crédit:', e);
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
      const url = `/administration/equilibreDebitCredit/save/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}${qs.length ? `?${qs.join('&')}` : ''}`;
      const res = await axiosPrivate.post(url);
      const n = res.data?.saved ?? 0;
      await fetchStored();
      toast.success(`Contrôle terminé : ${n} écriture${n > 1 ? 's' : ''} déséquilibrée(s)`);
    } catch (e) {
      console.error('Erreur révision équilibre:', e);
      toast.error('Erreur lors de la révision');
    } finally {
      setRevising(false);
    }
  };

  useEffect(() => { fetchStored(); }, [fetchStored]);

  // Réinitialise le filtre écriture à chaque nouveau chargement.
  useEffect(() => { setSelectedEcriture(''); }, [data]);

  const g = data?.global || { total_debit: 0, total_credit: 0, ecart: 0, equilibre: true };
  const ecritures = data?.ecritures || [];
  const lignes = data?.lignes || [];
  const allRows = useMemo(
    () => lignes.map((l, i) => ({ id: l.id ?? `row-${i}`, ...l })),
    [lignes]
  );
  const rows = useMemo(
    () => (selectedEcriture ? allRows.filter((r) => String(r.id_ecriture) === String(selectedEcriture)) : allRows),
    [allRows, selectedEcriture]
  );

  // Regroupe les lignes par écriture (dans l'ordre reçu du back) pour insérer un filet vert entre chaque écriture.
  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = String(r.id_ecriture ?? '—');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.values());
  }, [rows]);

  if (loading && !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress size={28} sx={{ color: T.accent }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Bandeau global */}
      <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mb: 2.5 }}>
        <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap">
          <StatCell label="Total débit" value={fmt(g.total_debit)} />
          <StatCell label="Total crédit" value={fmt(g.total_credit)} />
          <StatCell label="Écart global" value={fmt(g.ecart)} color={g.equilibre ? T.pos : T.neg} />
          <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Chip
              icon={g.equilibre ? <CheckCircleOutline sx={{ fontSize: 18 }} /> : <WarningAmberOutlined sx={{ fontSize: 18 }} />}
              label={g.equilibre ? 'Équilibré' : 'Déséquilibré'}
              sx={{
                bgcolor: g.equilibre ? T.accW : T.negW,
                color: g.equilibre ? T.pos : T.neg,
                fontWeight: 700, fontSize: '13px', height: 32,
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
            <Button
              variant="contained"
              disableElevation
              startIcon={revising ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <RestartAltOutlined />}
              onClick={handleReviser}
              disabled={revising}
              sx={{ ml: 'auto', bgcolor: T.accent, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#0B6870' } }}
            >
              {revising ? 'Révision…' : 'Réviser'}
            </Button>
          </Box>
        </Stack>
      </Box>

      {/* Écritures déséquilibrées */}
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography sx={{ fontSize: '12px', fontWeight: 700, color: T.ink, textTransform: 'uppercase', letterSpacing: '.4px' }}>
          Écritures déséquilibrées
        </Typography>
        <Chip label={ecritures.length} size="small" sx={{ bgcolor: ecritures.length > 0 ? T.negW : T.accW, color: ecritures.length > 0 ? T.neg : T.pos, fontWeight: 700, height: 20, ...NUM }} />

        {/* {ecritures.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: 'auto' }}>
            <Typography sx={{ fontSize: '11px', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '.4px' }}>
              Écriture
            </Typography>
            <Select
              size="small"
              value={selectedEcriture}
              onChange={(e) => setSelectedEcriture(e.target.value)}
              displayEmpty
              sx={{ minWidth: 220, height: 34, fontSize: '13px', bgcolor: T.surface, borderRadius: '8px' }}
            >
              <MenuItem value=""><em>Toutes ({ecritures.length})</em></MenuItem>
              {ecritures.map((ec) => (
                <MenuItem key={ec.id_ecriture} value={ec.id_ecriture} sx={{ fontSize: '13px' }}>
                  <Box component="span" sx={{ ...NUM }}>
                    N° {ec.id_ecriture} — écart {fmt(ec.ecart)}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </Stack>
        )} */}
      </Stack>

      {!data?.revised ? (
        <Alert severity="info" icon={<RestartAltOutlined />} sx={{ borderRadius: '12px' }}>
          Aucune donnée enregistrée. Cliquez sur « Réviser » pour lancer le contrôle.
        </Alert>
      ) : ecritures.length === 0 ? (
        <Alert severity="success" icon={<CheckCircleOutline />} sx={{ borderRadius: '12px' }}>
          Toutes les écritures sont équilibrées (débit = crédit), y compris au niveau global.
        </Alert>
      ) : (
        <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflowX: 'auto' }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '0.8rem', py: 0.6, px: 1.5, borderBottom: `1px solid ${T.ledger}` } }}>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
                <TableCell>Date</TableCell>
                <TableCell>Compte</TableCell>
                <TableCell>Pièce</TableCell>
                <TableCell>Libellé</TableCell>
                <TableCell align="right">Débit</TableCell>
                <TableCell align="right">Crédit</TableCell>
                <TableCell>Lettrage</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((grp, gi) => {
                const totalDebit = grp.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                const totalCredit = grp.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                const ecart = totalDebit - totalCredit;
                const idEc = grp[0]?.id_ecriture ?? '—';
                return (
                  <React.Fragment key={`grp-${idEc}-${gi}`}>
                    {grp.map((l, li) => (
                      <TableRow
                        key={l.id}
                        hover
                        // Filet vert au début de chaque écriture (sauf la première) pour les séparer.
                        sx={(li === 0 && gi > 0) ? { '& td': { borderTop: `2px solid ${T.pos}` } } : undefined}
                      >
                        <TableCell sx={{ ...NUM, whiteSpace: 'nowrap' }}>{fmtDate(l.dateecriture)}</TableCell>
                        <TableCell sx={{ ...NUM }}>{l.comptegen || l.compteaux || '—'}</TableCell>
                        <TableCell>{l.piece || '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.libelle || '—'}</TableCell>
                        <TableCell align="right" sx={{ ...NUM }}>{fmt(l.debit)}</TableCell>
                        <TableCell align="right" sx={{ ...NUM }}>{fmt(l.credit)}</TableCell>
                        <TableCell>{l.lettrage || '—'}</TableCell>
                      </TableRow>
                    ))}
                    {/* Sous-total de l'écriture : totaux débit / crédit + écart */}
                    <TableRow sx={{ '& td': { bgcolor: '#F1F5F4', fontWeight: 700, borderBottom: `1px solid ${T.line}` } }}>
                      <TableCell colSpan={4} sx={{ fontSize: '0.72rem', letterSpacing: '.3px' }}>
                        <Box component="span" sx={{ color: T.muted, textTransform: 'uppercase' }}>
                          Sous-total
                        </Box>
                        <Box
                          component="span"
                          sx={{ ...NUM, ml: 1.5, fontWeight: 800 }}
                        >
                          Écart :
                          <Chip
                            label={fmt(ecart)}
                            color={ecart >= 0 ? "success" : "error"}
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ ...NUM }}>{fmt(totalDebit)}</TableCell>
                      <TableCell align="right" sx={{ ...NUM }}>{fmt(totalCredit)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default EquilibreDebitCredit;
