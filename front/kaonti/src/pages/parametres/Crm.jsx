import { useState, useEffect, useCallback, useRef } from 'react';

import {
  Box, Typography, Stack, Button, IconButton, Paper, Grid,
  TextField, Chip, Breadcrumbs, Link, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItemButton, ListItemText, ListItemIcon, Select,
  Autocomplete, Checkbox, FormControlLabel,

} from '@mui/material';
import {
  SettingsOutlined, NavigateNext, BusinessOutlined,
  AddOutlined, EditOutlined, DeleteOutline, SaveOutlined,
  AnalyticsOutlined, MenuBookOutlined, AccountTreeOutlined,
  ListAltOutlined, AdminPanelSettingsOutlined, CheckOutlined, CloseOutlined,
  DashboardOutlined, PercentOutlined, AccountBalanceOutlined, SellOutlined,

} from '@mui/icons-material';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { useSearchParams, useParams, useNavigate } from "react-router-dom";
import {
  DataGrid,
  GridRowModes,
  GridActionsCellItem,
  GridRowEditStopReasons,
  GridToolbar
} from '@mui/x-data-grid';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import useAxiosPrivate from '../../../config/axiosPrivate';
import useAuth from '../../hooks/useAuth';
import usePermission from '../../hooks/usePermission';
import { jwtDecode } from 'jwt-decode';
import toast from 'react-hot-toast';
import axios from '../../../config/axios';
import ConfirmDeleteDialog from '../../components/ConfirmDeleteDialog';
import PopupTestSelectedFile from '../../components/PopupTestSelectedFile';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
import PopupImportCodeJournaux from '../../components/PopupImportCodeJournaux';

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
  warn: '#B5791A',
  neg: '#BE3A2F',
  accW: '#E2F0F1',
};
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const CARD_SHADOW = '0 1px 2px rgba(16,39,51,.04), 0 8px 24px -16px rgba(16,39,51,.18)';
const panelSx = {
  border: `1px solid ${T.line}`,
  borderRadius: '16px',
  bgcolor: T.surface,
  boxShadow: CARD_SHADOW,
  overflow: 'hidden',
};
const sectionTitleSx = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  color: T.ink,
};
// Bouton d'action principal (pétrole)
const primaryBtnSx = {
  bgcolor: T.accent,
  color: '#fff',
  textTransform: 'none',
  fontWeight: 600,
  fontSize: '13px',
  borderRadius: '8px',
  boxShadow: 'none',
  '&:hover': { bgcolor: T.accentDark },
  '&.Mui-disabled': { bgcolor: T.ledger, color: T.faint },
};

