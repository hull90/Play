let player, table, currentVideoId = "", allData = [];
const plyrConfig = { invertTime: false, displayDuration: true, controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'] };
player = new Plyr('#player', plyrConfig);

async function init() {
    const savedOffset = localStorage.getItem('videoLab_offset');
    if (savedOffset !== null) $('#offsetSeconds').val(savedOffset);
    $('#offsetSeconds').on('input', function() { localStorage.setItem('videoLab_offset', $(this).val()); });

    const params = new URLSearchParams(window.location.search);
    const jsonUrl = params.get('src');
    if (!jsonUrl) return;

    try {
        const response = await fetch(jsonUrl);
        const arrayBuffer = await response.arrayBuffer();
        const uint8View = new Uint8Array(arrayBuffer);
        
        let root;
        if (uint8View[0] === 0x1f && uint8View[1] === 0x8b) {
            root = JSON.parse(pako.ungzip(uint8View, { to: 'string' }));
        } else {
            root = JSON.parse(new TextDecoder("utf-8").decode(uint8View));
        }

        $('#main-title').html(`<b>${root.name || 'VIDEO LAB'}</b>`);
        $('#event-date').text(root.date || '');
        allData = root.markerInstanceList || [];
        renderTable(allData);
        generateFilterUI();
        
        // Fix per attivare lo scroll nativo su Firefox/Chrome Android
        const scrollEl = document.querySelector('.dataTables_scrollBody');
        if(scrollEl) scrollEl.addEventListener('touchstart', function() {}, {passive: true});

    } catch (err) { console.error("Data Error:", err); }
}

function renderTable(data) {
    const tbody = $('#video-table-body').empty();
    data.forEach((item, index) => {
        const vMap = item.valueMap || {};
        const seconds = Math.floor(item.videoTimeAssociated / 1000);
        tbody.append(`<tr data-idx="${index}" data-url="${item.videoPathAssociated}" data-time="${seconds}">
            <td class="row-index"></td>
            <td>${item.name || ''}</td>
            <td>${vMap["Giocatore attacco"] ? vMap["Giocatore attacco"].substring(0,3).toUpperCase() : '-'}</td>
            <td>${vMap["Squadra attacco"] || '-'}</td>
            <td>${vMap["Periodo"] ? vMap["Periodo"].toString().charAt(0) : '-'}</td>
        </tr>`);
    });

    if ($.fn.DataTable.isDataTable('#videoTable')) table.destroy();
    
    table = $('#videoTable').DataTable({ 
        paging: false, info: false, dom: 'rt', 
        scrollY: '100%', scrollCollapse: true, scrollX: true,
        autoWidth: false,
        columnDefs: [
            { targets: 0, width: '30px', orderable: false },
            { targets: 1, width: '130px' },
            { targets: [2,3,4], width: '70px' }
        ], 
        order: [[0, 'asc']]
    });

    table.on('order.dt search.dt', function () {
        table.column(0, {search:'applied', order:'applied'}).nodes().each((cell, i) => cell.innerHTML = i + 1);
        updateResetVisibility();
    }).draw();
    setupTableEvents();
}

function setupTableEvents() {
    $('#videoTable tbody').off('click', 'tr').on('click', 'tr', function () {
        const tr = $(this);
        table.rows().nodes().to$().removeClass('active-row');
        tr.addClass('active-row');
        $('#detailsBtn').css({'opacity': '1', 'pointer-events': 'auto'});
        $('#playBtn').off('click').on('click', () => {
            const time = parseInt(tr.data('time')) + (parseInt($('#offsetSeconds').val()) || 0);
            playVideo(tr.data('url'), Math.max(0, time));
        });
        $('#detailsBtn').off('click').on('click', () => showRowDetails(tr.data('idx'), tr.find('td:first').text()));
    });
}

function generateFilterUI() {
    const container = $('#filter-container').empty();
    const config = [{ label: "Evento", key: "name", isVMap: false }, { label: "Team", key: "Squadra attacco", isVMap: true }, { label: "Periodo", key: "Periodo", isVMap: true }];
    config.forEach(c => {
        const values = [...new Set(allData.map(item => c.isVMap ? (item.valueMap ? item.valueMap[c.key] : null) : item[c.key]))].filter(v => v).sort();
        let html = `<div style="margin-bottom:10px;"><b style="font-size:0.75rem;">${c.label}</b><div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; max-height:80px; overflow-y:auto; border:1px solid #eee; padding:5px;">`;
        values.forEach(v => html += `<label style="font-size:0.7rem;"><input type="checkbox" class="column-filter" data-key="${c.key}" data-vmap="${c.isVMap}" value="${v}"> ${v}</label>`);
        container.append(html + `</div></div>`);
    });
}

function applyFilters() {
    const filters = {};
    $('.column-filter:checked').each(function() {
        const key = $(this).data('key');
        if (!filters[key]) filters[key] = { vals: [], vmap: $(this).data('vmap') };
        filters[key].vals.push($(this).val());
    });
    $.fn.dataTable.ext.search.push((settings, data, dataIndex) => {
        const item = allData[$(table.row(dataIndex).node()).data('idx')];
        for (let key in filters) {
            const val = filters[key].vmap ? (item.valueMap ? item.valueMap[key] : null) : item[key];
            if (!filters[key].vals.includes(String(val))) return false;
        }
        return true;
    });
    table.draw();
    $.fn.dataTable.ext.search.pop();
    updateResetVisibility();
    toggleModal('filterModal', false);
}

function resetAll() { $('.column-filter').prop('checked', false); table.order([0, 'asc']).search('').draw(); updateResetVisibility(); }
function resetFilters() { resetAll(); toggleModal('filterModal', false); }

function updateResetVisibility() {
    const hasFilter = $('.column-filter:checked').length > 0;
    const isOrdered = table.order().length > 0 && (table.order()[0][0] !== 0 || table.order()[0][1] !== 'asc');
    $('#globalResetBtn').toggle(hasFilter || isOrdered).css('display', (hasFilter || isOrdered) ? 'flex' : 'none');
}

function showRowDetails(idx, pos) {
    const item = allData[idx];
    const container = $('#details-container').empty();
    if(item.valueMap) Object.entries(item.valueMap).forEach(([k, v]) => container.append(`<div style="margin-bottom:5px; font-size:0.8rem;"><b>${k}:</b> ${v || '-'}</div>`));
    toggleModal('detailsModal', true);
}

function playVideo(url, time) {
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/) || url.match(/(?:vimeo\.com\/)(\d+)/);
    const id = match ? (match[2] || match[1]) : url;
    const provider = url.includes('vimeo') ? 'vimeo' : (url.includes('youtube') || match ? 'youtube' : 'html5');
    if (id === currentVideoId && provider !== 'html5') { player.currentTime = time; player.play(); } 
    else {
        currentVideoId = id; player.destroy();
        const el = document.getElementById('player-container');
        if (provider === 'html5') el.innerHTML = `<video id="player" playsinline controls><source src="${url}" type="video/mp4"></video>`;
        else el.innerHTML = `<div id="player" data-plyr-provider="${provider}" data-plyr-embed-id="${id}"></div>`;
        player = new Plyr('#player', plyrConfig);
        player.on('ready', () => setTimeout(() => { player.currentTime = time; player.play(); }, 1200));
    }
}


function changeOffset(delta) {
    const input = $('#offsetSeconds');
    let val = parseInt(input.val()) || 0;
    val += delta;
    input.val(val);
    
    // Salva automaticamente
    localStorage.setItem('videoLab_offset', val);
    
    // Feedback visivo rapido sul click
    console.log("Nuovo Offset:", val);
}

// Ricorda di rimuovere o aggiornare l'event listener 'input' in init() 
// se avevi messo quello per l'inserimento manuale, anche se il 'readonly' lo protegge.

function toggleMobileMenu(e) { e.stopPropagation(); $('#navMenu').toggleClass('open'); }
function toggleModal(id, show) { $(`#${id}`).css('display', show ? 'block' : 'none'); }

$(window).on('click', e => { 
    if (!$(e.target).closest('.nav-right').length) $('#navMenu').removeClass('open');
    if ($(e.target).hasClass('modal')) $('.modal').hide();
});

$(window).on('resize', () => { 
    if ($(window).width() > 991) $('#navMenu').removeClass('open'); 
    if(table) table.columns.adjust(); // Ricalcola lo scroll orizzontale al cambio orientamento
});

$(document).ready(init);