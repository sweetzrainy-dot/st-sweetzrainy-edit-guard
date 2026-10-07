jQuery(async () => {
  console.log('[编辑保镖] v2 已加载');
  const D = document;
  const MAX_HISTORY = 50;      // 每个文本框最多保留的历史版本数
  const DEBOUNCE = 1200;       // 停止输入多久后记一个版本(毫秒)

  const getCtx = () => { try { return SillyTavern.getContext(); } catch (e) { return {}; } };
  const toast = (type, msg) => {
    const t = window.toastr || getCtx().toastr;
    if (t && t[type]) t[type](msg, undefined, { timeOut: 1200 });
  };

  // ───────── 样式：沿用酒馆原生的 right_menu_button，只补一点间距和反馈色 ─────────
  const style = D.createElement('style');
  style.textContent = `
    .eg-group { display: inline-flex; align-items: center; gap: 2px; margin-left: 6px; flex: 0 0 auto; vertical-align: middle; }
    .eg-btn { cursor: pointer; padding: 5px 7px; font-size: 15px; touch-action: manipulation;
              -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; transition: opacity .15s, color .15s; }
    .eg-btn.eg-off { opacity: .3; }
    .eg-btn.eg-ok { color: #7ddc8a !important; opacity: 1 !important; }
    .eg-row { display: flex; justify-content: flex-end; margin: 2px 0; }
  `;
  D.head.appendChild(style);

  // ───────── 每个文本框的状态 ─────────
  const states = new WeakMap();

  function getState(el) {
    let st = states.get(el);
    if (!st) {
      st = { el, stack: [el.value], last: el.value, timer: null, group: null, silent: false };
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

  // ───────── 找原生的「放大键」，把按键塞在它旁边 ─────────
  function findAnchor(ta) {
    const scope = ta.closest('dialog, .popup');
    if (ta.id) {
      const m = D.querySelector('.editor_maximize[data-for="' + CSS.escape(ta.id) + '"]');
      if (m && m.closest('dialog, .popup') === scope) return m;
    }
    // 往上找：在 textarea 前面、且中间没隔着别的 textarea 的最近一个放大键
    let level = ta.parentElement;
    for (let i = 0; i < 6 && level; i++) {
      const list = level.querySelectorAll('textarea, .editor_maximize');
      const idx = Array.prototype.indexOf.call(list, ta);
      for (let j = idx - 1; j >= 0; j--) {
        if (list[j].tagName === 'TEXTAREA') return null;
        if (list[j].classList.contains('editor_maximize')) return list[j];
      }
      if (level.matches('dialog, .popup, body')) break;
      level = level.parentElement;
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

  function eligible(ta) {
    if (ta.id === 'send_textarea' || ta.id === 'curEditTextarea') return false;
    if (ta.closest('#send_form, .mes, .eg-group')) return false;
    if (ta.readOnly || ta.disabled) return false;
    return true;
  }

  function bind(ta) {
    if (!eligible(ta)) return;
    const st = getState(ta);
    if (st.group && st.group.isConnected) return;
    const group = makeGroup(st);
    st.group = group;
    const anchor = findAnchor(ta);
    if (anchor) {
      anchor.insertAdjacentElement('afterend', group);          // 紧挨着原生放大键
    } else {
      group.classList.add('eg-row');                            // 没有放大键(比如放大后的弹窗) → 文本框上方一小排
      ta.insertAdjacentElement('beforebegin', group);
    }
    refresh(st);
  }

  function scan() {
    D.querySelectorAll('textarea').forEach(bind);
  }

  let scanTimer = null;
  const schedule = () => { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 150); };

  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'TEXTAREA' || (n.querySelector && n.querySelector('textarea'))) { schedule(); return; }
      }
    }
  }).observe(D.body, { childList: true, subtree: true });

  // 兜底：酒馆有时只重绘标题行不动文本框，这里每2秒补一次
  setInterval(() => { if (!D.hidden) scan(); }, 2000);
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
    if (!st) return;
    if (b.dataset.act === 'undo') undo(st);
    else if (b.dataset.act === 'save') save(st);
  }, true);
});
