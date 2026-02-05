let player; // Dichiarazione globale
let table, currentVideoId = "", allData = [], selectedRowIdx = null;
const plyrConfig = { invertTime: false, displayDuration: true, controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'] };

// Inizializzazione e caricamento JSON (Invariato)
async function init() {
  player = new Plyr('#player', plyrConfig);

  const savedOffset = localStorage.getItem('videoLab_offset');
  if (savedOffset !== null) $('#offsetSeconds').val(savedOffset);

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
    $('#main-title').html(`<b>${root.name || root.nome || 'VIDEO LAB'}</b>`);

    const docDate = root.date || root.dataCreazione;
    
    if (docDate) {
      const d = new Date(docDate);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        $('#event-date').text(`${day}/${month}/${year}`);
      } else {
        $('#event-date').text(docDate.split(' ')[0]);
      }
    }
    allData = root.markerInstanceList || [];
    renderTable(allData);
    generateFilterUI();
  } catch (err) { console.error("Error loading data:", err); }
}

function changeOffset(delta) {
  let val = parseInt($('#offsetSeconds').val()) || 0;
  val += delta;
  $('#offsetSeconds').val(val);
  localStorage.setItem('videoLab_offset', val);
}

function smartSkip(direction) {
  if (player) {
    const target = player.currentTime + direction;
    player.currentTime = Math.max(0, target);
  }
}

function updatePlaybackSpeed(val) {
  if (player) {
    player.speed = parseFloat(val);
  }
}

function renderTable(data) {
  const tbody = $('#video-table-body').empty();
  data.forEach((item, index) => {
    const vMap = item.valueMap || {};
    tbody.append(`<tr data-idx="${index}" data-url="${item.videoPathAssociated}" data-time="${Math.floor(item.videoTimeAssociated / 1000)}">
            <td></td><td>${item.name || ''}</td><td>${vMap["Giocatore attacco"] ? vMap["Giocatore attacco"].substring(0, 3).toUpperCase() : '-'}</td>
            <td>${vMap["Squadra attacco"] || '-'}</td><td>${vMap["Periodo"] ? vMap["Periodo"].toString().charAt(0) : '-'}</td>
        </tr>`);
  });
  if ($.fn.DataTable.isDataTable('#videoTable')) table.destroy();
  table = $('#videoTable').DataTable({
    paging: false, info: false, dom: 'rt', scrollY: '100%', scrollCollapse: true, scrollX: true, autoWidth: false,
    columnDefs: [{ targets: 0, width: '30px', orderable: false }, { targets: 1, width: '130px' }], order: [[0, 'asc']]
  });
  setTimeout(() => { table.columns.adjust().draw(); }, 200);
  table.on('order.dt search.dt', function () {
    table.column(0, { search: 'applied', order: 'applied' }).nodes().each((cell, i) => cell.innerHTML = i + 1);
    updateResetVisibility();
  }).draw();
  setupTableEvents();
}

function setupTableEvents() {
  $('#videoTable tbody').off('click', 'tr').on('click', 'tr', function () {
    const tr = $(this);
    table.rows().nodes().to$().removeClass('active-row');
    tr.addClass('active-row');
    selectedRowIdx = tr.data('idx');
    $('#detailsBtn').css({ 'opacity': '1', 'pointer-events': 'auto' });
    $('#playBtn').off('click').on('click', () => {
      const time = parseInt(tr.data('time')) + (parseInt($('#offsetSeconds').val()) || 0);
      playVideo(tr.data('url'), Math.max(0, time));
    });
  });
}


// Modifica la funzione playVideo per essere più robusta
function playVideo(url, time) {
  const speed = parseFloat($('#speedSelect').val()) || 1;
  const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
  const id = match ? match[2] : url;
  const provider = (url.includes('youtube') || match) ? 'youtube' : 'html5';

  // Se il player non esiste o cambiamo video
  if (id !== currentVideoId) {
    currentVideoId = id;
    if (player) player.destroy();

    const el = document.getElementById('player-container');
    // Ricreiamo il div bersaglio
    el.innerHTML = provider === 'html5' 
      ? `<video id="player" playsinline controls><source src="${url}" type="video/mp4"></video>` 
      : `<div id="player" data-plyr-provider="${provider}" data-plyr-embed-id="${id}"></div>`;
    
    player = new Plyr('#player', plyrConfig);
    
    player.on('ready', () => {
      player.speed = speed;
      player.currentTime = time;
      player.play();
    });
  } else {
    // Se il video è lo stesso, salta solo al tempo
    player.currentTime = time;
    player.play();
  }
}


