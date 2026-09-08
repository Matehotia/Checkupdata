import { useEffect } from "react";
import axios from "axios";
import useAuth from "../src/hooks/useAuth";
import useRefreshToken from "../src/hooks/useRefreshToken";

// const BASE_URL = "http://localhost:5100";
//const BASE_URL = 'https://finance.inframad.com/api';

const BASE_URL = import.meta.env.VITE_API_URL;

const axiosPrivate = axios.create({
    baseURL: BASE_URL,
    headers: { "Content-Type": "application/json" },
    withCredentials: true,
});

const useAxiosPrivate = () => {
    const { auth } = useAuth();
    const refresh = useRefreshToken();

    useEffect(() => {
        const requestIntercept = axiosPrivate.interceptors.request.use(
            (config) => {
                if (!config.headers["Authorization"]) {
                    config.headers["Authorization"] = `Bearer ${auth?.accessToken}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // Rafraîchit le token sur 403 (token expiré) puis rejoue la requête.
        const responseIntercept = axiosPrivate.interceptors.response.use(
            (response) => response,
            async (error) => {
                const prevRequest = error?.config;
                if (error?.response?.status === 403 && !prevRequest?.sent) {
                    prevRequest.sent = true;
                    const newAccessToken = await refresh();
                    prevRequest.headers["Authorization"] = `Bearer ${newAccessToken}`;
                    return axiosPrivate(prevRequest);
                }
                return Promise.reject(error);
            }
        );

        return () => {
            axiosPrivate.interceptors.request.eject(requestIntercept);
            axiosPrivate.interceptors.response.eject(responseIntercept);
        };
    }, [auth?.accessToken, refresh]);

    return axiosPrivate;
};

export default useAxiosPrivate;
