import { useState, useContext, useRef } from 'react';
import {
  Box, Typography, Stack,
  Divider, Button, Breadcrumbs, Link as MuiLink,
  MenuItem,
  Menu,
  CircularProgress,
  Tooltip
} from '@mui/material';
import ExercicePeriodeContext from '../context/ExercicePeriodeContext';
import {
  CompareArrowsOutlined, CalendarMonthOutlined,
  PeopleAltOutlined, ContentCopyOutlined, HelpOutline, LabelOutlined, FileDownloadOutlined, FilterListOutlined,
  DashboardOutlined, PictureAsPdf, TableChart, ArrowDropDown,
  FactCheckOutlined, NavigateNext,
  TrendingUpOutlined, RuleOutlined, AccountBalanceWalletOutlined,
  DomainOutlined, SwapVertOutlined, ReceiptLongOutlined,
  PendingOutlined, ConstructionOutlined, BalanceOutlined, PointOfSaleOutlined, RequestQuoteOutlined
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useAxiosPrivate from '../hooks/useAxiosPrivate';
import { fetchAnomaliesSynthese } from '../utils/anomaliesSynthese';
import { jwtDecode } from 'jwt-decode';
import RevueAnalytiqueTable from './listecontroles/revuenn1';
import RevueMensuelleTable from './listecontroles/revuemensuelle';
import GlobalBalance from './listecontroles/controleglobal';
import AnalyseTiers from './listecontroles/analyseTiers';
import RechercheDoublons from './listecontroles/rechercheDoublon';
import EcrituresSuspense from './listecontroles/EcrituresSuspense';
import ControleAnalytique from './listecontroles/controleAnalytique';
import EquilibreDebitCredit from './listecontroles/EquilibreDebitCredit';
import CaisseCreditrice from './listecontroles/CaisseCreditrice';
import CoherenceHtTva from './listecontroles/CoherenceHtTva';
import TauxTva from './listecontroles/TauxTva';
import ExercicePeriodeSelector from './ExercicePeriodeSelector';

// ─── Système de design (aligné sur ExportBalance / le tableau de bord) ───
const T = {
  ink: '#0E2733',
  canvas: '#F4F6F5',
  surface: '#FFFFFF',
  line: '#E2E6EA',
  ledger: '#EEF1F3',
  text: '#16202B',
  muted: '#6A7785',
  faint: '#9AA6B2',
  accent: '#0E7C86',
  accentDark: '#0a5d65',
  pos: '#1F8A70',
  neg: '#BE3A2F',
  accW: '#E2F0F1',
};
const CARD_SHADOW = '0 1px 2px rgba(16,39,51,.04), 0 8px 24px -16px rgba(51, 16, 16, 0.18)';

const PH = <PendingOutlined sx={{ fontSize: 20 }} />; // icône des contrôles à venir (placeholders)

const CONTROL_GROUPS = [
  {
    title: 'Forme & intégrité du fichier',
    items: [
      { id: 'doublons', label: 'Recherche de doublons', icon: <ContentCopyOutlined sx={{ fontSize: 20 }} /> },
      { id: 'suspense', label: 'Écritures en suspens', icon: <HelpOutline sx={{ fontSize: 20 }} /> },
      { id: 'fecFormat', label: 'Conformité du format FEC (18 champs obligatoires, art. A47 A-1 du LPF)', icon: PH, placeholder: true },
      { id: 'equilibreDC', label: 'Équilibre débit = crédit, global et par écriture', icon: <BalanceOutlined sx={{ fontSize: 20 }} /> },
      { id: 'continuiteNum', label: 'Continuité de la numérotation des écritures (EcritureNum)', icon: PH, placeholder: true },
      { id: 'controleDates', label: 'Contrôle des dates : date comptable dans l’exercice, ≥ date pièce, absence de dates futures', icon: PH, placeholder: true },
      { id: 'concordanceAN', label: 'Concordance des à-nouveaux avec la clôture N-1', icon: PH, placeholder: true },
      { id: 'libelleManquant', label: 'Écritures sans libellé ou libellé non signifiant', icon: PH, placeholder: true },
    ],
  },
  {
    title: 'Cohérence & revue analytique',
    items: [
      { id: 'revueAnalytiqueNN1', label: 'Revue analytique N/N-1', icon: PH, placeholder: true },
      { id: 'mensuelle', label: 'Revue analytique mensuelle', icon: <CalendarMonthOutlined sx={{ fontSize: 20 }} /> },
      { id: 'nn1', label: 'Contrôle Global', icon: <CompareArrowsOutlined sx={{ fontSize: 20 }} /> },
      { id: 'atypique', label: 'Recherche de montants atypiques', icon: <TrendingUpOutlined sx={{ fontSize: 20 }} />, revisionType: 'ATYPIQUE' },
      { id: 'sensSolde', label: 'Conformité du solde au sens normal des comptes', icon: <RuleOutlined sx={{ fontSize: 20 }} />, revisionType: 'SENS_SOLDE' },
      { id: 'variationAnormale', label: 'Variation anormale par poste (seuil de variation % paramétrable)', icon: PH, placeholder: true },
      { id: 'comptesDisparus', label: 'Comptes disparus / nouveaux entre N-1 et N', icon: PH, placeholder: true },
      { id: 'anClasse67', label: 'Comptes de classe 6 et 7 portant un à-nouveau (anomalie systématique)', icon: PH, placeholder: true },
    ],
  },
  {
    title: 'Contrôles par cycle',
    groups: [
      {
        cycle: 'Capitaux propres',
        items: [
          { id: 'existence', label: 'Existence du compte de capital', icon: <AccountBalanceWalletOutlined sx={{ fontSize: 20 }} />, revisionType: 'EXISTENCE' },
          { id: 'concordanceResultat', label: 'Concordance du résultat (compte 12) avec le résultat de la balance', icon: PH, placeholder: true },
          { id: 'affectationResultat', label: 'Affectation du résultat N-1 (12 → 106 / 110 / 119)', icon: PH, placeholder: true },
        ],
      },
      {
        cycle: 'Immobilisations',
        items: [
          { id: 'immoCharge', label: 'Conformité du seuil de capitalisation des immobilisations', icon: <DomainOutlined sx={{ fontSize: 20 }} />, revisionType: 'IMMO_CHARGE' },
          { id: 'coherenceImmoAmort', label: 'Cohérence immobilisation / amortissement / dotation (2xx ↔ 28xx ↔ 68xx)', icon: PH, placeholder: true },
          { id: 'traitementCessions', label: 'Traitement des cessions (675 / 775, sortie d’actif, plus/moins-value)', icon: PH, placeholder: true },
        ],
      },
      {
        cycle: 'Trésorerie',
        items: [
          { id: 'sequenceCheques', label: 'Séquence des numéros de chèque', icon: PH, placeholder: true },
          { id: 'caisseCreditrice', label: 'Caisse créditrice (solde 53 négatif — impossible physiquement)', icon: <PointOfSaleOutlined sx={{ fontSize: 20 }} /> },
          { id: 'banqueNonPointee', label: 'Écritures de banque non pointées / rapprochement bancaire', icon: PH, placeholder: true },
          { id: 'virementsInternes', label: 'Virements internes (compte 58) non soldés', icon: PH, placeholder: true },
        ],
      },
      {
        cycle: 'Achats / Ventes / Tiers',
        items: [
          { id: 'sensEcriture', label: "Sens d'enregistrement des factures d'achats et de ventes", icon: <SwapVertOutlined sx={{ fontSize: 20 }} />, revisionType: 'SENS_ECRITURE' },
          { id: 'tiers', label: 'Analyse Fournisseurs / Clients', icon: <PeopleAltOutlined sx={{ fontSize: 20 }} /> },
          { id: 'soldesInverses', label: 'Fournisseur débiteur / Client créditeur (soldes inversés)', icon: PH, placeholder: true },
          { id: 'coherenceHtTva', label: 'Cohérence HT / TVA / TTC sur les factures', icon: <RequestQuoteOutlined sx={{ fontSize: 20 }} /> },
          { id: 'balanceAgee', label: 'Balance âgée : antériorité des tiers non lettrés', icon: PH, placeholder: true },
        ],
      },
    ],
  },
  {
    title: 'Fiscal — TVA',
    items: [
      { id: 'utilCptTva', label: 'Utilisation des comptes de TVA', icon: <ReceiptLongOutlined sx={{ fontSize: 20 }} />, revisionType: 'UTIL_CPT_TVA' },
      { id: 'tvaNonDeductible', label: 'TVA non déductible', icon: PH, placeholder: true },
      { id: 'tauxTva', label: 'Contrôle des taux de TVA', icon: <ReceiptLongOutlined sx={{ fontSize: 20 }} /> },
      { id: 'concordanceTva', label: 'Concordance TVA collectée (4457) / base ventes, et TVA déductible (4456) / base achats', icon: PH, placeholder: true },
      { id: 'tvaSansBase', label: 'Compte de TVA mouvementé sans base HT correspondante (et inversement)', icon: PH, placeholder: true },
      { id: 'concordanceCa3', label: 'Concordance comptabilité / déclarations CA3', icon: PH, placeholder: true },
    ],
  },
  {
    title: 'Contrôles analytiques',
    items: [
      { id: 'analytique', label: 'Contrôle des codes analytiques (écritures 6 et 7)', icon: <LabelOutlined sx={{ fontSize: 20 }} /> },
      { id: 'analytiqueHors67', label: 'Écritures analytiques posées sur des comptes hors 6/7', icon: PH, placeholder: true },
      { id: 'concordanceAnalytique', label: 'Concordance totaux analytiques vs comptabilité générale', icon: PH, placeholder: true },
    ],
  },
];

// Aplatit la config pour retrouver un item par son id.
const ALL_CONTROLS = CONTROL_GROUPS.flatMap((g) => [
  ...(g.items || []),
  ...((g.groups || []).flatMap((sg) => sg.items || [])),
]);
const findControl = (id) => ALL_CONTROLS.find((c) => c.id === id);

const DEFAULT_CONTROL = ALL_CONTROLS[0]?.id || 'doublons';

const DetailsControles = () => {
  const { selectedExerciceId, selectedPeriodeId, selectedPeriodeDates, setSelectedExerciceId, setSelectedPeriodeId, listePeriodes, handleChangePeriode: ctxChangePeriode } = useContext(ExercicePeriodeContext);

  // Une période est-elle réellement sélectionnée ? (sinon on vide les contrôles)
  const hasPeriode = !!selectedPeriodeId && selectedPeriodeId !== 'exercice';
  const { auth } = useAuth();
  const axiosPrivate = useAxiosPrivate();
  const decoded = auth?.accessToken ? jwtDecode(auth.accessToken) : undefined;
  const compteName = decoded?.UserInfo?.compte || 'Espace Client';
  const id_compte = parseInt(decoded?.UserInfo?.compteId) || parseInt(sessionStorage.getItem('compteId')) || 1;
  const id_dossier = parseInt(sessionStorage.getItem('fileId')) || 1;
  const [activeControl, setActiveControl] = useState(DEFAULT_CONTROL);
  const loading = useState(false);
  const [globalExporting, setGlobalExporting] = useState(false);
  const [exportAnchorEl, setExportAnchorEl] = useState(null);
  const revueAnalytiqueRef = useRef(null);
  const revueMensuelleRef = useRef(null);
  const analyseTiersRef = useRef(null);
  const rechercheDoublonRef = useRef(null);
  const ecrituresSuspenseRef = useRef(null);
  const controleAnalytiqueRef = useRef(null);
  const atypiqueRef = useRef(null);
  const sensSoldeRef = useRef(null);
  const existenceRef = useRef(null);
  const immoChargeRef = useRef(null);
  const sensEcritureRef = useRef(null);
  const utilCptTvaRef = useRef(null);

  const handleChangeExercice = (exerciceId) => {
    setSelectedExerciceId(exerciceId);
  };

  const handleChangePeriode = (periodeId) => {
    // Utilise le handler du contexte pour aussi renseigner les dates de la période
    if (ctxChangePeriode) ctxChangePeriode(periodeId);
    else setSelectedPeriodeId(periodeId);
  };

  const activeRef = () => {
    switch (activeControl) {
      case 'doublons': return rechercheDoublonRef.current;
      case 'suspense': return ecrituresSuspenseRef.current;
      case 'mensuelle': return revueMensuelleRef.current;
      case 'nn1': return revueAnalytiqueRef.current;
      case 'tiers': return analyseTiersRef.current;
      case 'analytique': return controleAnalytiqueRef.current;
      case 'atypique': return atypiqueRef.current;
      case 'sensSolde': return sensSoldeRef.current;
      case 'existence': return existenceRef.current;
      case 'immoCharge': return immoChargeRef.current;
      case 'sensEcriture': return sensEcritureRef.current;
      case 'utilCptTva': return utilCptTvaRef.current;
      default: return null;
    }
  };

  const handleExportExcel = async () => {
    setExportAnchorEl(null);
    try {
      setGlobalExporting(true);
      await activeRef()?.exportExcel();
    } catch (error) {
      console.error('Erreur export Excel (onglet courant):', error);
    } finally {
      setGlobalExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExportAnchorEl(null);
    try {
      setGlobalExporting(true);
      await activeRef()?.exportPdf();
    } catch (error) {
      console.error('Erreur export PDF (onglet courant):', error);
    } finally {
      setGlobalExporting(false);
    }
  };

  // Export GLOBAL : un seul fichier regroupant TOUS les contrôles
  const downloadBlob = (data, mime, filename) => {
    const blob = new Blob([data], { type: mime });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(link.href);
  };

  const buildGlobalUrl = (format) => {
    let url = `/administration/detailsControles/${id_compte}/${id_dossier}/${selectedExerciceId}/export/global/${format}`;
    if (selectedPeriodeId) url += `?id_periode=${selectedPeriodeId}`;
    return url;
  };

  // Calcule la synthèse des anomalies (identique au dashboard) à joindre en 1re page.
  const getSynthese = async () => {
    try {
      const id_periode = (selectedPeriodeId && selectedPeriodeId !== 'exercice') ? selectedPeriodeId : null;
      return await fetchAnomaliesSynthese(axiosPrivate, {
        id_compte, id_dossier, id_exercice: selectedExerciceId, id_periode,
        periodeDates: selectedPeriodeDates || null,
      });
    } catch (error) {
      console.error('Erreur calcul synthèse anomalies:', error);
      return null;
    }
  };

  const handleExportGlobalExcel = async () => {
    setExportAnchorEl(null);
    if (!selectedExerciceId) return;
    try {
      setGlobalExporting(true);
      const synthese = await getSynthese();
      const response = await axiosPrivate.post(buildGlobalUrl('excel'), { synthese }, { responseType: 'blob' });
      downloadBlob(response.data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `Controles_Globaux_${id_dossier}_${selectedExerciceId}.xlsx`);
    } catch (error) {
      console.error('Erreur export global Excel:', error);
    } finally {
      setGlobalExporting(false);
    }
  };

  const handleExportGlobalPdf = async () => {
    setExportAnchorEl(null);
    if (!selectedExerciceId) return;
    try {
      setGlobalExporting(true);
      const synthese = await getSynthese();
      const response = await axiosPrivate.post(buildGlobalUrl('pdf'), { synthese }, { responseType: 'blob' });
      downloadBlob(response.data, 'application/pdf', `Controles_Globaux_${id_dossier}_${selectedExerciceId}.pdf`);
    } catch (error) {
      console.error('Erreur export global PDF:', error);
    } finally {
      setGlobalExporting(false);
    }
  };

  return (
    <Box sx={{
      p: 3, bgcolor: T.canvas, height: 'calc(100vh - 120px)',
      width: 'calc(100vw - 130px)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>

      {/* --- EN-TÊTE --- */}
      <Box sx={{ mb: 2, flexShrink: 0 }}>
        <Breadcrumbs
          separator={<NavigateNext sx={{ fontSize: 16, color: T.faint }} />}
          sx={{ mb: 1.5, '& .MuiTypography-root, & a': { fontSize: '12.5px', fontWeight: 600 } }}
        >
          <MuiLink component={Link} to={`/tab/dashboard/${id_dossier}`} underline="hover" sx={{ display: 'flex', alignItems: 'center', color: T.muted }}>
            <DashboardOutlined sx={{ mr: 0.5, fontSize: 16 }} /> Dashboard
          </MuiLink>
          <Typography sx={{ color: T.ink, fontWeight: 700 }}>Détails des contrôles</Typography>
        </Breadcrumbs>

        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ width: 38, height: 38, flex: 'none', borderRadius: '11px', display: 'grid', placeItems: 'center', color: T.accent, bgcolor: `${T.accent}14`, '& svg': { fontSize: 20 } }}>
              <FactCheckOutlined />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '18px', fontWeight: 700, color: T.ink, letterSpacing: '.2px', lineHeight: 1.2 }}>
                Détails des contrôles
              </Typography>
              <Typography sx={{ fontSize: '12px', color: T.muted, mt: 0.2 }}>
                Revue analytique, contrôles comptables &amp; anomalies · {compteName}
              </Typography>
            </Box>
          </Stack>

          <ExercicePeriodeSelector
            selectedExerciceId={selectedExerciceId}
            selectedPeriodeId={selectedPeriodeId}
            onExerciceChange={handleChangeExercice}
            onPeriodeChange={handleChangePeriode}
            disabled={loading}
            size="small"
            sx={{ mb: 0, ml: 0, border: `1px solid ${T.line}`, borderRadius: '10px', boxShadow: CARD_SHADOW }}
          />
        </Stack>
      </Box>

      {/* --- ZONE PRINCIPALE : SIDEBAR + CONTENU --- */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', border: `1px solid ${T.line}`, borderRadius: '16px', overflow: 'hidden', bgcolor: T.surface, boxShadow: CARD_SHADOW }}>

        {/* SIDEBAR GAUCHE — liste verticale groupée */}
        <Box sx={{ width: 312, flexShrink: 0, bgcolor: T.surface, borderRight: `1px solid ${T.line}`, py: 1.5, overflowY: 'auto' }}>
          {CONTROL_GROUPS.map((group, gi) => {
            const renderItem = (item, indent = false) => {
              const selected = activeControl === item.id;
              return (
                <Tooltip key={item.id} title={item.label} placement="right" arrow enterDelay={400}>
                  <Box
                    role="button"
                    onClick={() => setActiveControl(item.id)}
                    sx={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      minHeight: 44,
                      pl: indent ? 3.75 : 2.5,
                      pr: 2.5,
                      cursor: 'pointer',
                      color: selected ? T.accent : (item.placeholder ? T.faint : T.muted),
                      bgcolor: selected ? T.accW : 'transparent',
                      fontSize: '13px',
                      fontWeight: 600,
                      transition: 'background-color .15s, color .15s',
                      '&:hover': { bgcolor: selected ? T.accW : T.ledger, color: selected ? T.accent : T.text },
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 3,
                        borderRadius: '0 4px 4px 0',
                        bgcolor: selected ? T.accent : 'transparent',
                      },
                      '& svg': { minWidth: 22, flexShrink: 0 },
                    }}
                  >
                    {item.icon}
                    <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.label}
                    </Box>
                  </Box>
                </Tooltip>
              );
            };

            return (
              <Box key={gi} sx={{ mb: gi < CONTROL_GROUPS.length - 1 ? 1.5 : 0 }}>
                <Typography sx={{
                  px: 2.5, py: 0.75, mb: 0.5,
                  bgcolor: '#EAF4DE', color: '#435844',
                  fontSize: '10.5px', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: 0.6,
                }}>
                  {group.title}
                </Typography>

                {group.items && group.items.map((it) => renderItem(it))}

                {group.groups && group.groups.map((sg, si) => (
                  <Box key={si}>
                    <Stack
                      direction="row" alignItems="center" spacing={0.75}
                      sx={{
                        mt: 0.5, px: 2.5, py: 0.65,
                        bgcolor: T.ledger,
                        borderTop: `1px solid ${T.line}`,
                        borderBottom: `1px solid ${T.line}`,
                      }}
                    >
                      <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: T.faint, flexShrink: 0 }} />
                      <Typography sx={{
                        fontSize: '10px', fontWeight: 700, color: T.muted,
                        textTransform: 'uppercase', letterSpacing: '.5px',
                      }}>
                        {sg.cycle}
                      </Typography>
                    </Stack>
                    {sg.items.map((it) => renderItem(it, true))}
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>

        {/* ZONE DE TABLEAU À DROITE */}
        <Box sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
          bgcolor: T.surface
        }}>
          {/* Header interne (Titre + Filtres + Export) */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${T.ledger}`, flexShrink: 0 }}>
            <Typography sx={{ fontSize: '14px', fontWeight: 700, color: T.ink }}>
              {findControl(activeControl)?.label}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<FilterListOutlined />} sx={{ color: T.muted, textTransform: 'none', fontWeight: 600, fontSize: '13px' }}>Filtres</Button>
              <Button
                size="small"
                startIcon={<FileDownloadOutlined />}
                endIcon={<ArrowDropDown />}
                onClick={(e) => setExportAnchorEl(e.currentTarget)}
                disabled={globalExporting}
                sx={{ color: T.accent, textTransform: 'none', fontWeight: 600, fontSize: '13px' }}
              >
                {globalExporting ? 'Export en cours…' : 'Export'}
              </Button>
              {globalExporting && (
                <CircularProgress size={18} thickness={5} sx={{ color: '#1976d2' }} />
              )}
              <Menu
                anchorEl={exportAnchorEl}
                open={Boolean(exportAnchorEl)}
                onClose={() => setExportAnchorEl(null)}
                PaperProps={{ sx: { mt: 1, borderRadius: '10px', minWidth: 160, boxShadow: '0 8px 24px -12px rgba(16,39,51,.3)' } }}
              >
                <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: '11px', fontWeight: 700, color: T.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Contrôle courant
                </Typography>
                <MenuItem onClick={handleExportExcel} sx={{ gap: 1.5, py: 1, fontSize: '13px' }}>
                  <TableChart sx={{ fontSize: 18, color: T.pos }} /> Export Excel
                </MenuItem>
                <MenuItem onClick={handleExportPdf} sx={{ gap: 1.5, py: 1, fontSize: '13px' }}>
                  <PictureAsPdf sx={{ fontSize: 18, color: T.neg }} /> Export PDF
                </MenuItem>
                <Divider sx={{ my: 0.5 }} />
                <Typography sx={{ px: 2, pt: 0.5, pb: 0.5, fontSize: '11px', fontWeight: 700, color: T.faint, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Tous les contrôles
                </Typography>
                <MenuItem onClick={handleExportGlobalExcel} sx={{ gap: 1.5, py: 1, fontSize: '13px' }}>
                  <TableChart sx={{ fontSize: 18, color: T.pos }} /> Tout exporter (Excel)
                </MenuItem>
                <MenuItem onClick={handleExportGlobalPdf} sx={{ gap: 1.5, py: 1, fontSize: '13px' }}>
                  <PictureAsPdf sx={{ fontSize: 18, color: T.neg }} /> Tout exporter (PDF)
                </MenuItem>
              </Menu>
            </Stack>
          </Stack>

          {/* Conteneur spécifique pour le tableau */}
          <Box sx={{
            flexGrow: 1,
            width: '100%',
            height: '100%',
            position: 'relative',
            minHeight: 0,
            overflow: 'auto'
          }}>
            {activeControl === 'doublons' && (
              <RechercheDoublons
                ref={rechercheDoublonRef}
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'suspense' && (
              <EcrituresSuspense
                ref={ecrituresSuspenseRef}
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'equilibreDC' && (
              <EquilibreDebitCredit
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'caisseCreditrice' && (
              <CaisseCreditrice
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'coherenceHtTva' && (
              <CoherenceHtTva
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'tauxTva' && (
              <TauxTva
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'mensuelle' && (
              <RevueMensuelleTable
                ref={revueMensuelleRef}
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'nn1' && (
              <RevueAnalytiqueTable
                ref={revueAnalytiqueRef}
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'tiers' && (
              <AnalyseTiers
                ref={analyseTiersRef}
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'analytique' && (
              <ControleAnalytique
                ref={controleAnalytiqueRef}
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'atypique' && (
              <GlobalBalance
                ref={atypiqueRef}
                filterType="ATYPIQUE"
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'sensSolde' && (
              <GlobalBalance
                ref={sensSoldeRef}
                filterType="SENS_SOLDE"
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'existence' && (
              <GlobalBalance
                ref={existenceRef}
                filterType="EXISTENCE"
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'immoCharge' && (
              <GlobalBalance
                ref={immoChargeRef}
                filterType="IMMO_CHARGE"
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'sensEcriture' && (
              <GlobalBalance
                ref={sensEcritureRef}
                filterType="SENS_ECRITURE"
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {activeControl === 'utilCptTva' && (
              <GlobalBalance
                ref={utilCptTvaRef}
                filterType="UTIL_CPT_TVA"
                id_exercice={selectedExerciceId}
                id_periode={selectedPeriodeId}
              />
            )}
            {findControl(activeControl)?.placeholder && (
              <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 4 }}>
                <Stack alignItems="center" spacing={1.5} sx={{ maxWidth: 460, textAlign: 'center' }}>
                  <ConstructionOutlined sx={{ fontSize: 48, color: T.faint }} />
                  <Typography sx={{ fontSize: '15px', fontWeight: 700, color: T.muted }}>
                    {findControl(activeControl)?.label}
                  </Typography>
                  <Typography sx={{ fontSize: '13px', color: T.faint }}>
                    Ce contrôle sera bientôt disponible.
                  </Typography>
                </Stack>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default DetailsControles;