// Composant DataGrid pour Codes Journaux
const CodesJournauxDataGrid = ({ fileId, compteId, axiosPrivate, pc }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rowModesModel, setRowModesModel] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);
  const [openImportDialog, setOpenImportDialog] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);

  const typeOptions = [
    { value: 'ACHAT', label: 'ACHAT' },
    { value: 'BANQUE', label: 'BANQUE' },
    { value: 'CAISSE', label: 'CAISSE' },
    { value: 'OD', label: 'OD' },
    { value: 'RAN', label: 'RAN' },
    { value: 'VENTE', label: 'VENTE' },
  ];

  // Liste des comptes pour BANQUE/CAISSE
  const [listeCptBanque, setListeCptBanque] = useState([]);
  const [listeCptCaisse, setListeCptCaisse] = useState([]);

  useEffect(() => {
    if (pc && pc.length > 0) {
      setListeCptBanque(pc.filter((row) => row.compte?.startsWith('512') || row.compte?.startsWith('52')));
      setListeCptCaisse(pc.filter((row) => row.compte?.startsWith('53')));
    }
  }, [pc]);

  const fetchCodeJournaux = () => {
    if (!fileId) return;
    setLoading(true);
    axiosPrivate.get(`/param/codejournals/liste/${fileId}`)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          setRows(resData.list || []);
        } else {
          toast.error(resData.msg || 'Erreur lors du chargement');
        }
      })
      .catch(() => toast.error('Erreur lors du chargement des codes journaux'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCodeJournaux();
  }, [fileId]);

  const handleRowEditStop = (params, event) => {
    if (params.reason === GridRowEditStopReasons.rowFocusOut) {
      event.defaultMuiPrevented = true;
    }
  };

  const handleEditClick = (id) => () => {
    setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
  };

  const handleSaveClick = (id) => () => {
    setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
  };

  const handleDeleteClick = (id) => () => {
    setRowToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    const row = rows.find((r) => r.id === rowToDelete);
    if (!row) return;

    axiosPrivate.post('/param/codejournals/delete', {
      fileId,
      compteId,
      idToDelete: rowToDelete
    })
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || "Supprimé avec succès");
          setRows(rows.filter((r) => r.id !== rowToDelete));
        } else {
          toast.error(resData.msg || "Erreur lors de la suppression");
        }
      })
      .catch(() => toast.error('Erreur lors de la suppression'))
      .finally(() => {
        setDeleteDialogOpen(false);
        setRowToDelete(null);
      });
  };

  const handleCancelClick = (id) => () => {
    setRowModesModel({
      ...rowModesModel,
      [id]: { mode: GridRowModes.View, ignoreModifications: true },
    });
    const editedRow = rows.find((row) => row.id === id);
    if (editedRow && editedRow.isNew) {
      setRows(rows.filter((row) => row.id !== id));
    }
  };

  const processRowUpdate = (newRow) => {
    const { id, isNew, ...data } = newRow;

    const payload = {
      idCompte: compteId,
      idDossier: fileId,
      idCode: isNew ? 0 : id,
      code: data.code,
      libelle: data.libelle,
      type: data.type,
      compteassocie: data.compteassocie || ''
    };

    return axiosPrivate.post('/param/codejournals/add', payload)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || "Sauvegardé avec succès");
          // Si c'est une nouvelle ligne, mettre à jour l'ID avec l'ID réel du backend
          const updatedRow = isNew
            ? { ...newRow, isNew: false, id: resData.id }
            : { ...newRow, isNew: false };
          setRows(rows.map((row) => (row.id === newRow.id ? updatedRow : row)));
          return updatedRow;
        } else {
          toast.error(resData.msg || "Erreur lors de la sauvegarde");
          throw new Error(resData.msg);
        }
      })
      .catch((error) => {
        toast.error('Erreur lors de la sauvegarde');
        throw error;
      });
  };

  const handleAddNewRow = () => {
    const newId = Date.now(); // ID temporaire
    const newRow = {
      id: newId,
      code: '',
      libelle: '',
      type: '',
      compteassocie: '',
      id_compte: compteId,
      id_dossier: fileId,
      isNew: true,
    };
    setRows([newRow, ...rows]);
    setRowModesModel({ ...rowModesModel, [newId]: { mode: GridRowModes.Edit } });
  };

  const getTypeColor = (type) => {
    const colors = {
      'BANQUE': '#0369A1',
      'CAISSE': '#10B981',
      'ACHAT': '#3B82F6',
      'VENTE': '#10B981',
      'OD': '#64748B',
      'RAN': '#FFA62F'
    };
    return colors[type] || '#64748B';
  };

  const columns = [
    {
      field: 'selection',
      headerName: '',
      width: 50,
      type: 'checkbox',
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
    },
    {
      field: 'code',
      headerName: 'Code',
      width: 120,
      editable: true,
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => (
        <Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'libelle',
      headerName: 'Libellé',
      flex: 1,
      editable: true,
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => (
        <Typography sx={{ fontSize: '13px', color: '#475569' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 130,
      editable: true,
      type: 'singleSelect',
      valueOptions: typeOptions.map(t => t.value),
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => {
        const color = getTypeColor(params.value);
        return (
          <Chip
            label={params.value}
            size="small"
            sx={{
              bgcolor: color,
              color: '#fff',
              fontWeight: 800,
              fontSize: '10px',
              borderRadius: '6px',
              height: '22px',
              minWidth: '60px'
            }}
          />
        );
      },
    },
    {
      field: 'compteassocie',
      headerName: 'Compte Associé',
      width: 160,
      editable: true,
      type: 'singleSelect',
      valueOptions: (params) => {
        const rowType = params.row?.type;
        if (rowType === 'BANQUE') return listeCptBanque.map(c => c.compte);
        if (rowType === 'CAISSE') return listeCptCaisse.map(c => c.compte);
        return [];
      },
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => (
        <Typography sx={{ fontSize: '13px', color: '#475569', fontFamily: 'monospace' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 100,
      cellClassName: 'actions',
      getActions: ({ id }) => {
        const isInEditMode = rowModesModel[id]?.mode === GridRowModes.Edit;

        if (isInEditMode) {
          return [
            <GridActionsCellItem
              icon={<CheckOutlined sx={{ color: '#10B981' }} />}
              label="Save"
              onClick={handleSaveClick(id)}
              sx={{ bgcolor: '#e6fff5ff', mr: 1 }}
            />,
            <GridActionsCellItem
              icon={<CloseOutlined sx={{ color: '#EF4444' }} />}
              label="Cancel"
              onClick={handleCancelClick(id)}
              sx={{ bgcolor: '#FEF2F2' }}
            />,
          ];
        }

        return [
          <GridActionsCellItem
            icon={<EditOutlined sx={{ color: T.accent }} />}
            label="Edit"
            onClick={handleEditClick(id)}
            sx={{ bgcolor: '#EEF2FF', mr: 1 }}
          />,
          <GridActionsCellItem
            icon={<DeleteOutline sx={{ color: '#EF4444' }} />}
            label="Delete"
            onClick={handleDeleteClick(id)}
            sx={{ bgcolor: '#FEF2F2' }}
          />,
        ];
      },
    },
  ];

  return (
    <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2.5, bgcolor: '#FFF', flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>REGISTRE DES JOURNAUX</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            onClick={handleAddNewRow}
            startIcon={<AddOutlined sx={{ color: '#10B981' }} />}
            sx={{
              bgcolor: T.accent,
              color: '#FFF',
              textTransform: 'none',
              borderRadius: '8px',

              '&:hover': {
                bgcolor: T.accent
              }
            }}
          >
            Nouveau Journal
          </Button>
          <Button
            onClick={() => setOpenImportDialog(true)}
            startIcon={<FileUploadIcon sx={{ color: '#3B82F6' }} />}
            sx={{ bgcolor: '#EFF6FF', color: '#3B82F6', textTransform: 'none', px: 2, borderRadius: '8px', fontWeight: 700 }}
          >
            Importer
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0', flex: 1, minHeight: 0, mr: 2, ml: 2, display: 'flex', flexDirection: 'column', mt: -1 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          editMode="row"
          rowModesModel={rowModesModel}
          onRowModesModelChange={setRowModesModel}
          onRowEditStop={handleRowEditStop}
          processRowUpdate={processRowUpdate}
          checkboxSelection
          disableRowSelectionOnClick
          density="compact"
          // hideFooterPagination={rows.length <= 10}

          // Toolbar avec recherche rapide
          slots={{
            toolbar: GridToolbar,
          }}
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: {
                debounceMs: 500,
                placeholder: "Rechercher ...",
              },
            },
          }}

          // 🔥 sélection contrôlée (1 seule ligne)
          rowSelectionModel={selectedRow ? [selectedRow.id] : []}

          onRowSelectionModelChange={(ids) => {
            const selectedId = ids.at(-1);

            if (!selectedId) {
              setSelectedRow(null);
              return;
            }

            const row = rows.find((r) => r.id === selectedId);
            setSelectedRow(row || null);
          }}

          sx={{
            border: 'none',
            flex: 1,
            minHeight: 0,

            '& .MuiDataGrid-columnHeaders': {
              bgcolor: T.ledger,
              borderBottom: `1px solid ${T.line}`,

              '& .MuiDataGrid-columnHeaderTitle': {
                fontSize: '0.7rem',
                fontWeight: 800,
                color: '#64748B',
                textTransform: 'uppercase',
              }
            },

            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid #F1F5F9',
              '&:focus': { outline: 'none' }
            },

            '& .MuiDataGrid-row:hover': {
              bgcolor: '#F1F5F930'
            }
          }}
        />
      </Paper>
      {/* Dialog Confirmation Suppression */}
      <ConfirmDeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Confirmer la suppression"
        message="Êtes-vous sûr de vouloir supprimer ce code journal ? Cette action est irréversible."
      />
      <PopupImportCodeJournaux
        open={openImportDialog}
        onClose={() => setOpenImportDialog(false)}
        fileId={fileId}
        compteId={compteId}
        onImportSuccess={fetchCodeJournaux}
      />
    </Paper>
  );
};

// Composant DataGrid pour Analytique (Axes et Sections)
const AnalytiqueDataGrid = ({ fileId, compteId, axiosPrivate }) => {
  const [axes, setAxes] = useState([]);
  const [sections, setSections] = useState([]);
  const [selectedAxe, setSelectedAxe] = useState(null);é
  const [loadingAxes, setLoadingAxes] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);
  const [axeRowModesModel, setAxeRowModesModel] = useState({});
  const [sectionRowModesModel, setSectionRowModesModel] = useState({});
  const [deleteAxeDialogOpen, setDeleteAxeDialogOpen] = useState(false);
  const [deleteSectionDialogOpen, setDeleteSectionDialogOpen] = useState(false);
  const [axeToDelete, setAxeToDelete] = useState(null);
  const [sectionToDelete, setSectionToDelete] = useState(null);
  const [selectedSection, setSelectedSection] = useState(null);

  // Charger les axes
  const fetchAxes = () => {
    if (!fileId || !compteId) {
      return;
    }
    setLoadingAxes(true);
    axiosPrivate.get(`/param/analytique/axes/${compteId}/${fileId}`)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          setAxes(resData.data || []);
        } else {
          toast.error(resData.msg || 'Erreur lors du chargement des axes');
        }
      })
      .catch(() => toast.error('Erreur lors du chargement des axes'))
      .finally(() => setLoadingAxes(false));
  };

  const fetchSections = (axeId) => {
    console.log('fetchSections called with fileId:', fileId, 'compteId:', compteId, 'axeId:', axeId);
    if (!fileId || !compteId || !axeId) {
      console.log('fetchSections aborted - missing fileId, compteId or axeId');
      return;
    }
    setLoadingSections(true);
    axiosPrivate.post(`/param/analytique/sections/${compteId}/${fileId}`, { selectedRowAxeId: axeId })
      .then((response) => {
        console.log('fetchSections response:', response.data);
        const resData = response.data;
        if (resData.state) {
          console.log('Sections received:', resData.data);
          setSections(resData.data || []);
        } else {
          setSections([]);
        }
      })
      .catch(() => setSections([]))
      .finally(() => setLoadingSections(false));
  };

  // useEffect(() => {
  //   console.log('AnalytiqueDataGrid mounted, fetching axes...');
  //   fetchAxes();
  // }, []);

  useEffect(() => {
    console.log('fileId or compteId changed:', { fileId, compteId });
    fetchAxes();
  }, [fileId, compteId]);

  useEffect(() => {
    if (selectedAxe) {
      fetchSections(selectedAxe.id);
    } else {
      setSections([]);
    }
  }, [selectedAxe]);

  const handleAxeEditClick = (id) => () => {
    setAxeRowModesModel({ ...axeRowModesModel, [id]: { mode: GridRowModes.Edit } });
  };

  const handleAxeSaveClick = (id) => () => {
    setAxeRowModesModel({ ...axeRowModesModel, [id]: { mode: GridRowModes.View } });
  };

  const handleAxeDeleteClick = (id) => () => {
    setAxeToDelete(id);
    setDeleteAxeDialogOpen(true);
  };

  const handleConfirmDeleteAxe = () => {
    axiosPrivate.post('/param/analytique/axes/delete', {
      fileId,
      compteId,
      idToDelete: axeToDelete
    })
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || "Axe supprimé avec succès");
          setAxes(axes.filter((r) => r.id !== axeToDelete));
          if (selectedAxe?.id === axeToDelete) setSelectedAxe(null);
        } else {
          toast.error(resData.msg || "Erreur lors de la suppression");
        }
      })
      .catch(() => toast.error('Erreur lors de la suppression'))
      .finally(() => {
        setDeleteAxeDialogOpen(false);
        setAxeToDelete(null);
      });
  };

  const handleAxeCancelClick = (id) => () => {
    setAxeRowModesModel({ ...axeRowModesModel, [id]: { mode: GridRowModes.View, ignoreModifications: true } });
    const editedRow = axes.find((row) => row.id === id);
    if (editedRow && editedRow.isNew) {
      setAxes(axes.filter((row) => row.id !== id));
    }
  };

  const processAxeRowUpdate = (newRow) => {
    const { id, isNew, ...data } = newRow;
    const payload = {
      compteId: compteId,
      fileId: fileId,
      id: isNew ? 0 : id,
      code: data.code,
      libelle: data.libelle
    };

    return axiosPrivate.post('/param/analytique/axes/addOrUpdate', payload)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || "Axe sauvegardé avec succès");
          const updatedRow = isNew
            ? { ...newRow, isNew: false, id: resData.id }
            : { ...newRow, isNew: false };
          setAxes(axes.map((row) => (row.id === newRow.id ? updatedRow : row)));
          return updatedRow;
        } else {
          toast.error(resData.msg || "Erreur lors de la sauvegarde");
          throw new Error(resData.msg);
        }
      })
      .catch((error) => {
        toast.error('Erreur lors de la sauvegarde');
        throw error;
      });
  };

  const handleAddNewAxe = () => {
    const newId = Date.now();
    const newRow = { id: newId, code: '', libelle: '', id_compte: compteId, id_dossier: fileId, isNew: true };
    setAxes([newRow, ...axes]);
    setAxeRowModesModel({ ...axeRowModesModel, [newId]: { mode: GridRowModes.Edit } });
  };

  const handleSectionEditClick = (id) => () => {
    setSectionRowModesModel({ ...sectionRowModesModel, [id]: { mode: GridRowModes.Edit } });
  };

  const handleSectionSaveClick = (id) => () => {
    setSectionRowModesModel({ ...sectionRowModesModel, [id]: { mode: GridRowModes.View } });
  };

  const handleSectionDeleteClick = (id) => () => {
    setSectionToDelete(id);
    setDeleteSectionDialogOpen(true);
  };

  const handleConfirmDeleteSection = () => {
    axiosPrivate.post('/param/analytique/sections/delete', {
      fileId,
      compteId,
      idToDelete: sectionToDelete
    })
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || "Section supprimée avec succès");
          setSections(sections.filter((r) => r.id !== sectionToDelete));
        } else {
          toast.error(resData.msg || "Erreur lors de la suppression");
        }
      })
      .catch(() => toast.error('Erreur lors de la suppression'))
      .finally(() => {
        setDeleteSectionDialogOpen(false);
        setSectionToDelete(null);
      });
  };

  const handleSectionCancelClick = (id) => () => {
    setSectionRowModesModel({ ...sectionRowModesModel, [id]: { mode: GridRowModes.View, ignoreModifications: true } });
    const editedRow = sections.find((row) => row.id === id);
    if (editedRow && editedRow.isNew) {
      setSections(sections.filter((row) => row.id !== id));
    }
  };

  const processSectionRowUpdate = (newRow) => {
    const { id, isNew, ...data } = newRow;
    const payload = {
      id: isNew ? 0 : id,
      compteId: compteId,
      fileId: fileId,
      axeId: selectedAxe.id,
      section: data.section,
      intitule: data.intitule,
      compte: '',
      fermer: false,
      par_defaut: false
    };

    return axiosPrivate.post('/param/analytique/sections/addOrUpdate', payload)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || "Section sauvegardée avec succès");
          const updatedRow = isNew
            ? { ...newRow, isNew: false, id: resData.id }
            : { ...newRow, isNew: false };
          setSections(sections.map((row) => (row.id === newRow.id ? updatedRow : row)));
          return updatedRow;
        } else {
          toast.error(resData.msg || "Erreur lors de la sauvegarde");
          throw new Error(resData.msg);
        }
      })
      .catch((error) => {
        toast.error('Erreur lors de la sauvegarde');
        throw error;
      });
  };

  const handleAddNewSection = () => {
    if (!selectedAxe) {
      toast.error("Veuillez sélectionner un axe d'abord");
      return;
    }
    const newId = Date.now();
    const newRow = { id: newId, section: '', intitule: '', id_axe: selectedAxe.id, isNew: true };
    setSections([newRow, ...sections]);
    setSectionRowModesModel({ ...sectionRowModesModel, [newId]: { mode: GridRowModes.Edit } });
  };

  const axeColumns = [
    {
      field: 'code', headerName: 'Code Axe', width: 150, editable: true,
      renderCell: (params) => (<Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{params.value}</Typography>)
    },
    {
      field: 'libelle', headerName: 'Libellé', flex: 1, editable: true,
      renderCell: (params) => (<Typography sx={{ fontSize: '13px', color: '#475569' }}>{params.value}</Typography>)
    },
    {
      field: 'actions', type: 'actions', headerName: 'Actions', width: 100,
      getActions: ({ id }) => {
        const isInEditMode = axeRowModesModel[id]?.mode === GridRowModes.Edit;
        if (isInEditMode) {
          return [
            <GridActionsCellItem icon={<CheckOutlined sx={{ color: '#10B981' }} />} label="Save" onClick={handleAxeSaveClick(id)} sx={{ bgcolor: '#e6fff5ff', mr: 1 }} />,
            <GridActionsCellItem icon={<CloseOutlined sx={{ color: '#EF4444' }} />} label="Cancel" onClick={handleAxeCancelClick(id)} sx={{ bgcolor: '#FEF2F2' }} />,
          ];
        }
        return [
          <GridActionsCellItem icon={<EditOutlined sx={{ color: T.accent }} />} label="Edit" onClick={handleAxeEditClick(id)} sx={{ bgcolor: '#EEF2FF', mr: 1 }} />,
          <GridActionsCellItem icon={<DeleteOutline sx={{ color: '#EF4444' }} />} label="Delete" onClick={handleAxeDeleteClick(id)} sx={{ bgcolor: '#FEF2F2' }} />,
        ];
      },
    },
  ];

  const sectionColumns = [
    {
      field: 'section', headerName: 'Code Section', width: 150, editable: true,
      renderCell: (params) => (<Typography sx={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>{params.value}</Typography>)
    },
    {
      field: 'intitule', headerName: 'Libellé', flex: 1, editable: true,
      renderCell: (params) => (<Typography sx={{ fontSize: '13px', color: '#475569' }}>{params.value}</Typography>)
    },
    {
      field: 'actions', type: 'actions', headerName: 'Actions', width: 100,
      getActions: ({ id }) => {
        const isInEditMode = sectionRowModesModel[id]?.mode === GridRowModes.Edit;
        if (isInEditMode) {
          return [
            <GridActionsCellItem icon={<CheckOutlined sx={{ color: '#10B981' }} />} label="Save" onClick={handleSectionSaveClick(id)} sx={{ bgcolor: '#e6fff5ff', mr: 1 }} />,
            <GridActionsCellItem icon={<CloseOutlined sx={{ color: '#EF4444' }} />} label="Cancel" onClick={handleSectionCancelClick(id)} sx={{ bgcolor: '#FEF2F2' }} />,
          ];
        }
        return [
          <GridActionsCellItem icon={<EditOutlined sx={{ color: T.accent }} />} label="Edit" onClick={handleSectionEditClick(id)} sx={{ bgcolor: '#EEF2FF', mr: 1 }} />,
          <GridActionsCellItem icon={<DeleteOutline sx={{ color: '#EF4444' }} />} label="Delete" onClick={handleSectionDeleteClick(id)} sx={{ bgcolor: '#FEF2F2' }} />,
        ];
      },
    },
  ];

  return (
    <Grid container spacing={3} sx={{ flex: 1, minHeight: 0, height: '100%' }}>
      {/* AXES */}
      <Grid item xs={12} md={5} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
        <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2.5, bgcolor: '#FFF', flexShrink: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>AXES</Typography>
            <Button onClick={handleAddNewAxe} startIcon={<AddOutlined sx={{ color: '#10B981' }} />} sx={{
              bgcolor: T.accent,
              color: '#FFF',
              textTransform: 'none',
              borderRadius: '8px',

              '&:hover': {
                bgcolor: T.accent
              }
            }}>Ajouter</Button>
          </Stack>
          <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0', flex: 1, minHeight: 0, mr: 2, ml: 2, display: 'flex', flexDirection: 'column', mt: -1 }}>
            <DataGrid
              rows={axes}
              columns={axeColumns}
              loading={loadingAxes}
              editMode="row"
              rowModesModel={axeRowModesModel}
              onRowModesModelChange={setAxeRowModesModel}
              processRowUpdate={processAxeRowUpdate}
              checkboxSelection
              disableRowSelectionOnClick
              getRowId={(row) => row.id}
              density="compact"

              // Sélection contrôlée (une seule ligne)
              rowSelectionModel={selectedAxe ? [selectedAxe.id] : []}

              onRowSelectionModelChange={(ids) => {
                const selectedId = ids.at(-1);

                if (!selectedId) {
                  setSelectedAxe(null);
                  return;
                }

                const selectedRow = axes.find((row) => row.id === selectedId);

                setSelectedAxe(selectedRow || null);
              }}

              sx={{
                border: 'none',
                flex: 1,
                minHeight: 0,

                '& .Mui-selected': {
                  bgcolor: '#EEF2FF !important',
                },

                '& .MuiDataGrid-columnHeaders': {
                  bgcolor: '#F8FAFC',
                  borderBottom: '1px solid #E2E8F0',

                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: '#64748B',
                    textTransform: 'uppercase',
                  },
                },

                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid #F1F5F9',

                  '&:focus': {
                    outline: 'none',
                  },
                },

                '& .MuiDataGrid-row:hover': {
                  bgcolor: '#F1F5F930',
                },
              }}
            />
          </Paper>
        </Paper>
        <ConfirmDeleteDialog
          open={deleteAxeDialogOpen}
          onClose={() => setDeleteAxeDialogOpen(false)}
          onConfirm={handleConfirmDeleteAxe}
          title="Confirmer la suppression"
          message="Êtes-vous sûr de vouloir supprimer cet axe ? Les sections associées seront également supprimées. Cette action est irréversible."
        />
      </Grid>

      {/* SECTIONS */}
      <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
        <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2.5, bgcolor: '#FFF', flexShrink: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>{selectedAxe ? `SECTIONS - ${selectedAxe.code}` : 'SECTIONS ASSOCIÉES'}</Typography>
            <Button
              onClick={handleAddNewSection}
              startIcon={<AddOutlined sx={{ color: '#10B981' }} />}
              disabled={!selectedAxe}
              sx={{
                bgcolor: T.accent,
                color: '#FFF',
                textTransform: 'none',
                borderRadius: '8px',

                '&:hover': {
                  bgcolor: T.accent,
                },

                '&.Mui-disabled': {
                  bgcolor: '#111',
                  color: '#FFF',
                  opacity: 0.6,
                }
              }}
            >
              Ajouter Section
            </Button>
          </Stack>
          <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0', flex: 1, minHeight: 0, mr: 2, ml: 2, display: 'flex', flexDirection: 'column', mt: -1 }}>
            <DataGrid
              rows={sections}
              columns={sectionColumns}
              loading={loadingSections}
              editMode="row"
              rowModesModel={sectionRowModesModel}
              onRowModesModelChange={setSectionRowModesModel}
              processRowUpdate={processSectionRowUpdate}
              checkboxSelection
              disableRowSelectionOnClick
              getRowId={(row) => row.id}
              density="compact"

              // Sélection contrôlée (une seule ligne)
              rowSelectionModel={selectedSection ? [selectedSection.id] : []}

              onRowSelectionModelChange={(ids) => {
                const selectedId = ids.at(-1);

                if (!selectedId) {
                  setSelectedSection(null);
                  return;
                }

                const selectedRow = sections.find((row) => row.id === selectedId);

                setSelectedSection(selectedRow || null);
              }}

              sx={{
                border: 'none',
                flex: 1,
                minHeight: 0,

                '& .MuiDataGrid-columnHeaders': {
                  bgcolor: '#F8FAFC',
                  borderBottom: '1px solid #E2E8F0',

                  '& .MuiDataGrid-columnHeaderTitle': {
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: '#64748B',
                    textTransform: 'uppercase',
                  },
                },

                '& .MuiDataGrid-cell': {
                  borderBottom: '1px solid #F1F5F9',

                  '&:focus': {
                    outline: 'none',
                  },
                },

                '& .MuiDataGrid-row:hover': {
                  bgcolor: '#F1F5F930',
                },
              }}
            />
          </Paper>
        </Paper>
        <ConfirmDeleteDialog
          open={deleteSectionDialogOpen}
          onClose={() => setDeleteSectionDialogOpen(false)}
          onConfirm={handleConfirmDeleteSection}
          title="Confirmer la suppression"
          message="Êtes-vous sûr de vouloir supprimer cette section ? Cette action est irréversible."
        />
      </Grid>
    </Grid>
  );
};

