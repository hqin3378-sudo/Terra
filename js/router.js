// 轻量 hash 路由：页面切换无刷新，3D 场景常驻底层
export class Router {
  constructor(onChange) {
    this._routes = ['home', 'observatory', 'atlas', 'codex', 'journal', 'settings'];
    this._onChange = onChange;
    addEventListener('hashchange', () => this._apply());
  }

  get current() {
    const m = location.hash.match(/^#\/(\w+)/);
    return m && this._routes.includes(m[1]) ? m[1] : 'home';
  }

  go(name) {
    if (this.current !== name) location.hash = `#/${name}`;
  }

  start() { this._apply(); }

  _apply() {
    const name = this.current;
    document.querySelectorAll('.page').forEach((el) => {
      el.classList.toggle('active', el.dataset.page === name);
    });
    document.querySelectorAll('#tabbar button').forEach((el) => {
      el.classList.toggle('active', el.dataset.route === name);
    });
    document.getElementById('tabbar').classList.toggle('hidden', name === 'home');
    this._onChange(name);
  }
}
