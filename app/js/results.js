App.results = (() => {
    const state = App.state;
    const { downloadFile, downloadAll } = App.downloader;

    function showResults() {
        const container = document.getElementById('resultFiles');
        container.innerHTML = '';

        state.generatedFiles.forEach((file, idx) => {
            const row = document.createElement('div');
            row.className = 'result-file';

            const span = document.createElement('span');
            span.textContent = `📄 ${file.name} (${(file.bytes.length / 1024).toFixed(1)} KB)`;

            const btn = document.createElement('button');
            btn.className = 'btn-download';
            btn.textContent = '⬇ Download';
            btn.addEventListener('click', () => downloadFile(idx));

            row.appendChild(span);
            row.appendChild(btn);
            container.appendChild(row);
        });

        if (state.generatedFiles.length > 1) {
            const allBtn = document.createElement('button');
            allBtn.className = 'btn-primary';
            allBtn.style.marginTop = '0.75rem';
            allBtn.textContent = `⬇ Download All (${state.generatedFiles.length} files)`;
            allBtn.addEventListener('click', downloadAll);
            container.appendChild(allBtn);
        }

        document.getElementById('results').classList.add('visible');
    }

    return { showResults };
})();