const PlanComptableDataGrid = ({ fileId, compteId, axiosPrivate }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rowModesModel, setRowModesModel] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // const [rowToDelete, setRowToDelete] = useState(null);
  // const [listeCptCollectif, setListeCptCollectif] = useState([]);

  const { canAdd, canModify, canDelete, canView } = usePermission();
  const [searchParams] = useSearchParams();
  const compte = searchParams.get("compte");


  const [pc, setPc] = useState([]);
  const [filteredPc, setFilteredPc] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [listeCptCollectif, setListeCptCollectif] = useState([]);
  const [isLoadingCollectif, setIsLoadingCollectif] = useState(false);
  const loadingCollectifRef = useRef(false);

  // États pour l'édition DataGrid PC
  const [pcRowModesModel, setPcRowModesModel] = useState({});

  const [pcAllselectedRow, setPcAllselectedRow] = useState([]);

  const [isRefresh, setisRefresh] = useState(false);

  const [pcDeleteDialogOpen, setPcDeleteDialogOpen] = useState(false);
  const [pcToDelete, setPcToDelete] = useState(null);
  const [pcDeleteLoading, setPcDeleteLoading] = useState(false);
  const [selectedPc, setSelectedPc] = useState(null);

  useEffect(() => {
    setFilteredPc(pc);
  }, [pc])

  // Mettre automatiquement une nouvelle ligne en mode édition
  useEffect(() => {
    pc.forEach(row => {
      if (row.isNew && !pcRowModesModel[row.id]) {
        setPcRowModesModel(old => ({ ...old, [row.id]: { mode: GridRowModes.Edit } }));
      }
    });
  }, [pc]);

  const recupererListeCptCollectif = useCallback(() => {
    if (!fileId || !compteId) {
      // console.log('[DEBUG] recupererListeCptCollectif: fileId ou compteId manquant', { fileId, compteId });
      return;
    }
    if (loadingCollectifRef.current) {
      // console.log('[DEBUG] recupererListeCptCollectif: déjà en chargement');
      return;
    }

    // console.log('[DEBUG] recupererListeCptCollectif: début chargement...', { fileId, compteId });
    loadingCollectifRef.current = true;
    setIsLoadingCollectif(true);
    const startTime = Date.now();

    axios.post(`/param/comptabilite/pc`, { fileId: Number(fileId), compteId: Number(compteId) })
      .then((response) => {
        const elapsed = Date.now() - startTime;
        // console.log(`[DEBUG] recupererListeCptCollectif: reçu en ${elapsed}ms`);

        const resData = response.data;
        if (resData.state) {
          const listePc = resData.liste || [];
          const collectifs = listePc.filter(item => item.nature === 'Collectif');
          // console.log(`[DEBUG] recupererListeCptCollectif: ${listePc.length} total, ${collectifs.length} collectifs`);
          setListeCptCollectif(collectifs);
        } else {
          console.error('[DEBUG] recupererListeCptCollectif: API error', resData.msg);
        }
      })
      .catch((error) => {
        console.error('[DEBUG] recupererListeCptCollectif: network error', error);
      })
      .finally(() => {
        loadingCollectifRef.current = false;
        setIsLoadingCollectif(false);
        // console.log('[DEBUG] recupererListeCptCollectif: terminé');
      });
  }, [fileId, compteId]);

  // Ajouter une nouvelle ligne
  const handleAddNewRow = () => {
    if (!canAdd) {
      toast.error('Vous n\'avez pas les droits d\'ajout');
      return;
    }
    // Charger les comptes collectifs si ce n'est pas déjà fait
    if (listeCptCollectif.length === 0 && !loadingCollectifRef.current) {
      recupererListeCptCollectif();
    }

    const newId = Date.now();
    const newRow = {
      id: newId,
      compte: '',
      libelle: '',
      nature: 'General',
      baseCompte: '',
      isNew: true
    };
    setPc((prev) => [newRow, ...prev]);
    setEditingId(newId);
    setEditValues(newRow);
    setSelectedRowId(newId);
    setSelectedRow(newRow);
  };
  const handleEditClick = (row) => {
    if (!canModify) {
      toast.error('Vous n\'avez pas les droits de modification');
      return;
    }
    // Charger les comptes collectifs si ce n'est pas déjà fait
    if (listeCptCollectif.length === 0 && !loadingCollectifRef.current) {
      recupererListeCptCollectif();
    }
    setEditingId(row.id);
    setEditValues({ ...row });
    setSelectedRowId(row.id);
    setSelectedRow(row);
  };

  // Modifier la valeur d'un champ en édition
  const handleEditValueChange = (field, value) => {
    setEditValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Sauvegarder les modifications
  const handleSaveClick = async () => {
    if (!editingId) return;

    const row = editValues;
    const isNewRow = row.isNew === true;

    // Validation
    if (!row.compte || !row.libelle) {
      toast.error('Le compte et le libellé sont requis');
      return;
    }

    // Pour Auxiliaire: baseCompte obligatoire
    if ((row.nature === 'Aux' || row.nature === 'Auxiliaire') && (!row.baseCompte || String(row.baseCompte).trim() === '')) {
      toast.error('Veuillez sélectionner un compte collectif');
      return;
    }

    const itemId = isNewRow ? 0 : row.id;

    // Quand nature = General ou Collectif: baseCompte doit être le numéro de compte
    // Quand nature = Auxiliaire: baseCompte est l'ID du compte collectif sélectionné
    let baseCptValue = null;
    if (row.nature === 'General' || row.nature === 'Collectif') {
      baseCptValue = row.compte ? Number(row.compte) : null;
    } else if (row.baseCompte && String(row.baseCompte).trim() !== '') {
      baseCptValue = Number(row.baseCompte);
    }

    const payload = {
      action: isNewRow ? 'new' : 'modify',
      itemId: itemId,
      idCompte: Number(compteId),
      idDossier: Number(fileId),
      compte: row.compte,
      libelle: row.libelle,
      nature: row.nature,
      baseCptCollectif: baseCptValue,
      typeTier: (row.nature === 'General' || row.nature === 'Collectif') ? 'general' : (row.typeTier || 'sans-nif'),
      nif: row.nif || '',
      stat: row.statistique || '',
      adresse: row.adresse || '',
      motcle: row.motcle || '',
      cin: row.cin || '',
      dateCin: row.datecin && row.datecin !== 'Invalid date' ? row.datecin : null,
      autrePieceID: row.autrepieceid || '',
      refPieceID: row.refpieceid || '',
      adresseSansNIF: row.adressesansnif || '',
      nifRepresentant: row.nifrepresentant || '',
      adresseEtranger: row.adresseetranger || '',
      pays: row.pays || '',
      province: row.province || '',
      region: row.region || '',
      district: row.district || '',
      commune: row.commune || '',
      listeCptChg: [],
      listeCptTva: [],
      typecomptabilite: row.typecomptabilite || 'Français',
      compteautre: row.compteautre || '',
      libelleautre: row.libelleautre || ''
    };

    try {
      const response = await axiosPrivate.post(`/param/comptabilite/AddCpt`, payload);
      const resData = response.data;

      if (resData.state === true) {
        console.log('[DEBUG] Save successful, refreshing list...');
        toast.success(resData.msg || 'Compte enregistré avec succès');
        setEditingId(null);
        setEditValues({});
        showPc();
        // Rafraîchir la liste des comptes collectifs pour les nouvelles données
        loadingCollectifRef.current = false;
        recupererListeCptCollectif();
      } else {
        console.log('[DEBUG] Save failed:', resData);
        toast.error(resData.msg || 'Erreur lors de l\'enregistrement');
      }
    } catch (error) {
      const errMsg = error.response?.data?.message || error.message || "Erreur inconnue";
      toast.error(errMsg);
    }
  };

  // Annuler l'édition
  const handleCancelClick = () => {
    if (editValues?.isNew) {
      setPc((prev) => prev.filter((r) => r.id !== editingId));
    }
    setEditingId(null);
    setEditValues({});
  };

  // Handlers pour DataGrid PC avec GridActionsCellItem
  const handleAddNewPcRow = () => {
    if (!canAdd) {
      toast.error('Vous n\'avez pas les droits d\'ajout');
      return;
    }
    if (listeCptCollectif.length === 0 && !loadingCollectifRef.current) {
      recupererListeCptCollectif();
    }
    const newId = Date.now();
    const newRow = {
      id: newId,
      compte: '',
      libelle: '',
      nature: 'General',
      baseCompte: '',
      isNew: true
    };
    setPc((prev) => [newRow, ...prev]);
  };

  const handlePcEditClick = (id) => () => {
    if (!canModify) {
      toast.error('Vous n\'avez pas les droits de modification');
      return;
    }
    if (listeCptCollectif.length === 0 && !loadingCollectifRef.current) {
      recupererListeCptCollectif();
    }
    setPcRowModesModel({ ...pcRowModesModel, [id]: { mode: GridRowModes.Edit } });
  };

  const handlePcSaveClick = (id) => () => {
    setPcRowModesModel({ ...pcRowModesModel, [id]: { mode: GridRowModes.View } });
  };

  const handlePcCancelClick = (id) => () => {
    setPcRowModesModel({
      ...pcRowModesModel,
      [id]: { mode: GridRowModes.View, ignoreModifications: true },
    });
    const editedRow = pc.find((row) => row.id === id);
    if (editedRow && editedRow.isNew) {
      setPc(pc.filter((row) => row.id !== id));
    }
  };

  const handlePcDeleteClick = (id) => () => {
    if (!canDelete) {
      toast.error('Vous n\'avez pas les droits de suppression');
      return;
    }
    setPcToDelete(id);
    setPcDeleteDialogOpen(true);
  };

  const handleClosePcDeleteDialog = () => {
    if (pcDeleteLoading) return;
    setPcDeleteDialogOpen(false);
    setPcToDelete(null);
  };

  const handleConfirmDeletePc = async () => {
    if (!pcToDelete) return;

    try {
      setPcDeleteLoading(true);

      const response = await axiosPrivate.post('/param/comptabilite/deleteItemPc', {
        listId: [pcToDelete],
        compteId: Number(compteId),
        fileId: Number(fileId),
      });

      const resData = response.data;

      if (resData?.state) {
        toast.success(resData.msg || 'Compte supprimé avec succès');
        setPc((prev) => prev.filter((r) => r.id !== pcToDelete));
        setFilteredPc((prev) => prev.filter((r) => r.id !== pcToDelete));
        if (selectedRowId === pcToDelete) {
          setSelectedRowId(null);
          setSelectedRow(null);
        }
      } else {
        toast.error(resData?.msgUndeletableCpt || resData?.msg || 'Erreur lors de la suppression');
      }
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    } finally {
      setPcDeleteLoading(false);
      setPcDeleteDialogOpen(false);
      setPcToDelete(null);
    }
  };

  const processPcRowUpdate = (newRow) => {
    const { id, isNew, ...data } = newRow;

    const row = newRow;

    // Validation
    if (!row.compte || !row.libelle) {
      toast.error('Le compte et le libellé sont requis');
      throw new Error('Le compte et le libellé sont requis');
    }

    if ((row.nature === 'Aux' || row.nature === 'Auxiliaire') && (!row.baseCompte || String(row.baseCompte).trim() === '')) {
      toast.error('Veuillez sélectionner un compte collectif');
      throw new Error('Veuillez sélectionner un compte collectif');
    }

    let baseCptValue = null;
    if (row.nature === 'General' || row.nature === 'Collectif') {
      baseCptValue = row.compte ? Number(row.compte) : null;
    } else if (row.baseCompte && String(row.baseCompte).trim() !== '') {
      baseCptValue = Number(row.baseCompte);
    }

    const payload = {
      action: isNew ? 'new' : 'modify',
      itemId: isNew ? 0 : id,
      idCompte: Number(compteId),
      idDossier: Number(fileId),
      compte: row.compte,
      libelle: row.libelle,
      nature: row.nature,
      baseCptCollectif: baseCptValue,
      typeTier: (row.nature === 'General' || row.nature === 'Collectif') ? 'general' : (row.typeTier || 'sans-nif'),
      nif: row.nif || '',
      stat: row.statistique || '',
      adresse: row.adresse || '',
      motcle: row.motcle || '',
      cin: row.cin || '',
      dateCin: row.datecin && row.datecin !== 'Invalid date' ? row.datecin : null,
      autrePieceID: row.autrepieceid || '',
      refPieceID: row.refpieceid || '',
      adresseSansNIF: row.adressesansnif || '',
      nifRepresentant: row.nifrepresentant || '',
      adresseEtranger: row.adresseetranger || '',
      pays: row.pays || '',
      province: row.province || '',
      region: row.region || '',
      district: row.district || '',
      commune: row.commune || '',
      listeCptChg: [],
      listeCptTva: [],
      typecomptabilite: row.typecomptabilite || 'Français',
      compteautre: row.compteautre || '',
      libelleautre: row.libelleautre || ''
    };

    return axiosPrivate.post(`/param/comptabilite/AddCpt`, payload)
      .then((response) => {
        const resData = response.data;
        if (resData.state === true) {
          toast.success(resData.msg || 'Compte enregistré avec succès');
          loadingCollectifRef.current = false;
          recupererListeCptCollectif();
          const updatedRow = { ...newRow, isNew: false };
          setPc(pc.map((row) => (row.id === newRow.id ? updatedRow : row)));
          return updatedRow;
        } else {
          toast.error(resData.msg || 'Erreur lors de l\'enregistrement');
          throw new Error(resData.msg);
        }
      })
      .catch((error) => {
        toast.error(error.message || 'Erreur lors de la sauvegarde');
        throw error;
      });
  };

  // Pagination handlers
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Supprimer une ligne
  const handleDeleteClick = (row) => {
    if (!canDelete) {
      toast.error('Vous n\'avez pas les droits de suppression');
      return;
    }
    setSelectedRowId(row.id);
    setSelectedRow(row);
    setOpenDialogDeleteItemsPc(true);
  };

  const showPc = () => {
    console.log('[DEBUG] showPc: fetching data...', { fileId, compteId });
    axios.post(`/param/comptabilite/pc`, { fileId, compteId }).then((response) => {
      const resData = response.data;
      if (resData.state) {
        let listePc = resData.liste;

        if (compte) {
          listePc = listePc.filter((row) => row.compte === compte);
        }

        const unique = Object.values(
          (Array.isArray(listePc) ? listePc : []).reduce((acc, r) => {
            const k = String(r.compte || '');
            if (!acc[k]) {
              const baseValue = r.baseaux || r.baseCptCollectif || r.baseCompte || '';
              acc[k] = {
                ...r,
                baseCompte: baseValue
              };
            }
            return acc;
          }, {})
        );

        console.log('[DEBUG] showPc: received', listePc.length, 'items, unique:', unique.length);
        console.log('[DEBUG] showPc: first items', unique.slice(0, 3));
        setPc(unique);
      } else {
        toast.error(resData.msg);
      }
    })
  }

  //Récupération de l'ID de la ligne sélectionner dans le tableau détail du modèle sélectionné
  const listPCSelectedRow = (selectedIds) => {
    const itemId = selectedIds[0];
    setPcAllselectedRow(selectedIds);
    setSelectedRowId(itemId ?? null);

    const itemInfos = pc.find(row => row.id === itemId);
    if (itemInfos) {
      setSelectedRow(itemInfos);

      //récupérer la liste des comptes de charges et compte de TVA associées à la ligne sélectionnée
      axios.get(`/param/comptabilite/keepListCptChgTvaAssoc/${itemId}`).then((response) => {
        const resData = response.data;
        if (resData.state) {
          setListCptChg(resData.detailChg);
          setListCptTva(resData.detailTva);
        } else {
          toast.error(resData.msg);
        }
      })
    }
  }

  useEffect(() => {
    if (canView && fileId && compteId) {
      showPc();
      // Précharger les comptes collectifs pour l'édition
      // console.log('[DEBUG] useEffect: chargement comptes collectifs...');
      recupererListeCptCollectif();
    }
  }, [fileId, compteId, compte, isRefresh]);


  const columns = [
    {
      field: 'compte',
      headerName: 'Compte',
      width: 140,
      editable: true,
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => (
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.accent, fontFamily: 'monospace' }}>
          {params.row.compte}
        </Typography>
      ),
      renderEditCell: (params) => (
        <TextField
          size="small"
          fullWidth
          variant="standard"
          InputProps={{ disableUnderline: true }}
          value={params.value || ''}
          onChange={(e) => params.api.setEditCellValue({ id: params.id, field: params.field, value: e.target.value })}
          sx={{
            bgcolor: '#fff',
            border: 'none',
            '& .MuiInputBase-root': {
              bgcolor: 'transparent',
              border: 'none'
            },
            '& .MuiInputBase-input': {
              bgcolor: 'transparent'
            }
          }}
        />
      ),
    },
    {
      field: 'libelle',
      headerName: 'Libellé',
      flex: 1,
      editable: true,
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => (
        <Typography sx={{ fontSize: 13, color: '#475569' }}>
          {params.row.libelle}
        </Typography>
      ),
      renderEditCell: (params) => (
        <TextField
          size="small"
          fullWidth
          variant="standard"
          InputProps={{ disableUnderline: true }}
          value={params.value || ''}
          onChange={(e) => params.api.setEditCellValue({ id: params.id, field: params.field, value: e.target.value })}
          sx={{
            bgcolor: '#fff',
            border: 'none',
            '& .MuiInputBase-root': {
              bgcolor: 'transparent',
              border: 'none'
            },
            '& .MuiInputBase-input': {
              bgcolor: 'transparent'
            }
          }}
        />
      ),
    },
    {
      field: 'nature',
      headerName: 'Nature',
      width: 140,
      editable: true,
      type: 'singleSelect',
      valueOptions: ['General', 'Collectif', 'Auxiliaire'],
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => (
        <Chip
          label={(params.row.nature || '').toUpperCase()}
          sx={{
            bgcolor:
              params.row.nature === 'General'
                ? '#64748B'
                : params.row.nature === 'Collectif'
                  ? '#3B82F6'
                  : '#10B981',
            color: '#fff',
            fontWeight: 800,
            fontSize: '10px',
            borderRadius: '6px',
            height: '22px',
            minWidth: '60px',
          }}
        />
      ),
      renderEditCell: (params) => (
        <TextField
          select
          size="small"
          fullWidth
          variant="standard"
          InputProps={{ disableUnderline: true }}
          value={params.value || 'General'}
          onChange={(e) => params.api.setEditCellValue({ id: params.id, field: params.field, value: e.target.value })}
          sx={{
            bgcolor: '#fff',
            border: 'none',
            '& .MuiInputBase-root': {
              bgcolor: 'transparent',
              border: 'none'
            },
            '& .MuiInputBase-input': {
              bgcolor: 'transparent'
            }
          }}
        >
          <MenuItem value="General">Général</MenuItem>
          <MenuItem value="Collectif">Collectif</MenuItem>
          <MenuItem value="Auxiliaire">Auxiliaire</MenuItem>
        </TextField>
      ),
    },
    {
      field: 'baseCompte',
      headerName: 'Centr. / Base',
      width: 170,
      editable: true,
      type: 'singleSelect',
      headerClassName: 'HeaderbackColor',
      renderCell: (params) => (
        <Typography sx={{ fontSize: 13, color: '#475569' }}>
          {params.row.baseCompte}
        </Typography>
      ),
      renderEditCell: (params) => {
        const rowNature = params.row.nature;

        if (rowNature === 'General' || rowNature === 'Collectif') {
          return (
            <TextField
              size="small"
              fullWidth
              disabled
              variant="standard"
              InputProps={{ disableUnderline: true }}
              value={params.row.compte || ''}
              sx={{
                bgcolor: '#fff',
                border: 'none',
                '& .MuiInputBase-root': {
                  bgcolor: 'transparent',
                  border: 'none'
                },
                '& .MuiInputBase-input': {
                  bgcolor: 'transparent'
                }
              }}
            />
          );
        }

        return (
          <TextField
            select
            size="small"
            fullWidth
            variant="standard"
            InputProps={{ disableUnderline: true }}
            value={params.value || ''}
            onChange={(e) => params.api.setEditCellValue({ id: params.id, field: params.field, value: e.target.value })}
            sx={{
              bgcolor: '#fff',
              border: 'none',
              '& .MuiInputBase-root': {
                bgcolor: 'transparent',
                border: 'none'
              },
              '& .MuiInputBase-input': {
                bgcolor: 'transparent'
              }
            }}
          >
            <MenuItem value="">
              <em>Sélectionner</em>
            </MenuItem>
            {listeCptCollectif?.map((item) => (
              <MenuItem key={item.id} value={String(item.id)}>
                {item.compte} - {item.libelle}
              </MenuItem>
            ))}
          </TextField>
        );
      },
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 100,
      cellClassName: 'actions',
      getActions: ({ id }) => {
        const isInEditMode = pcRowModesModel[id]?.mode === GridRowModes.Edit;

        if (isInEditMode) {
          return [
            <GridActionsCellItem
              icon={<CheckOutlined sx={{ color: '#10B981' }} />}
              label="Save"
              onClick={handlePcSaveClick(id)}
              sx={{ bgcolor: '#e6fff5ff', mr: 1 }}
            />,
            <GridActionsCellItem
              icon={<CloseOutlined sx={{ color: '#EF4444' }} />}
              label="Cancel"
              onClick={handlePcCancelClick(id)}
              sx={{ bgcolor: '#FEF2F2' }}
            />,
          ];
        }

        return [
          <GridActionsCellItem
            icon={<EditOutlined sx={{ color: T.accent }} />}
            label="Edit"
            onClick={handlePcEditClick(id)}
            sx={{ bgcolor: '#EEF2FF', mr: 1 }}
          />,
          <GridActionsCellItem
            icon={<DeleteOutline sx={{ color: '#EF4444' }} />}
            label="Delete"
            onClick={handlePcDeleteClick(id)}
            sx={{ bgcolor: '#FEF2F2' }}
          />,
        ];
      },
    },
  ];

  return (
    <Paper sx={{ borderRadius: '12px', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ p: 2.5, flexShrink: 0 }}
      >
        <Typography sx={{ fontWeight: 900 }}>
          RÉFÉRENTIEL PLAN COMPTABLE
        </Typography>

        <Button
          onClick={handleAddNewPcRow}
          startIcon={<AddOutlined />}
          sx={{
            bgcolor: T.accent,
            color: '#FFF',
            textTransform: 'none',
            borderRadius: '8px',

            '&:hover': {
              bgcolor: T.accent // 👈 même couleur au hover
            }
          }}
        >
          Ajouter un compte
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0', flex: 1, minHeight: 0, mr: 2, ml: 2, display: 'flex', flexDirection: 'column', mt: -1 }}>
        <DataGrid
          rows={filteredPc}
          columns={columns}
          loading={loading}
          editMode="row"
          rowModesModel={pcRowModesModel}
          onRowModesModelChange={setPcRowModesModel}
          processRowUpdate={processPcRowUpdate}
          checkboxSelection
          disableRowSelectionOnClick
          density="compact"
          getRowId={(row) => row.id}

          // Toolbar avec recherche
          slots={{
            toolbar: GridToolbar,
          }}

          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: {
                debounceMs: 500,
                placeholder: "Rechercher un compte...",
              },
            },
          }}

          onRowEditStop={(params, event) => {
            if (params.reason === GridRowEditStopReasons.rowFocusOut) {
              event.defaultMuiPrevented = true;
            }
          }}

          // Sélection contrôlée (1 seule ligne)
          rowSelectionModel={selectedPc ? [selectedPc.id] : []}

          onRowSelectionModelChange={(ids) => {
            const selectedId = ids.at(-1);

            if (!selectedId) {
              setSelectedPc(null);
              return;
            }

            const row = filteredPc.find((r) => r.id === selectedId);
            setSelectedPc(row || null);
          }}

          sx={{
            flex: 1,
            minHeight: 0,
            border: "none",

            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "#F8FAFC",
              fontSize: 12,
              fontWeight: 800,
            },

            "& .MuiDataGrid-toolbarContainer": {
              padding: "8px 12px",
              borderBottom: "1px solid #E5E7EB",
              backgroundColor: "#FAFAFA",
            },

            "& .MuiDataGrid-toolbarContainer .MuiInputBase-root": {
              width: 300,
              backgroundColor: "#fff",
              borderRadius: "8px",
            },

            "& .MuiDataGrid-cell": {
              borderBottom: "1px solid #F1F5F9",
            },

            "& .MuiDataGrid-cell--editing": {
              bgcolor: "#fff !important",
            },

            "& .MuiDataGrid-cell--editing .MuiInputBase-root": {
              bgcolor: "transparent !important",
            },

            "& .MuiDataGrid-row:hover": {
              bgcolor: "#F1F5F930",
            },
          }}
        />
      </Paper>
      <ConfirmDeleteDialog
        open={pcDeleteDialogOpen}
        onClose={handleClosePcDeleteDialog}
        onConfirm={handleConfirmDeletePc}
        title="Confirmer la suppression"
        message="Êtes-vous sûr de vouloir supprimer ce compte ? Cette action est irréversible."
        loading={pcDeleteLoading}
      />
    </Paper>
  );
};

