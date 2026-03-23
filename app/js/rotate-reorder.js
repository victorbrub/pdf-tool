/**
 * rotate-reorder.js
 *
 * Renders page thumbnails via pdfjs.
 * Lets the user drag-and-drop cards to reorder pages and click ↺/↻ to rotate.
 * Builds the final PDF with pdf-lib using the new page order + rotations.
 */

(function () {
    'use strict';

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

    /* ── State ── */
    var state = {
        pdfDoc: null,
        pdfBytes: null,
        fileName: '',
        pageCount: 0,
        /* pages[i] = { origIndex (0-based), rotation (0|90|180|270), dataUrl } */
        pages: []
    };

    var draggedIdx = null;

    /* ── DOM ── */
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameEl = document.getElementById('fileName');
    var pageCountEl = document.getElementById('pageCountLabel');
    var thumbGrid = document.getElementById('thumbGrid');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var applyBtn = document.getElementById('applyBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var resultsEl = document.getElementById('results');
    var resultFiles = document.getElementById('resultFiles');
    var reorderAgain = document.getElementById('reorderAgainBtn');
    var rotAllCCW = document.getElementById('rotAllCCW');
    var rotAllCW = document.getElementById('rotAllCW');

    /* ── Helpers ── */
    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }
    function clearError() {
        errorBox.style.display = 'none';
        errorBox.textContent = '';
    }
    function setProgress(pct, label) {
        progressBar.style.width = pct + '%';
        progressLabel.textContent = label || '';
        progressWrap.style.display = pct >= 0 ? 'block' : 'none';
    }

    /* ── File handling ── */
    fileInput.addEventListener('change', function () {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });
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
        var f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') { fileInput.value = ''; handleFile(f); }
        else showError('Please drop a PDF file.');
    });

    function handleFile(file) {
        clearError();
        if (!file || file.type !== 'application/pdf') { showError('Only PDF files are supported.'); return; }
        state.fileName = file.name.replace(/\.pdf$/i, '');
        var reader = new FileReader();
        reader.onload = function (e) {
            state.pdfBytes = new Uint8Array(e.target.result);
            loadPdf(state.pdfBytes);
        };
        reader.readAsArrayBuffer(file);
    }

    function loadPdf(bytes) {
        pdfjsLib.getDocument({ data: bytes }).promise
            .then(function (doc) {
                state.pdfDoc = doc;
                state.pageCount = doc.numPages;
                state.pages = [];
                for (var i = 0; i < doc.numPages; i++) {
                    state.pages.push({ origIndex: i, rotation: 0, dataUrl: null });
                }
                fileNameEl.textContent = state.fileName + '.pdf';
                pageCountEl.textContent = state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');
                dropZone.style.display = 'none';
                optionsPanel.style.display = 'block';
                resultsEl.style.display = 'none';
                thumbGrid.innerHTML = '';
                applyBtn.disabled = true;
                setProgress(0, 'Loading thumbnails…');
                progressWrap.style.display = 'block';
                renderThumbs(1);
            })
            .catch(function (err) {
                showError('Could not read PDF: ' + err.message);
            });
    }

    /* ── Thumbnail rendering (sequential, progressive) ── */
    function renderThumbs(pageNum) {
        if (pageNum > state.pageCount) {
            progressWrap.style.display = 'none';
            applyBtn.disabled = false;
            return;
        }
        var pct = Math.round(((pageNum - 1) / state.pageCount) * 100);
        setProgress(pct, 'Loading page ' + pageNum + ' / ' + state.pageCount + '…');

        state.pdfDoc.getPage(pageNum)
            .then(function (page) {
                /* Render at a fixed width of ~92px */
                var vp1 = page.getViewport({ scale: 1 });
                var scale = 92 / vp1.width;
                var vp = page.getViewport({ scale: scale });
                var canvas = document.createElement('canvas');
                canvas.width = Math.round(vp.width);
                canvas.height = Math.round(vp.height);
                var ctx = canvas.getContext('2d');
                return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
                    var idx = pageNum - 1;
                    state.pages[idx].dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    canvas.width = 0; canvas.height = 0;
                    addThumbCard(state.pages[idx], idx);
                    renderThumbs(pageNum + 1);
                });
            })
            .catch(function (err) {
                showError('Thumbnail error: ' + err.message);
            });
    }

    /* ── Build one thumbnail card ── */
    function addThumbCard(pg, displayIdx) {
        var card = document.createElement('div');
        card.className = 'thumb-card';
        card.dataset.idx = String(displayIdx);
        card.draggable = true;

        var wrap = document.createElement('div');
        wrap.className = 'thumb-wrap';

        var img = new Image();
        img.className = 'thumb-img';
        img.src = pg.dataUrl;
        img.style.transform = pg.rotation ? 'rotate(' + pg.rotation + 'deg)' : '';
        wrap.appendChild(img);

        var label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = 'p. ' + (pg.origIndex + 1);

        var actions = document.createElement('div');
        actions.className = 'thumb-actions';

        var btnCCW = document.createElement('button');
        btnCCW.className = 'btn-rotate';
        btnCCW.textContent = '↺';
        btnCCW.title = 'Rotate left 90°';
        btnCCW.addEventListener('click', function (e) {
            e.stopPropagation();
            pg.rotation = (pg.rotation - 90 + 360) % 360;
            img.style.transform = 'rotate(' + pg.rotation + 'deg)';
        });

        var btnCW = document.createElement('button');
        btnCW.className = 'btn-rotate';
        btnCW.textContent = '↻';
        btnCW.title = 'Rotate right 90°';
        btnCW.addEventListener('click', function (e) {
            e.stopPropagation();
            pg.rotation = (pg.rotation + 90) % 360;
            img.style.transform = 'rotate(' + pg.rotation + 'deg)';
        });

        actions.appendChild(btnCCW);
        actions.appendChild(btnCW);
        card.appendChild(wrap);
        card.appendChild(label);
        card.appendChild(actions);
        thumbGrid.appendChild(card);

        /* ── HTML5 Drag & Drop ── */
        card.addEventListener('dragstart', function (e) {
            draggedIdx = parseInt(card.dataset.idx, 10);
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', function () {
            card.classList.remove('dragging');
        });
        card.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', function () {
            card.classList.remove('drag-over');
        });
        card.addEventListener('drop', function (e) {
            e.preventDefault();
            card.classList.remove('drag-over');
            var toIdx = parseInt(card.dataset.idx, 10);
            if (draggedIdx !== null && draggedIdx !== toIdx) {
                var moved = state.pages.splice(draggedIdx, 1)[0];
                state.pages.splice(toIdx, 0, moved);
                rebuildGrid();
            }
            draggedIdx = null;
        });
    }

    function rebuildGrid() {
        thumbGrid.innerHTML = '';
        state.pages.forEach(function (pg, idx) {
            addThumbCard(pg, idx);
        });
        /* Update dataset.idx on each card */
        var cards = thumbGrid.querySelectorAll('.thumb-card');
        cards.forEach(function (c, i) { c.dataset.idx = String(i); });
    }

    /* ── Rotate all ── */
    rotAllCCW.addEventListener('click', function () {
        state.pages.forEach(function (pg) { pg.rotation = (pg.rotation - 90 + 360) % 360; });
        thumbGrid.querySelectorAll('.thumb-img').forEach(function (img, i) {
            img.style.transform = 'rotate(' + state.pages[i].rotation + 'deg)';
        });
    });
    rotAllCW.addEventListener('click', function () {
        state.pages.forEach(function (pg) { pg.rotation = (pg.rotation + 90) % 360; });
        thumbGrid.querySelectorAll('.thumb-img').forEach(function (img, i) {
            img.style.transform = 'rotate(' + state.pages[i].rotation + 'deg)';
        });
    });

    /* ── Apply & build PDF ── */
    applyBtn.addEventListener('click', function () {
        clearError();
        applyBtn.disabled = true;
        startOverBtn.disabled = true;
        setProgress(5, 'Loading PDF…');

        PDFLib.PDFDocument.load(state.pdfBytes)
            .then(function (srcDoc) {
                setProgress(40, 'Copying pages…');
                return PDFLib.PDFDocument.create().then(function (newDoc) {
                    var origIndices = state.pages.map(function (pg) { return pg.origIndex; });
                    return newDoc.copyPages(srcDoc, origIndices).then(function (copied) {
                        copied.forEach(function (page, i) {
                            var existing = page.getRotation().angle;
                            var added = state.pages[i].rotation;
                            page.setRotation(PDFLib.degrees((existing + added) % 360));
                            newDoc.addPage(page);
                        });
                        setProgress(85, 'Saving…');
                        return newDoc.save();
                    });
                });
            })
            .then(function (bytes) {
                setProgress(100, '');
                showResults(bytes);
            })
            .catch(function (err) {
                showError('Failed: ' + err.message);
                applyBtn.disabled = false;
                startOverBtn.disabled = false;
                progressWrap.style.display = 'none';
            });
    });

    /* ── Results ── */
    function showResults(bytes) {
        applyBtn.disabled = false;
        startOverBtn.disabled = false;
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '_reordered.pdf';
        a.className = 'btn-primary';
        a.style.cssText = 'display:inline-flex;align-items:center;gap:0.4rem;text-decoration:none;';
        a.textContent = '⬇️ Download PDF';
        resultFiles.innerHTML = '';
        resultFiles.appendChild(a);
        optionsPanel.style.display = 'none';
        resultsEl.style.display = 'block';
        progressWrap.style.display = 'none';
    }

    /* ── Start over ── */
    function startOver() {
        state.pdfDoc = null; state.pdfBytes = null;
        state.fileName = ''; state.pageCount = 0; state.pages = [];
        fileInput.value = '';
        clearError();
        applyBtn.disabled = false;
        startOverBtn.disabled = false;
        progressWrap.style.display = 'none';
        progressBar.style.width = '0%';
        progressLabel.textContent = '';
        thumbGrid.innerHTML = '';
        resultsEl.style.display = 'none';
        optionsPanel.style.display = 'none';
        dropZone.style.display = 'flex';
    }
    startOverBtn.addEventListener('click', startOver);
    reorderAgain.addEventListener('click', startOver);

})();
