// App - Main logic & routing
window.App = {
  currentView: 'dump',
  currentDate: new Date().toISOString().split('T')[0],

  init() {
    Store.init();
    Store.carryOverTasks();
    this.bindRouting();
    this.navigate(location.hash.slice(1) || 'dump');
  },

  bindRouting() {
    window.addEventListener('hashchange', () => {
      this.navigate(location.hash.slice(1) || 'dump');
    });
  },

  navigate(view) {
    const valid = ['dump', 'today', 'projects', 'settings'];
    if (!valid.includes(view)) view = 'dump';
    this.currentView = view;
    location.hash = view;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.view === view);
    });

    // Render view
    switch (view) {
      case 'dump': UI.renderDumpView(); break;
      case 'today': UI.renderTodayView(); break;
      case 'projects': UI.renderProjectsView(); break;
      case 'settings': UI.renderSettingsView(); break;
    }
  },

  // Date helpers
  setDate(dateStr) {
    this.currentDate = dateStr;
    if (this.currentView === 'today') UI.renderTodayView();
  },

  prevDay() {
    const d = new Date(this.currentDate);
    d.setDate(d.getDate() - 1);
    this.setDate(d.toISOString().split('T')[0]);
  },

  nextDay() {
    const d = new Date(this.currentDate);
    d.setDate(d.getDate() + 1);
    this.setDate(d.toISOString().split('T')[0]);
  },

  formatDate(dateStr) {
    const d = new Date(dateStr);
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[d.getDay()];
    let label = `${month}월 ${day}일 (${weekday})`;

    if (dateStr === today) label += ' · 오늘';
    else if (dateStr === yesterday) label += ' · 어제';
    else if (dateStr === tomorrow) label += ' · 내일';

    return label;
  },

  showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