// ─── Comptes TVA (compte + nature) — liste manuelle utilisée par le contrôle UTIL_CPT_TVA ───
const ComptesTvaSection = ({ fileId, compteId, axiosPrivate, pc = [] }) => {
  const [liste, setListe] = useState([]);
  const [natures, setNatures] = useState(['IMMO', 'DED', 'COLL', 'AUTRE']);
  const [loading, setLoading] = useState(false);
  const [selectedCompte, setSelectedCompte] = useState(null);
  const [nature, setNature] = useState('IMMO');
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchListe = useCallback(() => {
    if (!fileId) return;
    setLoading(true);
    axiosPrivate.get(`/paramCrm/listeComptesTva/${fileId}`)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          setListe(resData.liste || []);
          if (Array.isArray(resData.natures) && resData.natures.length) setNatures(resData.natures);
        }
      })
      .catch(() => toast.error('Erreur lors du chargement des comptes TVA'))
      .finally(() => setLoading(false));
  }, [fileId, axiosPrivate]);

  useEffect(() => { fetchListe(); }, [fetchListe]);

  const resetForm = () => { setSelectedCompte(null); setNature('IMMO'); setEditId(null); };

  const handleEdit = (row) => {
    setEditId(row.id);
    const found = pc.find((p) => Number(p.id) === Number(row.id_compte))
      || pc.find((p) => p.compte === row.compte) || null;
    setSelectedCompte(found || { id: row.id_compte, compte: row.compte });
    setNature(row.nature);
  };

  const handleSave = () => {
    if (!selectedCompte || !selectedCompte.id || !nature) { toast.error('Compte et nature requis'); return; }
    setSaving(true);
    axiosPrivate.post('/paramCrm/compteTva', {
      id: editId || undefined,
      idCompte: selectedCompte.id,
      idDossier: fileId,
      compte: String(selectedCompte.compte || '').trim(),
      nature,
    })
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || 'Enregistré');
          resetForm();
          fetchListe();
        } else {
          toast.error(resData.msg || "Erreur lors de l'enregistrement");
        }
      })
      .catch(() => toast.error("Erreur lors de l'enregistrement"))
      .finally(() => setSaving(false));
  };

  const handleDelete = () => {
    axiosPrivate.post('/paramCrm/compteTvaDelete', { idToDelete: deleteId })
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || 'Supprimé');
          if (editId === deleteId) resetForm();
          fetchListe();
        } else {
          toast.error(resData.msg || 'Erreur lors de la suppression');
        }
      })
      .catch(() => toast.error('Erreur lors de la suppression'))
      .finally(() => setDeleteId(null));
  };

  const NATURE_LABELS = { IMMO: 'Immobilisations', DED: 'Déductible', COLL: 'Collectée', AUTRE: 'Intra Com' };
  const NATURE_COLORS = { IMMO: T.accent, DED: '#3A6EA5', COLL: '#1F8A70', AUTRE: '#B5791A' };
  const natureColor = (n) => NATURE_COLORS[n] || T.muted;

  // Regrouper les comptes TVA par nature → un tableau distinct par nature
  const groupsMap = liste.reduce((acc, r) => { (acc[r.nature] = acc[r.nature] || []).push(r); return acc; }, {});
  const NATURE_ORDER = ['IMMO', 'DED', 'COLL', 'AUTRE'];
  const groupKeys = Object.keys(groupsMap).sort((a, b) => {
    const ia = NATURE_ORDER.indexOf(a), ib = NATURE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const thSx = { fontWeight: 800, color: T.muted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.3px', bgcolor: T.ledger };

  const FieldLabel = ({ children }) => (
    <Typography variant="caption" sx={{ display: 'block', mb: 0.8, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>
      {children}
    </Typography>
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <Paper elevation={0} sx={{ ...panelSx, p: 3, mb: 2 }}>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} md={5}>
            <FieldLabel>Compte</FieldLabel>
            <Autocomplete
              options={pc.filter((p) => String(p.compte || '').startsWith('445'))}
              value={selectedCompte}
              onChange={(e, v) => setSelectedCompte(v)}
              isOptionEqualToValue={(opt, val) => Number(opt?.id) === Number(val?.id)}
              getOptionLabel={(opt) => { if (!opt) return ''; const lib = opt.libelle || opt.intitule; return `${opt.compte}${lib ? ' — ' + lib : ''}`; }}
              size="small"
              renderInput={(params) => (<TextField {...params} placeholder="Sélectionner un compte " />)}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <FieldLabel>Nature</FieldLabel>
            <Select value={nature} onChange={(e) => setNature(e.target.value)} fullWidth size="small">
              {natures.map((n) => (<MenuItem key={n} value={n}>{NATURE_LABELS[n] || n}</MenuItem>))}
            </Select>
          </Grid>
          <Grid item xs={12} md={3} sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained" disableElevation startIcon={<SaveOutlined />}
              sx={{ ...primaryBtnSx, height: '40px', flex: 1 }}
              onClick={handleSave} disabled={saving}
            >
              {editId ? 'Modifier' : 'Ajouter'}
            </Button>
            {editId && (
              <Button variant="text" sx={{ height: '40px', textTransform: 'none', color: T.muted }} onClick={resetForm}>
                Annuler
              </Button>
            )}
          </Grid>
        </Grid>
      </Paper>

      {liste.length === 0 && !loading ? (
        <Paper elevation={0} sx={{ ...panelSx, p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: T.faint, fontSize: '13px' }}>Aucun compte TVA saisi.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {groupKeys.map((n) => (
            <Paper key={n} elevation={0} sx={{ ...panelSx, p: 0, overflow: 'hidden' }}>
              {/* En-tête du tableau de la nature */}
              <Box sx={{ px: 2, py: 1.2, bgcolor: `${natureColor(n)}12`, borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 4, height: 18, borderRadius: 2, bgcolor: natureColor(n) }} />
                <Typography sx={{ fontSize: '13px', fontWeight: 800, color: T.ink }}>{NATURE_LABELS[n] || 'Comptes TVA'}</Typography>
                <Chip label={n} size="small" sx={{ height: 20, fontSize: '10px', fontWeight: 700, color: natureColor(n), bgcolor: `${natureColor(n)}18` }} />
                <Typography sx={{ ml: 'auto', fontSize: '12px', fontWeight: 600, color: T.muted }}>{groupsMap[n].length} compte{groupsMap[n].length > 1 ? 's' : ''}</Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={thSx}>Compte</TableCell>
                      <TableCell align="right" sx={{ ...thSx, width: 110 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupsMap[n].map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell sx={{ fontFamily: MONO, fontSize: '13px', color: T.ink }}>{row.compte}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => handleEdit(row)} sx={{ color: T.muted }}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => setDeleteId(row.id)} sx={{ color: T.neg }}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ))}
        </Box>
      )}

      <ConfirmDeleteDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        message="Êtes-vous sûr de vouloir supprimer ce compte TVA ?"
      />
    </Box>
  );
};

const CRM = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(4); // 4 = Général (identité du dossier)
  const [selectedAxe, setSelectedAxe] = useState(0);
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();
  // ... (rest of the code remains the same)
  const decoded = auth?.accessToken ? jwtDecode(auth.accessToken) : undefined;
  const compteId = decoded?.UserInfo?.compteId || null;
  const compteName = decoded?.UserInfo?.compte || 'Espace Client';
  const [fileId, setFileId] = useState(sessionStorage.getItem('fileId') || id || '0');
  const [noFile, setNoFile] = useState(!fileId || fileId === '0' || fileId === 0);

  useEffect(() => {
    const storedFileId = sessionStorage.getItem('fileId');
    const currentId = id || storedFileId;
    if (currentId && currentId !== '0') {
      setFileId(currentId);
      setNoFile(false);
    } else {
      setNoFile(true);
    }
  }, [id]);

  const sendToHome = () => {
    setNoFile(false);
    navigate('/home');
  };

  // Popup Nouveau Journal
  const [openJournalDialog, setOpenJournalDialog] = useState(false);
  const [listeCptAssocie, setListeCptAssocie] = useState([]);
  const [pc, setPc] = useState([]);
  const [listeCodeJournaux, setListeCodeJournaux] = useState([]);
  const [loadingJournaux, setLoadingJournaux] = useState(false);
  const [rowModesModel, setRowModesModel] = useState({});
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState(null);

  // CRM Header states
  const [nomDossier, setNomDossier] = useState('');
  const [portefeuille, setPortefeuille] = useState([]);
  const [listePortefeuille, setListePortefeuille] = useState([]);
  const [seuilVariation, setSeuilVariation] = useState(15);
  const [retardFourns, setRetardFourns] = useState(3);
  const [retardClt, setRetardClt] = useState(3);
  const lastSavedSeuilRef = useRef(15);
  const [confirmSeuilOpen, setConfirmSeuilOpen] = useState(false);
  const [confirmSeuilLoading, setConfirmSeuilLoading] = useState(false);
  const [pendingSeuilValue, setPendingSeuilValue] = useState(null);

  // --- Taux TVA (paramétrage) ---
  const [tauxTvaList, setTauxTvaList] = useState([]);
  const [tauxTvaLoading, setTauxTvaLoading] = useState(false);
  const [newTauxDeductible, setNewTauxDeductible] = useState(true);
  const [newTauxValue, setNewTauxValue] = useState('');
  const [editTauxId, setEditTauxId] = useState(null);
  const [editTauxDeductible, setEditTauxDeductible] = useState(true);
  const [editTauxValue, setEditTauxValue] = useState('');

  // --- Trésorerie (paramétrage : opérateur + mot-clé) ---
  const [tresoList, setTresoList] = useState([]);
  const [tresoLoading, setTresoLoading] = useState(false);
  const [newTresoOperateur, setNewTresoOperateur] = useState('cont');
  const [newTresoMotCle, setNewTresoMotCle] = useState('');
  const [editTresoId, setEditTresoId] = useState(null);
  const [editTresoOperateur, setEditTresoOperateur] = useState('cont');
  const [editTresoMotCle, setEditTresoMotCle] = useState('');

  // --- Vente (formats de numéro de facture) ---
  const [venteList, setVenteList] = useState([]);
  const [venteLoading, setVenteLoading] = useState(false);
  const [newVentePrefixe, setNewVentePrefixe] = useState('');
  const [newVenteLongueur, setNewVenteLongueur] = useState('');
  const [newVenteRetirer, setNewVenteRetirer] = useState(false);
  const [editVenteId, setEditVenteId] = useState(null);
  const [editVentePrefixe, setEditVentePrefixe] = useState('');
  const [editVenteLongueur, setEditVenteLongueur] = useState('');
  const [editVenteRetirer, setEditVenteRetirer] = useState(false);
  const [crmData, setCrmData] = useState(null);

  const formikNewJournal = useFormik({
    initialValues: {
      idCompte: compteId,
      idDossier: fileId,
      idCode: 0,
      code: '',
      libelle: '',
      type: '',
      compteassocie: ''
    },
    validationSchema: Yup.object({
      code: Yup.string().required("Veuillez ajouter un code journal"),
      libelle: Yup.string().required("Veuillez ajouter un libellé"),
      type: Yup.string().required("Veuillez choisir un type"),
      compteassocie: Yup.string()
        .when('type', {
          is: (value) => value === 'BANQUE' || value === 'CAISSE',
          then: () => Yup.string().required("Compte associé obligatoire pour BANQUE/CAISSE"),
          otherwise: () => Yup.string().notRequired(),
        }),
    }),
    onSubmit: (values) => {
      axiosPrivate.post('/param/codejournals/add', values)
        .then((response) => {
          const resData = response.data;
          if (resData.state) {
            toast.success(resData.msg || "Code journal créé avec succès");
            handleCloseJournalDialog();
            fetchCodeJournaux();
          } else {
            toast.error(resData.msg || "Erreur lors de la création");
          }
        })
        .catch((error) => {
          toast.error('Erreur lors de la sauvegarde');
        });
    },
    validateOnChange: false,
    validateOnBlur: true,
  });

  const handleOpenJournalDialog = () => {
    formikNewJournal.resetForm();
    formikNewJournal.setFieldValue('idCompte', compteId);
    formikNewJournal.setFieldValue('idDossier', fileId);
    setOpenJournalDialog(true);
  };

  const handleCloseJournalDialog = () => {
    setOpenJournalDialog(false);
    formikNewJournal.resetForm();
  };

  const handleTypeChange = (e) => {
    const typeValue = e.target.value;
    formikNewJournal.setFieldValue('type', typeValue);
    formikNewJournal.setFieldValue('compteassocie', '');

    if (typeValue === 'BANQUE') {
      const listBank = pc?.filter((row) => row.compte?.startsWith('512') || row.compte?.startsWith('52'));
      setListeCptAssocie(listBank || []);
    } else if (typeValue === 'CAISSE') {
      const listCash = pc?.filter((row) => row.compte?.startsWith('53'));
      setListeCptAssocie(listCash || []);
    } else {
      setListeCptAssocie([]);
    }
  };

  // Charger plan comptable
  useEffect(() => {
    if (fileId && compteId) {
      axiosPrivate.post('/param/comptabilite/pc', { fileId, compteId })
        .then((response) => {
          const resData = response.data;
          if (resData.state) {
            setPc(resData.liste || []);
          }
        })
        .catch((error) => {
          console.error('Erreur chargement plan comptable:', error);
        });
    }
  }, [fileId, compteId]);

  // Charger la liste des codes journaux quand on ouvre l'onglet
  const fetchCodeJournaux = () => {
    if (!fileId) return;
    setLoadingJournaux(true);
    axiosPrivate.get(`/param/codejournals/liste/${fileId}`)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          setListeCodeJournaux(resData.list || []);
        } else {
          setListeCodeJournaux([]);
          toast.error(resData.msg || 'Erreur lors du chargement');
        }
      })
      .catch((error) => {
        console.error('Erreur fetch codes journaux:', error);
        toast.error('Erreur lors du chargement des codes journaux');
      })
      .finally(() => {
        setLoadingJournaux(false);
      });
  };

  useEffect(() => {
    if (activeTab === 2) {
      fetchCodeJournaux();
    }
  }, [activeTab, fileId]);

  // Charger la liste des portefeuilles en premier
  useEffect(() => {
    if (!compteId) return;
    axiosPrivate.get(`/param/portefeuille/getAllPortefeuille/${compteId}`)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          setListePortefeuille(resData.list || []);
        } else {
          console.log('DEBUG - Portefeuilles response state false:', resData);
        }
      })
      .catch((error) => console.error('Erreur chargement portefeuilles:', error));
  }, [compteId]);

  // Charger les infos CRM (nom dossier, portefeuille, seuil) - après les portefeuilles
  useEffect(() => {
    if (!fileId || listePortefeuille.length === 0) return;

    axiosPrivate.get(`/paramCrm/infoscrm/${fileId}`)
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          setCrmData(resData.list);
          setNomDossier(resData.list.dossier || '');
          setSeuilVariation(resData.list.seuil_revu_analytique || 15);
          lastSavedSeuilRef.current = resData.list.seuil_revu_analytique || 15;
          setRetardFourns(resData.list.retard_fourns ?? 3);
          setRetardClt(resData.list.retard_clt ?? 3);
          // Mapper le portefeuille si besoin
          if (resData.list.id_portefeuille) {
            const mapped = resData.list.id_portefeuille.map(id =>
              listePortefeuille.find(p => p.id === Number(id))
            ).filter(Boolean);
            setPortefeuille(mapped);
          }
        }
      })
      .catch((error) => console.error('Erreur chargement CRM:', error));
  }, [fileId, listePortefeuille]);

  // Auto-save seuil on blur
  const handleSaveSeuil = async (newValue) => {
    if (!fileId || !crmData) return;
    try {
      await axiosPrivate.post(`/paramCrm/modifying`, {
        action: 'modify',
        itemId: crmData.id,
        idCompte: compteId,
        idDossier: fileId,
        nomdossier: nomDossier,
        portefeuille: portefeuille.map(p => p.id),
        seuil_revu_analytique: Number(newValue),
        retard_fourns: Number(retardFourns),
        retard_clt: Number(retardClt),
      });
      toast.success('Seuil mis à jour');
      lastSavedSeuilRef.current = Number(newValue);
    } catch (error) {
      toast.error('Erreur mise à jour seuil');
    }
  };

  // Save nom et portefeuille (bouton Enregistrer)
  const handleSaveHeader = async () => {
    if (!fileId || !crmData) return;
    try {
      await axiosPrivate.post(`/paramCrm/modifying`, {
        action: 'modify',
        itemId: crmData.id,
        idCompte: compteId,
        idDossier: fileId,
        nomdossier: nomDossier,
        portefeuille: portefeuille.map(p => p.id),
        seuil_revu_analytique: seuilVariation,
        retard_fourns: Number(retardFourns),
        retard_clt: Number(retardClt),
      });
      toast.success('Modifications enregistrées');
    } catch (error) {
      toast.error('Erreur sauvegarde');
    }
  };

  const handleSeuilBlur = (rawValue) => {
    const numeric = Number(rawValue);

    if (Number.isNaN(numeric)) {
      setSeuilVariation(lastSavedSeuilRef.current);
      return;
    }

    if (numeric === Number(lastSavedSeuilRef.current)) return;

    setPendingSeuilValue(numeric);
    setConfirmSeuilOpen(true);
  };

  const handleCloseConfirmSeuil = () => {
    if (confirmSeuilLoading) return;
    setConfirmSeuilOpen(false);
    setPendingSeuilValue(null);
    setSeuilVariation(lastSavedSeuilRef.current);
  };

  const handleConfirmSeuil = async () => {
    if (pendingSeuilValue === null) return;
    try {
      setConfirmSeuilLoading(true);
      await handleSaveSeuil(pendingSeuilValue);
      setConfirmSeuilOpen(false);
      setPendingSeuilValue(null);
    } finally {
      setConfirmSeuilLoading(false);
    }
  };

  // --- Taux TVA (paramétrage) ---
  const fetchTauxTva = async () => {
    if (!fileId || fileId === '0' || !compteId) return;
    setTauxTvaLoading(true);
    try {
      const res = await axiosPrivate.get(`/paramTauxTva/${compteId}/${fileId}`);
      if (res.data?.state) setTauxTvaList(res.data.data || []);
    } catch (e) {
      console.error('Erreur chargement taux TVA', e);
    } finally {
      setTauxTvaLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 6) fetchTauxTva();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fileId]);

  const handleAddTaux = async () => {
    const v = Number(String(newTauxValue).replace(',', '.'));
    if (isNaN(v) || v < 0) { toast.error('Taux invalide'); return; }
    try {
      await axiosPrivate.post('/paramTauxTva', {
        id_compte: compteId, id_dossier: fileId, deductible: newTauxDeductible, taux: v,
      });
      setNewTauxValue('');
      await fetchTauxTva();
      toast.success('Taux ajouté');
    } catch (e) {
      toast.error('Erreur lors de l\'ajout');
    }
  };

  const handleDeleteTaux = async (id) => {
    try {
      await axiosPrivate.delete(`/paramTauxTva/${id}`);
      await fetchTauxTva();
      toast.success('Taux supprimé');
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const startEditTaux = (row) => {
    setEditTauxId(row.id);
    setEditTauxDeductible(row.deductible);
    setEditTauxValue(String(row.taux));
  };

  const cancelEditTaux = () => {
    setEditTauxId(null);
    setEditTauxValue('');
  };

  const saveEditTaux = async () => {
    const v = Number(String(editTauxValue).replace(',', '.'));
    if (isNaN(v) || v < 0) { toast.error('Taux invalide'); return; }
    try {
      await axiosPrivate.put(`/paramTauxTva/${editTauxId}`, { deductible: editTauxDeductible, taux: v });
      cancelEditTaux();
      await fetchTauxTva();
      toast.success('Taux modifié');
    } catch (e) {
      toast.error('Erreur lors de la modification');
    }
  };

  // --- Trésorerie (paramétrage : opérateur + mot-clé) ---
  const fetchTresorerie = async () => {
    if (!fileId || fileId === '0' || !compteId) return;
    setTresoLoading(true);
    try {
      const res = await axiosPrivate.get(`/paramTresorerie/${compteId}/${fileId}`);
      if (res.data?.state) setTresoList(res.data.data || []);
    } catch (e) {
      console.error('Erreur chargement Trésorerie', e);
    } finally {
      setTresoLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 7) fetchTresorerie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fileId]);

  const handleAddTreso = async () => {
    if (!newTresoMotCle.trim()) { toast.error('Mot-clé requis'); return; }
    try {
      await axiosPrivate.post('/paramTresorerie', {
        id_compte: compteId, id_dossier: fileId, operateur: newTresoOperateur, mot_cle: newTresoMotCle.trim(),
      });
      setNewTresoMotCle('');
      await fetchTresorerie();
      toast.success('Règle ajoutée');
    } catch (e) {
      toast.error('Erreur lors de l\'ajout');
    }
  };

  const handleDeleteTreso = async (id) => {
    try {
      await axiosPrivate.delete(`/paramTresorerie/${id}`);
      await fetchTresorerie();
      toast.success('Règle supprimée');
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const startEditTreso = (row) => {
    setEditTresoId(row.id);
    setEditTresoOperateur(row.operateur);
    setEditTresoMotCle(row.mot_cle);
  };

  const cancelEditTreso = () => {
    setEditTresoId(null);
    setEditTresoMotCle('');
  };

  const saveEditTreso = async () => {
    if (!editTresoMotCle.trim()) { toast.error('Mot-clé requis'); return; }
    try {
      await axiosPrivate.put(`/paramTresorerie/${editTresoId}`, { operateur: editTresoOperateur, mot_cle: editTresoMotCle.trim() });
      cancelEditTreso();
      await fetchTresorerie();
      toast.success('Règle modifiée');
    } catch (e) {
      toast.error('Erreur lors de la modification');
    }
  };

  const tresoOpLabel = (op) => (op === 'com_par' ? 'Commence par' : op === '=' ? 'Égal à' : 'Contient');

  // --- Vente (formats de numéro de facture) ---
  const fetchVente = async () => {
    if (!fileId || fileId === '0' || !compteId) return;
    setVenteLoading(true);
    try {
      const res = await axiosPrivate.get(`/paramVente/${compteId}/${fileId}`);
      if (res.data?.state) setVenteList(res.data.data || []);
    } catch (e) {
      console.error('Erreur chargement Vente', e);
    } finally {
      setVenteLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 8) fetchVente();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fileId]);

  const handleAddVente = async () => {
    if (!newVentePrefixe.trim()) { toast.error('Le préfixe est requis'); return; }
    try {
      await axiosPrivate.post('/paramVente', {
        id_compte: compteId, id_dossier: fileId,
        prefixe_facture: newVentePrefixe.trim(),
        longueur_facture: newVenteLongueur === '' ? null : newVenteLongueur,
        retirer_lettres: newVenteRetirer,
      });
      setNewVentePrefixe('');
      setNewVenteLongueur('');
      setNewVenteRetirer(false);
      await fetchVente();
      toast.success('Format ajouté');
    } catch (e) {
      toast.error('Erreur lors de l\'ajout');
    }
  };

  const handleDeleteVente = async (id) => {
    try {
      await axiosPrivate.delete(`/paramVente/${id}`);
      await fetchVente();
      toast.success('Format supprimé');
    } catch (e) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const startEditVente = (row) => {
    setEditVenteId(row.id);
    setEditVentePrefixe(row.prefixe_facture || '');
    setEditVenteLongueur(row.longueur_facture != null ? String(row.longueur_facture) : '');
    setEditVenteRetirer(!!row.retirer_lettres);
  };

  const cancelEditVente = () => {
    setEditVenteId(null);
    setEditVentePrefixe('');
    setEditVenteLongueur('');
    setEditVenteRetirer(false);
  };

  const saveEditVente = async () => {
    try {
      await axiosPrivate.put(`/paramVente/${editVenteId}`, {
        prefixe_facture: editVentePrefixe.trim(),
        longueur_facture: editVenteLongueur === '' ? null : editVenteLongueur,
        retirer_lettres: editVenteRetirer,
      });
      cancelEditVente();
      await fetchVente();
      toast.success('Format modifié');
    } catch (e) {
      toast.error('Erreur lors de la modification');
    }
  };

  // Style Header Tableau (Pro & Minimaliste)
  const headerStyle = {
    fontWeight: 800,
    color: '#94A3B8',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05rem',
    py: 1.5,
    borderBottom: '1px solid #E2E8F0',
    bgcolor: '#FCFDFF'
  };

  const FieldLabel = ({ children }) => (
    <Typography variant="caption" sx={{ display: 'block', mb: 0.8, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02rem' }}>
      {children}
    </Typography>
  );

  const handleRowEditStart = (params, event) => {
    event.defaultMuiPrevented = true;
  };

  const handleRowEditStop = (params, event) => {
    event.defaultMuiPrevented = true;
  };

  const handleEditClick = (id) => () => {
    setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.Edit } });
  };

  const handleSaveClick = (id) => () => {
    setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
  };

  const handleDeleteClick = (id) => () => {
    setDeleteDialogOpen(true);
    setRowToDelete(id);
  };

  const handleDeleteRow = () => {
    axiosPrivate.post('/param/codejournals/delete', {
      fileId,
      compteId,
      idToDelete: rowToDelete
    })
      .then((response) => {
        const resData = response.data;
        if (resData.state) {
          toast.success(resData.msg || "Code journal supprimé avec succès");
          fetchCodeJournaux();
        } else {
          toast.error(resData.msg || "Erreur lors de la suppression");
        }
      })
      .catch((error) => {
        toast.error('Erreur lors de la suppression');
      })
      .finally(() => {
        setDeleteDialogOpen(false);
      });
  };

  const handleCancelClick = (id) => () => {
    setRowModesModel({ ...rowModesModel, [id]: { mode: GridRowModes.View } });
  };

  const columns = [
    { field: 'code', headerName: 'Code', width: 150 },
    { field: 'libelle', headerName: 'Libellé', width: 300 },
    { field: 'type', headerName: 'Type', width: 150 },
    {
      field: 'actions',
      headerName: 'Actions',
      type: 'actions',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<EditOutlined />}
          label="Edit"
          onClick={handleEditClick(params.id)}
        />,
        <GridActionsCellItem
          icon={<DeleteOutline />}
          label="Delete"
          onClick={handleDeleteClick(params.id)}
        />,
      ],
    },
  ];

  if (noFile) {
    return <PopupTestSelectedFile confirmationState={sendToHome} />;
  }

  return (
    <Box sx={{
      p: 3, height: 'calc(100vh - 120px)',
      width: 'calc(100vw - 130px)', bgcolor: T.canvas, display: 'flex', flexDirection: 'column', overflow: 'hidden'
    }}>
      {/* --- EN-TÊTE --- */}
      <Box sx={{ mb: 2, flexShrink: 0 }}>
        <Breadcrumbs
          separator={<NavigateNext sx={{ fontSize: 16, color: T.faint }} />}
          sx={{ mb: 1.5, '& .MuiTypography-root, & a': { fontSize: '12.5px', fontWeight: 600 } }}
        >
          <Link underline="hover" onClick={() => navigate(`/tab/dashboard/${fileId}`)} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: T.muted }}>
            <DashboardOutlined sx={{ mr: 0.5, fontSize: 16 }} /> Dashboard
          </Link>
          <Typography sx={{ color: T.ink, fontWeight: 700 }}>Paramètres · CRM</Typography>
        </Breadcrumbs>

        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box sx={{ width: 38, height: 38, flex: 'none', borderRadius: '11px', display: 'grid', placeItems: 'center', color: T.accent, bgcolor: `${T.accent}14`, '& svg': { fontSize: 20 } }}>
            <AdminPanelSettingsOutlined />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '18px', fontWeight: 700, color: T.ink, letterSpacing: '.2px', lineHeight: 1.2 }}>
              CRM &amp; paramètres du dossier
            </Typography>
            <Typography sx={{ fontSize: '12px', color: T.muted, mt: 0.2 }}>
              Plan comptable, journaux, analytique &amp; seuils · {compteName}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <ConfirmActionDialog
        open={confirmSeuilOpen}
        onClose={handleCloseConfirmSeuil}
        onConfirm={handleConfirmSeuil}
        title="Confirmer la modification"
        message={`Voulez-vous vraiment modifier le seuil de variation analytique à ${pendingSeuilValue ?? ''}% ?`}
        confirmText="Valider"
        cancelText="Annuler"
        loading={confirmSeuilLoading}
        color={T.accent}
      />

      {/* --- ESPACE DE TRAVAIL : navigation (gauche) + contenu (droite) --- */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>

        {/* NAVIGATION LATÉRALE */}
        <Paper elevation={0} sx={{ ...panelSx, width: { xs: '100%', md: 240 }, flex: 'none', display: 'flex', flexDirection: 'column' }}>
          <List sx={{ p: 1 }}>
            {[
              { value: 4, label: 'Général', icon: <BusinessOutlined /> },
              { value: 1, label: 'Plan comptable', icon: <MenuBookOutlined /> },
              { value: 2, label: 'Codes journaux', icon: <ListAltOutlined /> },
              { value: 3, label: 'Analytique', icon: <AccountTreeOutlined /> },
              { value: 5, label: 'Comptes TVA', icon: <AnalyticsOutlined /> },
              { value: 0, label: 'Seuils', icon: <SettingsOutlined /> },
              { value: 6, label: 'Taux TVA', icon: <PercentOutlined /> },
              { value: 7, label: 'Trésorerie', icon: <AccountBalanceOutlined /> },
              { value: 8, label: 'Vente', icon: <SellOutlined /> },
            ].map((s) => {
              const active = activeTab === s.value;
              return (
                <ListItemButton
                  key={s.value}
                  selected={active}
                  onClick={() => setActiveTab(s.value)}
                  sx={{
                    borderRadius: '10px', mb: 0.5,
                    '&.Mui-selected': { bgcolor: T.accW, borderLeft: `3px solid ${T.accent}` },
                    '&.Mui-selected:hover': { bgcolor: T.accW },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 34, color: active ? T.accent : T.faint, '& svg': { fontSize: 20 } }}>
                    {s.icon}
                  </ListItemIcon>
                  <ListItemText primary={s.label} primaryTypographyProps={{ fontSize: '13px', fontWeight: 600, color: active ? T.ink : T.text }} />
                </ListItemButton>
              );
            })}
          </List>
        </Paper>

        {/* CONTENU */}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

          {/* GÉNÉRAL — identité du dossier */}
          {activeTab === 4 && (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3 }}>
                <Typography sx={{ ...sectionTitleSx, mb: 2.5 }}>Identité du dossier</Typography>
                <Grid container spacing={3} alignItems="flex-end">
                  <Grid item xs={12} md={5}>
                    <FieldLabel>Nom complet du dossier</FieldLabel>
                    <TextField value={nomDossier} onChange={(e) => setNomDossier(e.target.value)} fullWidth size="small" variant="outlined" />
                  </Grid>
                  <Grid item xs={12} md={5}>
                    <FieldLabel>Portefeuille associé</FieldLabel>
                    <Autocomplete
                      multiple
                      options={listePortefeuille}
                      getOptionLabel={(option) => option.nom || ''}
                      value={portefeuille}
                      onChange={(e, newValue) => setPortefeuille(newValue)}
                      size="small"
                      renderInput={(params) => (<TextField {...params} placeholder="Sélectionner" />)}
                    />
                  </Grid>
                  <Grid item xs={12} md={2} sx={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button
                      variant="contained"
                      disableElevation
                      startIcon={<SaveOutlined />}
                      sx={{ ...primaryBtnSx, width: '100%', height: '40px' }}
                      onClick={handleSaveHeader}
                    >
                      Enregistrer
                    </Button>
                  </Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {/* SEUILS */}
          {activeTab === 0 && (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Paper elevation={0} sx={{ ...panelSx, p: 3 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AnalyticsOutlined sx={{ color: T.accent }} /> Paramètres d'anomalies
                    </Typography>
                    <FieldLabel>Seuil de variation analytique N/N-1 (%)</FieldLabel>
                    <TextField
                      value={seuilVariation}
                      onChange={(e) => setSeuilVariation(e.target.value)}
                      onBlur={(e) => handleSeuilBlur(e.target.value)}
                      fullWidth
                      type="number"
                      size="small"
                    />
                  </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Paper elevation={0} sx={{ ...panelSx, p: 3 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AccessTimeOutlined sx={{ color: T.accent }} /> Paramètres de retard
                    </Typography>
                    <Stack direction="row" spacing={3}>
                      <Box sx={{ flex: 1 }}>
                        <FieldLabel>Retard Fournisseurs (Mois)</FieldLabel>
                        <TextField fullWidth type="number" value={retardFourns} onChange={(e) => setRetardFourns(e.target.value)} size="small" />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <FieldLabel>Retard Clients (Mois)</FieldLabel>
                        <TextField fullWidth type="number" value={retardClt} onChange={(e) => setRetardClt(e.target.value)} size="small" />
                      </Box>
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* TAUX TVA */}
          {activeTab === 6 && (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PercentOutlined sx={{ color: T.accent }} /> Taux de TVA
                </Typography>

                {/* Formulaire d'ajout */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-end' }} sx={{ mb: 3 }}>
                  <Box sx={{ minWidth: 200 }}>
                    <FieldLabel>Type de TVA</FieldLabel>
                    <Select
                      value={newTauxDeductible ? 'deductible' : 'collectee'}
                      onChange={(e) => setNewTauxDeductible(e.target.value === 'deductible')}
                      size="small"
                      fullWidth
                    >
                      <MenuItem value="deductible">Déductible</MenuItem>
                      <MenuItem value="collectee">Collectée</MenuItem>
                    </Select>
                  </Box>
                  <Box sx={{ minWidth: 160 }}>
                    <FieldLabel>Taux (%)</FieldLabel>
                    <TextField
                      value={newTauxValue}
                      onChange={(e) => setNewTauxValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTaux(); }}
                      type="number"
                      size="small"
                      placeholder="20"
                      fullWidth
                    />
                  </Box>
                  <Button
                    variant="contained"
                    disableElevation
                    startIcon={<AddOutlined />}
                    sx={{ ...primaryBtnSx, height: '40px' }}
                    onClick={handleAddTaux}
                  >
                    Ajouter
                  </Button>
                </Stack>

                {/* Liste des taux paramétrés */}
                <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '12px' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Taux</TableCell>
                        <TableCell align="right" sx={{ width: 90 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tauxTvaList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} sx={{ textAlign: 'center', color: T.faint, py: 3 }}>
                            {tauxTvaLoading ? 'Chargement…' : 'Aucun taux paramétré'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        tauxTvaList.map((row) => (
                          editTauxId === row.id ? (
                            <TableRow key={row.id}>
                              <TableCell>
                                <Select
                                  value={editTauxDeductible ? 'deductible' : 'collectee'}
                                  onChange={(e) => setEditTauxDeductible(e.target.value === 'deductible')}
                                  size="small"
                                  sx={{ minWidth: 180 }}
                                >
                                  <MenuItem value="deductible">Déductible (achats)</MenuItem>
                                  <MenuItem value="collectee">Collectée (ventes)</MenuItem>
                                </Select>
                              </TableCell>
                              <TableCell align="right">
                                <TextField
                                  value={editTauxValue}
                                  onChange={(e) => setEditTauxValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditTaux(); if (e.key === 'Escape') cancelEditTaux(); }}
                                  type="number"
                                  size="small"
                                  sx={{ width: 110 }}
                                  autoFocus
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                <IconButton size="small" onClick={saveEditTaux} sx={{ color: T.accent }}>
                                  <CheckOutlined fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={cancelEditTaux} sx={{ color: T.faint }}>
                                  <CloseOutlined fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={row.id} hover>
                              <TableCell>
                                <Chip
                                  label={row.deductible ? 'Déductible' : 'Collectée'}
                                  size="small"
                                  sx={{
                                    bgcolor: row.deductible ? T.accW : '#FDF2E9',
                                    color: row.deductible ? T.accent : '#B5791A',
                                    fontWeight: 700, fontSize: '11px',
                                  }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {Number(row.taux).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %
                              </TableCell>
                              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                <IconButton size="small" onClick={() => startEditTaux(row)} sx={{ color: T.muted }}>
                                  <EditOutlined fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDeleteTaux(row.id)} sx={{ color: T.neg }}>
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          )
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          )}

          {/* TRÉSORERIE */}
          {activeTab === 7 && (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccountBalanceOutlined sx={{ color: T.accent }} /> Trésorerie
                </Typography>

                {/* Formulaire d'ajout */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-end' }} sx={{ mb: 3 }}>
                  <Box sx={{ minWidth: 200 }}>
                    <FieldLabel>Filtre</FieldLabel>
                    <Select
                      value={newTresoOperateur}
                      onChange={(e) => setNewTresoOperateur(e.target.value)}
                      size="small"
                      fullWidth
                    >
                      <MenuItem value="cont">Contient</MenuItem>
                      <MenuItem value="com_par">Commence par</MenuItem>
                      <MenuItem value="=">Égal à</MenuItem>
                    </Select>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <FieldLabel>Mot-clé</FieldLabel>
                    <TextField
                      value={newTresoMotCle}
                      onChange={(e) => setNewTresoMotCle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTreso(); }}
                      size="small"
                      placeholder="ex. 512 ou BANQUE"
                      fullWidth
                    />
                  </Box>
                  <Button
                    variant="contained"
                    disableElevation
                    startIcon={<AddOutlined />}
                    sx={{ ...primaryBtnSx, height: '40px' }}
                    onClick={handleAddTreso}
                  >
                    Ajouter
                  </Button>
                </Stack>

                {/* Liste des règles */}
                <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '12px' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
                        <TableCell>Filtre</TableCell>
                        <TableCell>Mot-clé</TableCell>
                        <TableCell align="right" sx={{ width: 90 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tresoList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} sx={{ textAlign: 'center', color: T.faint, py: 3 }}>
                            {tresoLoading ? 'Chargement…' : 'Aucune règle paramétrée'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        tresoList.map((row) => (
                          editTresoId === row.id ? (
                            <TableRow key={row.id}>
                              <TableCell>
                                <Select
                                  value={editTresoOperateur}
                                  onChange={(e) => setEditTresoOperateur(e.target.value)}
                                  size="small"
                                  sx={{ minWidth: 160 }}
                                >
                                  <MenuItem value="cont">Qui Contient</MenuItem>
                                  <MenuItem value="com_par">Commence par</MenuItem>
                                  <MenuItem value="=">Égal à</MenuItem>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <TextField
                                  value={editTresoMotCle}
                                  onChange={(e) => setEditTresoMotCle(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditTreso(); if (e.key === 'Escape') cancelEditTreso(); }}
                                  size="small"
                                  autoFocus
                                  fullWidth
                                />
                              </TableCell>
                              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                <IconButton size="small" onClick={saveEditTreso} sx={{ color: T.accent }}>
                                  <CheckOutlined fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={cancelEditTreso} sx={{ color: T.faint }}>
                                  <CloseOutlined fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={row.id} hover>
                              <TableCell>
                                <Chip
                                  label={tresoOpLabel(row.operateur)}
                                  size="small"
                                  sx={{ bgcolor: T.accW, color: T.accent, fontWeight: 700, fontSize: '11px' }}
                                />
                              </TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>{row.mot_cle}</TableCell>
                              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                <IconButton size="small" onClick={() => startEditTreso(row)} sx={{ color: T.muted }}>
                                  <EditOutlined fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDeleteTreso(row.id)} sx={{ color: T.neg }}>
                                  <DeleteOutline fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          )
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          )}

          {/* VENTE */}
          {activeTab === 8 && (
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <Paper elevation={0} sx={{ ...panelSx, p: 3 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SellOutlined sx={{ color: T.accent }} /> Vente — numéro de facture
                </Typography>

                {/* Formulaire d'ajout */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-end' }} sx={{ mb: 3 }}>
                  <Box sx={{ flex: 1, minWidth: 160 }}>
                    <FieldLabel>Préfixe numéro de facture</FieldLabel>
                    <TextField
                      value={newVentePrefixe}
                      onChange={(e) => setNewVentePrefixe(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddVente(); }}
                      size="small"
                      placeholder="ex. FV"
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ minWidth: 160 }}>
                    <FieldLabel>Longueur (optionnel)</FieldLabel>
                    <TextField
                      value={newVenteLongueur}
                      onChange={(e) => setNewVenteLongueur(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddVente(); }}
                      type="number"
                      size="small"
                      placeholder="vide = toutes"
                      fullWidth
                    />
                  </Box>
                  <FormControlLabel
                    sx={{ mb: 0.5, whiteSpace: 'nowrap' }}
                    control={<Checkbox size="small" checked={newVenteRetirer} onChange={(e) => setNewVenteRetirer(e.target.checked)} sx={{ color: T.faint, '&.Mui-checked': { color: T.accent } }} />}
                    label={<Typography sx={{ fontSize: '13px', fontWeight: 600 }}>Retirer les lettres</Typography>}
                  />
                  <Button
                    variant="contained"
                    disableElevation
                    startIcon={<AddOutlined />}
                    sx={{ ...primaryBtnSx, height: '40px' }}
                    onClick={handleAddVente}
                  >
                    Ajouter
                  </Button>
                </Stack>

                {/* Liste des formats */}
                <TableContainer sx={{ border: `1px solid ${T.line}`, borderRadius: '12px' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ '& th': { bgcolor: '#F8FAFC', color: '#64748B', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px' } }}>
                        <TableCell>Préfixe</TableCell>
                        <TableCell>Longueur</TableCell>
                        <TableCell align="center">Retirer lettres</TableCell>
                        <TableCell align="right" sx={{ width: 90 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {venteList.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} sx={{ textAlign: 'center', color: T.faint, py: 3 }}>
                            {venteLoading ? 'Chargement…' : 'Aucun format paramétré'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        venteList.map((row) => (
                          editVenteId === row.id ? (
                            <TableRow key={row.id}>
                              <TableCell>
                                <TextField value={editVentePrefixe} onChange={(e) => setEditVentePrefixe(e.target.value)} size="small" sx={{ minWidth: 120 }} autoFocus />
                              </TableCell>
                              <TableCell>
                                <TextField value={editVenteLongueur} onChange={(e) => setEditVenteLongueur(e.target.value)} type="number" size="small" sx={{ width: 100 }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditVente(); if (e.key === 'Escape') cancelEditVente(); }} />
                              </TableCell>
                              <TableCell align="center">
                                <Checkbox size="small" checked={editVenteRetirer} onChange={(e) => setEditVenteRetirer(e.target.checked)} sx={{ color: T.faint, '&.Mui-checked': { color: T.accent } }} />
                              </TableCell>
                              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                <IconButton size="small" onClick={saveEditVente} sx={{ color: T.accent }}><CheckOutlined fontSize="small" /></IconButton>
                                <IconButton size="small" onClick={cancelEditVente} sx={{ color: T.faint }}><CloseOutlined fontSize="small" /></IconButton>
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={row.id} hover>
                              <TableCell sx={{ fontWeight: 700 }}>{row.prefixe_facture || '—'}</TableCell>
                              <TableCell>{row.longueur_facture != null ? row.longueur_facture : '—'}</TableCell>
                              <TableCell align="center">
                                <Chip label={row.retirer_lettres ? 'Oui' : 'Non'} size="small" sx={{ bgcolor: row.retirer_lettres ? T.accW : '#F1F5F9', color: row.retirer_lettres ? T.accent : T.muted, fontWeight: 700, fontSize: '11px' }} />
                              </TableCell>
                              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                <IconButton size="small" onClick={() => startEditVente(row)} sx={{ color: T.muted }}><EditOutlined fontSize="small" /></IconButton>
                                <IconButton size="small" onClick={() => handleDeleteVente(row.id)} sx={{ color: T.neg }}><DeleteOutline fontSize="small" /></IconButton>
                              </TableCell>
                            </TableRow>
                          )
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          )}

          {/* PLAN COMPTABLE */}
          {activeTab === 1 && (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <PlanComptableDataGrid fileId={fileId} compteId={compteId} axiosPrivate={axiosPrivate} />
            </Box>
          )}

          {/* CODES JOURNAUX */}
          {activeTab === 2 && (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <CodesJournauxDataGrid fileId={fileId} compteId={compteId} axiosPrivate={axiosPrivate} pc={pc} />
            </Box>
          )}

          {/* ANALYTIQUE */}
          {activeTab === 3 && (
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <AnalytiqueDataGrid fileId={fileId} compteId={compteId} axiosPrivate={axiosPrivate} />
            </Box>
          )}

          {/* COMPTES TVA (nature) */}
          {activeTab === 5 && (
            <ComptesTvaSection fileId={fileId} compteId={compteId} axiosPrivate={axiosPrivate} pc={pc} />
          )}
        </Box>
      </Box>

    </Box>
  );
};

export default CRM;