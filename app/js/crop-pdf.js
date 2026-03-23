(function () {
    'use strict';

    var MM_TO_PT = 2.83465;

    var state = {
        pdfBytes: null,
        fileName: '',
        pageCount: 0,
        scope: 'all',   // 'all' | 'page'
        currentPage: 1, // 1-based, used in per-page scope
        // per-page margin overrides: { 1: {top,bottom,left,right}, ... }
        pageMargins: {}
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameLabel = document.getElementById('fileNameLabel');
    var filePagesLabel = document.getElementById('filePagesLabel');
    var btnChangeFile = document.getElementById('btnChangeFile');
    var btnScopeAll = document.getElementById('btnScopeAll');
    var btnScopePage = document.getElementById('btnScopePage');
    var pageNavWrap = document.getElementById('pageNavWrap');
    var pageIndicator = document.getElementById('pageIndicator');
    var btnPrevPage = document.getElementById('btnPrevPage');
    var btnNextPage = document.getElementById('btnNextPage');
    var previewWrap = document.getElementById('previewWrap');
    var previewCanvas = document.getElementById('previewCanvas');
    var marginTop = document.getElementById('marginTop');
    var marginBottom = document.getElementById('marginBottom');
    var marginLeft = document.getElementById('marginLeft');
    var marginRight = document.getElementById('marginRight');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var btnCrop = document.getElementById('btnCrop');
    var results = document.getElementById('results');
    var downloadLink = document.getElementById('downloadLink');
    var btnAgain = document.getElementById('btnAgain');

    // ── File pick / drop ──────────────────────────────────────────────────────
    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        var f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });
    btnChangeFile.addEventListener('click', startOver);

    function handleFile(file) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            showError('Please select a valid PDF file.');
            return;
        }
        hideError();
        var reader = new FileReader();
        reader.onload = function (e) {
            state.pdfBytes = new Uint8Array(e.target.result);
            state.fileName = file.name;
            state.pageCount = 0;
            state.currentPage = 1;
            state.pageMargins = {};
            // Count pages using pdf-lib
            PDFLib.PDFDocument.load(state.pdfBytes).then(function (doc) {
                state.pageCount = doc.getPageCount();
                fileNameLabel.textContent = state.fileName;
                filePagesLabel.textContent = state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');
                updateScopeUI();
                dropZone.style.display = 'none';
                optionsPanel.style.display = 'block';
                loadPreview(state.currentPage);
            }).catch(function (err) {
                showError('Could not read PDF. ' + err.message);
            });
        };
        reader.readAsArrayBuffer(file);
    }

    // ── Scope toggle ──────────────────────────────────────────────────────────
    btnScopeAll.addEventListener('click', function () {
        state.scope = 'all';
        updateScopeUI();
    });
    btnScopePage.addEventListener('click', function () {
        state.scope = 'page';
        state.currentPage = 1;
        updateScopeUI();
        loadPreview(state.currentPage);
    });

    function updateScopeUI() {
        btnScopeAll.classList.toggle('active', state.scope === 'all');
        btnScopePage.classList.toggle('active', state.scope === 'page');
        pageNavWrap.style.display = state.scope === 'page' ? 'block' : 'none';
        previewWrap.style.display = state.scope === 'page' ? 'flex' : 'none';
        updatePageNav();
        if (state.scope === 'page') {
            loadMarginsForPage(state.currentPage);
        }
    }

    function updatePageNav() {
        if (state.scope !== 'page') return;
        pageIndicator.textContent = 'Page ' + state.currentPage + ' / ' + state.pageCount;
        btnPrevPage.disabled = state.currentPage <= 1;
        btnNextPage.disabled = state.currentPage >= state.pageCount;
    }

    btnPrevPage.addEventListener('click', function () {
        if (state.currentPage > 1) {
            saveMarginsForPage(state.currentPage);
            state.currentPage--;
            loadMarginsForPage(state.currentPage);
            updatePageNav();
            loadPreview(state.currentPage);
        }
    });
    btnNextPage.addEventListener('click', function () {
        if (state.currentPage < state.pageCount) {
            saveMarginsForPage(state.currentPage);
            state.currentPage++;
            loadMarginsForPage(state.currentPage);
            updatePageNav();
            loadPreview(state.currentPage);
        }
    });

    function saveMarginsForPage(pg) {
        state.pageMargins[pg] = {
            top: parseFloat(marginTop.value) || 0,
            bottom: parseFloat(marginBottom.value) || 0,
            left: parseFloat(marginLeft.value) || 0,
            right: parseFloat(marginRight.value) || 0
        };
    }
    function loadMarginsForPage(pg) {
        var m = state.pageMargins[pg];
        if (m) {
            marginTop.value = m.top;
            marginBottom.value = m.bottom;
            marginLeft.value = m.left;
            marginRight.value = m.right;
        } else {
            marginTop.value = marginBottom.value = marginLeft.value = marginRight.value = '0';
        }
    }

    // ── Preview (pdfjs) ───────────────────────────────────────────────────────
    function loadPreview(pageNum) {
        if (!state.pdfBytes) return;
        if (typeof pdfjsLib === 'undefined') return;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
        pdfjsLib.getDocument({ data: state.pdfBytes.slice() }).promise.then(function (pdfDoc) {
            return pdfDoc.getPage(pageNum);
        }).then(function (page) {
            var viewport = page.getViewport({ scale: 1 });
            var scale = Math.min(280 / viewport.width, 260 / viewport.height);
            var scaled = page.getViewport({ scale: scale });
            previewCanvas.width = scaled.width;
            previewCanvas.height = scaled.height;
            var ctx = previewCanvas.getContext('2d');
            page.render({ canvasContext: ctx, viewport: scaled });
        }).catch(function () {/* preview fails silently */ });
    }

    // ── Crop ──────────────────────────────────────────────────────────────────
    btnCrop.addEventListener('click', function () {
        if (!state.pdfBytes) return;

        // Save current page margins if in per-page mode
        if (state.scope === 'page') saveMarginsForPage(state.currentPage);

        // Validate
        var globalM = {
            top: parseFloat(marginTop.value) || 0,
            bottom: parseFloat(marginBottom.value) || 0,
            left: parseFloat(marginLeft.value) || 0,
            right: parseFloat(marginRight.value) || 0
        };

        btnCrop.disabled = true;
        progressWrap.style.display = 'block';
        progressBar.style.width = '0%';
        progressLabel.style.display = 'block';
        progressLabel.setAttribute('data-i18n', 'crp.processing');
        if (window._i18nApply) window._i18nApply();

        PDFLib.PDFDocument.load(state.pdfBytes).then(function (doc) {
            var pages = doc.getPages();
            for (var i = 0; i < pages.length; i++) {
                var pg = pages[i];
                var m;
                if (state.scope === 'page') {
                    var saved = state.pageMargins[i + 1];
                    m = saved ? {
                        top: saved.top * MM_TO_PT,
                        bottom: saved.bottom * MM_TO_PT,
                        left: saved.left * MM_TO_PT,
                        right: saved.right * MM_TO_PT
                    } : { top: 0, bottom: 0, left: 0, right: 0 };
                } else {
                    m = {
                        top: globalM.top * MM_TO_PT,
                        bottom: globalM.bottom * MM_TO_PT,
                        left: globalM.left * MM_TO_PT,
                        right: globalM.right * MM_TO_PT
                    };
                }

                var mb = pg.getMediaBox();
                var newX = mb.x + m.left;
                var newY = mb.y + m.bottom;
                var newW = mb.width - m.left - m.right;
                var newH = mb.height - m.top - m.bottom;

                if (newW <= 0 || newH <= 0) {
                    showError('Margins are too large for page ' + (i + 1) + '. Result would have zero or negative size.');
                    btnCrop.disabled = false;
                    progressWrap.style.display = 'none';
                    progressLabel.style.display = 'none';
                    return;
                }

                pg.setMediaBox(newX, newY, newW, newH);
                pg.setCropBox(newX, newY, newW, newH);

                progressBar.style.width = Math.round(((i + 1) / pages.length) * 100) + '%';
            }

            return doc.save();
        }).then(function (saved) {
            if (!saved) return;
            var blob = new Blob([saved], { type: 'application/pdf' });
            var url = URL.createObjectURL(blob);
            var outName = state.fileName.replace(/\.pdf$/i, '') + '_cropped.pdf';
            downloadLink.href = url;
            downloadLink.download = outName;
            optionsPanel.style.display = 'none';
            progressWrap.style.display = 'none';
            progressLabel.style.display = 'none';
            results.style.display = 'block';
            btnCrop.disabled = false;
        }).catch(function (err) {
            showError('Error cropping PDF: ' + err.message);
            btnCrop.disabled = false;
            progressWrap.style.display = 'none';
            progressLabel.style.display = 'none';
        });
    });

    btnAgain.addEventListener('click', startOver);

    function startOver() {
        state.pdfBytes = null;
        state.fileName = '';
        state.pageCount = 0;
        state.currentPage = 1;
        state.pageMargins = {};
        state.scope = 'all';
        fileInput.value = '';
        marginTop.value = marginBottom.value = marginLeft.value = marginRight.value = '0';
        dropZone.style.display = 'block';
        optionsPanel.style.display = 'none';
        results.style.display = 'none';
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
        btnCrop.disabled = false;
        updateScopeUI();
        hideError();
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
    function hideError() {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
    }

})();
