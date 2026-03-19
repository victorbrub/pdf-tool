App.downloader = (() => {
    const state = App.state;

    function triggerDownload(bytes, filename) {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function downloadFile(idx) {
        const file = state.generatedFiles[idx];
        triggerDownload(file.bytes, file.name);
    }

    function downloadAll() {
        state.generatedFiles.forEach((f, i) => {
            setTimeout(() => triggerDownload(f.bytes, f.name), i * 300);
        });
    }

    return { triggerDownload, downloadFile, downloadAll };
})();
