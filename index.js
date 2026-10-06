jQuery(async () => {
  const { getContext } = SillyTavern;
  const context = getContext();
  const D = document;

  // ══════════════════════════════════════════════
  // 🎨 【自定义样式控制台】换主题只改这里！
  // ══════════════════════════════════════════════
  const CONFIG = {
    BAR_BG: 'rgba(30, 24, 18, 0.85)',
    BAR_BORDER: '1px solid rgba(192, 160, 128, 0.6)',
    BAR_RADIUS: '30px',
    BAR_SHADOW: '0 4px 12px rgba(0,0,0,0.5)',
    TEXT_COLOR: '#F0E6DA',
    ACCENT_COLOR: '#c0a080',
    HOVER_BG: 'rgba(192, 160, 128, 0.2)',
    FONT_SIZE: '14px',
    ICON_SIZE: '18px',
    POS_BOTTOM: '90px',
    POS_LEFT: '50%',
    TRANSFORM_X: 'translateX(-50%)',
    ICON_UNDO: '↶',
    TEXT_UNDO: '撤销',
    ICON_SAVE: '💾',
    TEXT_SAVE: '保存',
    MAX_HISTORY: 30,
    DEBOUNCE_TIME: 1500
  };

  let activeEl = null;
  let history = {};
  let saveTimer = null;

  function getKey(el) {
    if (el.id) return 'id#' + el.id;
    if (el.name) return 'name#' + el.name;
    const parent = el.closest('[uid], [data-id], .world_entry, .persona_item, .character_select');
    const parentId = parent ? (parent.getAttribute('uid') || parent.getAttribute('data-id') || 'item') : '';
    const container = el.closest('.popup, .drawer-content, #persona_management, body') || D.body;
    const inputs = Array.from(container.querySelectorAll('textarea, input[type="text"]')).filter(x => x.id !== 'send_textarea');
    const index = Array.from(inputs).indexOf(el);
    return `idx#${index}_${parentId}_${el.placeholder || 'input'}`;
  }

  function pushHistory(key, value) {
    if (!history[key]) history[key] = [];
    if (history[key].length && history[key][0] === value) return;
    history[key].unshift(value);
    if (history[key].length > CONFIG.MAX_HISTORY) history[key].pop();
  }

  const bar = D.createElement('div');
  bar.id = 'edit-guard-bar';
  bar.style.cssText = `
    position: fixed; bottom: ${CONFIG.POS_BOTTOM}; left: ${CONFIG.POS_LEFT}; transform: ${CONFIG.TRANSFORM_X};
    background: ${CONFIG.BAR_BG}; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border: ${CONFIG.BAR_BORDER}; border-radius: ${CONFIG.BAR_RADIUS};
    padding: 6px 12px; display: none; gap: 10px; align-items: center;
    z-index: 2147483647; box-shadow: ${CONFIG.BAR_SHADOW};
    transition: opacity 0.2s ease;
  `;

  const undoBtn = D.createElement('div');
  undoBtn.innerHTML = `<span style="font-size:${CONFIG.ICON_SIZE};">${CONFIG.ICON_UNDO}</span> ${CONFIG.TEXT_UNDO}`;
  undoBtn.style.cssText = `color: ${CONFIG.TEXT_COLOR}; cursor: pointer; padding: 6px 10px; font-size: ${CONFIG.FONT_SIZE}; border-radius: 20px; transition: background 0.2s;`;
  
  const saveBtn = D.createElement('div');
  saveBtn.innerHTML = `<span style="font-size:${CONFIG.ICON_SIZE};">${CONFIG.ICON_SAVE}</span> ${CONFIG.TEXT_SAVE}`;
  saveBtn.style.cssText = `color: ${CONFIG.ACCENT_COLOR}; font-weight: bold; cursor: pointer; padding: 6px 10px; font-size: ${CONFIG.FONT_SIZE}; border-radius: 20px; transition: background 0.2s;`;

  bar.appendChild(undoBtn);
  bar.appendChild(saveBtn);
  D.body.appendChild(bar);

  undoBtn.onmouseover = () => undoBtn.style.background = CONFIG.HOVER_BG;
  undoBtn.onmouseout = () => undoBtn.style.background = 'transparent';
  saveBtn.onmouseover = () => saveBtn.style.background = CONFIG.HOVER_BG;
  saveBtn.onmouseout = () => saveBtn.style.background = 'transparent';

  D.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el || (el.tagName !== 'TEXTAREA' && el.type !== 'text')) return;
    if (el.id === 'send_textarea') return;
    activeEl = el;
    const key = getKey(el);
    if (!history[key] || history[key].length === 0) pushHistory(key, el.value);
    bar.style.display = 'flex';
  });

  D.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || el !== activeEl || el.id === 'send_textarea') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => pushHistory(getKey(el), el.value), CONFIG.DEBOUNCE_TIME);
  });

  D.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!el || el !== activeEl || el.id === 'send_textarea') return;
    pushHistory(getKey(el), el.value);
    setTimeout(() => {
      if (D.activeElement !== undoBtn && D.activeElement !== saveBtn && D.activeElement !== activeEl) {
        bar.style.display = 'none';
        activeEl = null;
      }
    }, 200);
  });

  undoBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  undoBtn.addEventListener('click', () => {
    if (!activeEl) return;
    const list = history[getKey(activeEl)] || [];
    if (list.length <= 1) {
      if (context.toastr && context.toastr.warning) context.toastr.warning('没有更早的历史版本了', '撤销');
      return;
    }
    list.shift();
    activeEl.value = list[0];
    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
    activeEl.dispatchEvent(new Event('change', { bubbles: true }));
    if (context.toastr && context.toastr.info) context.toastr.info('已撤销到上一个版本', '撤销');
  });

  saveBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  saveBtn.addEventListener('click', () => {
    if (!activeEl) return;
    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
    activeEl.dispatchEvent(new Event('change', { bubbles: true }));
    context.saveSettingsDebounced();
    if (context.toastr && context.toastr.success) context.toastr.success('已触发底层保存', '编辑保镖');
  });
});
