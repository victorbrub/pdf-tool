/**
 * compress-pdf.js
 *
 * Two modes:
 *  • Lossless — pdf-lib re-saves with useObjectStreams=true (preserves text/vectors)
 *  • Lossy    — pdfjs renders pages as JPEG → pdf-lib embeds in new PDF
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
        originalSize: 0,
        pageCount: 0,
        mode: 'lossless',       // 'lossless' | 'lossy'
        quality: 65,            // JPEG quality 10-95
        scale: 1.5,             // render scale for lossy mode
        activePreset: 'medium'
    };

    /* ── DOM refs ── */
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameEl = document.getElementById('fileName');
    var pageCountEl = document.getElementById('pageCountLabel');
    var modeLossless = document.getElementById('modeLossless');
    var modeLossy = document.getElementById('modeLossy');
    var noteLossless = document.getElementById('noteLossless');
    var noteLossy = document.getElementById('noteLossy');
    var presetSection = document.getElementById('presetSection');
    var presetBtns = document.querySelectorAll('.preset-btn');
    var customRow = document.getElementById('customQualityRow');
    var qualitySlider = document.getElementById('qualitySlider');
    var qualityValue = document.getElementById('qualityValue');
    var compressBtn = document.getElementById('compressBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var resultsEl = document.getElementById('results');
    var sizeBeforeEl = document.getElementById('sizeBeforeEl');
    var sizeAfterEl = document.getElementById('sizeAfterEl');
    var reductionBadge = document.getElementById('reductionBadge');
    var resultFiles = document.getElementById('resultFiles');
    var compressAgain = document.getElementById('compressAgainBtn');

    /* ── Helpers ── */
    function fmtBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

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
        var file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            fileInput.value = '';
            handleFile(file);
        } else {
            showError('Please drop a PDF file.');
        }
    });

    function handleFile(file) {
        clearError();
        if (!file || file.type !== 'application/pdf') {
            showError('Only PDF files are supported.');
            return;
        }
        state.fileName = file.name.replace(/\.pdf$/i, '');
        state.originalSize = file.size;

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
                fileNameEl.textContent = state.fileName + '.pdf';
                pageCountEl.textContent = state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');
                dropZone.style.display = 'none';
                optionsPanel.style.display = 'block';
                resultsEl.style.display = 'none';
            })
            .catch(function (err) {
                showError('Could not read PDF: ' + err.message);
            });
    }

    /* ── Mode toggle ── */
    modeLossless.addEventListener('click', function () {
        state.mode = 'lossless';
        modeLossless.classList.add('active');
        modeLossy.classList.remove('active');
        noteLossless.classList.add('visible');
        noteLossy.classList.remove('visible');
        presetSection.style.display = 'none';
    });

    modeLossy.addEventListener('click', function () {
        state.mode = 'lossy';
        modeLossy.classList.add('active');
        modeLossless.classList.remove('active');
        noteLossy.classList.add('visible');
        noteLossless.classList.remove('visible');
        presetSection.style.display = 'block';
    });

    /* ── Preset buttons ── */
    presetBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            presetBtns.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');

            var q = btn.getAttribute('data-quality');
            var s = btn.getAttribute('data-scale');
            if (q === 'custom') {
                customRow.style.display = 'flex';
                state.quality = parseInt(qualitySlider.value, 10);
                state.scale = 1.5;
            } else {
                customRow.style.display = 'none';
                state.quality = parseInt(q, 10);
                state.scale = parseFloat(s);
            }
        });
    });

    qualitySlider.addEventListener('input', function () {
        state.quality = parseInt(qualitySlider.value, 10);
        qualityValue.textContent = state.quality + '%';
    });

    /* ── Compress ── */
    compressBtn.addEventListener('click', function () {
        clearError();
        if (!state.pdfDoc) return;
        compressBtn.disabled = true;
        startOverBtn.disabled = true;
        progressWrap.style.display = 'block';
        setProgress(5, 'Starting…');

        if (state.mode === 'lossless') {
            runLossless();
        } else {
            runLossy();
        }
    });

    /* ── Lossless compression ── */
    function runLossless() {
        setProgress(20, 'Loading PDF…');
        PDFLib.PDFDocument.load(state.pdfBytes)
            .then(function (doc) {
                setProgress(60, 'Re-saving with compressed streams…');
                return doc.save({ useObjectStreams: true });
            })
            .then(function (saved) {
                setProgress(100, '');
                showResults(saved);
            })
            .catch(function (err) {
                showError('Compression failed: ' + err.message);
                reset();
            });
    }

    /* ── Lossy compression (render → JPEG → pdf-lib) ── */
    function runLossy() {
        var pages = [];
        var n = state.pageCount;

        function processPage(pageNum) {
            if (pageNum > n) {
                buildLossyPdf(pages);
                return;
            }
            var pct = Math.round(5 + ((pageNum - 1) / n) * 70);
            setProgress(pct, 'Rendering page ' + pageNum + ' / ' + n + '…');

            state.pdfDoc.getPage(pageNum)
                .then(function (page) {
                    var vp = page.getViewport({ scale: state.scale });
                    var ptVp = page.getViewport({ scale: 1 });   // native points

                    var canvas = document.createElement('canvas');
                    canvas.width = Math.round(vp.width);
                    canvas.height = Math.round(vp.height);
                    var ctx = canvas.getContext('2d');

                    return page.render({ canvasContext: ctx, viewport: vp }).promise
                        .then(function () {
                            var dataUrl = canvas.toDataURL('image/jpeg', state.quality / 100);
                            pages.push({
                                jpegDataUrl: dataUrl,
                                ptWidth: ptVp.width,
                                ptHeight: ptVp.height
                            });
                            canvas.width = 0;
                            canvas.height = 0;
                            processPage(pageNum + 1);
                        });
                })
                .catch(function (err) {
                    showError('Page render error: ' + err.message);
                    reset();
                });
        }

        processPage(1);
    }

    function buildLossyPdf(pages) {
        setProgress(80, 'Building PDF…');

        PDFLib.PDFDocument.create()
            .then(function (doc) {
                var embedPromises = pages.map(function (p) {
                    var b64 = p.jpegDataUrl.split(',')[1];
                    var binary = atob(b64);
                    var bytes = new Uint8Array(binary.length);
                    for (var i = 0; i < binary.length; i++) {
                        bytes[i] = binary.charCodeAt(i);
                    }
                    return doc.embedJpg(bytes);
                });

                return Promise.all(embedPromises).then(function (imgs) {
                    pages.forEach(function (p, i) {
                        var page = doc.addPage([p.ptWidth, p.ptHeight]);
                        page.drawImage(imgs[i], {
                            x: 0,
                            y: 0,
                            width: p.ptWidth,
                            height: p.ptHeight
                        });
                    });
                    setProgress(95, 'Saving…');
                    return doc.save();
                });
            })
            .then(function (saved) {
                setProgress(100, '');
                showResults(saved);
            })
            .catch(function (err) {
                showError('Build error: ' + err.message);
                reset();
            });
    }

    /* ── Show results ── */
    function showResults(compressedBytes) {
        compressBtn.disabled = false;
        startOverBtn.disabled = false;

        var originalSize = state.originalSize;
        var compressedSize = compressedBytes.length;
        var reduction = ((originalSize - compressedSize) / originalSize) * 100;
        var worse = compressedSize > originalSize;

        sizeBeforeEl.textContent = fmtBytes(originalSize);
        sizeAfterEl.textContent = fmtBytes(compressedSize);

        if (worse) {
            reductionBadge.textContent = '+' + Math.abs(reduction).toFixed(1) + '% larger';
            reductionBadge.className = 'reduction-badge worse';
        } else {
            reductionBadge.textContent = '↓ ' + reduction.toFixed(1) + '% smaller';
            reductionBadge.className = 'reduction-badge';
        }

        // Download link
        var blob = new Blob([compressedBytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '_compressed.pdf';
        a.className = 'btn-primary';
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.style.gap = '0.4rem';
        a.style.textDecoration = 'none';
        a.textContent = '⬇️ Download compressed PDF';

        resultFiles.innerHTML = '';
        resultFiles.appendChild(a);

        optionsPanel.style.display = 'none';
        resultsEl.style.display = 'block';
        progressWrap.style.display = 'none';
    }

    /* ── Start over ── */
    function reset() {
        compressBtn.disabled = false;
        startOverBtn.disabled = false;
        progressWrap.style.display = 'none';
        progressBar.style.width = '0%';
        progressLabel.textContent = '';
    }

    startOverBtn.addEventListener('click', startOver);
    compressAgain.addEventListener('click', startOver);

    function startOver() {
        state.pdfDoc = null;
        state.pdfBytes = null;
        state.fileName = '';
        state.pageCount = 0;
        fileInput.value = '';
        clearError();
        reset();
        resultsEl.style.display = 'none';
        optionsPanel.style.display = 'none';
        dropZone.style.display = 'flex';
        // Reset to lossless mode UI
        state.mode = 'lossless';
        modeLossless.classList.add('active');
        modeLossy.classList.remove('active');
        noteLossless.classList.add('visible');
        noteLossy.classList.remove('visible');
        presetSection.style.display = 'none';
    }

})();
