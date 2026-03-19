App.pdfLoader = (() => {
    const state = App.state;
    const { showError, clearResults } = App.ui;
    const { renderThumbnails, updateSelectedCount } = App.thumbnails;

    async function loadPDF(file) {
        clearResults();
        showError('');

        try {
            const arrayBuffer = await file.arrayBuffer();

            state.pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            state.totalPages = state.pdfDoc.getPageCount();

            const pdfjsLib = window['pdfjs-dist/build/pdf'];
            if (pdfjsLib) {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
                state.pdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
            }

            document.getElementById('fileName').textContent = file.name;
            document.getElementById('pageCount').textContent =
                `${state.totalPages} page${state.totalPages !== 1 ? 's' : ''}`;

            document.getElementById('fileInfo').classList.add('visible');
            document.getElementById('splitOptions').classList.add('visible');

            document.getElementById('fromPage').value = 1;
            document.getElementById('toPage').value = state.totalPages;
            document.getElementById('fromPage').max = state.totalPages;
            document.getElementById('toPage').max = state.totalPages;

            state.selectedPages = new Set([...Array(state.totalPages).keys()].map(i => i + 1));
            updateSelectedCount();

            await renderThumbnails();
        } catch (err) {
            showError('Failed to load PDF. It may be corrupted or password-protected.');
            console.error(err);
        }
    }

    return { loadPDF };
})();
