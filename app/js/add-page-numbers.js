/**
 * add-page-numbers.js
 *
 * Uses pdf-lib only (no rendering required).
 * Loads the PDF, draws page number text on each page, saves.
 *
 * Options: format, position, font size, start number, skip first page.
 */

(function () {
    'use strict';

    /* ── State ── */
    var state = {
        pdfBytes: null,
        fileName: '',
        pageCount: 0,
        format: 'n',              // 'n' | 'n_total' | 'page_n' | 'page_n_of_total'
        position: 'bottom-center',  // 'bottom-center' | 'bottom-left' | 'bottom-right' | 'top-center'
        fontSize: 12,
        startFrom: 1,
        skipFirst: false
    };

    /* ── DOM ── */
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var fileNameEl = document.getElementById('fileName');
    var pageCountEl = document.getElementById('pageCountLabel');
    var fontSizeSlider = document.getElementById('fontSizeSlider');
    var fontSizeValue = document.getElementById('fontSizeValue');
    var startNumInput = document.getElementById('startNumInput');
    var skipFirstPage = document.getElementById('skipFirstPage');
    var applyBtn = document.getElementById('applyBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var resultsEl = document.getElementById('results');
    var resultFiles = document.getElementById('resultFiles');
    var applyAgain = document.getElementById('applyAgainBtn');

    /* ── Helpers ── */
    function showError(msg) { errorBox.textContent = msg; errorBox.style.display = 'block'; }
    function clearError() { errorBox.style.display = 'none'; errorBox.textContent = ''; }
    function setProgress(pct, label) {
        progressBar.style.width = pct + '%';
        progressLabel.textContent = label || '';
        progressWrap.style.display = pct >= 0 ? 'block' : 'none';
    }
    function resetButtons() {
        applyBtn.disabled = false; startOverBtn.disabled = false;
        progressWrap.style.display = 'none'; progressBar.style.width = '0%';
        progressLabel.textContent = '';
    }

    /* ── Option controls ── */
    /* Format buttons */
    document.querySelectorAll('.format-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.format-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.format = btn.dataset.format;
        });
    });

    /* Position buttons */
    document.querySelectorAll('.position-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.position-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            state.position = btn.dataset.pos;
        });
    });

    fontSizeSlider.addEventListener('input', function () {
        state.fontSize = parseInt(fontSizeSlider.value, 10);
        fontSizeValue.textContent = state.fontSize + ' pt';
    });
    startNumInput.addEventListener('input', function () {
        var v = parseInt(startNumInput.value, 10);
        state.startFrom = isNaN(v) ? 1 : v;
    });
    skipFirstPage.addEventListener('change', function () {
        state.skipFirst = skipFirstPage.checked;
    });

    /* ── File handling ── */
    fileInput.addEventListener('change', function () {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('dragover'); });
    dropZone.addEventListener('drop', function (e) {
        e.preventDefault(); dropZone.classList.remove('dragover');
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
            PDFLib.PDFDocument.load(state.pdfBytes)
                .then(function (doc) {
                    state.pageCount = doc.getPageCount();
                    fileNameEl.textContent = state.fileName + '.pdf';
                    pageCountEl.textContent = state.pageCount + ' page' + (state.pageCount !== 1 ? 's' : '');
                    dropZone.style.display = 'none';
                    optionsPanel.style.display = 'block';
                    resultsEl.style.display = 'none';
                })
                .catch(function (err) { showError('Could not read PDF: ' + err.message); });
        };
        reader.readAsArrayBuffer(file);
    }

    /* ── Format page number string ── */
    function formatNum(pageIndex, total) {
        var n = state.startFrom + (state.skipFirst ? pageIndex - 1 : pageIndex);
        switch (state.format) {
            case 'n': return String(n);
            case 'n_total': return n + ' / ' + total;
            case 'page_n': return 'Page ' + n;
            case 'page_n_of_total': return 'Page ' + n + ' of ' + total;
            default: return String(n);
        }
    }

    /* ── Apply ── */
    applyBtn.addEventListener('click', function () {
        clearError();
        applyBtn.disabled = true;
        startOverBtn.disabled = true;
        setProgress(10, 'Loading PDF…');

        PDFLib.PDFDocument.load(state.pdfBytes)
            .then(function (doc) {
                setProgress(30, 'Embedding font…');
                return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
                    var pages = doc.getPages();
                    var total = pages.length;
                    var fontSize = state.fontSize;
                    var margin = 28; /* points from edge */

                    pages.forEach(function (page, i) {
                        if (state.skipFirst && i === 0) return;

                        var text = formatNum(i, total);
                        var sz = page.getSize();
                        var w = sz.width, h = sz.height;
                        var textWidth = font.widthOfTextAtSize(text, fontSize);
                        var x, y;

                        switch (state.position) {
                            case 'bottom-center':
                                x = (w - textWidth) / 2;
                                y = margin;
                                break;
                            case 'bottom-left':
                                x = margin;
                                y = margin;
                                break;
                            case 'bottom-right':
                                x = w - textWidth - margin;
                                y = margin;
                                break;
                            case 'top-center':
                                x = (w - textWidth) / 2;
                                y = h - margin - fontSize;
                                break;
                            default:
                                x = (w - textWidth) / 2;
                                y = margin;
                        }

                        page.drawText(text, {
                            x: x,
                            y: y,
                            size: fontSize,
                            font: font,
                            color: PDFLib.rgb(0.3, 0.3, 0.3)
                        });
                    });

                    setProgress(80, 'Saving…');
                    return doc.save();
                });
            })
            .then(function (saved) {
                setProgress(100, '');
                showResults(saved);
            })
            .catch(function (err) {
                showError('Failed: ' + err.message);
                resetButtons();
            });
    });

    /* ── Results ── */
    function showResults(bytes) {
        resetButtons();
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = state.fileName + '_numbered.pdf';
        a.className = 'btn-primary';
        a.style.cssText = 'display:inline-flex;align-items:center;gap:0.4rem;text-decoration:none;';
        a.textContent = '⬇️ Download PDF';
        resultFiles.innerHTML = '';
        resultFiles.appendChild(a);
        optionsPanel.style.display = 'none';
        resultsEl.style.display = 'block';
    }

    /* ── Start over ── */
    function startOver() {
        state.pdfBytes = null; state.fileName = ''; state.pageCount = 0;
        fileInput.value = '';
        clearError(); resetButtons();
        resultsEl.style.display = 'none';
        optionsPanel.style.display = 'none';
        dropZone.style.display = 'flex';
    }
    startOverBtn.addEventListener('click', startOver);
    applyAgain.addEventListener('click', startOver);

})();
