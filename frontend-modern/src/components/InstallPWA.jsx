import React, { useEffect, useState } from 'react';
import { Button, Modal, ModalContent, useDisclosure } from "@heroui/react";
import { DownloadOutlined } from '@ant-design/icons';

// Native-like iOS Icons
const IOSShareIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#007AFF]">
        <path d="M12 3V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 8L12 3L17 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 13V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const IOSAddIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-900 dark:text-white">
        <rect x="2" y="2" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 12H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const InstallPWA = () => {
    const [supportsPWA, setSupportsPWA] = useState(false);
    const [promptInstall, setPromptInstall] = useState(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    useEffect(() => {
        const handler = (e) => {
            e.preventDefault();
            setSupportsPWA(true);
            setPromptInstall(e);
        };

        window.addEventListener("beforeinstallprompt", handler);

        // Check for iOS
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const ios = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
        setIsIOS(ios);

        // Strict Mobile Check (phones/tablets only)
        // Exclude generic "Macintosh" or "Windows" unless they have touch points (tablets)
        const mobileCheck = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
        setIsMobile(mobileCheck);

        // Check if already in standalone mode
        const checkStandalone = () => {
            const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone ||
                document.referrer.includes('android-app://');
            setIsStandalone(isStandaloneMode);
        };

        checkStandalone();

        // Listen for changes in display mode
        const mediaQuery = window.matchMedia('(display-mode: standalone)');
        const mediaQueryHandler = (e) => setIsStandalone(e.matches);

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', mediaQueryHandler);
        } else {
            // Fallback for older browsers
            mediaQuery.addListener(mediaQueryHandler);
        }

        return () => {
            window.removeEventListener("beforeinstallprompt", handler);
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', mediaQueryHandler);
            } else {
                mediaQuery.removeListener(mediaQueryHandler);
            }
        };
    }, []);

    const handleInstallClick = async (e) => {
        if (isIOS) {
            onOpen();
        } else if (promptInstall) {
            promptInstall.prompt();
            const { outcome } = await promptInstall.userChoice;
            setPromptInstall(null);
        }
    };

    // Helper to determine if we should show the button
    const shouldShow = !isStandalone && isMobile && (supportsPWA || isIOS);

    if (!shouldShow) return null;

    return (
        <>
            <Button
                color="primary"
                variant="flat"
                size="sm"
                startContent={<DownloadOutlined />}
                onPress={handleInstallClick}
                onClick={handleInstallClick} // Fallback
                className="font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
                Install App
            </Button>

            <Modal
                isOpen={isOpen}
                onOpenChange={onOpenChange}
                placement="center"
                backdrop="blur"
                classNames={{
                    base: "bg-white dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/10 shadow-2xl rounded-3xl m-4",
                    header: "border-b border-gray-100 dark:border-white/5",
                    body: "p-6",
                    footer: "border-t border-gray-100 dark:border-white/5"
                }}
            >
                <ModalContent>
                    {(onClose) => (
                        <>
                            <div className="flex flex-col items-center text-center p-2">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 dark:from-white dark:to-gray-300 shadow-xl mb-4 flex items-center justify-center p-1">
                                    <img src="/pwa-icon.png" alt="App Icon" className="w-full h-full rounded-xl object-cover" />
                                </div>

                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                    Install Application
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                                    Install this app on your home screen for a better, fullscreen experience and quick access.
                                </p>

                                <div className="w-full space-y-3 bg-gray-50 dark:bg-white/5 p-4 rounded-2xl mb-4">
                                    <div className="flex items-center gap-4 text-left">
                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center shadow-sm shrink-0">
                                            <IOSShareIcon />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Step 1</p>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Tap the <span className="text-[#007AFF] font-bold">Share</span> button attached to your browser bar.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="h-px w-full bg-gray-200 dark:bg-white/5" />

                                    <div className="flex items-center gap-4 text-left">
                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center shadow-sm shrink-0">
                                            <IOSAddIcon />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Step 2</p>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                                Scroll down and select <span className="font-bold">Add to Home Screen</span>.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 pt-2">
                                <Button
                                    className="w-full bg-emerald-500 text-white font-bold rounded-xl h-12 shadow-lg shadow-emerald-500/30"
                                    onPress={onClose}
                                >
                                    I Understand
                                </Button>
                            </div>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
};

export default InstallPWA;
