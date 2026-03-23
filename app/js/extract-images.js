// Extract Images — main logic
//
// How it works:
//   pdfjs renders PDF pages by issuing canvas 2D drawing calls on the main thread.
//   Every embedded raster image in a PDF is drawn via ctx.drawImage().
//   By wrapping that method before calling page.render(), we intercept each image
//   object at its NATIVE resolution (before any page scaling or compositing).
//   We then deduplicate across pages using a 16×16 thumbnail hash so the same
//   logo/header image repeated on every page only appears once.

(function () {
    'use strict';

    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

    var MIN_DEFAULT = 20; // default minimum dimension in px

    // ── State ─────────────────────────────────────────────────────────────────
    var state = {
        pdfDoc: null,
        fileName: '',
        /** @type {{ canvas: HTMLCanvasElement, width: number, height: number }[]} */
        found: []
    };

    // ── DOM refs ──────────────────────────────────────────────────────────────
    var dropZone = document.getElementById('dropZone');
    var fileInput = document.getElementById('fileInput');
    var errorBox = document.getElementById('errorBox');
    var optionsPanel = document.getElementById('optionsPanel');
    var results = document.getElementById('results');
    var fileNameEl = document.getElementById('fileName');
    var pageCountEl = document.getElementById('pageCountLabel');
    var rangeInput = document.getElementById('rangeInput');
    var minSizeInput = document.getElementById('minSizeInput');
    var extractBtn = document.getElementById('extractBtn');
    var startOverBtn = document.getElementById('startOverBtn');
    var progressWrap = document.getElementById('progressWrap');
    var progressBar = document.getElementById('progressBar');
    var progressLabel = document.getElementById('progressLabel');
    var foundBadge = document.getElementById('foundBadge');
    var downloadZipBtn = document.getElementById('downloadZipBtn');
    var imgResultsContainer = document.getElementById('imgResultsContainer');
    var extractAgainBtn = document.getElementById('extractAgainBtn');

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

    function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showError('Please select a PDF file.');
            return;
        }
        hideError();
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
                var n = pdf.numPages;
                pageCountEl.textContent = n + ' page' + (n !== 1 ? 's' : '');
                dropZone.style.display = 'none';
                results.style.display = 'none';
                optionsPanel.style.display = 'block';
            })
            .catch(function (err) {
                showError('Could not read PDF: ' + err.message);
            });
    }

    // ── Page range parser (same pattern used across tools) ────────────────────
    function parseRange(str, maxPage) {
        if (!str.trim()) return allPages(maxPage);
        var pages = [];
        str.split(',').forEach(function (part) {
            part = part.trim();
            var m = part.match(/^(\d+)\s*-\s*(\d+)$/);
            if (m) {
                var a = Math.max(1, parseInt(m[1], 10));
                var b = Math.min(maxPage, parseInt(m[2], 10));
                for (var i = a; i <= b; i++) pages.push(i);
            } else if (/^\d+$/.test(part)) {
                var n = parseInt(part, 10);
                if (n >= 1 && n <= maxPage) pages.push(n);
            }
        });
        pages = pages.filter(function (v, i, a) { return a.indexOf(v) === i; });
        pages.sort(function (a, b) { return a - b; });
        return pages.length ? pages : allPages(maxPage);
    }

    function allPages(n) {
        var arr = [];
        for (var i = 1; i <= n; i++) arr.push(i);
        return arr;
    }

    // ── Extract ───────────────────────────────────────────────────────────────
    extractBtn.addEventListener('click', function () {
        if (!state.pdfDoc) return;

        var minSize = Math.max(1, parseInt(minSizeInput.value, 10) || MIN_DEFAULT);
        var pages = parseRange(rangeInput.value, state.pdfDoc.numPages);

        extractBtn.disabled = true;
        startOverBtn.disabled = true;
        progressWrap.style.display = 'block';
        progressLabel.style.display = 'block';
        state.found = [];

        // Global dedup map: thumbnailDataURL → true
        var seenKeys = {};

        extractPages(state.pdfDoc, pages, minSize, seenKeys, 0, function () {
            setExtracting(false);
            renderResults();
        });
    });

    // Process pages sequentially to avoid memory spikes
    function extractPages(pdf, pages, minSize, seenKeys, index, done) {
        if (index >= pages.length) {
            done();
            return;
        }
        var pageNum = pages[index];
        var pct = Math.round((index / pages.length) * 100);
        progressBar.style.width = pct + '%';
        progressLabel.textContent = 'Scanning page ' + pageNum + ' of ' + pages[pages.length - 1] + '…';

        extractFromPage(pdf, pageNum, minSize, seenKeys)
            .then(function () {
                extractPages(pdf, pages, minSize, seenKeys, index + 1, done);
            })
            .catch(function (err) {
                showError('Error on page ' + pageNum + ': ' + err.message);
                setExtracting(false);
            });
    }

    function extractFromPage(pdf, pageNum, minSize, seenKeys) {
        return pdf.getPage(pageNum).then(function (page) {
            // Render at 1× — we only need the page to trigger drawing calls.
            // Images are captured at their native resolution regardless of viewport scale.
            var viewport = page.getViewport({ scale: 1 });
            var pageCanvas = document.createElement('canvas');
            pageCanvas.width = viewport.width;
            pageCanvas.height = viewport.height;
            var ctx = pageCanvas.getContext('2d');

            // Intercept ctx.drawImage to capture every image object drawn
            var origDrawImage = ctx.drawImage;
            ctx.drawImage = function (image) {
                // Get native dimensions of the image source
                var w = image.width || image.naturalWidth || 0;
                var h = image.height || image.naturalHeight || 0;

                if (w >= minSize && h >= minSize) {
                    try {
                        // Generate a tiny thumbnail to use as a dedup key
                        var thumbW = Math.min(16, w);
                        var thumbH = Math.min(16, h);
                        var thumbCanvas = document.createElement('canvas');
                        thumbCanvas.width = thumbW;
                        thumbCanvas.height = thumbH;
                        thumbCanvas.getContext('2d').drawImage(image, 0, 0, thumbW, thumbH);
                        var key = w + 'x' + h + ':' + thumbCanvas.toDataURL('image/jpeg', 0.25);

                        if (!seenKeys[key]) {
                            seenKeys[key] = true;
                            // Capture at full native resolution
                            var captureCanvas = document.createElement('canvas');
                            captureCanvas.width = w;
                            captureCanvas.height = h;
                            captureCanvas.getContext('2d').drawImage(image, 0, 0);
                            state.found.push({ canvas: captureCanvas, width: w, height: h });
                        }
                    } catch (e) {
                        // Cross-origin or tainted canvas — skip silently
                    }
                }

                // Always call original to keep the page rendering correct
                origDrawImage.apply(ctx, arguments);
            };

            return page.render({ canvasContext: ctx, viewport: viewport }).promise;
        });
    }

    // ── Render results ────────────────────────────────────────────────────────
    function renderResults() {
        progressBar.style.width = '100%';
        setTimeout(function () {
            progressWrap.style.display = 'none';
            progressLabel.style.display = 'none';
            progressBar.style.width = '0%';
        }, 300);

        imgResultsContainer.innerHTML = '';
        var count = state.found.length;
        foundBadge.textContent = count + ' image' + (count !== 1 ? 's' : '') + ' found';
        downloadZipBtn.disabled = count === 0;

        if (count === 0) {
            imgResultsContainer.innerHTML =
                '<div class="no-images-msg">' +
                '<div class="no-images-icon">🔍</div>' +
                '<p>No embedded raster images found in the selected pages.</p>' +
                '<p style="font-size:0.8rem;margin-top:0.5rem;color:#334155;">The PDF may contain only vector graphics or text.</p>' +
                '</div>';
        } else {
            var grid = document.createElement('div');
            grid.className = 'img-results-grid';

            state.found.forEach(function (item, i) {
                var card = document.createElement('div');
                card.className = 'img-result-card';

                // Thumbnail — use the canvas directly as an img src
                var img = document.createElement('img');
                img.className = 'img-result-thumb';
                img.src = item.canvas.toDataURL('image/png');
                img.alt = 'Image ' + (i + 1);

                var meta = document.createElement('div');
                meta.className = 'img-result-meta';

                var dims = document.createElement('div');
                dims.className = 'img-result-dims';
                dims.textContent = item.width + ' × ' + item.height + ' px';

                var dlBtn = document.createElement('button');
                dlBtn.className = 'btn-dl-img';
                dlBtn.textContent = '⬇ PNG';
                dlBtn.addEventListener('click', (function (canvas, index) {
                    return function () {
                        canvas.toBlob(function (blob) {
                            var url = URL.createObjectURL(blob);
                            var a = document.createElement('a');
                            a.href = url;
                            a.download = state.fileName + '_image' + (index + 1) + '.png';
                            a.click();
                            setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
                        }, 'image/png');
                    };
                }(item.canvas, i)));

                meta.appendChild(dims);
                meta.appendChild(dlBtn);
                card.appendChild(img);
                card.appendChild(meta);
                grid.appendChild(card);
            });

            imgResultsContainer.appendChild(grid);
        }

        optionsPanel.style.display = 'none';
        results.style.display = 'block';
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── ZIP download ──────────────────────────────────────────────────────────
    downloadZipBtn.addEventListener('click', function () {
        if (state.found.length === 0) return;
        downloadZipBtn.disabled = true;
        downloadZipBtn.textContent = '⏳ Building ZIP…';

        var files = {};
        var pending = state.found.length;

        state.found.forEach(function (item, i) {
            var fname = state.fileName + '_image' + (i + 1) + '.png';
            item.canvas.toBlob(function (blob) {
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
                        downloadZipBtn.disabled = false;
                        downloadZipBtn.textContent = '⬇ Download all as ZIP';
                    }
                };
                reader.readAsArrayBuffer(blob);
            }, 'image/png');
        });
    });

    // ── Reset ─────────────────────────────────────────────────────────────────
    startOverBtn.addEventListener('click', fullReset);
    extractAgainBtn.addEventListener('click', fullReset);

    function fullReset() {
        state.pdfDoc = null;
        state.fileName = '';
        state.found = [];
        imgResultsContainer.innerHTML = '';
        hideError();
        results.style.display = 'none';
        optionsPanel.style.display = 'none';
        progressBar.style.width = '0%';
        progressWrap.style.display = 'none';
        progressLabel.style.display = 'none';
        extractBtn.disabled = false;
        startOverBtn.disabled = false;
        dropZone.style.display = 'flex';
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function setExtracting(on) {
        extractBtn.disabled = on;
        startOverBtn.disabled = on;
        progressWrap.style.display = on ? 'block' : 'none';
        progressLabel.style.display = on ? 'block' : 'none';
        if (!on) progressBar.style.width = '0%';
    }

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.style.display = 'block';
    }

    function hideError() {
        errorBox.textContent = '';
        errorBox.style.display = 'none';
    }

    // Init
    optionsPanel.style.display = 'none';
    results.style.display = 'none';
    progressWrap.style.display = 'none';
    progressLabel.style.display = 'none';
    hideError();

}());
