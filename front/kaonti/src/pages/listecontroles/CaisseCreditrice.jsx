import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Stack, Chip, CircularProgress, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import { CheckCircleOutline, WarningAmberOutlined, RestartAltOutlined } from '@mui/icons-material';
import toast from 'react-hot-toast';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { useExercicePeriode } from '../../context/ExercicePeriodeContext';
import { jwtDecode } from 'jwt-decode';

// ─── Design (aligné sur DetailsControles) ───
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

const CaisseCreditrice = ({ id_exercice, id_periode }) => {
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

  // Lecture des anomalies enregistrées (pas de recalcul)
  const fetchStored = useCallback(async () => {
    if (!effectiveExerciceId) return;
    setLoading(true);
    try {
      let url = `/administration/caisseCreditrice/stored/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}`;
      if (effectivePeriodeId) url += `?id_periode=${effectivePeriodeId}`;
      const res = await axiosPrivate.get(url);
      if (res.data?.state) setData(res.data.data);
    } catch (e) {
      console.error('Erreur lecture caisse créditrice:', e);
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
      const url = `/administration/caisseCreditrice/save/${ids.id_compte}/${ids.id_dossier}/${effectiveExerciceId}${qs.length ? `?${qs.join('&')}` : ''}`;
      const res = await axiosPrivate.post(url);
      const n = res.data?.saved ?? 0;
      await fetchStored();
      toast.success(`Contrôle terminé : ${n} ligne${n > 1 ? 's' : ''} créditrice(s)`);
    } catch (e) {
      console.error('Erreur révision caisse créditrice:', e);
      toast.error('Erreur lors de la révision');
    } finally {
      setRevising(false);
    }
  };

  useEffect(() => { fetchStored(); }, [fetchStored]);

  const lignes = data?.lignes || [];
  const nbComptes = data?.nbComptes || 0;
  const nbNegatives = data?.nbNegatives || 0;

  const rows = useMemo(
    () => lignes.map((l, i) => ({ id: l.id ?? `row-${i}`, ...l })),
    [lignes]
  );

  // Regroupe les lignes par compte caisse (filet vert entre chaque compte).
  const groups = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const key = String(r.compte ?? r.comptegen ?? r.compteaux ?? '—');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries()).map(([compte, ls]) => ({ compte, lignes: ls }));
  }, [rows]);

  if (loading && !data) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress size={28} sx={{ color: T.accent }} />
      </Box>
    );
  }

  const anomalie = nbNegatives > 0;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      {/* Bandeau */}
      <Box sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflow: 'hidden', mb: 2.5 }}>
        <Stack direction="row" divider={<Box sx={{ width: '1px', bgcolor: T.line }} />} flexWrap="wrap">
          <StatCell label="Comptes caisse concernés" value={nbComptes} color={anomalie ? T.neg : T.pos} />
          <StatCell label="Lignes créditrices" value={nbNegatives} color={anomalie ? T.neg : T.pos} />
          <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Chip
              icon={anomalie ? <WarningAmberOutlined sx={{ fontSize: 18 }} /> : <CheckCircleOutline sx={{ fontSize: 18 }} />}
              label={anomalie ? 'Caisse négative détectée' : 'Aucune caisse négative'}
              sx={{
                bgcolor: anomalie ? T.negW : T.accW,
                color: anomalie ? T.neg : T.pos,
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

      <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '14px', overflowX: 'auto' }}>
          <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '0.8rem', py: 0.6, px: 1.5, borderBottom: `1px solid ${T.ledger}` } }}>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
                <TableCell>Date</TableCell>
                <TableCell>Pièce</TableCell>
                <TableCell>Libellé</TableCell>
                <TableCell align="right">Débit</TableCell>
                <TableCell align="right">Crédit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', color: T.faint, py: 5 }}>
                    {revising
                      ? 'Révision en cours…'
                      : 'Aucune donnée enregistrée. Cliquez sur « Réviser » pour lancer le contrôle.'}
                  </TableCell>
                </TableRow>
              )}
              {groups.map((grp, gi) => (
                <React.Fragment key={`grp-${grp.compte}-${gi}`}>
                  {/* En-tête du compte caisse (filet vert entre comptes) */}
                  <TableRow sx={{ '& td': { bgcolor: '#F1F5F4', fontWeight: 700, borderTop: gi > 0 ? `2px solid ${T.pos}` : undefined } }}>
                    <TableCell colSpan={5} sx={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '.4px', color: T.muted }}>
                      Compte {grp.compte} — {grp.lignes.length} ligne(s) créditrice(s)
                    </TableCell>
                  </TableRow>
                  {grp.lignes.map((l) => (
                    <TableRow key={l.id} hover>
                      <TableCell sx={{ ...NUM, whiteSpace: 'nowrap' }}>{fmtDate(l.dateecriture)}</TableCell>
                      <TableCell>{l.piece || '—'}</TableCell>
                      <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.libelle || '—'}</TableCell>
                      <TableCell align="right" sx={{ ...NUM }}>{fmt(l.debit)}</TableCell>
                      <TableCell align="right" sx={{ ...NUM }}>{fmt(l.credit)}</TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
    </Box>
  );
};

export default CaisseCreditrice;
