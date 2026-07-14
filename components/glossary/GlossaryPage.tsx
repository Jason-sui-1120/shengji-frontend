import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { GlossaryEntry, Project } from "../../types";

type GlossaryDraft = Partial<GlossaryEntry> & { aliasesText?: string };

export function GlossaryPage({
  entries,
  projects,
  onSave,
  onDelete,
}: {
  entries: GlossaryEntry[];
  projects: Project[];
  onSave: (entry: Partial<GlossaryEntry>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [scopeFilter, setScopeFilter] = React.useState<"all" | "global" | "project">("all");
  const [projectFilter, setProjectFilter] = React.useState<string>("all");
  const [enabledFilter, setEnabledFilter] = React.useState<"all" | "enabled" | "disabled">("all");
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<GlossaryDraft>(() => emptyDraft(projects[0]?.id));
  const [status, setStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [isNew, setIsNew] = React.useState(false);

  const projectNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    projects.forEach((project) => {
      if (project.id) map.set(project.id, project.name);
    });
    return map;
  }, [projects]);

  const visibleEntries = entries.filter((entry) => {
    if (scopeFilter !== "all" && entry.scope !== scopeFilter) return false;
    if (enabledFilter === "enabled" && entry.enabled === false) return false;
    if (enabledFilter === "disabled" && entry.enabled !== false) return false;
    if (projectFilter !== "all") {
      if (entry.scope !== "project") return false;
      return String(entry.projectId || "") === projectFilter;
    }
    return true;
  });

  // 默认选中第一条
  const initializedRef = React.useRef(false);
  React.useEffect(() => {
    if (!initializedRef.current && visibleEntries.length > 0 && !selectedId && !isNew) {
      initializedRef.current = true;
      const first = visibleEntries[0];
      setSelectedId(first.id);
      setDraft({ ...first, aliasesText: (first.aliases || []).join("，") });
    }
  }, [visibleEntries, selectedId, isNew]);

  // 清除不存在的选中
  React.useEffect(() => {
    if (selectedId && !entries.some((e) => e.id === selectedId)) {
      setSelectedId(null);
      initializedRef.current = false;
    }
  }, [entries, selectedId]);

  function selectEntry(entry: GlossaryEntry) {
    setSelectedId(entry.id);
    setDraft({ ...entry, aliasesText: (entry.aliases || []).join("，") });
    setStatus("idle");
    setIsNew(false);
  }

  function startNew() {
    setSelectedId(null);
    setDraft(emptyDraft(projects[0]?.id));
    setStatus("idle");
    setIsNew(true);
  }

  function cancelNew() {
    setIsNew(false);
    setDraft(emptyDraft(projects[0]?.id));
    // 重新选中第一条
    if (visibleEntries.length > 0) {
      const first = visibleEntries[0];
      setSelectedId(first.id);
      setDraft({ ...first, aliasesText: (first.aliases || []).join("，") });
    }
  }

  // 构建保存用的 patch
  function buildPatch(): Partial<GlossaryEntry> | null {
    const term = String(draft.term || "").trim();
    if (!term) return null;
    const scope = draft.scope === "global" ? "global" : "project";
    return {
      id: draft.id,
      scope,
      projectId: scope === "project" ? Number(draft.projectId || projects[0]?.id || 0) || null : null,
      term,
      aliases: splitAliases(draft.aliasesText ?? (draft.aliases || []).join("，")),
      category: draft.category || "业务词",
      weight: Number(draft.weight || 80),
      enabled: draft.enabled !== false,
    };
  }

  // 编辑模式：blur 自动保存
  async function autoSave() {
    if (isNew || !draft.id) return; // 新增模式不自动保存
    const patch = buildPatch();
    if (!patch) return;
    // 检查是否有变化
    const original = entries.find((e) => e.id === draft.id);
    if (original && !hasChanges(original, draft)) return;
    setStatus("saving");
    try {
      await onSave(patch);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  // 新增模式：点按钮创建
  async function createNew() {
    const patch = buildPatch();
    if (!patch || status === "saving") return;
    setStatus("saving");
    try {
      await onSave({ ...patch, id: undefined }); // 不传 id，POST 创建
      setIsNew(false);
      setDraft(emptyDraft(projects[0]?.id));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  // select/checkbox 变化时直接保存（编辑模式）
  async function saveOnSelectChange() {
    if (isNew || !draft.id) return;
    // 用 setTimeout 确保 draft 已更新
    setTimeout(() => void autoSave(), 0);
  }

  const effectiveSelectedId = selectedId;

  return (
    <section className="history-page">
      <div className="history-page-head">
        <div>
          <h1 className="timeline-page-title">热词库</h1>
          <div className="timeline-page-sub">{entries.length} 条热词 · 提升最终转写里的业务词准确率</div>
        </div>
        <div className="history-page-actions">
          <button className="primary-button" onClick={startNew}><Plus size={15} />新增热词</button>
        </div>
      </div>

      {/* 范围筛选 chip */}
      <div className="timeline-filter">
        <button className={`timeline-chip ${scopeFilter === "all" ? "active" : ""}`} onClick={() => setScopeFilter("all")}>全部 {entries.length}</button>
        <button className={`timeline-chip ${scopeFilter === "global" ? "active" : ""}`} onClick={() => setScopeFilter("global")}>全局 {entries.filter((e) => e.scope === "global").length}</button>
        <button className={`timeline-chip ${scopeFilter === "project" ? "active" : ""}`} onClick={() => setScopeFilter("project")}>项目 {entries.filter((e) => e.scope === "project").length}</button>
      </div>

      {/* 状态筛选 chip */}
      <div className="timeline-filter">
        <button className={`timeline-chip ${enabledFilter === "all" ? "active" : ""}`} onClick={() => setEnabledFilter("all")}>全部状态</button>
        <button className={`timeline-chip ${enabledFilter === "enabled" ? "active" : ""}`} onClick={() => setEnabledFilter("enabled")}>已启用 {entries.filter((e) => e.enabled !== false).length}</button>
        <button className={`timeline-chip ${enabledFilter === "disabled" ? "active" : ""}`} onClick={() => setEnabledFilter("disabled")}>已停用 {entries.filter((e) => e.enabled === false).length}</button>
      </div>

      {scopeFilter === "project" && (
        <div className="timeline-filter">
          <button className={`timeline-chip ${projectFilter === "all" ? "active" : ""}`} onClick={() => setProjectFilter("all")}>全部项目</button>
          {projects.map((p) => (
            <button
              key={p.id}
              className={`timeline-chip ${projectFilter === String(p.id) ? "active" : ""}`}
              onClick={() => setProjectFilter(String(p.id))}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="project-todo-layout">
        {/* 左侧列表 */}
        <div className="project-todo-list-panel">
          <div className="project-todo-rows">
            {visibleEntries.length ? visibleEntries.map((entry) => {
              const scopeLabel = entry.scope === "global" ? "全局" : projectNameById.get(entry.projectId || 0) || "项目";
              return (
                <button
                  key={entry.id}
                  className={`project-todo-row ${!isNew && effectiveSelectedId === entry.id ? "selected" : ""}`}
                  onClick={() => selectEntry(entry)}
                >
                  <i className="dash-todo-dot normal" />
                  <div className="project-todo-text">
                    <strong>{entry.term}</strong>
                    {entry.aliases.length > 0 && <span className="glossary-row-aliases">{entry.aliases.join("、")}</span>}
                  </div>
                  <span className="project-action-sub">{scopeLabel}</span>
                </button>
              );
            }) : <p className="project-empty">暂无符合筛选条件的热词</p>}
          </div>
        </div>

        {/* 右侧编辑面板 */}
        <div className="project-todo-detail glossary-detail-panel">
          <div className="glossary-detail-head">
            <div>
              <span className="glossary-detail-label">{isNew ? "新增热词" : draft.id ? "编辑热词" : "热词详情"}</span>
              <strong>{draft.term || "新热词"}</strong>
            </div>
            <div className="action-detail-head-actions">
              {status === "saving" && <span className="glossary-saving-hint">保存中...</span>}
              {draft.id && !isNew && (
                <button className="icon-button" title="删除热词" onClick={() => { if (confirm("确定删除此热词？")) { void onDelete(draft.id!); cancelNew(); } }}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="glossary-detail-meta">
            <span>权重 {draft.weight ?? 80}</span>
            <span>{draft.enabled !== false ? "已启用" : "已停用"}</span>
            <span>{draft.category || "业务词"}</span>
          </div>

          <div className="glossary-detail-section">
            <div className="glossary-detail-section-title"><h3>热词信息</h3><span>{isNew ? "填完点下方新增" : "编辑后自动保存"}</span></div>

            <label className="glossary-field">
              标准词
              <input
                value={draft.term || ""}
                onChange={(event) => { const v = event.currentTarget.value; setDraft((current) => ({ ...current, term: v })); }}
                onBlur={() => void autoSave()}
                placeholder="例如：育儿假"
              />
            </label>

            <div className="detail-field-grid">
              <label className="glossary-field">
                类型
                <input
                  value={draft.category || ""}
                  onChange={(event) => { const v = event.currentTarget.value; setDraft((current) => ({ ...current, category: v })); }}
                  onBlur={() => void autoSave()}
                  placeholder="业务词 / 人名 / 系统名"
                />
              </label>
              <label className="glossary-field">
                权重
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.weight ?? 80}
                  onChange={(event) => { const v = Number(event.currentTarget.value || 80); setDraft((current) => ({ ...current, weight: v })); }}
                  onBlur={() => void autoSave()}
                />
              </label>
            </div>

            <label className="glossary-field">
              易错词 / 别名
              <input
                value={draft.aliasesText ?? (draft.aliases || []).join("，")}
                onChange={(event) => { const v = event.currentTarget.value; setDraft((current) => ({ ...current, aliasesText: v })); }}
                onBlur={() => void autoSave()}
                placeholder="多个词用逗号隔开，例如：约假，育假"
              />
            </label>
          </div>

          <div className="glossary-detail-section">
            <div className="glossary-detail-section-title"><h3>生效范围</h3><span>可选全局或指定项目</span></div>
            <div className="detail-field-grid">
              <label className="glossary-field">
                范围
                <select
                  value={draft.scope || "project"}
                  onChange={(event) => {
                    const nextScope = event.currentTarget.value as GlossaryEntry["scope"];
                    setDraft((current) => ({
                      ...current,
                      scope: nextScope,
                      projectId: nextScope === "project" ? current?.projectId || projects[0]?.id || null : null,
                    }));
                    void saveOnSelectChange();
                  }}
                >
                  <option value="project">指定项目</option>
                  <option value="global">全局</option>
                </select>
              </label>
              <label className="glossary-field">
                项目
                <select
                  value={String(draft.projectId || projects[0]?.id || "")}
                  disabled={draft.scope === "global"}
                  onChange={(event) => {
                    const projectId = Number(event.currentTarget.value) || null;
                    setDraft((current) => ({ ...current, projectId }));
                    void saveOnSelectChange();
                  }}
                >
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            </div>
            <label className="glossary-field glossary-enabled-field">
              <input
                type="checkbox"
                checked={draft.enabled !== false}
                onChange={(event) => { const v = event.currentTarget.checked; setDraft((current) => ({ ...current, enabled: v })); void saveOnSelectChange(); }}
              />
              启用
            </label>
          </div>

          {status === "error" && <p className="modal-error">热词保存失败，请稍后重试。</p>}

          {isNew && (
            <div className="glossary-detail-actions">
              <button className="secondary-button" type="button" onClick={cancelNew}>取消</button>
              <button className="primary-button" type="button" disabled={!String(draft.term || "").trim() || status === "saving"} onClick={createNew}>
                <Plus size={15} />{status === "saving" ? "创建中" : "新增热词"}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function emptyDraft(projectId?: number): GlossaryDraft {
  return {
    scope: "project",
    projectId: projectId || null,
    term: "",
    aliases: [],
    aliasesText: "",
    category: "业务词",
    weight: 80,
    enabled: true,
  };
}

function splitAliases(text: string): string[] {
  return text.split(/[，,]/).map((s) => s.trim()).filter(Boolean);
}

function hasChanges(original: GlossaryEntry, draft: GlossaryDraft): boolean {
  if (draft.term !== undefined && draft.term !== original.term) return true;
  if (draft.category !== undefined && draft.category !== original.category) return true;
  if (draft.weight !== undefined && draft.weight !== original.weight) return true;
  if (draft.aliasesText !== undefined) {
    const originalAliases = (original.aliases || []).join("，");
    if (draft.aliasesText !== originalAliases) return true;
  }
  if (draft.scope !== undefined && draft.scope !== original.scope) return true;
  if (draft.projectId !== undefined && draft.projectId !== original.projectId) return true;
  if (draft.enabled !== undefined && draft.enabled !== original.enabled) return true;
  return false;
}
