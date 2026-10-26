import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Paper, Grid,
  Breadcrumbs, Link, MenuItem, Select, Divider,
  LinearProgress, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Dialog, DialogTitle, DialogContent, IconButton, List,
  Chip, ToggleButton, ToggleButtonGroup
} from '@mui/material';
import {
  NavigateNext, FileUploadOutlined,
  DownloadOutlined, CloudUploadOutlined, ErrorOutline,
  CheckCircleOutline, HistoryOutlined, Close, HomeOutlined, ChevronRight, DashboardOutlined
} from '@mui/icons-material';
import { jwtDecode } from 'jwt-decode';
import { DataGrid, frFR } from '@mui/x-data-grid';

import { format } from 'date-fns';
import { useFormik } from 'formik';
import * as Yup from "yup";
import useAuth from '../../hooks/useAuth';
import usePermission from '../../hooks/usePermission';
import useSSEImport from '../../hooks/useSSEImport';
import useAxiosPrivate from '../../../config/axiosPrivate';
import Papa from 'papaparse';
import axios from '../../../config/axios';
import toast from 'react-hot-toast';
import PopupTestSelectedFile from '../../components/PopupTestSelectedFile';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';

// ─── Système de design (aligné sur le tableau de bord) ───
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
  warn: '#B5791A',
  neg: '#BE3A2F',
  negW: '#F7E7E4',
  accW: '#E2F0F1',
};
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const NUM = { fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"' };
const CARD_SHADOW = '0 1px 2px rgba(16,39,51,.04), 0 8px 24px -16px rgba(16,39,51,.18)';
const panelSx = {
  border: `1px solid ${T.line}`,
  borderRadius: '16px',
  bgcolor: T.surface,
  boxShadow: CARD_SHADOW,
  overflow: 'hidden',
};
const fieldLabelSx = {
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '.4px',
  fontWeight: 600,
  color: T.faint,
  mb: 0.5,
  display: 'block',
};
const selectSx = {
  height: 34,
  fontSize: '13px',
  borderRadius: '8px',
  bgcolor: T.surface,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.line },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#CBD5E1' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.accent },
};
const toggleSx = {
  '& .MuiToggleButtonGroup-grouped': {
    flex: 1,
    textTransform: 'none',
    fontSize: '13px',
    fontWeight: 600,
    color: T.muted,
    borderColor: T.line,
    py: 0.55,
    '&.Mui-selected': { color: '#fff', bgcolor: T.accent, '&:hover': { bgcolor: T.accentDark } },
  },
};

// Bloc d'étape du panneau de pilotage : badge numéroté (✓ si fait) + titre + contenu
const StepBlock = ({ n, title, done, last, children }) => (
  <Box sx={{ px: 2.5, py: 2, borderBottom: last ? 'none' : `1px solid ${T.ledger}` }}>
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.5 }}>
      <Box
        sx={{
          width: 22, height: 22, flex: 'none', borderRadius: '7px', display: 'grid', placeItems: 'center',
          fontSize: '11px', fontWeight: 700, color: done ? '#fff' : T.accent, bgcolor: done ? T.accent : T.accW,
        }}
      >
        {done ? '✓' : n}
      </Box>
      <Typography sx={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, color: T.ink }}>
        {title}
      </Typography>
    </Stack>
    {children}
  </Box>
);

// Option sélectionnable type radio (mode d'import)
const OptionRow = ({ selected, onClick, title, desc }) => (
  <Box
    onClick={onClick}
    sx={{
      px: 1.5, py: 1, borderRadius: '10px', cursor: 'pointer',
      border: `1px solid ${selected ? T.accent : T.line}`,
      bgcolor: selected ? T.accW : T.surface,
      transition: 'all .15s',
      '&:hover': { borderColor: T.accent },
    }}
  >
    <Stack direction="row" alignItems="center" spacing={1}>
      <Box sx={{ width: 16, height: 16, flex: 'none', borderRadius: '50%', border: `2px solid ${selected ? T.accent : '#CBD5E1'}`, display: 'grid', placeItems: 'center' }}>
        {selected && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: T.accent }} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '13px', fontWeight: 600, color: T.ink, lineHeight: 1.2 }}>{title}</Typography>
        <Typography sx={{ fontSize: '11px', color: T.muted }}>{desc}</Typography>
      </Box>
    </Stack>
  </Box>
);

