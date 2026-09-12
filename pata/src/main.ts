import './style.css';
import { App } from './app';

const app = new App();

// 调试控制台只在 ?dev 下挂载
if (new URLSearchParams(location.search).has('dev')) {
  void import('./dev').then((m) => m.installDevConsole(app));
}

app.init().catch((e) => {
  console.error(e);
  const host = document.getElementById('ui');
  if (host) {
    host.innerHTML =
      '<div class="modal"><div class="card"><h2>启动失败</h2><p>请看控制台日志</p></div></div>';
  }
});
