App.thumbnails = (() => {
    const state = App.state;

    function updateSelectedCount() {
        document.getElementById('selectedCount').textContent = state.selectedPages.size;
    }

    function togglePage(pageNum, el) {
        if (state.selectedPages.has(pageNum)) {
            state.selectedPages.delete(pageNum);
            el.classList.remove('selected');
        } else {
            state.selectedPages.add(pageNum);
            el.classList.add('selected');
        }
        updateSelectedCount();
    }

    function selectAll() {
        for (let i = 1; i <= state.totalPages; i++) state.selectedPages.add(i);
        document.querySelectorAll('.thumbnail').forEach(t => t.classList.add('selected'));
        updateSelectedCount();
    }

    function selectNone() {
        state.selectedPages.clear();
        document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('selected'));
        updateSelectedCount();
    }

    function invertSelection() {
        document.querySelectorAll('.thumbnail').forEach(t => {
            const p = parseInt(t.dataset.page);
            if (state.selectedPages.has(p)) {
                state.selectedPages.delete(p);
                t.classList.remove('selected');
            } else {
                state.selectedPages.add(p);
                t.classList.add('selected');
            }
        });
        updateSelectedCount();
    }

    function renderPlaceholder(canvas, pageNum) {
        canvas.width = 80;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 80, 100);
        ctx.fillStyle = '#475569';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`P${pageNum}`, 40, 55);
    }

    async function renderThumbnails() {
        const container = document.getElementById('thumbnails');
        container.innerHTML = '';

        const pdfjsLib = window['pdfjs-dist/build/pdf'];

        for (let i = 1; i <= state.totalPages; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'thumbnail selected';
            wrapper.dataset.page = i;

            const canvas = document.createElement('canvas');

            const check = document.createElement('div');
            check.className = 'check';
            check.textContent = '✓';

            const label = document.createElement('div');
            label.className = 'page-num';
            label.textContent = `Page ${i}`;

            wrapper.appendChild(canvas);
            wrapper.appendChild(check);
            wrapper.appendChild(label);
            container.appendChild(wrapper);

            wrapper.addEventListener('click', () => togglePage(i, wrapper));

            if (pdfjsLib && state.pdfJsDoc) { // eslint-disable-line
                try {
                    const page = await state.pdfJsDoc.getPage(i);
                    const viewport = page.getViewport({ scale: 0.3 });
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                } catch {
                    renderPlaceholder(canvas, i);
                }
            } else {
                renderPlaceholder(canvas, i);
            }
        }
    }

    return { updateSelectedCount, togglePage, selectAll, selectNone, invertSelection, renderThumbnails };
})();