const ImportJournal = () => {
  const [importMode, setImportMode] = useState('update');
  const [exercise, setExercise] = useState('2024');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [openAnomalies, setOpenAnomalies] = useState(false); // État pour la popup

  const headerStyle = {
    fontWeight: 800, color: '#94A3B8', fontSize: '0.65rem',
    textTransform: 'uppercase', letterSpacing: '0.05rem',
    py: 1, borderBottom: '1px solid #E2E8F0', bgcolor: '#FCFDFF'
  };


  const [valSelectCptDispatch, setValSelectCptDispatch] = useState('None');
  const { canAdd, canModify, canDelete, canView } = usePermission();
  const axiosPrivate = useAxiosPrivate();

  const [fileInfos, setFileInfos] = useState('');
  const [fileId, setFileId] = useState(0);
  const { id } = useParams();
  const [noFile, setNoFile] = useState(false);

  const [selectedExerciceId, setSelectedExerciceId] = useState(0);
  const [selectedPeriodeId, setSelectedPeriodeId] = useState(0);
  const [selectedPeriodeChoiceId, setSelectedPeriodeChoiceId] = useState(0);
  const [listeExercice, setListeExercice] = useState([]);
  const [listeSituation, setListeSituation] = useState([]);
  const [openPopupCodejournal, setOpenPopupCodeJournal] = useState(false);

  const [journalData, setJournalData] = useState([]);
  const [planComptable, setPlanComptable] = useState([]);
  const [codeJournal, setCodeJournal] = useState([]);
  const [devises, setDevises] = useState([]);
  const [msgAnomalie, setMsgAnomalie] = useState([]);
  const [couleurBoutonAnomalie, setCouleurBoutonAnomalie] = useState('white');
  const [nbrAnomalie, setNbrAnomalie] = useState(0);
  const [openDetailsAnomalie, setOpenDetailsAnomalie] = useState(false);
  const [fileTypeCSV, setFileTypeCSV] = useState(true);
  const [openDialogConfirmImport, setOpenDialogConfirmImport] = useState(false);
  const [codeJournalToCreate, setCodeJournalToCreate] = useState([]);
  const [compteToCreateGen, setCompteToCreateGen] = useState([]);
  const [compteToCreateAux, setCompteToCreateAux] = useState([]);

  const [traitementJournalWaiting, setTraitementJournalWaiting] = useState(false);
  const [traitementJournalMsg, setTraitementJournalMsg] = useState('');
  const [progressValue, setProgressValue] = useState(0);
  const [longeurCompteStd, setLongeurCompteStd] = useState(0);
  const [activeStep, setActiveStep] = useState(0);
  const [ranCodesCreated, setRanCodesCreated] = useState(false);
  const [ranCodesList, setRanCodesList] = useState([]);
  const [ranCodeInput, setRanCodeInput] = useState('');
  const [nextRanId, setNextRanId] = useState(1);
  const [importLaunched, setImportLaunched] = useState(false);
  const [nbrImported, setNbrImported] = useState(0);
  const [nbrTotalLines, setNbrTotalLines] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  //récupération infos de connexion
  const { auth } = useAuth();
  const decoded = auth?.accessToken ? jwtDecode(auth.accessToken) : undefined;
  const compteId = decoded.UserInfo.compteId || null;
  const userId = decoded.UserInfo.userId || null;
  const compteName = decoded.UserInfo.compte || 'Espace Client';
  const navigate = useNavigate();

  // Hook SSE pour la progression en temps réel
  const { isImporting, progress: sseProgress, message: sseMessage, currentLine, totalLines, startImport } = useSSEImport();

  const anomalies = (Array.isArray(msgAnomalie) ? msgAnomalie : [])
    .filter(Boolean)
    .map((erreur, index) => ({
      ligne: index + 1,
      erreur: String(erreur)
    }));

  // Synchroniser les valeurs SSE avec l'affichage
  useEffect(() => {
    if (isImporting) {
      setProgressValue(sseProgress);
      const displayMessage = currentLine > 0 && totalLines > 0
        ? `${sseMessage} (${currentLine}/${totalLines} lignes)`
        : sseMessage;
      setTraitementJournalMsg(displayMessage);
    }
  }, [isImporting, sseProgress, sseMessage, currentLine, totalLines]);

  useEffect(() => {
    if (openPopupCodejournal) {
      toast.error("Veuillez créer le code journal RAN avant d'importer.");
      setOpenPopupCodeJournal(false);
    }
  }, [openPopupCodejournal]);

  useEffect(() => {
    setUploadProgress(Number(progressValue) || 0);
  }, [progressValue]);

  //récupérer les informations du dossier sélectionné
  useEffect(() => {
    //tester si la page est renvoyer par useNavigate
    const navigationEntries = performance.getEntriesByType('navigation');
    let idFile = 0;

    if (navigationEntries.length > 0) {
      const navigationType = navigationEntries[0].type;
      if (navigationType === 'reload') {
        const idDossier = sessionStorage.getItem("fileId");
        setFileId(idDossier);
        idFile = idDossier;
      } else {
        sessionStorage.setItem('fileId', id);
        setFileId(id);
        idFile = id;
      }
    }

    GetInfosIdDossier(idFile);
    GetListeExercice(idFile);
  }, [id]);

  const GetInfosIdDossier = (id) => {
    axios.get(`/home/FileInfos/${id}`).then((response) => {
      const resData = response.data;

      if (resData.state) {
        setFileInfos(resData.fileInfos[0]);
        setLongeurCompteStd(resData.fileInfos[0]?.longcomptestd);
        setNoFile(false);
      } else {
        setFileInfos([]);
        setNoFile(true);
      }
    })
  }

  const sendToHome = (value) => {
    setNoFile(!value);
    navigate('/home');
  }

  const columnsTable = [
    {
      id: 'EcritureNum',
      label: 'ID',
      minWidth: 50,
      align: 'left',
      isnumber: false
    },
    {
      id: 'datesaisie',
      label: 'Date saisie',
      minWidth: 150,
      align: 'center',
      isnumber: false
    },
    {
      id: 'EcritureDate',
      label: 'Date écriture',
      minWidth: 150,
      align: 'center',
      isnumber: false
    },
    {
      id: 'CompteNum',
      label: 'Compte gen.',
      minWidth: 150,
      align: 'left',
      isnumber: false
    },
    {
      id: 'CompAuxNum',
      label: 'Compte centr.',
      minWidth: 150,
      align: 'left',
      isnumber: false
    },
    {
      id: 'JournalCode',
      label: 'Journal',
      minWidth: 80,
      align: 'left',
      isnumber: false
    },
    {
      id: 'PieceRef',
      label: 'Pièces',
      minWidth: 150,
      align: 'left',
      isnumber: false
    },
    {
      id: 'PieceDate',
      label: 'Pièce date',
      minWidth: 150,
      align: 'center',
      isnumber: false
    },
    {
      id: 'EcritureLib',
      label: 'Libellé gen.',
      minWidth: 380,
      align: 'left',
      isnumber: false
    },
    {
      id: 'Debit',
      label: 'Débit',
      minWidth: 150,
      align: 'right',
      format: (value) => {
        const num = Number(value?.toString().replace(',', '.'));
        return !isNaN(num)
          ? num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '';
      },
      isnumber: true
    },
    {
      id: 'Credit',
      label: 'Crédit',
      minWidth: 150,
      align: 'right',
      format: (value) => {
        const num = Number(value?.toString().replace(',', '.'));
        return !isNaN(num)
          ? num.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '';
      },
      isnumber: true
    },
    {
      id: 'Idevise',
      label: 'Devise',
      minWidth: 70,
      align: 'center',
      isnumber: false
    },
    {
      id: 'EcritureLet',
      label: 'Lettrage',
      minWidth: 90,
      align: 'left',
      isnumber: false
    },
    {
      id: 'DateLet',
      label: 'Date let.',
      minWidth: 100,
      align: 'center',
      isnumber: false
    },
    {
      id: 'ModeRglt',
      label: 'Mode règl.',
      minWidth: 150,
      align: 'left',
      isnumber: false
    },
    {
      id: 'DateRglt',
      label: 'Date règl.',
      minWidth: 120,
      align: 'center',
      isnumber: false
    },
    {
      id: 'Analytique',
      label: 'Analytique',
      minWidth: 150,
      align: 'left',
      isnumber: false
    },
  ];

  //Récupérer la liste des exercices
  const GetListeExercice = (id) => {
    axios.get(`/api/exercices/listeExercice/${id}`).then((response) => {
      const resData = response.data;
      if (resData.state) {

        setListeExercice(resData.list);

        const exerciceNId = resData.list?.filter((item) => item.libelle_rang === "N");
        setListeSituation(exerciceNId);

        // Cible par défaut : l'exercice "N" s'il existe, sinon le premier de la liste
        // (évite un plantage + un id_exercice=0 quand aucun rang "N" n'est renseigné).
        const cible = (exerciceNId && exerciceNId.length > 0) ? exerciceNId[0] : (resData.list && resData.list[0]);
        if (cible) {
          setSelectedExerciceId(cible.id);
          setSelectedPeriodeChoiceId(0);
          setSelectedPeriodeId(cible.id);
        }

      } else {
        setListeExercice([]);
        //toast.error("une erreur est survenue lors de la récupération de la liste des exercices");
        return
      }
    })
  }

  //Récupérer la liste des exercices
  const GetListeSituation = (id) => {
    axios.get(`/api/exercices/listeSituation/${id}`).then((response) => {
      const resData = response.data;
      if (resData.state) {
        const list = resData.list;
        setListeSituation(resData.list);
        if (list.length > 0) {
          setSelectedPeriodeId(list[0].id);
        }
      } else {
        setListeSituation([]);
        //toast.error("une erreur est survenue lors de la récupération de la liste des exercices");
        return
      }
    })
  }

  //Choix exercice
  const handleChangeExercice = (exercice_id) => {
    setSelectedExerciceId(exercice_id);
    setSelectedPeriodeChoiceId("0");
    setListeSituation(listeExercice?.filter((item) => item.id === exercice_id));
    setSelectedPeriodeId(exercice_id);
  }

  //Choix période
  const handleChangePeriode = (choix) => {
    setSelectedPeriodeChoiceId(choix);

    if (choix === 0) {
      setListeSituation(listeExercice?.filter((item) => item.id === selectedExerciceId));
      setSelectedPeriodeId(selectedExerciceId);
    } else if (choix === 1) {
      GetListeSituation(selectedExerciceId);
    }
  }

  //Récupération du plan comptable
  const recupPlanComptable = (fileId, compteId) => {
    axios.post(`/param/comptabilite/pc`, { fileId, compteId }).then((response) => {
      const resData = response.data;
      if (resData.state) {
        const list = Array.isArray(resData.liste) ? resData.liste : [];
        const unique = Object.values(
          list.reduce((acc, r) => {
            const k = String(r.compte || '');
            if (!acc[k]) acc[k] = r;
            return acc;
          }, {})
        );
        setPlanComptable(unique);
      } else {
        toast.error(resData.msg);
      }
    });
  }

  // Récupérer la liste des devises existantes pour le dossier/compte
  const GetListeDevises = (id) => {
    if (!compteId || !id) { setDevises([]); return; }
    axios.get(`/devises/devise/compte/${compteId}/${id}`).then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      setDevises(data);
    }).catch(() => setDevises([]));
  }

  //récupération données liste code journaux
  const GetListeCodeJournaux = (id) => {
    axios.get(`/param/codejournals/liste/${id}`).then((response) => {
      const resData = response.data;
      if (resData.state) {
        setCodeJournal(resData.list);
      } else {
        setCodeJournal([]);
        toast.error(resData.msg);
      }
    });
  }

  useEffect(() => {
    if (fileId && selectedExerciceId && compteId) {
      GetListeCodeJournaux(fileId);
      recupPlanComptable(fileId, compteId);
      GetListeDevises(fileId);
    }
  }, [fileId, selectedExerciceId, compteId]);

  //Valeur du listbox choix Type exercice-----------------------------------------------------
  const handleChangeType = (event) => {
    formikImport.setFieldValue('type', event.target.value);

    if (event.target.value === 'CSV') {
      setFileTypeCSV(true);
    } else {
      setFileTypeCSV(false);
    }
  };

  //Valeur du listbox choix compte à dispatcher----------------------------------------------------
  const handleChangeCptDispatch = (event) => {
    formikImport.setFieldValue('choixImport', event.target.value);
    setValSelectCptDispatch(event.target.value);
  };

  //Formulaire pour l'import du journal
  const formikImport = useFormik({
    initialValues: {
      idCompte: compteId,
      idDossier: fileId,
      idExercice: selectedPeriodeId,
      type: 'CSV',
      choixImport: '',
      journalData: [],
    },
    validationSchema: Yup.object({
      type: Yup.string().required("Veuillez choisir le type de fichier à importer"),
      choixImport: Yup.string().required("Veuillez choisir l'action à faire"),
      compteassocie: Yup.string()
    }),
    onSubmit: (values) => {
      if (!Array.isArray(journalData) || journalData.length === 0) {
        toast.error('Veuillez sélectionner un fichier avant de lancer l\'import');
        return;
      }

      setImportLaunched(true);
      setNbrTotalLines(journalData.length); // Stocker le nombre total de lignes

      setOpenDialogConfirmImport(true);
    },
  });

  //download modele d'import
  const handleDownloadModel = () => {
    const fileUrl = '../../../../../public/modeleImport/modeleImportJournal.csv';
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = 'ModeleImportJournal';
    link.click();
  }

  //validation des entêtes si c'est bon ou pas
  const validateHeaders = (headers) => {

    let expectedHeaders = [];
    const expectedHeadersCSV = ["EcritureNum", "datesaisie", "EcritureDate", "JournalCode", "CompteNum", "CompAuxNum", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "Idevise", "EcritureLet", "DateLet", "ModeRglt", "Analytique"];
    const expectedHeadersFEC = ["EcritureNum", "EcritureDate", "JournalCode", "CompteNum", "CompAuxNum", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "Idevise", "EcritureLet", "DateLet", "Analytique"];

    if (fileTypeCSV) {
      expectedHeaders = expectedHeadersCSV;
    } else {
      expectedHeaders = expectedHeadersFEC;
    }

    // Comparer les en-têtes du CSV aux en-têtes attendus (sauf Analytique qui est optionnelle)
    const requiredHeaders = expectedHeaders.filter(h => h !== 'Analytique');
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    if (missingHeaders.length > 0) {
      toast.error(`Les en-têtes du modèle d'import suivants sont manquants : ${missingHeaders.join(', ')}`);
      return false;
    }
    return true;
  };

  //Test d'existance de code journal ou de compte par rapport aux données dans paramétrage
  const existance = (param, liste) => {
    const missingCode = liste.filter(item => !param.includes(item));
    return missingCode;
  };

  const padCompte = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val).trim();
    if (s === "" || s === "0") return "";
    return s;
  };

  const parseCSVNumber = (value) => {
    if (!value) return 0;

    const cleaned = value.toString()
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.');

    const num = Number(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const pluralizeCompte = (nbr) => {
    if (nbr === 1) {
      return `Ce compte n'existe`;
    }
    if (nbr > 1) {
      return `Ces ${nbr} comptes n'existent`;
    }
  }

  const pluralizeDevise = (nbr) => {
    if (nbr === 1) {
      return `Ce devise n'existe`;
    }
    if (nbr > 1) {
      return `Ces ${nbr} devises n'existent`;
    }
  }

  const pluralizeCodeJournal = (nbr) => {
    if (nbr === 1) {
      return `Ce code journal n'existe`;
    }
    if (nbr > 1) {
      return `Ces ${nbr} codes journaux n'existent`;
    }
  }

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const testIfRanExist = async () => {
    try {
      const response = await axios.post('/traitement/ImportJournal/testIfRanExist', {
        id_dossier: Number(fileId),
        id_compte: Number(compteId)
      });

      const resData = response?.data;

      if (resData?.state) {
        return resData?.exist;
      } else {
        toast.error(resData?.message || "Erreur inconnue");
        return false;
      }
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const getAllCodeRan = async () => {
    try {
      const response = await axios.post('/traitement/ImportJournal/getAllCodeRan', {
        id_dossier: Number(fileId),
        id_compte: Number(compteId)
      });
      const resData = response?.data;
      return resData?.list;
    } catch (error) {
      toast.error(error.message);
    }
  }

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    await processFile(file);
  };

  const processFile = async (file) => {
    if (!file) return;

      const ranExist = await testIfRanExist();
      if (!ranExist) {
        setOpenPopupCodeJournal(true);
        return;
      }
      const codeJournauxRan = await getAllCodeRan();
      Papa.parse(file, {
        complete: (result) => {
          const headers = result.meta.fields;

          if (validateHeaders(headers)) {
            setTraitementJournalMsg('Traitement du journal en cours...');
            setTraitementJournalWaiting(true);
            setProgressValue(0);

            //réinitialiser les compteurs d'anomalies
            const couleurAnom = "#EB5B00";
            let nbrAnom = 0;
            let msg = [];
            setMsgAnomalie([]);
            setCouleurBoutonAnomalie('white');
            setNbrAnomalie(0);

            const normalizeCode = (v) => String(v || '').trim().toUpperCase();

            const listeUniqueCodeJnlInitial = [...new Set(result.data.map(item => normalizeCode(item.JournalCode)))];
            const listeUniqueCodeJnl = listeUniqueCodeJnlInitial.filter(item => item !== '');

            const listeUniqueCompteInitial = [
              ...new Set(
                result.data.flatMap(item => [
                  item.CompteNum,
                  item.CompAuxNum
                ]).filter(Boolean)
              )
            ];

            const listeUniqueCompte = listeUniqueCompteInitial
              .filter(item => item !== '')
              .map(val => String(val).trim())

            let DataWithId = [];
            if (fileTypeCSV) {
              DataWithId = result.data.map((row, index) => ({ ...row, id: index, CompteLib: '', CompAuxLib: '' }));
            } else {
              DataWithId = result.data;
            }

            const activeData = DataWithId.filter(r => {
              return (
                r &&
                (
                  r.EcritureNum ||
                  r.CompteNum ||
                  r.JournalCode ||
                  r.Debit ||
                  r.Credit
                )
              );
            });

            const totalDebit = DataWithId.reduce((acc, item) => acc + parseCSVNumber(item.Debit), 0);
            const totalCredit = DataWithId.reduce((acc, item) => acc + parseCSVNumber(item.Credit), 0);

            const ecart = totalDebit - totalCredit;

            const EPSILON = 0.00001;

            if (Math.abs(ecart) > EPSILON) {
              if (ecart > 0) {
                msg.push(
                  `Le journal n'est pas équilibré : Débit supérieur au Crédit de ${ecart.toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}`
                );
              } else {
                msg.push(
                  `Le journal n'est pas équilibré : Crédit supérieur au Débit de ${Math.abs(ecart).toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}`
                );
              }

              nbrAnom += 1;
              setNbrAnomalie(nbrAnom);
            }

            // const compteNonValideStd = Number(longeurCompteStd) > 0
            //     ? listeUniqueCompte.some((c) => String(c || '').trim() !== '' && String(c || '').trim().length !== Number(longeurCompteStd))
            //     : false;

            // if (compteNonValideStd) {
            //     msg.push('Attention, la longueur des comptes dans le fichier csv est différente de celle des comptes dans le paramétrage CRM du dossier.');
            //     nbrAnom = nbrAnom + 1;
            //     setNbrAnomalie(nbrAnom);
            //     setCouleurBoutonAnomalie(couleurAnom);
            // }

            //stocker en 2 variables les comptes généraux et comptesaux pour la création
            const listeUniqueCompteGenInitial = [
              ...new Set(
                activeData
                  .map(item => item.CompteNum)
                  .filter(val => val && val !== 0)
                  .map(val => String(val).trim())
              )
            ];
            const listeUniqueCompteGen = listeUniqueCompteGenInitial.filter(item => item !== '');

            const listeUniqueCompteAuxInitial = [
              ...new Set(
                activeData
                  .map(item => item.CompAuxNum)
                  .filter(val => val && val !== 0)
                  .map(val => String(val).trim())
              )
            ];
            const listeUniqueCompteAux = listeUniqueCompteAuxInitial.filter(item => item !== '');

            const ListeCodeJnlParams = [...new Set(codeJournal.map(item => normalizeCode(item.code)))];
            const ListeCompteParams = [...new Set(planComptable.map(item => item.compte))];

            const codeJournalNotInParams = existance(ListeCodeJnlParams, listeUniqueCodeJnl);
            // const codeJournalNotInParams = [];
            const compteNotInParams = existance(ListeCompteParams, listeUniqueCompte);
            // const compteNotInParams = [];

            const compteNotInParamsGen = existance(ListeCompteParams, listeUniqueCompteGen);
            const compteNotInParamsAux = existance(ListeCompteParams, listeUniqueCompteAux);

            // Devises: détecter les codes manquants et les vides
            const listeUniqueDevisesInitial = [...new Set(activeData.map(item => (item.Idevise || '').trim()))];
            const listeUniqueDevises = listeUniqueDevisesInitial.filter(item => item !== '');
            const listeDevisesParams = [...new Set((devises || []).map(d => d.code))];
            const devisesNotInParams = existance(listeDevisesParams, listeUniqueDevises);
            // const devisesNotInParams = [];

            const codeJournalNotInParamsFiltered = [...new Set(codeJournalNotInParams.map(val => val))];

            if (codeJournalNotInParamsFiltered.length > 0) {
              msg.push(`${pluralizeCodeJournal(codeJournalNotInParamsFiltered.length)} pas encore dans votre dossier : ${codeJournalNotInParamsFiltered.join(', ')}`);
              nbrAnom = nbrAnom + 1;
              setNbrAnomalie(nbrAnom);
              setCouleurBoutonAnomalie(couleurAnom);

              // Construire { code, libelle } à partir du fichier importé (JournalLib si présent)
              const missingCodeWithLib = codeJournalNotInParamsFiltered.map((code) => {
                const row = activeData.find(r => normalizeCode(r.JournalCode) === code);
                const libelle = row && (row.JournalLib || row.JournalLabel || row.Journal || '')
                  ? (row.JournalLib || row.JournalLabel || row.Journal)
                  : `Journal ${code}`;
                return { code, libelle };
              });
              setCodeJournalToCreate(missingCodeWithLib);
            }

            const compteNotInParamsFiltered = [...new Set(compteNotInParams.map(val => padCompte(val)))];

            if (compteNotInParamsFiltered.length > 0) {
              msg.push(`${pluralizeCompte(compteNotInParamsFiltered.length)} pas encore dans votre dossier : ${compteNotInParamsFiltered.join(', ')}`);

              nbrAnom = nbrAnom + 1;
              setNbrAnomalie(nbrAnom);
              setCouleurBoutonAnomalie(couleurAnom);
            }

            const devisesNotInParamsFiltered = [... new Set(devisesNotInParams.map(val => val))];

            // Anomalies devises manquantes (seront créées automatiquement)
            if (devisesNotInParamsFiltered.length > 0) {
              msg.push(`${pluralizeDevise(devisesNotInParamsFiltered.length)} pas encore dans votre dossier : ${devisesNotInParamsFiltered.join(', ')}`);
              nbrAnom = nbrAnom + 1;
              setNbrAnomalie(nbrAnom);
              setCouleurBoutonAnomalie(couleurAnom);
            }

            setMsgAnomalie(msg);

            // Déterminer la période de l'exercice sélectionné (période active)
            const getExerciseRange = () => {
              const all = [...(listeSituation || []), ...(listeExercice || [])];
              const ex = all.find(e => e.id === selectedPeriodeId) || {};
              const start = ex.datedebut || ex.date_debut || ex.debut || ex.startDate || null;
              const end = ex.datefin || ex.date_fin || ex.fin || ex.endDate || null;
              return { start, end };
            };

            const parseToDate = (str) => {
              if (!str) return null;
              if (typeof str === 'string') str = str.trim();
              let d = null;
              if (typeof str === 'string') {
                if (str.includes('/')) {
                  const [day, month, year] = str.split('/').map(s => s.trim());
                  d = new Date(`${year}-${month}-${day}`);
                } else if (/^\d{8}$/.test(str)) {
                  d = new Date(`${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`);
                } else {
                  d = new Date(str);
                }
              } else {
                d = new Date(str);
              }
              if (isNaN(d.getTime())) return null;
              d.setHours(0, 0, 0, 0);
              return d;
            };

            // Filtrage des lignes hors exercice si au moins une borne est disponible
            const { start, end } = getExerciseRange();
            let finalData = DataWithId;
            const dStart = parseToDate(start);
            const dEnd = parseToDate(end);

            const ranCodesNormalized = Array.isArray(codeJournauxRan)
              ? codeJournauxRan.map((c) => String(c || '').trim().toUpperCase())
              : [];

            const dateDebut = formatDate(start);
            const dateFin = formatDate(end);

            if (dStart || dEnd) {
              const missingDate = activeData.filter(r => {
                const jnl = String(r.JournalCode || '').trim().toUpperCase();
                return !parseToDate(r.EcritureDate) && !ranCodesNormalized.includes(jnl);
              });
              const withDate = activeData.filter(r => !!parseToDate(r.EcritureDate));

              const outOfRange = withDate.filter(r => {
                const d = parseToDate(r.EcritureDate);
                const afterStart = dStart ? (d && d >= dStart) : true;
                const beforeEnd = dEnd ? (d && d <= dEnd) : true;

                const jnl = String(r.JournalCode || '').trim().toUpperCase();
                if (ranCodesNormalized.includes(jnl)) return false;

                return !(afterStart && beforeEnd);
              });

              if (missingDate.length > 0) {
                msg.push("Certaines lignes n'ont pas de date d'écriture valide, elles seront ignorées.");
                nbrAnom = nbrAnom + 1;
                setNbrAnomalie(nbrAnom);
                setCouleurBoutonAnomalie(couleurAnom);
              }
              if (outOfRange.length > 0) {
                msg.push(`Certaines lignes ne seront pas importées car leur date d'écriture n'est pas entre ${dateDebut} et ${dateFin}.`);
                nbrAnom = nbrAnom + 1;
                setNbrAnomalie(nbrAnom);
                setCouleurBoutonAnomalie(couleurAnom);
              }

              finalData = withDate.filter(r => {
                const d = parseToDate(r.EcritureDate);
                const afterStart = dStart ? (d && d >= dStart) : true;
                const beforeEnd = dEnd ? (d && d <= dEnd) : true;

                const jnl = String(r.JournalCode || '').trim().toUpperCase();
                if (ranCodesNormalized.includes(jnl)) return true;

                return afterStart && beforeEnd;
              });
            }

            const finalDataCompteFormatted = finalData.map(item => {
              const date = new Date(start);
              const exerciceStartFormatted = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

              return {
                ...item,
                CompteNum: String(item.CompteNum || '').trim(),
                CompAuxNum: String(item.CompAuxNum || '').trim(),
                exerciceStart: exerciceStartFormatted
              };
            });

            setJournalData(finalDataCompteFormatted);
            formikImport.setFieldValue('journalData', finalDataCompteFormatted);
            setImportLaunched(false);
            setNbrImported(0);
            setNbrTotalLines(0);

            const mapGen = new Map();

            finalDataCompteFormatted.forEach(item => {
              const compteGen = item.CompteNum;
              const compteAux = item.CompAuxNum;

              if (compteNotInParamsGen.includes(compteGen) && !mapGen.has(compteGen)) {
                mapGen.set(compteGen, {
                  CompteNum: compteGen,
                  // CompteLib: item.CompteLib,
                  CompteLib: item.CompteLib || item.EcritureLib || `Compte général ${compteGen}`,
                  CompAuxNum: compteAux
                });
              }
            });

            const cptToCreateGen = [...mapGen.values()];

            const mapAux = new Map();

            DataWithId.forEach(item => {
              const compte = String(item.CompAuxNum || '').trim();

              if (compteNotInParamsAux.includes(compte) && !mapAux.has(compte)) {
                mapAux.set(compte, {
                  CompAuxNum: compte,
                  // CompAuxLib: item.EcritureLib,
                  CompAuxLib: item.EcritureLib || item.CompteLib || `Compte auxiliaire ${compte}`,
                  CompteNum: String(item.CompteNum || '').trim() || ''
                });
              }
            });

            const cptToCreateAux = [...mapAux.values()];

            setCompteToCreateGen(cptToCreateGen);
            setCompteToCreateAux(cptToCreateAux);

            setMsgAnomalie(msg);

            event.target.value = null;
            setProgressValue(100);

            setTimeout(() => {
              setTraitementJournalWaiting(false);
              setProgressValue(0);
            }, 800);

            handleOpenAnomalieDetails();
          }
        },
        header: true,
        skipEmptyLines: true,
      });
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const file = event.dataTransfer.files[0];
    await processFile(file);
  };

  //afficher ou non les détails des anomalies de l'import
  const handleOpenAnomalieDetails = () => {
    setOpenDetailsAnomalie(true);
  }

  const handleCloseAnomalieDetails = (value) => {
    setOpenDetailsAnomalie(value);
  }

  //import du journal
  const handleOpenDialogConfirmImport = () => {
    formikImport.setFieldValue("idCompte", compteId);
    formikImport.setFieldValue("idDossier", fileId);
    formikImport.setFieldValue("idExercice", selectedPeriodeId);

    setOpenDialogConfirmImport(true);
  }

  const handleCloseDialogConfirmImport = () => {
    setOpenDialogConfirmImport(false);
  }

  //création des journaux qui n'existe pas encore avant import journal
  const createCodeJournalNotExisting = async () => {
    const response = await axios.post(`/traitement/ImportJournal/createNotExistingCodeJournal`, { compteId, fileId, codeJournalToCreate });
    const resData = response.data;
    return resData.list;
  }

  //création des comptes qui n'existe pas encore avant import journal
  const createCompteNotExisting = async () => {
    const response = await axios.post(`/traitement/ImportJournal/createNotExistingCompte`, { compteId, fileId, compteToCreateGen, compteToCreateAux });
    const resData = response.data;
    const list = Array.isArray(resData.list) ? resData.list : [];
    const unique = Object.values(
      list.reduce((acc, r) => {
        const k = String(r.compte || '');
        if (!acc[k]) acc[k] = r;
        return acc;
      }, {})
    );
    setPlanComptable(unique);
    return unique;
  }

  const handleImportJournal = async (value) => {
    if (value) {
      const UpdatedPlanComptable = await createCompteNotExisting();
      const UpdatedCodeJournal = await createCodeJournalNotExisting();

      if (!Array.isArray(UpdatedCodeJournal)) {
        toast.error("Un problème est survenu lors de la création des codes journaux manquants.");
      }

      if (!Array.isArray(UpdatedPlanComptable)) {
        toast.error("Un problème est survenu lors de la création des comptes manquants.");
      }

      if (Array.isArray(UpdatedCodeJournal) && Array.isArray(UpdatedPlanComptable)) {
        setTraitementJournalMsg('Importation du journal en cours...');
        setTraitementJournalWaiting(true);
        setProgressValue(0);
        // transmettre les bornes de l'exercice sélectionné pour filtrer côté backend
        const allPeriods = [...(listeSituation || []), ...(listeExercice || [])];
        const selectedObj = allPeriods.find(x => x.id === selectedPeriodeId) || {};
        const periodeStart = selectedObj.datedebut || selectedObj.date_debut || selectedObj.debut || selectedObj.startDate || null;
        const periodeEnd = selectedObj.datefin || selectedObj.date_fin || selectedObj.fin || selectedObj.endDate || null;

        // Utiliser SSE pour la progression en temps réel
        startImport(
          '/traitement/ImportJournal/importJournalWithProgress',
          { compteId, userId, fileId, selectedPeriodeId, fileTypeCSV, valSelectCptDispatch, journalData, longeurCompteStd, periodeStart, periodeEnd },
          (eventData) => {
            // Succès
            setTimeout(() => {
              setTraitementJournalMsg('');
              setTraitementJournalWaiting(false);
              setProgressValue(0);
              setNbrImported(eventData.nbrligne ?? eventData.total ?? eventData.current ?? 0);
              toast.success(eventData.message, {
                duration: 15000
              });
              setJournalData([]);
              setNbrAnomalie(0);
              setMsgAnomalie([]);
              setOpenDetailsAnomalie(false);
              recupPlanComptable(fileId, compteId);
            }, 800);
          },
          (error) => {
            // Erreur
            setTraitementJournalMsg('');
            setTraitementJournalWaiting(false);
            setProgressValue(0);
            toast.error(error || "Import non effectué", {
              duration: 15000
            });
          }
        );
      }

      handleCloseDialogConfirmImport();
    } else {
      handleCloseDialogConfirmImport();
    }
  }
  const buttonStyle = {
    minWidth: 120,
    height: 32,
    px: 2,
    textTransform: 'none',
    fontSize: '0.85rem',
    borderRadius: '6px',
    boxShadow: 'none',
    '& .MuiTouchRipple-root': {
      display: 'none',
    },
    '&:focus': {
      outline: 'none',
    },
    '&.Mui-focusVisible': {
      outline: 'none',
      boxShadow: 'none',
    },

    '&:hover': {
      boxShadow: 'none',
      backgroundColor: 'action.hover',
      border: 'none',
    },

    '&.Mui-disabled': {
      opacity: 0.4
    },
  };

  const steps = ['Création du code journal À nouveau', 'Import du fichier', 'Gestion des types'];

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
    // Réinitialiser importLaunched quand on revient à l'étape 1
    if (activeStep === 1) {
      setImportLaunched(false);
      setNbrImported(0);
      setNbrTotalLines(0);
    }
  };

  const handleFinish = () => {
    navigate(`/tab/dashboard/${fileId}`);
  };

  const handleReset = () => {
    setActiveStep(0);
    setRanCodesCreated(false);
    setRanCodesList([]);
    setNextRanId(1);
    setJournalData([]);
    setNbrAnomalie(0);
    setMsgAnomalie([]);
  };

  // Fonctions pour la gestion des codes RAN dans Step 1
  const handleAddRanCode = () => {
    if (!ranCodeInput.trim()) {
      toast.error('Veuillez saisir un code');
      return;
    }

    // Vérifier si le code existe déjà dans la liste
    if (ranCodesList.some(row => row.code.toUpperCase() === ranCodeInput.trim().toUpperCase())) {
      toast.error('Ce code existe déjà dans la liste');
      return;
    }

    const newCode = {
      id: nextRanId,
      code: ranCodeInput.trim().toUpperCase(),
      libelle: 'Report à Nouveau',
      type: 'RAN'
    };
    setRanCodesList([...ranCodesList, newCode]);
    setNextRanId(nextRanId + 1);
    setRanCodeInput(''); // Réinitialiser le champ
  };

  const handleDeleteRanCode = (id) => {
    setRanCodesList(ranCodesList.filter((row) => row.id !== id));
  };

  const handleSaveRanCodes = async () => {
    // Debug: vérifier les valeurs     
    if (!compteId || !fileId) {
      toast.error('Erreur: compteId ou fileId non défini. Veuillez rafraîchir la page.');
      return;
    }

    // Vérifier que tous les codes sont remplis
    const emptyCodes = ranCodesList.filter(row => !row.code || row.code.trim() === '');
    if (emptyCodes.length > 0) {
      toast.error('Veuillez remplir tous les codes journal');
      return;
    }

    // Vérifier si les codes existent déjà dans le dossier (pour un autre type que RAN)
    const existingCodes = codeJournal.map(cj => cj.code.toUpperCase());
    const duplicateWithExisting = ranCodesList.filter(row =>
      existingCodes.includes(row.code.trim().toUpperCase())
    );
    if (duplicateWithExisting.length > 0) {
      toast.error(`Les codes suivants existent déjà : ${duplicateWithExisting.map(r => r.code).join(', ')}`);
      return;
    }

    // Vérifier si un code de type RAN existe déjà dans le dossier
    const existingRanCode = codeJournal.find(cj => cj.type?.toUpperCase() === 'RAN');

    // Créer ou mettre à jour le code RAN
    try {
      const row = ranCodesList[0]; // On ne prend que le premier code (un seul RAN par dossier)

      const codeData = {
        idCompte: Number(compteId),
        idDossier: Number(fileId),
        idCode: existingRanCode ? existingRanCode.id : 0, // ID existant ou 0 pour nouveau
        code: row.code.trim().toUpperCase(),
        libelle: row.libelle || 'Report à Nouveau',
        type: 'RAN',
        compteassocie: ''
      };

      const response = await axiosPrivate.post(`/paramCodeJournaux/codeJournauxAdd`, codeData);

      if (response.data.state) {
        toast.success(existingRanCode
          ? 'Code journal RAN mis à jour avec succès'
          : 'Code journal RAN créé avec succès');
        setRanCodesCreated(true);
        GetListeCodeJournaux(fileId);
        handleNext();
      } else {
        toast.error(response.data.msg || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('[handleSaveRanCodes] error:', error);
      toast.error('Erreur lors de la sauvegarde du code RAN: ' + (error.response?.data?.msg || error.message));
    }
  };

  if (noFile) {
    return <PopupTestSelectedFile confirmationState={sendToHome} />;
  }

  return (
    <Box
      sx={{
        px: 3,
        py: 2.5,
        bgcolor: T.canvas,
        height: 'calc(100vh - 120px)',
        width: 'calc(100vw - 120px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'absolute',
        // left: '72px', // Décale le bloc pour qu'il commence après la sidebar
      }}
    >

      {/* --- EN-TÊTE --- */}
      <Box sx={{ mb: 2.5, flexShrink: 0 }}>
        <Breadcrumbs
          separator={<NavigateNext sx={{ fontSize: 16, color: T.faint }} />}
          sx={{ mb: 1.5, '& .MuiTypography-root, & a': { fontSize: '12.5px', fontWeight: 600 } }}
        >
          <Link underline="hover" onClick={() => navigate(`/tab/dashboard/${fileId}`)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: T.muted }}>
            <DashboardOutlined sx={{ mr: 0.5, fontSize: 16 }} /> Dashboard
          </Link>
          <Typography sx={{ color: T.ink, fontWeight: 700 }}>Import du journal</Typography>
        </Breadcrumbs>

        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 38, height: 38, flex: 'none', borderRadius: '11px', display: 'grid', placeItems: 'center',
                color: T.accent, bgcolor: `${T.accent}14`, '& svg': { fontSize: 20 },
              }}
            >
              <FileUploadOutlined />
            </Box>
            <Box>
              <Typography sx={{ fontSize: '18px', fontWeight: 700, color: T.ink, letterSpacing: '.2px', lineHeight: 1.2 }}>
                Import du journal
              </Typography>
              <Typography sx={{ fontSize: '12px', color: T.muted, mt: 0.2 }}>
                Importez et contrôlez vos écritures avant intégration · {compteName}
              </Typography>
            </Box>
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            spacing={1.25}
            sx={{ ml: { md: 'auto' }, px: 1.75, py: 0.9, borderRadius: '10px', border: `1px solid ${T.line}`, bgcolor: T.surface, boxShadow: CARD_SHADOW }}
          >
            <Typography sx={{ ...fieldLabelSx, mb: 0 }}>Exercice</Typography>
            <Select
              value={selectedExerciceId}
              onChange={(e) => handleChangeExercice(e.target.value)}
              variant="standard"
              disableUnderline
              size="small"
              sx={{ ...NUM, fontSize: '13px', fontWeight: 700, color: T.ink, '& .MuiSelect-select': { py: 0, pr: '20px !important' } }}
            >
              {listeExercice.map((option) => {
                // date-fns format() exige un objet Date : l'API renvoie des chaînes ISO
                // (sinon les dates apparaissaient vides).
                const fmt = (d) => {
                  const x = d ? new Date(d) : null;
                  return x && !isNaN(x.getTime()) ? format(x, "dd/MM/yyyy") : "—";
                };
                return (
                  <MenuItem key={option.id} value={option.id} sx={{ ...NUM, fontSize: '13px' }}>
                    {fmt(option.date_debut)} – {fmt(option.date_fin)}
                  </MenuItem>
                );
              })}
            </Select>
          </Stack>
        </Stack>
      </Box>

      {/* --- ESPACE DE TRAVAIL : pilotage (gauche) + aperçu (droite) --- */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>

        {/* PANNEAU DE PILOTAGE */}
        <Paper
          elevation={0}
          sx={{
            ...panelSx,
            width: { xs: '100%', md: 360 },
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* Étape 1 — Format & mode */}
          <StepBlock n={1} title="Format & mode" done={!!formikImport.values.choixImport}>
            <Typography sx={fieldLabelSx}>Type de fichier</Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={formikImport.values.type}
              onChange={(e, v) => v && handleChangeType({ target: { value: v } })}
              sx={toggleSx}
            >
              <ToggleButton value="CSV">CSV</ToggleButton>
              <ToggleButton value="FEC">FEC</ToggleButton>
            </ToggleButtonGroup>

            <Typography sx={{ ...fieldLabelSx, mt: 2 }}>Mode d'import</Typography>
            <Stack spacing={1}>
              <OptionRow
                selected={formikImport.values.choixImport === 'UPDATE'}
                onClick={() => handleChangeCptDispatch({ target: { value: 'UPDATE' } })}
                title="Importer sans écraser"
                desc="Ajoute aux écritures déjà présentes"
              />
              <OptionRow
                selected={formikImport.values.choixImport === 'ECRASER'}
                onClick={() => handleChangeCptDispatch({ target: { value: 'ECRASER' } })}
                title="Écraser les données"
                desc="Remplace l'existant sur la période"
              />
            </Stack>

            <Button
              startIcon={<DownloadOutlined sx={{ fontSize: 16 }} />}
              disabled={!fileTypeCSV}
              onClick={fileTypeCSV ? handleDownloadModel : undefined}
              sx={{
                mt: 1.5, px: 0, textTransform: 'none', fontWeight: 600, fontSize: '12.5px', color: T.accent,
                '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' },
              }}
            >
              Télécharger le modèle
            </Button>
          </StepBlock>

          {/* Étape 2 — Fichier */}
          <StepBlock n={2} title="Fichier" done={journalData.length > 0}>
            {journalData.length === 0 ? (
              <Box
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("fileInput").click()}
                sx={{
                  p: 2.5, borderRadius: '12px', textAlign: 'center', cursor: 'pointer',
                  border: isDragging ? `2px dashed ${T.accent}` : `1.5px dashed ${T.line}`,
                  bgcolor: isDragging ? T.accW : '#FCFDFD',
                  transition: 'all 0.2s ease',
                  '&:hover': { borderColor: T.accent },
                }}
              >
                <Box sx={{ width: 44, height: 44, mx: 'auto', mb: 1, borderRadius: '12px', display: 'grid', placeItems: 'center', color: T.accent, bgcolor: `${T.accent}14` }}>
                  <CloudUploadOutlined sx={{ fontSize: 24 }} />
                </Box>
                <Typography sx={{ fontSize: '13px', fontWeight: 700, color: T.ink }}>
                  Glissez votre fichier ou <Box component="span" sx={{ color: T.accent }}>parcourez</Box>
                </Typography>
                <Typography sx={{ fontSize: '11px', color: T.muted, mt: 0.3 }}>CSV, FEC (max 10 Mo)</Typography>
              </Box>
            ) : (
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#F1F8F5', border: '1px solid #CDE8DD' }}>
                <CheckCircleOutline sx={{ color: T.pos, fontSize: 22 }} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography sx={{ ...NUM, fontSize: '13px', fontWeight: 700, color: T.ink }}>{journalData.length} lignes chargées</Typography>
                  <Typography sx={{ fontSize: '11px', color: T.muted }}>Prêtes à être contrôlées</Typography>
                </Box>
                <Button
                  size="small"
                  onClick={() => document.getElementById("fileInput").click()}
                  sx={{ textTransform: 'none', fontSize: '12px', fontWeight: 600, color: T.accent, '&:hover': { bgcolor: T.accW } }}
                >
                  Remplacer
                </Button>
              </Stack>
            )}
            <input
              type="file"
              accept={fileTypeCSV ? ".csv" : ".txt"}
              onChange={handleFileSelect}
              style={{ display: "none" }}
              id="fileInput"
            />
          </StepBlock>

          {/* Étape 3 — Contrôles */}
          <StepBlock n={3} title="Contrôles">
            {journalData.length === 0 ? (
              <Typography sx={{ fontSize: '12.5px', color: T.faint }}>En attente d'un fichier…</Typography>
            ) : nbrAnomalie === 0 ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <CheckCircleOutline sx={{ color: T.pos, fontSize: 18 }} />
                <Typography sx={{ fontSize: '12.5px', fontWeight: 600, color: T.pos }}>Aucune anomalie détectée</Typography>
              </Stack>
            ) : (
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <ErrorOutline sx={{ color: T.warn, fontSize: 18 }} />
                  <Typography sx={{ fontSize: '12.5px', fontWeight: 700, color: T.warn }}>
                    {nbrAnomalie} point(s) de vigilance
                  </Typography>
                </Stack>
                <Stack spacing={0.75} sx={{ maxHeight: 220, overflowY: 'auto', pr: 0.5 }}>
                  {anomalies.map((anom, index) => (
                    <Box key={index} sx={{ p: 1, borderRadius: '8px', bgcolor: '#FBF4E6', border: '1px solid #EADFC2' }}>
                      <Typography sx={{ fontSize: '11.5px', color: '#6B5618', lineHeight: 1.4 }}>{anom.erreur}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
          </StepBlock>

          {/* Étape 4 — Import */}
          <StepBlock n={4} title="Import" last>
            {(uploadProgress > 0 || isImporting) && (
              <Box sx={{ mb: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography noWrap sx={{ fontSize: '11px', color: T.muted, mr: 1 }}>{traitementJournalMsg || 'Traitement…'}</Typography>
                  <Typography sx={{ ...NUM, fontSize: '11px', fontWeight: 700, color: T.accent }}>{uploadProgress}%</Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={uploadProgress}
                  sx={{ height: 6, borderRadius: 99, bgcolor: T.ledger, '& .MuiLinearProgress-bar': { bgcolor: T.accent, borderRadius: 99 } }}
                />
              </Box>
            )}
            <Button
              type="button"
              fullWidth
              variant="contained"
              disableElevation
              disabled={journalData.length === 0}
              onClick={formikImport.handleSubmit}
              sx={{
                textTransform: 'none', fontWeight: 700, fontSize: '14px', py: 1, borderRadius: '10px',
                bgcolor: T.accent, '&:hover': { bgcolor: T.accentDark },
                '&.Mui-disabled': { bgcolor: T.ledger, color: T.faint },
              }}
            >
              Lancer l'import
            </Button>
          </StepBlock>
        </Paper>

        {/* APERÇU DES ÉCRITURES */}
        <Paper
          elevation={0}
          sx={{
            ...panelSx,
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: { xs: 320, md: 0 },
          }}
        >
          <Box
            sx={{
              px: 2.5,
              py: 1.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid ${T.ledger}`,
              flexShrink: 0,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.25}>
              <Typography sx={{ fontSize: '13px', fontWeight: 700, color: T.ink }}>
                Aperçu des écritures
              </Typography>
              {journalData.length > 0 && (
                <Box component="span" sx={{ ...NUM, fontFamily: MONO, fontSize: '10px', fontWeight: 600, color: T.accent, bgcolor: T.accW, px: 1, py: '3px', borderRadius: '5px' }}>
                  {journalData.length} lignes
                </Box>
              )}
            </Stack>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {journalData.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ flex: 1, px: 3, textAlign: 'center' }}>
                <Box sx={{ width: 56, height: 56, borderRadius: '16px', display: 'grid', placeItems: 'center', color: T.faint, bgcolor: T.ledger }}>
                  <CloudUploadOutlined sx={{ fontSize: 28 }} />
                </Box>
                <Typography sx={{ fontSize: '14px', fontWeight: 600, color: T.muted }}>Aucune donnée à prévisualiser</Typography>
                <Typography sx={{ fontSize: '12.5px', color: T.faint, maxWidth: 340 }}>
                  Importez un fichier CSV ou FEC depuis le panneau de gauche pour afficher l'aperçu des écritures avant intégration.
                </Typography>
              </Stack>
            ) : (
              <DataGrid
                rows={journalData}
                columns={columnsTable.map(col => ({
                  field: col.id,
                  headerName: col.label,
                  width: col.minWidth,
                  align: col.align,
                  headerAlign: col.align,
                  valueFormatter: col.format
                    ? (params) => col.format(params.value)
                    : undefined
                }))}
                getRowId={(row) =>
                  row.id || row.EcritureNum || row.RefInterne || Math.random().toString(36).substr(2, 9)
                }
                density="compact"
                disableColumnMenu
                sx={{
                  border: 'none',
                  fontSize: '12.5px',
                  height: '100%',
                  ...NUM,
                  '& .MuiDataGrid-columnHeaders': {
                    bgcolor: T.ledger,
                    borderBottom: `1px solid ${T.line}`,
                  },
                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontWeight: 700,
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '.3px',
                    color: T.muted,
                  },
                  '& .MuiDataGrid-cell': { borderColor: '#F1F4F6', color: T.text },
                  '& .MuiDataGrid-row': {
                    height: '38px !important',
                    minHeight: '38px !important',
                    maxHeight: '38px !important',
                  },
                  '& .MuiDataGrid-row:hover': { bgcolor: '#FAFBFB' },
                  '& .MuiDataGrid-footerContainer': { borderTop: `1px solid ${T.ledger}` },
                }}
              />
            )}
          </Box>
        </Paper>
      </Box>

      {/* --- POPUP DE CONFIRMATION D'IMPORT --- */}
      <ConfirmActionDialog
        open={openDialogConfirmImport}
        onClose={() => handleCloseDialogConfirmImport()}
        onConfirm={() => handleImportJournal(true)}
        title="Confirmer l'import"
        message="Voulez-vous vraiment importer le journal en cours ?"
        confirmText="Importer"
        cancelText="Annuler"
        color={T.accent}
      />

    </Box>
  );
};

export default ImportJournal;