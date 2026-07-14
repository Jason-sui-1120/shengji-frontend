import type { FlowStep } from "../../types";

export function MeetingFlowBar({ steps }: { steps: FlowStep[] }) {
  return (
    <section className="meeting-flow-bar" aria-label="会议主流程">
      {steps.map((step, index) => (
        <div className={`flow-step ${step.state}`} key={step.label}>
          <em>{index + 1}</em>
          <div>
            <span>{step.label}</span>
            <strong>{step.value}</strong>
          </div>
        </div>
      ))}
    </section>
  );
}
