jQuery(async () => {
  console.log('[编辑保镖] v3 已加载');
  const D = document;
  const MAX_HISTORY = 50;      // 每个文本框最多保留的历史版本数
  const DEBOUNCE = 1200;       // 停止输入多久后记一个版本(毫秒)
  const SCAN_INTERVAL = 1000;  // 多久检查一次界面变化(毫秒)

  const getCtx = () => { try { return SillyTavern.getContext(); } catch (e) { return {}; } };
  const toast = (type, msg) => {
    const t = window.toastr || getCtx().toastr;
    if (t && t[type]) t[type](msg, undefined, { timeOut: 1200 });
  };

  // ───────── 样式：沿用酒馆原生的 right_menu_button，只补间距和反馈色 ─────────
  const style = D.createElement('style');
  style.textContent = `
    .eg-group { display: inline-flex; align-items: center; gap: 0; margin-left: 4px; flex: 0 0 auto; vertical-align: middle; }
    .eg-btn { cursor: pointer; padding: 4px 6px; font-size: 14px; touch-action: manipulation;
              -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; transition: opacity .15s, color .15s; }
    .eg-btn.eg-off { opacity: .3; }
    .eg-btn.eg-ok { color: #7ddc8a !important; opacity: 1 !important; }
    .eg-group.eg-row { display: flex; justify-content: flex-end; margin: 2px 0; }
    .eg-group.eg-float { position: absolute; z-index: 10; margin: 0; padding: 2px 6px; border-radius: 18px;
                         background: rgba(30, 24, 18, 0.85); }
  `;
  D.head.appendChild(style);

  // ───────── 每个文本框的状态 ─────────
  const states = new WeakMap();

  function getState(el) {
    let st = states.get(el);
    if (!st) {
      st = { el, stack: [el.value], last: el.value, timer: null, group: null, mode: null, silent: false };
      states.set(el, st);
    }
    return st;
  }

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function refresh(st) {
    if (!st.group) return;
    const top = st.stack[st.stack.length - 1];
    const can = st.stack.length > 1 || st.el.value !== top;
    const u = st.group.querySelector('.eg-undo');
    if (u) u.classList.toggle('eg-off', !can);
  }

  function push(st) {
    const v = st.el.value;
    if (st.stack[st.stack.length - 1] === v) { refresh(st); return; }
    st.stack.push(v);
    if (st.stack.length > MAX_HISTORY) st.stack.shift();
    st.last = v;
    refresh(st);
  }

  function undo(st) {
    const el = st.el;
    push(st); // 先把当前内容记下来，再回退
    if (st.stack.length <= 1) { toast('warning', '没有更早的版本了'); return; }
    st.stack.pop();
    const v = st.stack[st.stack.length - 1];
    st.silent = true;
    el.value = v;
    st.last = v;
    try { el.setSelectionRange(v.length, v.length); } catch (e) {}
    fire(el);
    st.silent = false;
    refresh(st);
    toast('info', '已撤销');
  }

  function flash(st) {
    const b = st.group && st.group.querySelector('.eg-save');
    if (!b) return;
    b.classList.remove('fa-floppy-disk');
    b.classList.add('fa-check', 'eg-ok');
    setTimeout(() => {
      b.classList.remove('fa-check', 'eg-ok');
      b.classList.add('fa-floppy-disk');
    }, 900);
  }

  function save(st) {
    const el = st.el;
    clearTimeout(st.timer);
    push(st);
    fire(el);
    try { const c = getCtx(); if (c.saveSettingsDebounced) c.saveSettingsDebounced(); } catch (e) {}
    flash(st);
    toast('success', '已保存');
    if (D.activeElement === el) el.blur(); // 顺手收起键盘
  }

  // ───────── 判断与定位 ─────────
  const isVisible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  function eligible(ta) {
    if (ta.id === 'send_textarea' || ta.id === 'curEditTextarea') return false;
    if (ta.closest('#send_form, .mes, .eg-group')) return false;
    if (ta.disabled) return false;
    return true;
  }

  // 找 textarea 前面最近的、看得见的原生放大键(中间不能隔着别的 textarea)
  function findAnchor(ta) {
    let level = ta.parentElement;
    for (let i = 0; i < 6 && level; i++) {
      const list = level.querySelectorAll('textarea, .editor_maximize');
      const idx = Array.prototype.indexOf.call(list, ta);
      for (let j = idx - 1; j >= 0; j--) {
        const x = list[j];
        if (x.tagName === 'TEXTAREA') return null;
        if (x.closest('.eg-group')) continue;
        if (isVisible(x)) return x;
      }
      if (level.matches('dialog, .popup, body')) break;
      level = level.parentElement;
    }
    return null;
  }

  // 决定这个文本框的按键放哪：
  //  overlay = 展开成大浮层的编辑框(脚本编辑器) → 框内右下角
  //  anchor  = 紧挨原生放大键右边
  //  below   = 放大弹窗(里面只有这一个框) → 框下方右侧
  //  above   = 其他弹窗里没有放大键的框(如正则) → 框上方右侧
  function computePlacement(ta) {
    const dlg = ta.closest('dialog, .popup');
    const r = ta.getBoundingClientRect();
    const pos = getComputedStyle(ta).position;
    if (dlg && !ta.readOnly && (pos === 'absolute' || pos === 'fixed') && r.height > window.innerHeight * 0.5) {
      return { mode: 'overlay' };
    }
    const a = findAnchor(ta);
    if (a) return { mode: 'anchor', ref: a };
    if (dlg && !ta.readOnly) {
      const vis = Array.from(dlg.querySelectorAll('textarea')).filter((t) => eligible(t) && isVisible(t));
      if (vis.length === 1) return { mode: 'below' };
      if (r.height >= 70) return { mode: 'above' };
    }
    return null;
  }

  function makeGroup(st) {
    const g = D.createElement('span');
    g.className = 'eg-group';
    g.innerHTML =
      '<i class="fa-solid fa-rotate-left right_menu_button eg-btn eg-undo" title="撤销" data-act="undo"></i>' +
      '<i class="fa-solid fa-floppy-disk right_menu_button eg-btn eg-save" title="保存" data-act="save"></i>';
    g._eg = st;
    return g;
  }

  function removeGroup(st) {
    if (st.group) st.group.remove();
    st.group = null;
    st.mode = null;
  }

  function positionOverlay(st) {
    const g = st.group, ta = st.el;
    if (!g) return;
    const op = g.offsetParent || D.body;
    const o = op.getBoundingClientRect();
    const t = ta.getBoundingClientRect();
    const w = g.offsetWidth || 80, h = g.offsetHeight || 34;
    const left = t.right - o.left - (op.clientLeft || 0) + (op === D.body ? 0 : op.scrollLeft) - w - 34;
    const top = t.bottom - o.top - (op.clientTop || 0) + (op === D.body ? 0 : op.scrollTop) - h - 10;
    g.style.left = left + 'px';
    g.style.top = top + 'px';
  }

  function place(st) {
    const ta = st.el;
    const p = computePlacement(ta);
    if (!p) { removeGroup(st); return; }

    let g = st.group;
    if (g && g.isConnected && st.mode === p.mode) {
      if (p.mode === 'anchor' && p.ref.nextElementSibling === g) return;
      if (p.mode === 'above' && ta.previousElementSibling === g) return;
      if (p.mode === 'below' && ta.nextElementSibling === g) return;
      if (p.mode === 'overlay' && ta.nextElementSibling === g) { positionOverlay(st); return; }
    }

    if (p.mode === 'anchor') {
      const nxt = p.ref.nextElementSibling;
      // 这个放大键旁边已经有别的文本框的按键了 → 不重复放
      if (nxt && nxt !== g && nxt.classList.contains('eg-group') && nxt._eg && nxt._eg.group === nxt) { removeGroup(st); return; }
    }

    if (!g) { g = makeGroup(st); st.group = g; }
    g.className = 'eg-group';
    g.removeAttribute('style');

    if (p.mode === 'anchor') {
      p.ref.insertAdjacentElement('afterend', g);
    } else if (p.mode === 'above') {
      g.classList.add('eg-row');
      ta.insertAdjacentElement('beforebegin', g);
    } else if (p.mode === 'below') {
      g.classList.add('eg-row');
      ta.insertAdjacentElement('afterend', g);
    } else if (p.mode === 'overlay') {
      g.classList.add('eg-float');
      ta.insertAdjacentElement('afterend', g);
      positionOverlay(st);
    }
    st.mode = p.mode;
    refresh(st);
  }

  function scan() {
    // 清掉游离的按键(比如被酒馆整块克隆出来、已经失去绑定的)
    D.querySelectorAll('.eg-group').forEach((g) => {
      if (!g._eg || g._eg.group !== g) g.remove();
    });
    D.querySelectorAll('textarea').forEach((ta) => {
      if (!eligible(ta)) return;
      if (!isVisible(ta)) {                 // 看不见的(模板、折叠起来的)一律不放，避免重复
        const old = states.get(ta);
        if (old && old.group) removeGroup(old);
        return;
      }
      place(getState(ta));
    });
  }

  let scanTimer = null;
  const schedule = (ms) => { clearTimeout(scanTimer); scanTimer = setTimeout(scan, ms || 150); };

  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'TEXTAREA' || (n.querySelector && n.querySelector('textarea'))) { schedule(150); return; }
      }
    }
  }).observe(D.body, { childList: true, subtree: true });

  setInterval(() => { if (!D.hidden) scan(); }, SCAN_INTERVAL);
  window.addEventListener('resize', () => schedule(200));
  D.addEventListener('click', () => schedule(300), true); // 点了展开/折叠之类的按钮后，马上重新摆放
  scan();

  // ───────── 记录历史 ─────────
  D.addEventListener('focusin', (e) => {
    const st = states.get(e.target);
    if (!st) return;
    // 值被酒馆换掉了(比如切换了角色/条目) → 丢掉旧历史，避免撤销到别人的内容
    if (st.el.value !== st.last) st.stack = [st.el.value];
    st.last = st.el.value;
    refresh(st);
  }, true);

  D.addEventListener('input', (e) => {
    const st = states.get(e.target);
    if (!st) return;
    st.last = st.el.value;
    if (st.silent) return;
    refresh(st);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => push(st), DEBOUNCE);
  }, true);

  D.addEventListener('focusout', (e) => {
    const st = states.get(e.target);
    if (st) push(st);
  }, true);

  // ───────── 点按：按下时不抢焦点(键盘不收)，点击时执行 ─────────
  const stopFocusSteal = (e) => {
    if (e.target.closest && e.target.closest('.eg-btn')) e.preventDefault();
  };
  D.addEventListener('pointerdown', stopFocusSteal, true);
  D.addEventListener('mousedown', stopFocusSteal, true);

  D.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.eg-btn');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation(); // 防止触发所在折叠标题栏的展开/收起
    const g = b.closest('.eg-group');
    const st = g && g._eg;
    if (!st) { if (g) g.remove(); return; }
    if (b.dataset.act === 'undo') undo(st);
    else if (b.dataset.act === 'save') save(st);
  }, true);
});
