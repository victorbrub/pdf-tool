App.ui = (() => {
    const state = App.state;

    function showError(msg) {
        const el = document.getElementById('errorBox');
        el.textContent = msg;
        el.classList.toggle('visible', !!msg);
    }

    function setProgress(pct, label) {
        document.getElementById('progressBar').style.width = pct + '%';
        document.getElementById('progressLabel').textContent = label;
    }

    function showProgressBar(show) {
        document.getElementById('progressWrap').classList.toggle('visible', show);
        document.getElementById('progressLabel').classList.toggle('visible', show);
    }

    function clearResults() {
        document.getElementById('results').classList.remove('visible');
        document.getElementById('resultFiles').innerHTML = '';
        state.generatedFiles = [];
        showProgressBar(false);
    }

    function clearFile() {
        state.pdfDoc = null;
        state.pdfJsDoc = null;
        state.totalPages = 0;
        state.selectedPages.clear();
        document.getElementById('fileInput').value = '';
        document.getElementById('fileInfo').classList.remove('visible');
        document.getElementById('splitOptions').classList.remove('visible');
        document.getElementById('thumbnails').innerHTML = '';
        clearResults();
        showError('');
    }

    return { showError, setProgress, showProgressBar, clearResults, clearFile };
})();
