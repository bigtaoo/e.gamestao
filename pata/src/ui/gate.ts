import { S, store } from '../model/store';
import { ApiError, fetchSave, isLoggedIn, login, register } from '../net/api';
import { applyRemoteSave } from '../model/store';
import { el, ui } from './dom';
import { fmtDate } from '../core/util';

type Mode = 'login' | 'register';

/** 本地未上传的进度超过这么久才值得打断用户去选。短于此一律以云端为准 */
const UNPUSHED_PROMPT_MS = 10 * 60_000;

/**
 * 登录闸门。游戏启动前先过这里。
 *
 * 为什么密码是必要的：存档要跟着账号走。如果存档只在 localStorage，
 * 密码什么也保护不了——打开浏览器就能玩，那这个功能就是假的。
 */
export function openGate(): Promise<void> {
  return new Promise((resolve) => {
    const mask = el('div.gate');
    const card = el('div.gate-card');
    let mode: Mode = S().auth.name ? 'login' : 'register';
    let busy = false;

    const done = () => {
      mask.remove();
      resolve();
    };

    const render = () => {
      // 浏览器会把「文本框 + 密码框」认成登录表单去自动填充，而且填充是异步的。
      // 靠 value 属性设初值会被它覆盖（曾经出现过：点下去那刻名字还是空的，
      // 报「先取个名字」，之后才被填上旧账号名）。所以显式写 .value 属性，
      // 并声明 autocomplete，让密码管理器按我们的意图工作而不是猜。
      const nameInput = el('input.input', {
        placeholder: '给 Pata 取个名字',
        maxlength: 16,
        autocomplete: 'username',
        name: 'pata-name',
      }) as HTMLInputElement;
      nameInput.value = S().auth.name ?? '';

      const passInput = el('input.input', {
        type: 'password',
        placeholder: mode === 'register' ? '设一个密码（至少 4 位）' : '密码',
        maxlength: 32,
        autocomplete: mode === 'register' ? 'new-password' : 'current-password',
        name: 'pata-pass',
      }) as HTMLInputElement;
      const err = el('div.gate-err');
      const submit = el('button.btn.wide', {}, mode === 'register' ? '注册并开始' : '登录');

      const fail = (msg: string) => {
        err.textContent = msg;
        busy = false;
        submit.removeAttribute('disabled');
        submit.textContent = mode === 'register' ? '注册并开始' : '登录';
      };

      submit.addEventListener('click', async () => {
        if (busy) return;
        const name = nameInput.value.trim();
        const pass = passInput.value;
        if (!name) return fail('先取个名字');
        if (pass.length < 4) return fail('密码至少 4 位');

        busy = true;
        err.textContent = '';
        submit.setAttribute('disabled', '');
        submit.textContent = '连接中…';

        try {
          if (mode === 'register') {
            await register(name, pass);
            // 注册时已经把本地这份档传上去了，直接进游戏
            S().pet.name = name;
            S().introDone = true;
            store.changed();
            done();
            return;
          }

          const remoteAt = await login(name, pass);
          const local = S();
          const localAt = local.leftAt ?? 0;
          // 该比的不是「谁的时间戳新」——模拟器一直在跑，leftAt 每次落盘都往前走，
          // 本地永远显得更新，挂一会儿页面就会误报冲突。
          // 真正要问的是：本地在最后一次成功上传之后，又攒了多少没传上去的进度。
          const unpushed = localAt - (local.auth.syncedAt ?? 0);
          if (remoteAt && unpushed > UNPUSHED_PROMPT_MS) {
            confirmOverwrite(card, remoteAt, localAt, async (useRemote) => {
              if (useRemote) await pullRemote();
              done();
            });
            return;
          }
          await pullRemote();
          done();
        } catch (e) {
          // 只有 ApiError 的文案是我们自己写的中文；其它 Error（代码 bug 抛的
          // TypeError 之类）消息是英文的，不能直接显示给玩家
          fail(e instanceof ApiError ? e.message : '出了点问题，请再试一次');
        }
      });

      const switcher = el('button.gate-link', {
        onclick: () => {
          mode = mode === 'register' ? 'login' : 'register';
          render();
        },
      }, mode === 'register' ? '已经有账号了？去登录' : '还没有账号？去注册');

      card.replaceChildren(
        el('h1', null, 'Pata'),
        el('p', null, mode === 'register' ? '取个名字，设个密码，它就住进来了' : '欢迎回来'),
        el('div.field', null, el('label', null, 'Pata 的名字'), nameInput),
        el('div.field', null, el('label', null, '密码'), passInput),
        err,
        submit,
        switcher,
        // 服务没开的时候得有路进去，否则本地存档被一个连不上的登录页锁死
        el('button.gate-link.muted', {
          onclick: () => {
            if (busy) return;
            done();
          },
        }, '离线玩这台设备上的存档'),
      );

      passInput.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter') submit.click();
      });
      setTimeout(() => (nameInput.value ? passInput : nameInput).focus(), 60);
    };

    render();
    mask.append(card);
    ui().append(mask);
  });
}

async function pullRemote(): Promise<void> {
  const { save } = await fetchSave();
  if (save) applyRemoteSave(save as Record<string, unknown>);
}

function confirmOverwrite(
  card: HTMLElement,
  remoteAt: number,
  localAt: number,
  pick: (useRemote: boolean) => void,
): void {
  card.replaceChildren(
    el('h1', null, '两份存档'),
    el('p', null, '这台设备上的进度比云端的新。要用哪一份？'),
    el('div.lines', null,
      el('div', null, el('span', null, '这台设备'), el('b', null, fmtDate(localAt))),
      el('div', null, el('span', null, '云端'), el('b', null, fmtDate(remoteAt))),
    ),
    el('button.btn.wide', { onclick: () => pick(false) }, '用这台设备的（会覆盖云端）'),
    el('button.gate-link', { onclick: () => pick(true) }, '用云端的（丢弃本机进度）'),
  );
}

/** 令牌失效时把用户送回登录页 */
export async function reopenGate(): Promise<void> {
  if (document.querySelector('.gate')) return;
  await openGate();
}

export const needsGate = () => !isLoggedIn();
