// UI - Rendering module
window.UI = {
  $app: null,
  _chatMessages: [],
  _chatProjectName: '',
  _chatProjectId: null,
  _dumpResults: null,

  getApp() {
    if (!this.$app) this.$app = document.getElementById('app');
    return this.$app;
  },

  // ============================
  // Brain Dump View
  // ============================
  renderDumpView() {
    const app = this.getApp();
    app.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">Brain Dump</h1>
        <p class="view-subtitle">할 일을 자유롭게 입력하세요</p>
      </div>
      <textarea class="dump-textarea" id="dumpInput" placeholder="내일 캐스팅앱 버그 고치고, 은행 서류 제출하고, 유튜브 스크립트 쓰고, 투자자한테 이메일 보내야 됨..."></textarea>
      <button class="btn btn-primary" id="dumpSubmit">정리하기</button>
      <div id="dumpResults"></div>
    `;
    document.getElementById('dumpSubmit').addEventListener('click', () => this._handleDump());
  },

  async _handleDump() {
    const input = document.getElementById('dumpInput').value.trim();
    if (!input) return App.showToast('내용을 입력해주세요', 'error');

    const settings = Store.getSettings();
    if (!settings.geminiApiKey) return App.showToast('설정에서 API 키를 먼저 입력해주세요', 'error');

    const btn = document.getElementById('dumpSubmit');
    const results = document.getElementById('dumpResults');
    btn.disabled = true;
    btn.textContent = '';
    results.innerHTML = '<div class="loading-inline"><div class="spinner"></div>AI가 정리 중...</div>';

    try {
      const data = await AI.processBrainDump(input);
      this._dumpResults = data;
      this._renderDumpResults(data);
    } catch (e) {
      App.showToast(e.message || 'AI 처리 중 오류 발생', 'error');
      results.innerHTML = '';
    } finally {
      btn.disabled = false;
      btn.textContent = '정리하기';
    }
  },

  _renderDumpResults(data) {
    const results = document.getElementById('dumpResults');
    const projects = Store.getProjects();

    let html = '<div class="dump-results">';

    // New project suggestions
    if (data.newProjectSuggestions && data.newProjectSuggestions.length > 0) {
      html += '<div class="dump-new-projects"><h4>새 프로젝트 제안</h4>';
      data.newProjectSuggestions.forEach((s, i) => {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span>${s.name} - ${s.reason}</span>
          <button class="btn btn-sm btn-secondary" data-action="add-project" data-index="${i}">추가</button>
        </div>`;
      });
      html += '</div>';
    }

    // Task cards
    data.tasks.forEach((task, i) => {
      const project = projects.find(p => p.id === task.projectId);
      const projectName = project ? project.name : '미분류';
      const projectColor = project ? project.color : '#999';
      const priorityClass = `priority-${task.priority || 'medium'}`;

      html += `<div class="dump-result-card" data-index="${i}">
        <div class="dump-result-title">${this._esc(task.title)}</div>
        <div class="dump-result-meta">
          <span class="priority-dot ${priorityClass}"></span>
          <span class="badge badge-project" style="background:${projectColor}20;color:${projectColor}">${this._esc(projectName)}</span>
          ${task.aiExecutable ? '<span class="badge badge-ai">AI 실행 가능</span>' : ''}
        </div>
        <div class="dump-result-actions">
          <button class="btn btn-sm btn-ghost" data-action="remove-task" data-index="${i}">삭제</button>
        </div>
      </div>`;
    });

    html += `<button class="btn btn-primary" id="confirmTasks" style="margin-top:16px;">확인하고 추가 (${data.tasks.length}개)</button>`;
    html += '</div>';
    results.innerHTML = html;

    // Event delegation
    results.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'remove-task') {
        const idx = parseInt(btn.dataset.index);
        this._dumpResults.tasks.splice(idx, 1);
        this._renderDumpResults(this._dumpResults);
      } else if (action === 'add-project') {
        const idx = parseInt(btn.dataset.index);
        const s = this._dumpResults.newProjectSuggestions[idx];
        const colors = ['#6C5CE7', '#00B894', '#E17055', '#0984E3', '#FDCB6E', '#E84393'];
        Store.addProject(s.name, colors[Math.floor(Math.random() * colors.length)]);
        this._dumpResults.newProjectSuggestions.splice(idx, 1);
        App.showToast(`"${s.name}" 프로젝트 추가됨`);
        this._renderDumpResults(this._dumpResults);
      }
    });

    document.getElementById('confirmTasks')?.addEventListener('click', () => {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      this._dumpResults.tasks.forEach(t => {
        Store.addTask({
          title: t.title,
          description: t.description || '',
          projectId: t.projectId || null,
          milestoneId: t.milestoneId || null,
          priority: t.priority || 'medium',
          date: dateStr,
          aiExecutable: !!t.aiExecutable,
          aiActionType: t.aiActionType || null
        });
      });

      App.showToast(`${this._dumpResults.tasks.length}개 태스크가 추가되었습니다`);
      this._dumpResults = null;
      App.navigate('today');
    });
  },

  // ============================
  // Today View
  // ============================
  renderTodayView() {
    const app = this.getApp();
    const date = App.currentDate;
    const tasks = Store.getTasksByDate(date);
    const projects = Store.getProjects();

    const done = tasks.filter(t => t.status === 'done').length;
    const total = tasks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    let html = `
      <div class="date-nav">
        <button class="date-nav-btn" onclick="App.prevDay()">◀</button>
        <span class="date-nav-text">${App.formatDate(date)}</span>
        <button class="date-nav-btn" onclick="App.nextDay()">▶</button>
      </div>
      <div class="progress-container">
        <div class="progress-label">
          <span>진행률</span>
          <span>${done}/${total} 완료 (${pct}%)</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    `;

    if (tasks.length === 0) {
      html += `<div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <p class="empty-state-text">할 일이 없습니다.<br>Brain Dump에서 추가해보세요!</p>
      </div>`;
    } else {
      // Group by project
      const groups = {};
      tasks.forEach(t => {
        const pid = t.projectId || '_none';
        if (!groups[pid]) groups[pid] = [];
        groups[pid].push(t);
      });

      // Render active tasks first, then completed
      const activeTasksHtml = [];
      const doneTasksHtml = [];

      Object.entries(groups).forEach(([pid, groupTasks]) => {
        const project = projects.find(p => p.id === pid);
        const name = project ? project.name : '기타';
        const color = project ? project.color : '#999';

        const active = groupTasks.filter(t => t.status !== 'done');
        const completed = groupTasks.filter(t => t.status === 'done');

        if (active.length > 0) {
          let groupHtml = `<div class="project-group">
            <div class="project-group-header">
              <span class="project-color-dot" style="background:${color}"></span>
              <span class="project-group-name">${this._esc(name)}</span>
            </div>`;
          active.forEach(t => { groupHtml += this._renderTaskCard(t); });
          groupHtml += '</div>';
          activeTasksHtml.push(groupHtml);
        }

        completed.forEach(t => { doneTasksHtml.push(this._renderTaskCard(t)); });
      });

      html += activeTasksHtml.join('');

      if (doneTasksHtml.length > 0) {
        html += `<div class="section-title">완료됨</div>`;
        html += doneTasksHtml.join('');
      }
    }

    app.innerHTML = html;

    // Event delegation
    app.addEventListener('click', (e) => {
      const checkbox = e.target.closest('.task-checkbox');
      if (checkbox) {
        const id = checkbox.dataset.id;
        Store.toggleTask(id);
        this.renderTodayView();
        return;
      }

      const aiBtn = e.target.closest('.badge-ai');
      if (aiBtn) {
        const id = aiBtn.dataset.id;
        this._handleAiExecute(id);
        return;
      }

      const copyBtn = e.target.closest('[data-action="copy"]');
      if (copyBtn) {
        const id = copyBtn.dataset.id;
        const task = Store.getTasks().find(t => t.id === id);
        if (task && task.aiResult) {
          navigator.clipboard.writeText(task.aiResult).then(() => App.showToast('복사됨!'));
        }
      }
    });
  },

  _renderTaskCard(task) {
    const checked = task.status === 'done' ? 'checked' : '';
    const completed = task.status === 'done' ? 'completed' : '';
    const priorityClass = `priority-${task.priority || 'medium'}`;

    let html = `<div class="task-card ${completed}">
      <div class="task-checkbox ${checked}" data-id="${task.id}"></div>
      <div class="task-content">
        <div class="task-title">${this._esc(task.title)}</div>
        <div class="task-meta">
          <span class="priority-dot ${priorityClass}"></span>
        </div>`;

    if (task.aiResult) {
      html += `<div class="ai-result">
        <div class="ai-result-header">
          <span class="ai-result-type">AI 결과</span>
          <button class="btn btn-sm btn-ghost" data-action="copy" data-id="${task.id}">복사</button>
        </div>
        <div>${this._esc(task.aiResult)}</div>
      </div>`;
    }

    html += `</div>
      <div class="task-actions">`;

    if (task.aiExecutable && !task.aiResult && task.status !== 'done') {
      html += `<span class="badge badge-ai" data-id="${task.id}">AI 실행</span>`;
    }

    html += `</div></div>`;
    return html;
  },

  async _handleAiExecute(taskId) {
    const task = Store.getTasks().find(t => t.id === taskId);
    if (!task) return;

    const settings = Store.getSettings();
    if (!settings.geminiApiKey) return App.showToast('API 키를 먼저 설정해주세요', 'error');

    App.showToast('AI 실행 중...');
    try {
      const result = await AI.executeTask(task);
      Store.updateTask(taskId, { aiResult: result.result });
      this.renderTodayView();
      App.showToast('AI 실행 완료!');
    } catch (e) {
      App.showToast(e.message || 'AI 실행 오류', 'error');
    }
  },

  // ============================
  // Projects View
  // ============================
  renderProjectsView() {
    const app = this.getApp();
    const projects = Store.getProjects();

    let html = `
      <div class="view-header">
        <h1 class="view-title">프로젝트</h1>
        <p class="view-subtitle">로드맵과 프로젝트를 관리하세요</p>
      </div>
      <button class="btn btn-primary" style="margin-bottom:20px;" id="addProjectBtn">+ 새 프로젝트</button>
    `;

    if (projects.length === 0) {
      html += `<div class="empty-state">
        <div class="empty-state-icon">🗂️</div>
        <p class="empty-state-text">프로젝트가 없습니다.<br>새 프로젝트를 만들어보세요!</p>
      </div>`;
    } else {
      projects.forEach(p => {
        const milestones = p.roadmap?.milestones || [];
        const doneMilestones = milestones.filter(m => m.status === 'done').length;
        const pct = milestones.length ? Math.round((doneMilestones / milestones.length) * 100) : 0;

        html += `<div class="project-card" data-project-id="${p.id}" style="border-top-color:${p.color}">
          <div class="project-card-name">${this._esc(p.name)}</div>
          <div class="project-card-goal">${this._esc(p.roadmap?.goal || '로드맵을 설정해주세요')}</div>
          <div class="project-card-stats">
            <span>마일스톤 ${milestones.length}개</span>
            <span>진행률 ${pct}%</span>
          </div>
          <div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>`;
      });
    }

    app.innerHTML = html;

    document.getElementById('addProjectBtn').addEventListener('click', () => this._showAddProjectModal());

    app.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', () => {
        this._renderProjectDetail(card.dataset.projectId);
      });
    });
  },

  _showAddProjectModal() {
    const colors = ['#6C5CE7', '#00B894', '#E17055', '#0984E3', '#FDCB6E', '#E84393'];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">
      <h3 class="modal-title">새 프로젝트</h3>
      <div class="form-group">
        <label class="form-label">프로젝트 이름</label>
        <input class="form-input" id="newProjectName" placeholder="예: 캐스팅 앱">
      </div>
      <div class="form-group">
        <label class="form-label">색상</label>
        <div style="display:flex;gap:8px;">
          ${colors.map((c, i) => `<div style="width:32px;height:32px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${i === 0 ? '#333' : 'transparent'}" data-color="${c}" class="color-option"></div>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="cancelProject">취소</button>
        <button class="btn btn-primary" style="width:auto;" id="saveProject">만들기</button>
      </div>
    </div>`;

    document.body.appendChild(overlay);

    let selectedColor = colors[0];
    overlay.querySelectorAll('.color-option').forEach(el => {
      el.addEventListener('click', () => {
        overlay.querySelectorAll('.color-option').forEach(o => o.style.borderColor = 'transparent');
        el.style.borderColor = '#333';
        selectedColor = el.dataset.color;
      });
    });

    overlay.querySelector('#cancelProject').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#saveProject').addEventListener('click', () => {
      const name = document.getElementById('newProjectName').value.trim();
      if (!name) return App.showToast('이름을 입력해주세요', 'error');
      Store.addProject(name, selectedColor);
      overlay.remove();
      App.showToast(`"${name}" 프로젝트 생성됨`);
      this.renderProjectsView();
    });
  },

  _renderProjectDetail(projectId) {
    const app = this.getApp();
    const project = Store.getProjects().find(p => p.id === projectId);
    if (!project) return;

    const milestones = project.roadmap?.milestones || [];
    const tasks = Store.getTasksByProject(projectId);

    let html = `
      <button class="back-btn" onclick="UI.renderProjectsView()">← 프로젝트 목록</button>
      <div class="view-header">
        <h1 class="view-title" style="color:${project.color}">${this._esc(project.name)}</h1>
        <p class="view-subtitle">${this._esc(project.roadmap?.goal || '')}</p>
      </div>
    `;

    // Roadmap
    if (milestones.length > 0) {
      html += '<div class="section-title">로드맵</div><div class="timeline">';
      milestones.forEach(m => {
        const statusClass = m.status === 'done' ? 'done' : m.status === 'active' ? 'active' : '';
        html += `<div class="timeline-item ${statusClass}">
          <div class="timeline-title">${this._esc(m.title)}</div>
          <div class="timeline-date">${m.targetDate || ''}</div>
          ${m.description ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">${this._esc(m.description)}</div>` : ''}
          <ul class="timeline-results">
            ${(m.keyResults || []).map(r => `<li>${this._esc(r)}</li>`).join('')}
          </ul>
        </div>`;
      });
      html += '</div>';
    }

    html += `<button class="btn btn-secondary" style="width:100%;margin:16px 0;" id="buildRoadmapBtn">
      ${milestones.length > 0 ? '로드맵 다시 만들기' : '로드맵 만들기 (AI 대화)'}
    </button>`;

    // Recent tasks
    if (tasks.length > 0) {
      html += '<div class="section-title">관련 태스크</div>';
      const recent = tasks.slice(-10).reverse();
      recent.forEach(t => { html += this._renderTaskCard(t); });
    }

    // Delete project
    html += `<button class="btn btn-danger btn-sm" style="margin-top:24px;" id="deleteProjectBtn">프로젝트 삭제</button>`;

    app.innerHTML = html;

    document.getElementById('buildRoadmapBtn').addEventListener('click', () => {
      this._startRoadmapChat(projectId, project.name);
    });

    document.getElementById('deleteProjectBtn').addEventListener('click', () => {
      if (confirm(`"${project.name}" 프로젝트를 삭제할까요?`)) {
        Store.deleteProject(projectId);
        App.showToast('프로젝트 삭제됨');
        this.renderProjectsView();
      }
    });
  },

  // ============================
  // Roadmap Chat
  // ============================
  _startRoadmapChat(projectId, projectName) {
    this._chatMessages = [];
    this._chatProjectName = projectName;
    this._chatProjectId = projectId;
    this._renderRoadmapChat();
    // Send initial AI message
    this._sendRoadmapChat(null, true);
  },

  _renderRoadmapChat() {
    const app = this.getApp();
    let html = `
      <button class="back-btn" onclick="UI._renderProjectDetail('${this._chatProjectId}')">← ${this._esc(this._chatProjectName)}</button>
      <div class="view-header">
        <h1 class="view-title">로드맵 만들기</h1>
        <p class="view-subtitle">AI와 대화하며 로드맵을 설계하세요</p>
      </div>
      <div class="chat-container" id="chatContainer">
    `;

    this._chatMessages.forEach(m => {
      html += `<div class="chat-bubble ${m.role === 'model' ? 'ai' : 'user'}">${this._esc(m.text)}</div>`;
    });

    html += `</div>
      <div id="chatLoading" style="display:none;" class="loading-inline"><div class="spinner"></div>AI 생각 중...</div>
      <div id="roadmapSaveArea"></div>
      <div class="chat-input-bar">
        <input class="chat-input" id="chatInput" placeholder="프로젝트에 대해 설명해주세요..." />
        <button class="chat-send-btn" id="chatSendBtn">→</button>
      </div>
    `;

    app.innerHTML = html;

    const sendMsg = () => {
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      this._sendRoadmapChat(text, false);
    };

    document.getElementById('chatSendBtn').addEventListener('click', sendMsg);
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMsg();
    });
  },

  async _sendRoadmapChat(userText, isInit) {
    const settings = Store.getSettings();
    if (!settings.geminiApiKey) return App.showToast('API 키를 먼저 설정해주세요', 'error');

    if (userText) {
      this._chatMessages.push({ role: 'user', text: userText });
      const container = document.getElementById('chatContainer');
      container.innerHTML += `<div class="chat-bubble user">${this._esc(userText)}</div>`;
    }

    const loading = document.getElementById('chatLoading');
    if (loading) loading.style.display = 'flex';

    try {
      const result = await AI.chatForRoadmap(this._chatProjectName, this._chatMessages, isInit);
      this._chatMessages.push({ role: 'model', text: result.reply });

      const container = document.getElementById('chatContainer');
      container.innerHTML += `<div class="chat-bubble ai">${this._esc(result.reply)}</div>`;
      container.scrollTop = container.scrollHeight;

      if (result.roadmap) {
        const saveArea = document.getElementById('roadmapSaveArea');
        saveArea.innerHTML = `<button class="btn btn-primary" id="saveRoadmapBtn" style="margin:12px 0;">로드맵 저장하기</button>`;
        document.getElementById('saveRoadmapBtn').addEventListener('click', () => {
          Store.setRoadmap(this._chatProjectId, result.roadmap);
          App.showToast('로드맵이 저장되었습니다!');
          this._renderProjectDetail(this._chatProjectId);
        });
      }
    } catch (e) {
      App.showToast(e.message || '오류 발생', 'error');
    } finally {
      if (loading) loading.style.display = 'none';
    }
  },

  // ============================
  // Settings View
  // ============================
  renderSettingsView() {
    const app = this.getApp();
    const settings = Store.getSettings();

    app.innerHTML = `
      <div class="view-header">
        <h1 class="view-title">설정</h1>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">API 설정</div>
        <div class="form-group">
          <label class="form-label">Gemini API 키</label>
          <div class="input-with-toggle">
            <input class="form-input" id="apiKeyInput" type="password" value="${this._esc(settings.geminiApiKey || '')}" placeholder="API 키를 입력하세요">
            <button class="input-toggle" id="toggleApiKey">보기</button>
          </div>
        </div>
        <button class="btn btn-secondary" id="saveApiKey">저장</button>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">데이터</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="exportBtn" style="flex:1;">내보내기</button>
          <button class="btn btn-secondary" id="importBtn" style="flex:1;">가져오기</button>
        </div>
        <input type="file" id="importFile" accept=".json" style="display:none;">
      </div>

      <div class="danger-zone">
        <div class="settings-section-title">위험 구역</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">모든 데이터가 영구적으로 삭제됩니다.</p>
        <button class="btn btn-danger btn-sm" id="deleteAllBtn">모든 데이터 삭제</button>
      </div>
    `;

    // Toggle API key visibility
    document.getElementById('toggleApiKey').addEventListener('click', () => {
      const input = document.getElementById('apiKeyInput');
      const btn = document.getElementById('toggleApiKey');
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '숨기기';
      } else {
        input.type = 'password';
        btn.textContent = '보기';
      }
    });

    // Save API key
    document.getElementById('saveApiKey').addEventListener('click', () => {
      const key = document.getElementById('apiKeyInput').value.trim();
      Store.updateSettings({ geminiApiKey: key });
      App.showToast('API 키가 저장되었습니다');
    });

    // Export
    document.getElementById('exportBtn').addEventListener('click', () => {
      const data = Store.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `taskmanager_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      App.showToast('데이터 내보내기 완료');
    });

    // Import
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          Store.importData(ev.target.result);
          App.showToast('데이터 가져오기 완료');
          this.renderSettingsView();
        } catch (err) {
          App.showToast('유효하지 않은 파일입니다', 'error');
        }
      };
      reader.readAsText(file);
    });

    // Delete all
    document.getElementById('deleteAllBtn').addEventListener('click', () => {
      if (confirm('정말 모든 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) {
        localStorage.removeItem('taskmanager_data');
        Store.init();
        App.showToast('모든 데이터가 삭제되었습니다');
        this.renderSettingsView();
      }
    });
  },

  // ============================
  // Helpers
  // ============================
  _esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
