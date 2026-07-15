import { Plus, Trash2 } from "lucide-react";
import type { Project, FinalizedMeeting, ActionBacklogItem } from "../../types";
import { isOpenAction } from "../../lib/actions";

export function ProjectListPage({
  projects,
  archives,
  actions,
  onNewProject,
  onOpenProject,
  onDeleteProject,
}: {
  projects: Project[];
  archives: FinalizedMeeting[];
  actions: ActionBacklogItem[];
  onNewProject: () => void;
  onOpenProject: (projectName: string) => void;
  onDeleteProject?: (projectId: number) => void;
}) {
  const sortedProjects = [...projects].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  function getProjectStats(projectName: string) {
    const projectArchives = archives.filter((a) => a.projectName === projectName);
    const projectActions = actions.filter((a) => a.projectName === projectName);
    const openCount = projectActions.filter(isOpenAction).length;
    const totalCount = projectActions.length;
    const lastMeeting = projectArchives[0]?.createdAt;
    return {
      meetingCount: projectArchives.length,
      openCount,
      totalCount,
      lastMeeting,
    };
  }

  return (
    <section className="history-page">
      <div className="history-page-head">
        <div>
          <h1 className="timeline-page-title">项目</h1>
          <div className="timeline-page-sub">{projects.length} 个项目 · 点击进入项目工作区</div>
        </div>
        <div className="history-page-actions">
          <button className="primary-button" onClick={onNewProject}>
            <Plus size={15} /> 新建项目
          </button>
        </div>
      </div>

      {sortedProjects.length > 0 ? (
        <div className="project-card-grid">
          {sortedProjects.map((project) => {
            const stats = getProjectStats(project.name);
            return (
              <div
                key={project.name}
                className="project-list-card"
                onClick={() => onOpenProject(project.name)}
              >
                <div className="project-list-icon">
                  {project.name.charAt(0)}
                </div>
                <div className="project-list-body">
                  <div className="project-list-name">
                    {project.name}
                    {project.visibility === "private" && <span className="project-visibility-badge private" title="私有项目">私有</span>}
                    {project.visibility === "shared" && <span className="project-visibility-badge shared" title="共享项目">共享</span>}
                  </div>
                  <div className="project-list-meta">
                    {stats.meetingCount} 场会议 · 最近 {stats.lastMeeting ? formatDate(stats.lastMeeting) : "暂无"}
                  </div>
                </div>
                <div className="project-list-badge">
                  {stats.openCount > 0 ? (
                    <span className="timeline-action-count has">{stats.openCount}/{stats.totalCount} 待办</span>
                  ) : stats.totalCount > 0 ? (
                    <span className="timeline-action-count none">待办已清</span>
                  ) : (
                    <span className="timeline-action-count none">无待办</span>
                  )}
                </div>
                {onDeleteProject && project.id != null && (
                  <button
                    className="project-list-delete"
                    title="删除项目"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`确定删除项目「${project.name}」？该项目下所有会议和待办将一起移入回收站。`)) {
                        onDeleteProject(project.id!);
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-archive">
          <Plus size={26} />
          <h2>暂无项目</h2>
          <p>创建项目后，可以按项目维度管理会议和待办。</p>
          <button className="primary-button" onClick={onNewProject}><Plus size={15} />新建项目</button>
        </div>
      )}
    </section>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
  return `${Math.floor(diffDays / 30)}月前`;
}
