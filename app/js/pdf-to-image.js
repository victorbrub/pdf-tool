// PDF to Image — main logic
// Renders each page of a PDF to a canvas via pdfjs, then exports as JPG or PNG.
// A ZIP (via fflate) is offered when there are multiple pages.

(function () {
    'use strict';

    // ── pdfjs worker ──────────────────────────────────────────────────────────
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

    // ── State ─────────────────────────────────────────────────────────────────
    var state = {
        pdfDoc: null,
        fileName: '',
        format: 'jpeg',
        quality: 0.92,
        /** @type {HTMLCanvasElement[]} rendered canvases (one per page) */
        canvases: []
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var results = document.getElementById('results');
    var fileNameEl = document.getElementById('fileName');
    var pageCountLabel = document.getElementById('pageCountLabel');
    var formatBtns = document.querySelectorAll('.format-btn');
    var qualityRow = document.getElementById('qualityRow');
    var qualitySlider = document.getElementById('qualitySlider');
    var qualityValue = document.getElementById('qualityValue');
    var pageGrid = document.getElementById('pageGrid');
    var convertBtn = document.getElementById('convertBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var resultFiles = document.getElementById('resultFiles');
    var convertAgainBtn = document.getElementById('convertAgainBtn');

    // ── Drop / file pick ──────────────────────────────────────────────────────
    dropZone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', function () {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        var file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files[0]) handleFile(fileInput.files[0]);
        fileInput.value = '';
    });

    // ── File ingestion ────────────────────────────────────────────────────────
    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showError('Please choose a PDF file.');
            return;
        }
        hideError();
        resetUI();

        state.fileName = file.name.replace(/\.pdf$/i, '');
        fileNameEl.textContent = file.name;

        var reader = new FileReader();
        reader.onload = function (e) {
            loadPdf(new Uint8Array(e.target.result));
        };
        reader.readAsArrayBuffer(file);
    }

    function loadPdf(bytes) {
        pdfjsLib.getDocument({ data: bytes }).promise
            .then(function (pdf) {
                state.pdfDoc = pdf;
                var count = pdf.numPages;
                var lang = localStorage.getItem('lang') || 'en';
                pageCountLabel.textContent = count + ' ' + (count === 1 ? 'page' : 'pages');
                renderPreviews(pdf).then(function () {
                    optionsPanel.style.display = 'block';
                });
            })
            .catch(function (err) {
                showError('Could not read PDF: ' + err.message);
            });
    }

    // ── Render thumbnails into the page grid ──────────────────────────────────
    function renderPreviews(pdf) {
        pageGrid.innerHTML = '';
        state.canvases = [];
        var promises = [];
        for (var i = 1; i <= pdf.numPages; i++) {
            promises.push(renderPagePreview(pdf, i));
        }
        return Promise.all(promises);
    }

    function renderPagePreview(pdf, pageNum) {
        return pdf.getPage(pageNum).then(function (page) {
            var scale = 0.5;
            var viewport = page.getViewport({ scale: scale });
            var canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            var ctx = canvas.getContext('2d');
            return page.render({ canvasContext: ctx, viewport: viewport }).promise
                .then(function () {
                    // Store canvas for full-res export
                    var fullCanvas = document.createElement('canvas');
                    fullCanvas.width = viewport.width * 2; // 1x scale
                    fullCanvas.height = viewport.height * 2;
                    state.canvases[pageNum - 1] = null; // placeholder; rendered on convert

                    var wrap = document.createElement('div');
                    wrap.className = 'page-grid-item';
                    wrap.appendChild(canvas);
                    var label = document.createElement('div');
                    label.className = 'page-grid-label';
                    label.textContent = 'Page ' + pageNum;
                    wrap.appendChild(label);
                    pageGrid.appendChild(wrap);
                });
        });
    }

    // ── Format selector ───────────────────────────────────────────────────────
    formatBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            formatBtns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.format = btn.dataset.format;
            // Quality only meaningful for JPEG
            qualityRow.style.display = (state.format === 'jpeg') ? 'flex' : 'none';
        });
    });

    qualitySlider.addEventListener('input', function () {
        state.quality = parseInt(this.value) / 100;
        qualityValue.textContent = this.value + '%';
    });

    // ── Convert ───────────────────────────────────────────────────────────────
    convertBtn.addEventListener('click', function () {
        if (!state.pdfDoc) return;
        convertAllPages();
    });

    function convertAllPages() {
        convertBtn.disabled = true;
        startOverBtn.disabled = true;
        progressWrap.style.display = 'block';
        progressLabel.style.display = 'block';

        var pdf = state.pdfDoc;
        var total = pdf.numPages;
        var blobs = [];
        var index = 0;

        function processNext() {
            if (index >= total) {
                progressBar.style.width = '100%';
                progressLabel.textContent = '';
                buildResults(blobs);
                return;
            }
            var pageNum = index + 1;
            var pct = Math.round((index / total) * 100);
            progressBar.style.width = pct + '%';
            progressLabel.textContent = 'Converting page ' + pageNum + ' of ' + total + '…';

            pdf.getPage(pageNum).then(function (page) {
                var scale = 2; // render at 2× for decent resolution
                var viewport = page.getViewport({ scale: scale });
                var canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                var ctx = canvas.getContext('2d');
                return page.render({ canvasContext: ctx, viewport: viewport }).promise
                    .then(function () {
                        var mimeType = state.format === 'png' ? 'image/png' : 'image/jpeg';
                        return new Promise(function (resolve) {
                            canvas.toBlob(function (blob) {
                                resolve(blob);
                            }, mimeType, state.quality);
                        });
                    });
            }).then(function (blob) {
                blobs.push(blob);
                index++;
                processNext();
            }).catch(function (err) {
                showError('Error on page ' + pageNum + ': ' + err.message);
                convertBtn.disabled = false;
                startOverBtn.disabled = false;
            });
        }

        processNext();
    }

    // ── Build results ─────────────────────────────────────────────────────────
    function buildResults(blobs) {
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
        optionsPanel.style.display = 'none';
        resultFiles.innerHTML = '';

        var ext = state.format === 'png' ? 'png' : 'jpg';

        if (blobs.length === 1) {
            // Single page — direct download link
            appendDownloadLink(resultFiles, blobs[0], state.fileName + '.' + ext, 'Page 1');
        } else {
            // Multiple pages — offer individual links AND a ZIP
            var zipBtn = document.createElement('button');
            zipBtn.className = 'btn-primary';
            zipBtn.style.marginBottom = '1rem';
            zipBtn.textContent = '⬇ Download all as ZIP';
            zipBtn.addEventListener('click', function () {
                downloadZip(blobs, ext);
            });
            resultFiles.appendChild(zipBtn);

            blobs.forEach(function (blob, i) {
                appendDownloadLink(resultFiles, blob, state.fileName + '_page' + (i + 1) + '.' + ext, 'Page ' + (i + 1));
            });
        }

        results.style.display = 'block';
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function appendDownloadLink(container, blob, filename, label) {
        var url = URL.createObjectURL(blob);
        var wrap = document.createElement('div');
        wrap.className = 'result-file';
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.className = 'btn-download';
        a.textContent = '⬇ ' + label;
        wrap.appendChild(a);
        container.appendChild(wrap);
    }

    // ── ZIP via fflate ────────────────────────────────────────────────────────
    function downloadZip(blobs, ext) {
        var files = {};
        var pending = blobs.length;

        blobs.forEach(function (blob, i) {
            var fname = state.fileName + '_page' + (i + 1) + '.' + ext;
            var reader = new FileReader();
            reader.onload = function (e) {
                files[fname] = new Uint8Array(e.target.result);
                pending--;
                if (pending === 0) {
                    var zipped = fflate.zipSync(files);
                    var zipBlob = new Blob([zipped], { type: 'application/zip' });
                    var url = URL.createObjectURL(zipBlob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = state.fileName + '_images.zip';
                    a.click();
                    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
                }
            };
            reader.readAsArrayBuffer(blob);
        });
    }

    // ── Reset / start over ────────────────────────────────────────────────────
    startOverBtn.addEventListener('click', function () { fullReset(); });
    convertAgainBtn.addEventListener('click', function () { fullReset(); });

    function fullReset() {
        state.pdfDoc = null;
        state.fileName = '';
        state.canvases = [];
        pageGrid.innerHTML = '';
        resultFiles.innerHTML = '';
        hideError();
        resetUI();
        results.style.display = 'none';
        optionsPanel.style.display = 'none';
        dropZone.style.display = 'flex';
        convertBtn.disabled = false;
        startOverBtn.disabled = false;
        progressBar.style.width = '0%';
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
    }

    function resetUI() {
        dropZone.style.display = 'none';
    }

    // ── Error helpers ─────────────────────────────────────────────────────────
    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
    function hideError() {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    // Init: hide panels that start hidden
    optionsPanel.style.display = 'none';
    results.style.display = 'none';
    progressWrap.style.display = 'none';
    progressLabel.style.display = 'none';
    hideError();

}());