function generateFilterUI() {
  const container = $('#filter-container').empty();
  if (allData.length === 0) return;

  // 1. Identifichiamo tutte le chiavi e raccogliamo i valori (O(N))
  const filterSpecs = new Map();
  filterSpecs.set("name", { label: "Evento", isVMap: false, values: new Set() });

  allData.forEach(item => {
    if (item.name) filterSpecs.get("name").values.add(item.name);
    if (item.valueMap) {
      Object.entries(item.valueMap).forEach(([k, v]) => {
        if (k !== 'Coordinate' && k !== 'Distanza' && v !== null && v !== undefined && v !== "") {
          if (!filterSpecs.has(k)) filterSpecs.set(k, { label: k, isVMap: true, values: new Set() });
          filterSpecs.get(k).values.add(v);
        }
      });
    }
  });

  // 2. Ordiniamo le chiavi (Evento per primo, poi alfabetico)
  const sortedKeys = Array.from(filterSpecs.keys()).sort((a, b) => {
    if (a === "name") return -1;
    if (b === "name") return 1;
    return a.localeCompare(b);
  });

  // 3. Generiamo l'interfaccia
  sortedKeys.forEach(key => {
    const spec = filterSpecs.get(key);
    const sortedValues = Array.from(spec.values).sort();
    if (sortedValues.length === 0) return;

    let html = `
            <div style="margin-bottom:15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                <b style="font-size:0.8rem; color:var(--dark); display:block; margin-bottom:8px;">${spec.label}</b>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">`;

    sortedValues.forEach(v => {
      html += `
                <label style="font-size:0.7rem; display:flex; align-items:center; gap:4px; cursor:pointer; background:#f8fafc; padding:4px; border-radius:4px;">
                    <input type="checkbox" class="column-filter" data-key="${key}" data-vmap="${spec.isVMap}" value="${v}"> 
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${v}">${v}</span>
                </label>`;
    });
    container.append(html + `</div></div>`);
  });
}












function applyFilters() {
  const filters = {};
  const activeCheckboxes = $('.column-filter:checked');
  
  if (activeCheckboxes.length === 0) {
    $.fn.dataTable.ext.search = [];
    table.draw();
    updateResetVisibility();
    toggleModal('filterModal', false);
    return;
  }

  activeCheckboxes.each(function () {
    const key = $(this).data('key');
    const isVMap = $(this).data('vmap');
    if (!filters[key]) filters[key] = { vals: new Set(), vmap: isVMap };
    filters[key].vals.add(String($(this).val()));
  });

  const filterEntries = Object.entries(filters);

  $.fn.dataTable.ext.search.push((settings, data, dataIndex) => {
    const item = allData[$(table.row(dataIndex).node()).data('idx')];
    return filterEntries.every(([key, f]) => {
      const val = f.vmap ? (item.valueMap ? item.valueMap[key] : null) : item[key];
      return f.vals.has(String(val));
    });
  });

  table.draw();
  $.fn.dataTable.ext.search.pop();
  updateResetVisibility();
  toggleModal('filterModal', false);
}

function resetAll() { $('.column-filter').prop('checked', false); table.order([0, 'asc']).search('').draw(); updateResetVisibility(); }
function resetFilters() { resetAll(); toggleModal('filterModal', false); }
function updateResetVisibility() {
  if (!table) return;
  const hasFilter = $('.column-filter:checked').length > 0;
  const order = table.order();
  const isOrdered = order.length > 0 && (order[0][0] !== 0 || order[0][1] !== 'asc');
  $('#globalResetBtn').toggle(hasFilter || isOrdered);
}

function showRowDetails() {
  if (selectedRowIdx === null) return;
  const item = allData[selectedRowIdx];
  const container = $('#details-container').empty();

  // 1. Dati tecnici
  container.append(`
        <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid var(--primary);">
            <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;"><b>Sorgente Video:</b></div>
            <div style="font-size:0.75rem; word-break: break-all; margin-bottom:8px; color:var(--dark);">${item.videoPathAssociated}</div>
            <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;"><b>Timestamp:</b></div>
            <div style="font-size:0.8rem; font-family: monospace; color:var(--dark);">${item.videoTimeAssociated} ms</div>
        </div>
        <hr style="border:0; border-top:1px solid #eee; margin:15px 0;">
  `);

  // 2. ValueMap con filtri corretti
  if (item.valueMap) {
    Object.entries(item.valueMap).forEach(([k, v]) => {
      if (k === 'Coordinate' || k === 'Distanza') return; 

      container.append(`
                <div style="font-size:0.8rem; margin-bottom:8px; display:flex; justify-content:space-between; border-bottom:1px solid #fafafa; padding-bottom:4px;">
                    <span style="color:#64748b;">${k}:</span>
                    <span style="font-weight:600; color:var(--dark);">${v || '-'}</span>
                </div>
            `);
    });
  }

  toggleModal('detailsModal', true);
}



function toggleMobileMenu(e) { e.stopPropagation(); $('#navMenu').toggleClass('open'); }
function toggleModal(id, show) { $(`#${id}`).css('display', show ? 'block' : 'none'); }
$(window).on('click', e => { if (!$(e.target).closest('.nav-right').length) $('#navMenu').removeClass('open'); if ($(e.target).hasClass('modal')) $('.modal').hide(); });
$(window).on('resize', () => { if (table) table.columns.adjust(); if ($(window).width() > 991) $('#navMenu').removeClass('open'); });
$(document).ready(init);