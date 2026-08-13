import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(authService.getCurrentUser());
    const [savedUsername, setSavedUsername] = useState(authService.getSavedUsername());

    useEffect(() => {
        const unsub = authService.subscribe((event, data) => {
            if (event === 'authStateChanged') {
                setUser(data);
                setSavedUsername(authService.getSavedUsername());
            }
        });
        return unsub;
    }, []);

    const authenticateUser = async (username, credential, isPin = true) => {
        const result = await authService.authenticateUser(username, credential, isPin);
        if (result.success) {
            setSavedUsername(authService.getSavedUsername());
        }
        return result;
    };

    const logout = () => {
        authService.logout();
    };

    const clearSavedUsername = () => {
        authService.setSavedUsername('');
        setSavedUsername('');
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            savedUsername,
            authenticateUser, 
            logout, 
            clearSavedUsername,
            findUserByUsername: (u) => authService.findUserByUsername(u),
            getAllStaffFromDb: () => authService.getAllStaffFromDb(),
            syncStaffToIndexedDB: () => authService.syncStaffToIndexedDB(),
            isLoggedIn: !!user 
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
