import React, { useEffect, useState } from 'react';
import { Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/react";
import { DownloadOutlined, ShareAltOutlined, PlusSquareOutlined } from '@ant-design/icons';

const InstallPWA = () => {
    const [supportsPWA, setSupportsPWA] = useState(false);
    const [promptInstall, setPromptInstall] = useState(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const { isOpen, onOpen, onOpenChange } = useDisclosure();

    useEffect(() => {
        const handler = (e) => {
            e.preventDefault();
            setSupportsPWA(true);
            setPromptInstall(e);
        };

        window.addEventListener("beforeinstallprompt", handler);

        // Check for iOS
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        setIsIOS(ios);

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

    const handleInstallClick = (e) => {
        e.preventDefault();
        if (isIOS) {
            onOpen();
        } else if (promptInstall) {
            promptInstall.prompt();
        }
    };

    // Helper to determine if we should show the button
    // Show if: (Android AND supportsPWA) OR (iOS AND NOT Standalone)
    const shouldShow = !isStandalone && (supportsPWA || isIOS);

    if (!shouldShow) return null;

    return (
        <>
            <Button
                color="primary"
                variant="flat"
                size="sm"
                startContent={<DownloadOutlined />}
                onPress={handleInstallClick}
                className="font-medium"
            >
                Install App
            </Button>

            <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="center">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">Install App</ModalHeader>
                            <ModalBody>
                                <p>To install this app on your iOS device:</p>
                                <div className="flex flex-col gap-4 mt-2">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gray-100 rounded-lg">
                                            <ShareAltOutlined style={{ fontSize: '20px', color: '#007AFF' }} />
                                        </div>
                                        <span>Tap the <strong>Share</strong> button in your browser menu.</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gray-100 rounded-lg">
                                            <PlusSquareOutlined style={{ fontSize: '20px' }} />
                                        </div>
                                        <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                                    </div>
                                </div>
                            </ModalBody>
                            <ModalFooter>
                                <Button color="primary" onPress={onClose}>
                                    Got it
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </>
    );
};

export default InstallPWA;
