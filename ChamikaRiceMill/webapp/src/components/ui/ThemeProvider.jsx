import React, { createContext, useContext, useEffect } from "react";

const ThemeContext = createContext({
    theme: "dark",
    toggleTheme: () => { },
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove("light");
        root.classList.add("dark");
        localStorage.setItem("mill-theme", "dark");
    }, []);

    const toggleTheme = () => {
        // Dark mode is permanently enforced
    };

    return (
        <ThemeContext.Provider value={{ theme: "dark", toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
