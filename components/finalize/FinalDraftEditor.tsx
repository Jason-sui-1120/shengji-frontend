import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, List, Redo2, Undo2 } from "lucide-react";
import type { ActionStatus, FinalMinutesDraft } from "../../types";
import { getDateInputValue, getDueFromDateInput } from "../../lib/actions";
import {
  draftToDocumentHtml,
  getDraftSourceCounts,
  looksStructuredPlainText,
  parseDraftDocument,
  plainTextToDocumentHtml,
} from "../../lib/markdown";

export function FinalDraftEditor({ draft, onChange }: { draft: FinalMinutesDraft; onChange: (patch: Partial<FinalMinutesDraft>) => void }) {
  const [sideMode, setSideMode] = React.useState<"actions" | "structure" | "sources">("actions");
  const lastExternalSignatureRef = React.useRef<string | null>(null);
  const editorDrivenChangeRef = React.useRef(false);
  const editor = useEditor({
    extensions: [StarterKit],
    content: draftToDocumentHtml(draft),
    editorProps: {
      attributes: {
        class: "final-doc-prosemirror",
      },
      handlePaste(_view, event) {
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain");
        if (html || !text || !looksStructuredPlainText(text)) return false;
        event.preventDefault();
        editor?.chain().focus().deleteSelection().insertContent(plainTextToDocumentHtml(text)).run();
        return true;
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      editorDrivenChangeRef.current = true;
      onChange(parseDraftDocument(activeEditor.getHTML(), draft));
    },
  });

  const draftSignature = React.useMemo(() => JSON.stringify({
    title: draft.title,
    overview: draft.overview,
    topics: draft.topics,
    decisions: draft.decisions,
    risks: draft.risks,
    openQuestions: draft.openQuestions,
    transcriptCount: draft.transcriptCount,
  }), [draft.title, draft.overview, draft.topics, draft.decisions, draft.risks, draft.openQuestions, draft.transcriptCount]);

  React.useEffect(() => {
    if (!editor) return;
    if (editorDrivenChangeRef.current) {
      editorDrivenChangeRef.current = false;
      lastExternalSignatureRef.current = draftSignature;
      return;
    }
    if (lastExternalSignatureRef.current === draftSignature) return;
    lastExternalSignatureRef.current = draftSignature;
    editor.commands.setContent(draftToDocumentHtml(draft), { emitUpdate: false });
  }, [editor, draftSignature]);

  const sourceCounts = getDraftSourceCounts(draft);

  function updateAction(index: number, patch: Partial<FinalMinutesDraft["actionUpdates"][number]>) {
    onChange({
      actionUpdates: draft.actionUpdates.map((action, currentIndex) => (
        currentIndex === index ? { ...action, ...patch } : action
      )),
    });
  }

  function addDraftAction() {
    onChange({
      actionUpdates: [
        ...draft.actionUpdates,
        { title: "新增待办", owner: "待确认", due: "待确认", status: "clarify", source: "本次新增：人工补充" },
      ],
    });
  }

  function removeDraftAction(index: number) {
    onChange({ actionUpdates: draft.actionUpdates.filter((_, currentIndex) => currentIndex !== index) });
  }

  return (
    <div className="final-draft-editor">
      <div className="final-doc-shell">
        <main className="final-doc-main">
          <div className="final-doc-toolbar" aria-label="纪要编辑工具栏">
            <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} className={editor?.isActive("bold") ? "active" : ""} title="加粗">
              <Bold size={15} />
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={editor?.isActive("heading", { level: 2 }) ? "active" : ""} title="二级标题">
              <Heading2 size={15} />
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={editor?.isActive("heading", { level: 3 }) ? "active" : ""} title="议题标题">
              <Heading3 size={15} />
            </button>
            <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={editor?.isActive("bulletList") ? "active" : ""} title="项目列表">
              <List size={15} />
            </button>
            <span />
            <button type="button" onClick={() => editor?.chain().focus().undo().run()} title="撤销">
              <Undo2 size={15} />
            </button>
            <button type="button" onClick={() => editor?.chain().focus().redo().run()} title="重做">
              <Redo2 size={15} />
            </button>
          </div>
          <EditorContent className="final-doc-scroll" editor={editor} />
        </main>

        <aside className="final-doc-side" aria-label="会议智能侧栏">
          <div className="final-doc-side-tabs" role="tablist" aria-label="编辑侧栏">
            <button type="button" className={sideMode === "actions" ? "active" : ""} onClick={() => setSideMode("actions")}>待办</button>
            <button type="button" className={sideMode === "structure" ? "active" : ""} onClick={() => setSideMode("structure")}>结构</button>
            <button type="button" className={sideMode === "sources" ? "active" : ""} onClick={() => setSideMode("sources")}>来源</button>
          </div>

          {sideMode === "actions" && <section>
            <div className="side-section-head">
              <h3>归档待办</h3>
              <button type="button" onClick={addDraftAction}>新增</button>
            </div>
            <p>确认归档后会同步到待办池；已完成和已取消会作为关闭状态保留。</p>
            <div className="doc-action-editor-list">
              {draft.actionUpdates.length ? draft.actionUpdates.slice(0, 8).map((action, index) => (
                <article key={`${action.title}-${index}`}>
                  <input value={action.title} onChange={(event) => updateAction(index, { title: event.currentTarget.value })} aria-label="待办标题" />
                  <div>
                    <input value={action.owner} onChange={(event) => updateAction(index, { owner: event.currentTarget.value })} aria-label="负责人" />
                    <input
                      type="date"
                      value={getDateInputValue(action.due)}
                      onChange={(event) => updateAction(index, { due: getDueFromDateInput(event.currentTarget.value) })}
                      aria-label="截止时间"
                      title={action.due || "待确认"}
                    />
                  </div>
                  <select value={action.status} onChange={(event) => updateAction(index, { status: event.currentTarget.value as ActionStatus })} aria-label="待办状态">
                    <option value="candidate">候选</option>
                    <option value="clarify">待澄清</option>
                    <option value="confirmed">已确认</option>
                    <option value="in_progress">进行中</option>
                    <option value="done">已完成</option>
                    <option value="cancelled">已取消</option>
                  </select>
                  <input value={action.source} onChange={(event) => updateAction(index, { source: event.currentTarget.value })} aria-label="来源" />
                  <button type="button" onClick={() => removeDraftAction(index)}>删除</button>
                </article>
              )) : <p>暂无待办</p>}
            </div>
          </section>}

          {sideMode === "structure" && <section>
            <h3>归档结构</h3>
            <p>{draft.topics.length} 个议题，{draft.decisions.length} 条决策，{draft.risks.length} 条风险，{draft.openQuestions.length} 个待澄清问题。</p>
          </section>}

          {sideMode === "sources" && <section>
            <h3>来源标记</h3>
            <div className="source-stat-list">
              <span><em className="source-tag new">本次新增</em>{sourceCounts.new}</span>
              <span><em className="source-tag continued">历史延续</em>{sourceCounts.continued}</span>
              <span><em className="source-tag updated">历史更新</em>{sourceCounts.updated}</span>
              <span><em className="source-tag closed">历史关闭</em>{sourceCounts.closed}</span>
            </div>
          </section>}
        </aside>
      </div>
    </div>
  );
}
