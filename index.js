jQuery(async () => {
  console.log("[智能编辑保镖] 扩展已成功加载！");
  const { getContext } = SillyTavern;
  const context = getContext();
  const D = document;
  
  // ══════════════════════════════════════════════
  // 🎨 自定义样式控制台
  // ══════════════════════════════════════════════
  const BAR_BG = 'rgba(30, 24, 18, 0.9)';
  const BAR_BORDER = '1px solid rgba(192, 160, 128, 0.6)';
  const TEXT_COLOR = '#F0E6DA';
  const ACCENT_COLOR = '#c0a080';
  const MAX_HISTORY = 30;
  const DEBOUNCE_TIME = 1500;
  // ====================

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
    if (history[key].length > MAX_HISTORY) history[key].pop();
  }

  const bar = D.createElement('div');
  bar.id = 'edit-guard-bar';
  bar.style.cssText = `
    position: fixed; display: none; gap: 10px; align-items: center;
    background: ${BAR_BG}; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    border: ${BAR_BORDER}; border-radius: 30px; padding: 6px 12px;
    z-index: 2147483647; box-shadow: 0 4px 12px rgba(0,0,0,0.5); transition: opacity 0.2s ease;
  `;

  const undoBtn = D.createElement('div');
  undoBtn.innerHTML = '↶ 撤销';
  undoBtn.style.cssText = `color: ${TEXT_COLOR}; cursor: pointer; padding: 6px 10px; font-size: 14px; border-radius: 20px;`;
  
  const saveBtn = D.createElement('div');
  saveBtn.innerHTML = '💾 保存';
  saveBtn.style.cssText = `color: ${ACCENT_COLOR}; font-weight: bold; cursor: pointer; padding: 6px 10px; font-size: 14px; border-radius: 20px;`;

  bar.appendChild(undoBtn);
  bar.appendChild(saveBtn);
  D.body.appendChild(bar);

  // ⭐ 智能定位：悬浮在输入框上方（正好是“删除键那一排”的位置）
  function positionBar(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const barWidth = 150; 
    const barHeight = 40; 
    
    let top = rect.top - barHeight - 10; // 优先放在上方
    if (top < 10) top = rect.bottom + 10; // 上方没空间就放下方
    
    let left = rect.left;
    if (left + barWidth > window.innerWidth) left = window.innerWidth - barWidth - 10;
    if (left < 10) left = 10;

    bar.style.top = `${top}px`;
    bar.style.left = `${left}px`;
    bar.style.display = 'flex';
  }

  // ⚠️ 核心变动：全部加上 { capture: true }，突破防误触脚本的拦截
  D.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!el || (el.tagName !== 'TEXTAREA' && el.type !== 'text') || el.id === 'send_textarea') return;
    
    activeEl = el;
    const key = getKey(el);
    if (!history[key] || history[key].length === 0) pushHistory(key, el.value);
    
    positionBar(el); 
  }, true); // <-- 捕获阶段

  D.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || el !== activeEl || el.id === 'send_textarea') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => pushHistory(getKey(el), el.value), DEBOUNCE_TIME);
  }, true); // <-- 捕获阶段

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
  }, true); // <-- 捕获阶段

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
    if (context.saveSettingsDebounced) context.saveSettingsDebounced();
    if (context.toastr && context.toastr.success) context.toastr.success('已触发底层保存', '编辑保镖');
  });

  window.addEventListener('resize', () => {
    if (activeEl && bar.style.display !== 'none') positionBar(activeEl);
  });
});
