"use client";

import { useEffect } from "react";

export default function FontReady() {
    useEffect(() => {
        let isMounted = true;

        const showApp = () => {
            if (!isMounted) return;

            document.body.classList.remove("fontLoading");
            document.body.classList.add("fontReady");
        };

        if ("fonts" in document) {
            void document.fonts.ready.then(showApp, showApp);
        } else {
            showApp();
        }

        return () => {
            isMounted = false;
        };
    }, []);

    return null;
}
