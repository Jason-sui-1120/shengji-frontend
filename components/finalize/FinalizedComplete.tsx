import { History, ListChecks, Plus, FolderKanban } from "lucide-react";
import type { FinalizedMeeting } from "../../types";
import { isOpenAction } from "../../lib/actions";

export function FinalizedComplete({
  meeting,
  onOpenHistory,
  onOpenActions,
  onOpenProject,
  onNewMeeting,
}: {
  meeting: FinalizedMeeting;
  onOpenHistory: () => void;
  onOpenActions: () => void;
  onOpenProject: () => void;
  onNewMeeting: () => void;
}) {
  const openActions = meeting.actionSnapshot.filter((action) => isOpenAction(action)).length;
  const closedActions = meeting.actionSnapshot.length - openActions;

  return (
    <div className="finalized-complete">
      <div className="finalized-hero">
        <span>已完成归档</span>
        <h3>{meeting.title}</h3>
        <p>{meeting.overview || "本次会议已归档。"}</p>
      </div>

      <div className="finalized-result-grid">
        <article>
          <span>会议档案</span>
          <strong>{meeting.topics.length} 个议题</strong>
          <p>{meeting.transcriptCount} 条转写已沉淀为可回看的会议档案。</p>
        </article>
        <article>
          <span>待办同步</span>
          <strong>{openActions} 个未关闭</strong>
          <p>{meeting.actionSnapshot.length} 个归档待办已同步到待办池，{closedActions} 个为关闭状态。</p>
        </article>
        <article>
          <span>下次会议</span>
          <strong>自动载入</strong>
          <p>同项目下一场会议会把本次纪要和未关闭待办作为历史上下文。</p>
        </article>
      </div>

      <div className="finalized-next-actions">
        <button className="primary-button" onClick={onOpenProject}><FolderKanban size={15} />查看项目</button>
        <button className="secondary-button" onClick={onOpenHistory}><History size={15} />查看会议档案</button>
        <button className="secondary-button" onClick={onOpenActions}><ListChecks size={15} />查看待办池</button>
        <button className="secondary-button" onClick={onNewMeeting}><Plus size={15} />新建下一场</button>
      </div>
    </div>
  );
}
