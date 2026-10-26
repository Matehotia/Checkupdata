import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from '../../config/axios';
import useAuth from '../hooks/useAuth';
import { jwtDecode } from 'jwt-decode';

const ExercicePeriodeContext = createContext();

export const useExercicePeriode = () => {
    const context = useContext(ExercicePeriodeContext);
    if (!context) {
        throw new Error('useExercicePeriode doit être utilisé dans un ExercicePeriodeProvider');
    }
    return context;
};

export const ExercicePeriodeProvider = ({ children }) => {
    const [selectedExerciceId, setSelectedExerciceId] = useState('');
    const [selectedPeriodeId, setSelectedPeriodeId] = useState('');
    const [selectedPeriodeDates, setSelectedPeriodeDates] = useState(null);
    const [listeExercice, setListeExercice] = useState([]);
    const [listePeriodes, setListePeriodes] = useState([]);
    const [loading, setLoading] = useState(false);

    // Clés de persistance (sessionStorage) pour conserver le choix après rechargement de page.
    const STORAGE_EXERCICE = 'exercicePeriode_exerciceId';
    const STORAGE_PERIODE = 'exercicePeriode_periodeId';
    // La restauration de la période ne doit se faire qu'une seule fois (au montage),
    // pas à chaque changement d'exercice par l'utilisateur.
    const periodeRestoredRef = useRef(false);

    // Récupérer les IDs depuis JWT token (priorité) et sessionStorage (fallback)
    const { auth } = useAuth();
    const getIds = () => {
        const decodedCompteId = auth?.accessToken ? jwtDecode(auth.accessToken)?.UserInfo?.compteId : null;
        return {
            id_compte: parseInt(decodedCompteId) || parseInt(sessionStorage.getItem('compteId')) || 1,
            id_dossier: parseInt(sessionStorage.getItem('fileId')) || 1
        };
    };

    // Formatter les dates
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    // Récupérer les exercices
    const fetchExercices = useCallback(async () => {
        try {
            setLoading(true);
            const { id_dossier } = getIds();
            const response = await axios.get(`/paramExercice/listeExercice/${id_dossier}`);
            const resData = response.data;
            if (resData.state) {
                setListeExercice(resData.list || []);
                // Si aucun exercice sélectionné (ex. après rechargement de page),
                // restaurer le dernier choix mémorisé s'il existe encore dans la liste,
                // sinon prendre le premier exercice par défaut.
                if (resData.list && resData.list.length > 0 && !selectedExerciceId) {
                    const stored = sessionStorage.getItem(STORAGE_EXERCICE);
                    const match = stored ? resData.list.find(e => String(e.id) === String(stored)) : null;
                    setSelectedExerciceId(match ? match.id : resData.list[0].id);
                }
            }
        } catch (error) {
            console.error('Error fetching exercices:', error);
            setListeExercice([]);
        } finally {
            setLoading(false);
        }
    }, [selectedExerciceId]);

    // Récupérer les périodes pour un exercice
    const fetchPeriodes = useCallback(async (exerciceId) => {
        if (!exerciceId) {
            setListePeriodes([]);
            return;
        }
        try {
            const response = await axios.get(`/paramExercice/listePeriodes/${exerciceId}`);
            if (response.data.state) {
                setListePeriodes(response.data.list || []);
            } else {
                setListePeriodes([]);
            }
        } catch (error) {
            console.error('Error fetching periodes:', error);
            setListePeriodes([]);
        }
    }, []);

    // Gérer le changement d'exercice
    const handleChangeExercice = useCallback((exerciceId) => {
        setSelectedExerciceId(exerciceId);
        setSelectedPeriodeId('');
        setSelectedPeriodeDates(null);
        fetchPeriodes(exerciceId);
    }, [fetchPeriodes]);

    // Gérer le changement de période
    const handleChangePeriode = useCallback((periodeId) => {
        setSelectedPeriodeId(periodeId);
        setSelectedPeriodeDates(null);

        if (periodeId && periodeId !== 'exercice') {
            const periode = listePeriodes.find(p => p.id === periodeId);
            if (periode) {
                setSelectedPeriodeDates({
                    date_debut: periode.date_debut,
                    date_fin: periode.date_fin
                });
            }
        }
    }, [listePeriodes]);

    // Récupérer les dates de l'exercice courant
    const currentExerciceDates = useMemo(() => {
        const exercice = listeExercice.find(e => e.id === selectedExerciceId);
        if (exercice) {
            return {
                date_debut: exercice.date_debut,
                date_fin: exercice.date_fin,
                libelle_rang: exercice.libelle_rang
            };
        }
        return null;
    }, [listeExercice, selectedExerciceId]);

    // Obtenir les paramètres pour les API
    const getApiParams = useCallback(() => {
        const params = new URLSearchParams();

        if (selectedPeriodeDates) {
            params.append('date_debut', selectedPeriodeDates.date_debut);
            params.append('date_fin', selectedPeriodeDates.date_fin);
        } else if (currentExerciceDates) {
            params.append('date_debut', currentExerciceDates.date_debut);
            params.append('date_fin', currentExerciceDates.date_fin);
        }

        if (selectedPeriodeId) {
            params.append('id_periode', selectedPeriodeId);
        }

        return params;
    }, [selectedPeriodeDates, currentExerciceDates, selectedPeriodeId]);

    // Effet pour charger les exercices au montage
    useEffect(() => {
        fetchExercices();
    }, [fetchExercices]);

    // Effet pour charger les périodes quand l'exercice change
    useEffect(() => {
        if (selectedExerciceId) {
            fetchPeriodes(selectedExerciceId);
        } else {
            setListePeriodes([]);
        }
    }, [selectedExerciceId, fetchPeriodes]);

    // Mémoriser l'exercice sélectionné (persiste après rechargement de page)
    useEffect(() => {
        if (selectedExerciceId) {
            sessionStorage.setItem(STORAGE_EXERCICE, String(selectedExerciceId));
        }
    }, [selectedExerciceId]);

    // Mémoriser la période sélectionnée.
    // IMPORTANT : ne pas toucher au sessionStorage tant que la restauration initiale
    // n'a pas eu lieu, sinon le '' du montage effacerait la période à restaurer.
    useEffect(() => {
        if (!periodeRestoredRef.current) return;
        if (selectedPeriodeId) {
            sessionStorage.setItem(STORAGE_PERIODE, String(selectedPeriodeId));
        } else {
            sessionStorage.removeItem(STORAGE_PERIODE);
        }
    }, [selectedPeriodeId]);

    // Restaurer la période mémorisée UNE SEULE FOIS, une fois les périodes chargées au montage.
    // (On n'écrase pas le choix quand l'utilisateur change ensuite d'exercice.)
    useEffect(() => {
        if (periodeRestoredRef.current) return;
        if (!selectedPeriodeId && listePeriodes.length > 0) {
            const stored = sessionStorage.getItem(STORAGE_PERIODE);
            if (stored && stored !== 'exercice') {
                const p = listePeriodes.find(pp => String(pp.id) === String(stored));
                if (p) {
                    setSelectedPeriodeId(p.id);
                    setSelectedPeriodeDates({ date_debut: p.date_debut, date_fin: p.date_fin });
                }
            }
            periodeRestoredRef.current = true;
        }
    }, [listePeriodes, selectedPeriodeId]);

    const value = {
        // États
        selectedExerciceId,
        selectedPeriodeId,
        selectedPeriodeDates,
        listeExercice,
        listePeriodes,
        loading,
        currentExerciceDates,

        // Actions
        handleChangeExercice,
        handleChangePeriode,
        setSelectedExerciceId,
        setSelectedPeriodeId,

        // Utilitaires
        formatDate,
        getApiParams,
        getIds
    };

    return (
        <ExercicePeriodeContext.Provider value={value}>
            {children}
        </ExercicePeriodeContext.Provider>
    );
};

export default ExercicePeriodeContext;
