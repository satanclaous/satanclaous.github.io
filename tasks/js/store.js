/**
 * store.js
 * localStorage data management module for AI Task Manager
 * Key: "taskmanager_data"
 */

(function () {
  "use strict";

  const STORAGE_KEY = "taskmanager_data";

  function getDefaultData() {
    return {
      projects: [],
      tasks: [],
      settings: {
        geminiApiKey: "",
        language: "ko",
      },
    };
  }

  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function getYesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  const Store = {
    _data: null,

    // -------------------------------------------------------------------------
    // Core: init / save
    // -------------------------------------------------------------------------

    init() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Merge with defaults to handle schema additions gracefully
          this._data = Object.assign(getDefaultData(), parsed);
          this._data.settings = Object.assign(
            getDefaultData().settings,
            parsed.settings || {}
          );
        } else {
          this._data = getDefaultData();
          this.save();
        }
      } catch (e) {
        console.error("[Store] Failed to load data, resetting to defaults.", e);
        this._data = getDefaultData();
        this.save();
      }
      return this;
    },

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
      } catch (e) {
        console.error("[Store] Failed to save data.", e);
      }
      return this;
    },

    // -------------------------------------------------------------------------
    // Projects
    // -------------------------------------------------------------------------

    getProjects() {
      return this._data.projects.slice();
    },

    addProject(name, color) {
      const project = {
        id: crypto.randomUUID(),
        name: name || "Untitled Project",
        color: color || "#6366f1",
        createdAt: new Date().toISOString(),
        roadmap: {
          goal: "",
          milestones: [],
        },
      };
      this._data.projects.push(project);
      this.save();
      return project;
    },

    updateProject(id, data) {
      const idx = this._data.projects.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      // Merge top-level fields, but protect nested roadmap from accidental overwrite
      const existing = this._data.projects[idx];
      const { roadmap, ...rest } = data;
      this._data.projects[idx] = Object.assign({}, existing, rest);
      if (roadmap) {
        this._data.projects[idx].roadmap = Object.assign(
          {},
          existing.roadmap,
          roadmap
        );
      }
      this.save();
      return this._data.projects[idx];
    },

    deleteProject(id) {
      const before = this._data.projects.length;
      this._data.projects = this._data.projects.filter((p) => p.id !== id);
      // Cascade-delete tasks belonging to this project
      this._data.tasks = this._data.tasks.filter((t) => t.projectId !== id);
      const deleted = this._data.projects.length < before;
      if (deleted) this.save();
      return deleted;
    },

    // -------------------------------------------------------------------------
    // Roadmap / Milestones
    // -------------------------------------------------------------------------

    setRoadmap(projectId, roadmap) {
      const project = this._data.projects.find((p) => p.id === projectId);
      if (!project) return null;
      project.roadmap = {
        goal: roadmap.goal || "",
        milestones: Array.isArray(roadmap.milestones)
          ? roadmap.milestones
          : project.roadmap.milestones,
      };
      this.save();
      return project.roadmap;
    },

    addMilestone(projectId, milestone) {
      const project = this._data.projects.find((p) => p.id === projectId);
      if (!project) return null;
      if (!project.roadmap) {
        project.roadmap = { goal: "", milestones: [] };
      }
      const newMilestone = Object.assign(
        {
          id: crypto.randomUUID(),
          title: "Untitled Milestone",
          description: "",
          targetDate: "",
          keyResults: [],
          status: "upcoming",
        },
        milestone,
        // Ensure id is always fresh unless explicitly provided
        { id: milestone.id || crypto.randomUUID() }
      );
      project.roadmap.milestones.push(newMilestone);
      this.save();
      return newMilestone;
    },

    updateMilestone(projectId, milestoneId, data) {
      const project = this._data.projects.find((p) => p.id === projectId);
      if (!project || !project.roadmap) return null;
      const idx = project.roadmap.milestones.findIndex(
        (m) => m.id === milestoneId
      );
      if (idx === -1) return null;
      project.roadmap.milestones[idx] = Object.assign(
        {},
        project.roadmap.milestones[idx],
        data,
        { id: milestoneId } // id is immutable
      );
      this.save();
      return project.roadmap.milestones[idx];
    },

    // -------------------------------------------------------------------------
    // Tasks
    // -------------------------------------------------------------------------

    /**
     * getTasks(filters)
     * filters: { projectId, milestoneId, status, priority, date, aiExecutable }
     * All filters are optional and ANDed together.
     */
    getTasks(filters) {
      let tasks = this._data.tasks.slice();
      if (!filters) return tasks;

      if (filters.projectId !== undefined) {
        tasks = tasks.filter((t) => t.projectId === filters.projectId);
      }
      if (filters.milestoneId !== undefined) {
        tasks = tasks.filter((t) => t.milestoneId === filters.milestoneId);
      }
      if (filters.status !== undefined) {
        tasks = tasks.filter((t) => t.status === filters.status);
      }
      if (filters.priority !== undefined) {
        tasks = tasks.filter((t) => t.priority === filters.priority);
      }
      if (filters.date !== undefined) {
        tasks = tasks.filter((t) => t.date === filters.date);
      }
      if (filters.aiExecutable !== undefined) {
        tasks = tasks.filter((t) => t.aiExecutable === filters.aiExecutable);
      }

      return tasks;
    },

    addTask(task) {
      const newTask = Object.assign(
        {
          id: crypto.randomUUID(),
          title: "Untitled Task",
          description: "",
          projectId: null,
          milestoneId: null,
          priority: "medium",
          status: "todo",
          date: getTodayStr(),
          aiExecutable: false,
          aiResult: "",
          subtasks: [],
          createdAt: new Date().toISOString(),
          completedAt: null,
        },
        task,
        { id: task.id || crypto.randomUUID() }
      );
      this._data.tasks.push(newTask);
      this.save();
      return newTask;
    },

    updateTask(id, data) {
      const idx = this._data.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      this._data.tasks[idx] = Object.assign({}, this._data.tasks[idx], data, {
        id, // id is immutable
      });
      this.save();
      return this._data.tasks[idx];
    },

    deleteTask(id) {
      const before = this._data.tasks.length;
      this._data.tasks = this._data.tasks.filter((t) => t.id !== id);
      const deleted = this._data.tasks.length < before;
      if (deleted) this.save();
      return deleted;
    },

    /**
     * toggleTask(id)
     * Cycles: todo -> done -> todo
     * Sets/clears completedAt accordingly.
     */
    toggleTask(id) {
      const task = this._data.tasks.find((t) => t.id === id);
      if (!task) return null;
      if (task.status === "done") {
        task.status = "todo";
        task.completedAt = null;
      } else {
        task.status = "done";
        task.completedAt = new Date().toISOString();
      }
      this.save();
      return task;
    },

    // -------------------------------------------------------------------------
    // Convenience task queries
    // -------------------------------------------------------------------------

    getTasksByDate(date) {
      return this._data.tasks.filter((t) => t.date === date);
    },

    getTasksByProject(projectId) {
      return this._data.tasks.filter((t) => t.projectId === projectId);
    },

    /**
     * carryOverTasks()
     * Finds incomplete (todo/carried) tasks from yesterday and copies them to
     * today, marking the originals as "carried" so they no longer appear as
     * active yesterday items.
     * Returns the array of newly created tasks.
     */
    carryOverTasks() {
      const yesterday = getYesterdayStr();
      const today = getTodayStr();
      const carried = [];

      this._data.tasks.forEach((task) => {
        if (
          task.date === yesterday &&
          (task.status === "todo" || task.status === "carried")
        ) {
          // Mark original as carried
          task.status = "carried";

          // Create a new task for today
          const newTask = Object.assign({}, task, {
            id: crypto.randomUUID(),
            date: today,
            status: "todo",
            createdAt: new Date().toISOString(),
            completedAt: null,
          });
          carried.push(newTask);
        }
      });

      this._data.tasks.push(...carried);
      if (carried.length > 0) this.save();
      return carried;
    },

    // -------------------------------------------------------------------------
    // Settings
    // -------------------------------------------------------------------------

    getSettings() {
      return Object.assign({}, this._data.settings);
    },

    updateSettings(data) {
      this._data.settings = Object.assign({}, this._data.settings, data);
      this.save();
      return this._data.settings;
    },

    // -------------------------------------------------------------------------
    // Export / Import
    // -------------------------------------------------------------------------

    exportData() {
      return JSON.stringify(this._data, null, 2);
    },

    importData(json) {
      try {
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        if (
          !parsed ||
          typeof parsed !== "object" ||
          !Array.isArray(parsed.projects) ||
          !Array.isArray(parsed.tasks)
        ) {
          throw new Error("Invalid data structure.");
        }
        this._data = Object.assign(getDefaultData(), parsed);
        this._data.settings = Object.assign(
          getDefaultData().settings,
          parsed.settings || {}
        );
        this.save();
        return true;
      } catch (e) {
        console.error("[Store] importData failed:", e);
        return false;
      }
    },
  };

  // Expose globally
  window.Store = Store;
})();
