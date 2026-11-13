import ICAL from "ical.js";
import { createHash } from "node:crypto";
export function zonedInstant(value, timeZone = "America/Denver") {
  const [date, time = "00:00:00"] = value.split("T");
  const desired = Date.parse(`${date}T${time}Z`);
  let stamp = desired;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(stamp)
        .map((p) => [p.type, p.value]),
    );
    const seen = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    const next = stamp + desired - seen;
    if (next === stamp) return new Date(stamp).toISOString();
    stamp = next;
  }
  throw Error(
    "A calendar time falls in a daylight-saving gap. Check the source time zone.",
  );
}
export function parseCalendar(
  text,
  {
    id = "import",
    label = "Calendar",
    timeZone = "America/Denver",
    now = new Date(),
  } = {},
) {
  if (!text.trimStart().startsWith("BEGIN:VCALENDAR"))
    throw Error("Choose an iCalendar (.ics) file or feed.");
  const root = new ICAL.Component(ICAL.parse(text));
  for (const zone of root.getAllSubcomponents("vtimezone"))
    ICAL.TimezoneService.register(
      new ICAL.Timezone({
        component: zone,
        tzid: zone.getFirstPropertyValue("tzid"),
      }),
    );
  const components = root.getAllSubcomponents("vevent");
  if (components.length > 15000) throw Error("Calendar is too large.");
  const exceptions = new Map();
  for (const c of components)
    if (c.hasProperty("recurrence-id")) {
      const uid = c.getFirstPropertyValue("uid");
      if (!exceptions.has(uid)) exceptions.set(uid, []);
      exceptions.get(uid).push(c);
    }
  const rows = [],
    startWindow = new Date(now.getTime() - 90 * 86400000),
    endWindow = new Date(now.getTime() + 370 * 86400000);
  const convert = (t, component) => {
    if (t.isDate) return t.toString();
    if (t.zone?.tzid === "floating")
      return zonedInstant(
        t.toString(),
        component?.getFirstProperty("dtstart")?.getParameter("tzid") ||
          timeZone,
      );
    if (
      !["UTC", "Z"].includes(t.zone?.tzid) &&
      t.zone === ICAL.Timezone.localTimezone
    )
      throw Error("Calendar time zone is not supported.");
    return t.toJSDate().toISOString();
  };
  for (const c of components) {
    if (
      c.hasProperty("recurrence-id") ||
      c.getFirstPropertyValue("status") === "CANCELLED"
    )
      continue;
    const event = new ICAL.Event(c);
    if (!event.uid || !event.startDate)
      throw Error("Calendar event is missing its ID or date.");
    for (const exception of exceptions.get(event.uid) || [])
      event.relateException(new ICAL.Event(exception));
    const iterator = event.iterator();
    let count = 0,
      occurrence;
    while ((occurrence = iterator.next())) {
      if (++count > 25000)
        throw Error("Calendar recurrence exceeds the supported limit.");
      if (occurrence.toJSDate() > endWindow) break;
      const detail = event.getOccurrenceDetails(occurrence);
      if (detail.endDate.toJSDate() < startWindow) continue;
      if (detail.item.component.getFirstPropertyValue("status") === "CANCELLED")
        continue;
      const key = `${event.uid}:${occurrence.toString()}`;
      rows.push({
        id: `ical:${id}:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`,
        title: detail.item.summary || event.summary || "Untitled event",
        start: convert(detail.startDate, detail.item.component),
        end: convert(detail.endDate, detail.item.component),
        allDay: detail.startDate.isDate,
        courseId: null,
        projectId: null,
        location: detail.item.location || "",
        description: detail.item.description || "",
        connectionId: id,
        source: {
          kind: "ical",
          label,
          externalId: key,
          observedAt: now.toISOString(),
          timeZone,
        },
      });
      if (rows.length > 15000)
        throw Error("Calendar has too many occurrences.");
      if (!event.isRecurring()) break;
    }
  }
  return rows;
}
export function replaceCalendar(domain, connectionId, rows) {
  domain.store.batch(() => {
    for (const r of domain.store.list("event"))
      if (r.connectionId === connectionId) domain.store.remove("event", r.id);
    for (const row of rows) domain.store.put("event", row.id, row);
  });
}
