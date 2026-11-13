import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { LifeState, LifeEvent, Task } from "./types";
export default function Calendar({
  state,
  onSelect,
  onAdd,
  onMove,
}: {
  state: LifeState;
  onSelect: (kind: string, row: LifeEvent | Task) => void;
  onAdd: (date: string) => void;
  onMove: (
    event: LifeEvent,
    start: string,
    end: string | null,
  ) => Promise<void>;
}) {
  const courses = new Map(state.courses.map((c) => [c.id, c]));
  return (
    <div className="life-calendar">
      <p className="life-muted">
        Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.
        Assignment dates remain in their recorded course time zone.
      </p>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView={window.innerWidth < 800 ? "listWeek" : "timeGridWeek"}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,listWeek",
        }}
        height="auto"
        nowIndicator
        firstDay={1}
        selectable
        select={(info) => onAdd(info.startStr.slice(0, 16))}
        events={[
          ...state.events.map((e) => ({
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end || undefined,
            allDay: e.allDay,
            color: courses.get(e.courseId || "")?.color || "#749cbd",
            editable: e.source?.kind === "manual",
            extendedProps: { kind: "event", row: e },
          })),
          ...state.tasks
            .filter((t) => t.dueDate)
            .map((t) => ({
              id: t.id,
              title: `${t.status === "done" ? "✓ " : ""}${t.title}`,
              start: t.dueDate!,
              allDay: true,
              color: courses.get(t.courseId || "")?.color || "#a4b88b",
              editable: false,
              classNames: t.status === "done" ? ["life-completed"] : [],
              extendedProps: { kind: "task", row: t },
            })),
        ]}
        eventClick={(info) =>
          onSelect(info.event.extendedProps.kind, info.event.extendedProps.row)
        }
        eventDrop={async (info) => {
          try {
            await onMove(
              info.event.extendedProps.row,
              info.event.startStr,
              info.event.endStr || null,
            );
          } catch {
            info.revert();
          }
        }}
        eventResize={async (info) => {
          try {
            await onMove(
              info.event.extendedProps.row,
              info.event.startStr,
              info.event.endStr || null,
            );
          } catch {
            info.revert();
          }
        }}
      />
    </div>
  );
}
