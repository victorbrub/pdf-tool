App.tabs = (() => {
    const state = App.state;
    const TAB_NAMES = ['range', 'custom', 'all', 'visual'];

    function switchTab(tab) {
        state.currentTab = tab;
        document.querySelectorAll('.tab').forEach((el, i) => {
            el.classList.toggle('active', TAB_NAMES[i] === tab);
        });
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
    }

    return { switchTab };
})();
