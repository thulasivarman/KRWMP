/**
 * KRWMP Map Print and Export Tools
 * Handles browser printing and current map canvas export as PNG.
 */

window.initializeMapExportControls = function () {
    const printButton = document.getElementById('btn-map-print');
    const exportButton = document.getElementById('btn-map-export');

    if (printButton) {
        printButton.addEventListener('click', () => {
            window.print();
        });
    }

    if (exportButton) {
        exportButton.addEventListener('click', () => {
            window.exportCurrentMapAsPng();
        });
    }
};

window.exportCurrentMapAsPng = function () {
    try {
        if (!window.KRWMP_MAP) {
            alert('Map is not ready yet.');
            return;
        }

        window.KRWMP_MAP.once('idle', () => {
            const canvas = window.KRWMP_MAP.getCanvas();
            const imageUrl = canvas.toDataURL('image/png');

            const link = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

            link.href = imageUrl;
            link.download = `KRWMP-map-export-${timestamp}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        window.KRWMP_MAP.triggerRepaint();
    } catch (error) {
        console.error('Map export failed:', error);
        alert('Map export failed. This can happen when external basemap tiles restrict canvas export. Use the Print button as fallback.');
    }
};
